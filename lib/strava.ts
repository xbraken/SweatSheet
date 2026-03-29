import { db } from './db'

const CLIENT_ID = process.env.STRAVA_CLIENT_ID!
const CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET!

const ACTIVITY_MAP: Record<string, string> = {
  Run: 'Run',
  VirtualRun: 'Run',
  TrailRun: 'Run',
  Ride: 'Cycling',
  VirtualRide: 'Cycling',
  EBikeRide: 'Cycling',
  Walk: 'Walking',
  Hike: 'Walking',
}

export function stravaAuthUrl(redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    approval_prompt: 'auto',
    scope: 'activity:read_all',
  })
  return `https://www.strava.com/oauth/authorize?${params}`
}

export async function exchangeCode(code: string) {
  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, code, grant_type: 'authorization_code' }),
  })
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`)
  return res.json() as Promise<{ access_token: string; refresh_token: string; expires_at: number; athlete: { id: number } }>
}

async function refreshToken(userId: number, refresh: string): Promise<string> {
  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, refresh_token: refresh, grant_type: 'refresh_token' }),
  })
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`)
  const data = await res.json() as { access_token: string; refresh_token: string; expires_at: number }
  await db.execute({
    sql: 'UPDATE users SET strava_access_token = ?, strava_refresh_token = ?, strava_token_expires_at = ? WHERE id = ?',
    args: [data.access_token, data.refresh_token, data.expires_at, userId],
  })
  return data.access_token
}

export async function getValidToken(userId: number): Promise<string | null> {
  const res = await db.execute({
    sql: 'SELECT strava_access_token, strava_refresh_token, strava_token_expires_at FROM users WHERE id = ?',
    args: [userId],
  })
  if (!res.rows.length) return null
  const { strava_access_token: token, strava_refresh_token: refresh, strava_token_expires_at: expiresAt } = res.rows[0]
  if (!token || !refresh) return null
  if (Math.floor(Date.now() / 1000) >= (expiresAt as number) - 300) {
    return refreshToken(userId, refresh as string)
  }
  return token as string
}

export async function importActivity(userId: number, activityId: number): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  try {
    const token = await getValidToken(userId)
    if (!token) return { ok: false, error: 'No Strava connection' }

    // Dedup check
    const dup = await db.execute({
      sql: `SELECT c.id FROM cardio c JOIN blocks b ON b.id = c.block_id JOIN sessions s ON s.id = b.session_id
            WHERE s.user_id = ? AND c.imported_from = ?`,
      args: [userId, `strava:${activityId}`],
    })
    if (dup.rows.length > 0) return { ok: true, skipped: true }

    // Fetch activity
    const actRes = await fetch(`https://www.strava.com/api/v3/activities/${activityId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!actRes.ok) return { ok: false, error: `Activity fetch failed: ${actRes.status}` }
    const act = await actRes.json() as Record<string, unknown>

    const activityType = ACTIVITY_MAP[(act.sport_type ?? act.type) as string] ?? null
    if (!activityType) return { ok: true, skipped: true }

    // Fetch streams
    const streamsRes = await fetch(
      `https://www.strava.com/api/v3/activities/${activityId}/streams?keys=heartrate,distance,time&key_by_type=true`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    const streams = streamsRes.ok ? await streamsRes.json() as Record<string, { data: number[] }> : {}

    const startStr = act.start_date as string
    const date = (act.start_date_local as string)?.slice(0, 10) ?? startStr.slice(0, 10)
    const totalSec = (act.elapsed_time ?? act.moving_time ?? 0) as number
    const hh = Math.floor(totalSec / 3600)
    const mm = Math.floor((totalSec % 3600) / 60)
    const ss = totalSec % 60
    const duration = hh > 0
      ? `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
      : `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`

    const distKm = act.distance ? (act.distance as number) / 1000 : 0
    const paceSecPerKm = distKm > 0.1 && totalSec > 0 ? totalSec / distKm : null
    const pace = paceSecPerKm
      ? `${Math.floor(paceSecPerKm / 60)}:${String(Math.round(paceSecPerKm % 60)).padStart(2, '0')}`
      : null

    const avgHR = act.average_heartrate ? Math.round(act.average_heartrate as number) : null
    const maxHR = act.max_heartrate ? Math.round(act.max_heartrate as number) : null
    const calories = act.calories ? Math.round(act.calories as number) : null

    const endDate = new Date(new Date(startStr).getTime() + totalSec * 1000).toISOString()

    // Build HR samples
    const hrSamples: { offsetSec: number; bpm: number }[] = []
    if (streams.heartrate?.data && streams.time?.data) {
      for (let i = 0; i < streams.heartrate.data.length; i++) {
        const bpm = streams.heartrate.data[i]
        const offsetSec = streams.time.data[i]
        if (bpm > 0) hrSamples.push({ offsetSec, bpm })
      }
    }

    // Build distance samples
    const distSamples: { offsetSec: number; distKm: number }[] = []
    if (streams.distance?.data && streams.time?.data) {
      for (let i = 0; i < streams.distance.data.length; i++) {
        distSamples.push({ offsetSec: streams.time.data[i], distKm: streams.distance.data[i] / 1000 })
      }
    }

    const blockType = activityType === 'Cycling' ? 'cycle' : 'run'

    const sessionRes = await db.execute({
      sql: 'INSERT INTO sessions (user_id, date) VALUES (?, ?) RETURNING id',
      args: [userId, date],
    })
    const blockRes = await db.execute({
      sql: 'INSERT INTO blocks (session_id, type, position) VALUES (?, ?, 0) RETURNING id',
      args: [sessionRes.rows[0].id as number, blockType],
    })
    const blockId = blockRes.rows[0].id as number

    const cardioRes = await db.execute({
      sql: `INSERT INTO cardio (block_id, activity, distance, duration, pace, calories, heart_rate, hr_max, started_at, ended_at, imported_from)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      args: [blockId, activityType, distKm > 0 ? distKm.toFixed(2) : null, duration || null, pace || null,
             calories, avgHR, maxHR, startStr, endDate, `strava:${activityId}`],
    })
    const cardioId = cardioRes.rows[0].id as number

    if (hrSamples.length > 0) {
      await db.batch(hrSamples.map(s => ({
        sql: 'INSERT INTO cardio_hr_samples (cardio_id, time_offset_sec, hr_bpm) VALUES (?, ?, ?)',
        args: [cardioId, s.offsetSec, s.bpm] as (string | number | null)[],
      })))
    }
    if (distSamples.length > 0) {
      await db.batch(distSamples.map(s => ({
        sql: 'INSERT INTO cardio_distance_samples (cardio_id, time_offset_sec, distance_km) VALUES (?, ?, ?)',
        args: [cardioId, s.offsetSec, s.distKm] as (string | number | null)[],
      })))
    }

    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' }
  }
}
