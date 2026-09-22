import { db } from './db'
import { recordCardioPrs } from '@/lib/cardio-prs'

const API_KEY = process.env.INTERVALS_ICU_API_KEY!
const ATHLETE_ID = process.env.INTERVALS_ICU_ATHLETE_ID!

const ACTIVITY_MAP: Record<string, string> = {
  Run: 'Run',
  VirtualRun: 'Run',
  TrailRun: 'Run',
  Ride: 'Cycling',
  VirtualRide: 'Cycling',
  EBikeRide: 'Cycling',
  Walk: 'Walking',
  Hike: 'Walking',
  HighIntensityIntervalTraining: 'HIIT',
  Workout: 'Workout',
  Yoga: 'Yoga',
  Swim: 'Swim',
  Elliptical: 'Elliptical',
  StairStepper: 'Stairs',
  Rowing: 'Rowing',
}

// Strength-only activity types — these are logged in-app, don't import as cardio
const SKIP_TYPES = new Set(['WeightTraining', 'Crossfit'])

function authHeader(): string {
  return 'Basic ' + Buffer.from(`API_KEY:${API_KEY}`).toString('base64')
}

async function intervalsFetch(path: string): Promise<Response> {
  return fetch(`https://intervals.icu/api/v1${path}`, {
    headers: { Authorization: authHeader() },
  })
}

// List response already includes full activity detail (distance, HR, calories, etc) —
// no separate per-activity detail call needed, unlike Strava's summary-then-detail flow.
export async function getRecentActivities(oldest: string, newest: string): Promise<Record<string, unknown>[]> {
  const res = await intervalsFetch(`/athlete/${ATHLETE_ID}/activities?oldest=${oldest}&newest=${newest}`)
  if (!res.ok) throw new Error(`Activities fetch failed: ${res.status}`)
  return res.json()
}

// Streams come back as an array of {type, data} objects (not keyed by type like Strava)
async function getActivityStreams(activityId: string): Promise<Record<string, number[]>> {
  const res = await intervalsFetch(`/activity/${activityId}/streams.json?types=heartrate,velocity_smooth,distance,time`)
  if (!res.ok) return {}
  const streams = await res.json() as { type: string; data: number[] }[]
  const byType: Record<string, number[]> = {}
  for (const s of streams) {
    if (Array.isArray(s.data)) byType[s.type] = s.data
  }
  return byType
}

export async function importActivity(
  userId: number,
  activity: Record<string, unknown>,
  opts: { force?: boolean } = {}
): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  try {
    const activityId = activity.id as string

    const rawType = (activity.type as string) || null
    if (!rawType) return { ok: true, skipped: true }
    if (SKIP_TYPES.has(rawType)) return { ok: true, skipped: true }
    const activityType = ACTIVITY_MAP[rawType] ?? rawType

    // Dedup check (skipped when force=true so user can re-import after a delete)
    if (!opts.force) {
      const dup = await db.execute({
        sql: `SELECT c.id FROM cardio c JOIN blocks b ON b.id = c.block_id JOIN sessions s ON s.id = b.session_id
              WHERE s.user_id = ? AND c.imported_from = ?`,
        args: [userId, `intervals:${activityId}`],
      })
      if (dup.rows.length > 0) return { ok: true, skipped: true }
    }

    const streams = await getActivityStreams(activityId)

    const startStr = activity.start_date as string
    const date = (activity.start_date_local as string)?.slice(0, 10) ?? startStr.slice(0, 10)
    const totalSec = (activity.elapsed_time ?? activity.moving_time ?? 0) as number
    const hh = Math.floor(totalSec / 3600)
    const mm = Math.floor((totalSec % 3600) / 60)
    const ss = totalSec % 60
    const duration = hh > 0
      ? `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
      : `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`

    // Intervals.icu's top-level "pace" field is speed-scaled (m/s), not sec/km —
    // compute pace from distance/time ourselves, same as the Strava pipeline does.
    const distKm = activity.distance ? (activity.distance as number) / 1000 : 0
    const paceSecPerKm = distKm > 0.1 && totalSec > 0 ? totalSec / distKm : null
    const pace = paceSecPerKm
      ? `${Math.floor(paceSecPerKm / 60)}:${String(Math.round(paceSecPerKm % 60)).padStart(2, '0')}`
      : null

    const avgHR = activity.average_heartrate ? Math.round(activity.average_heartrate as number) : null
    const maxHR = activity.max_heartrate ? Math.round(activity.max_heartrate as number) : null
    const calories = activity.calories ? Math.round(activity.calories as number) : null

    let endDate: string
    try {
      endDate = new Date(new Date(startStr).getTime() + totalSec * 1000).toISOString()
    } catch {
      endDate = startStr ?? new Date().toISOString()
    }

    // Build HR samples — downsample to 1 per 10s
    const hrSamples: { offsetSec: number; bpm: number }[] = []
    const hrData = streams.heartrate
    const timeData = streams.time
    if (hrData && timeData) {
      let lastSec = -Infinity
      for (let i = 0; i < hrData.length; i++) {
        const bpm = hrData[i]
        const offsetSec = timeData[i]
        if (bpm > 0 && offsetSec - lastSec >= 10) {
          hrSamples.push({ offsetSec, bpm })
          lastSec = offsetSec
        }
      }
    }

    // Build distance samples — downsample to 1 per 10s
    const distSamples: { offsetSec: number; distKm: number }[] = []
    const distData = streams.distance
    if (distData && timeData) {
      let lastSec = -Infinity
      for (let i = 0; i < distData.length; i++) {
        const offsetSec = timeData[i]
        if (offsetSec - lastSec >= 10) {
          distSamples.push({ offsetSec, distKm: distData[i] / 1000 })
          lastSec = offsetSec
        }
      }
      // Always include the final sample so total distance is accurate on the chart
      if (distData.length > 0) {
        const last = distData.length - 1
        const lastOffset = timeData[last]
        if (distSamples.length === 0 || distSamples[distSamples.length - 1].offsetSec !== lastOffset) {
          distSamples.push({ offsetSec: lastOffset, distKm: distData[last] / 1000 })
        }
      }
    }

    // Any cardio-ish activity that isn't explicitly cycling goes in a 'run' block.
    const blockType = activityType === 'Cycling' ? 'cycle' : 'run'

    // Find-or-create session for this date (prevents orphaned empty sessions on retry)
    const existingSession = await db.execute({
      sql: 'SELECT id FROM sessions WHERE user_id = ? AND date = ? LIMIT 1',
      args: [userId, date],
    })
    const sessionId = existingSession.rows.length > 0
      ? existingSession.rows[0].id as number
      : (await db.execute({
          sql: 'INSERT INTO sessions (user_id, date) VALUES (?, ?) RETURNING id',
          args: [userId, date],
        })).rows[0].id as number

    const posRes = await db.execute({
      sql: 'SELECT COUNT(*) as cnt FROM blocks WHERE session_id = ?',
      args: [sessionId],
    })
    const position = posRes.rows[0].cnt as number

    const blockRes = await db.execute({
      sql: 'INSERT INTO blocks (session_id, type, position) VALUES (?, ?, ?) RETURNING id',
      args: [sessionId, blockType, position],
    })
    const blockId = blockRes.rows[0].id as number

    const cardioRes = await db.execute({
      sql: `INSERT INTO cardio (block_id, activity, distance, duration, pace, calories, heart_rate, hr_max, started_at, ended_at, imported_from)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      args: [blockId, activityType, distKm > 0 ? distKm.toFixed(2) : null, duration || null, pace || null,
             calories, avgHR, maxHR, startStr, endDate, `intervals:${activityId}`],
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
    await recordCardioPrs(cardioId)

    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

// Shared sync loop used by both the polling cron and the manual "Sync now" button
export async function syncRecentActivities(
  userId: number,
  opts: { lookbackDays?: number; force?: boolean } = {}
): Promise<{ ok: boolean; imported: number; skipped: number; errors: number; errorDetails: string[] }> {
  const lookbackDays = opts.lookbackDays ?? 3
  const newest = new Date().toISOString().slice(0, 10)
  const oldest = new Date(Date.now() - lookbackDays * 86400000).toISOString().slice(0, 10)

  const activities = await getRecentActivities(oldest, newest)

  let imported = 0
  let skipped = 0
  let errors = 0
  const errorDetails: string[] = []

  for (const activity of activities) {
    const result = await importActivity(userId, activity, { force: opts.force })
    if (!result.ok) {
      errors++
      if (result.error) errorDetails.push(result.error)
    } else if (result.skipped) {
      skipped++
    } else {
      imported++
    }
  }

  return { ok: true, imported, skipped, errors, errorDetails }
}
