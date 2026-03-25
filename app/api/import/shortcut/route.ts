import { NextRequest, NextResponse } from 'next/server'
import { db, initDb } from '@/lib/db'

await initDb()

const ACTIVITY_MAP: Record<string, string> = {
  running: 'Outdoor run',
  'outdoor run': 'Outdoor run',
  'indoor run': 'Indoor run',
  cycling: 'Cycling',
  'outdoor cycling': 'Cycling',
  'indoor cycling': 'Cycling',
  walking: 'Walking',
  hkworkoutactivitytyperunning: 'Outdoor run',
  hkworkoutactivitytypecycling: 'Cycling',
  hkworkoutactivitytypewalking: 'Walking',
}

function toSeconds(str: string | null): number | null {
  if (!str) return null
  const parts = str.split(':').map(Number)
  if (parts.some(isNaN)) return null
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  return null
}

function field(obj: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) if (obj[k] !== undefined) return obj[k]
  return undefined
}

export async function POST(req: NextRequest) {
  // Auth via API key header
  const apiKey = req.headers.get('x-api-key') ?? req.headers.get('authorization')?.replace('Bearer ', '')
  if (!apiKey) return NextResponse.json({ error: 'Missing X-API-Key header' }, { status: 401 })

  const userRes = await db.execute({ sql: `SELECT id FROM users WHERE api_key = ?`, args: [apiKey] })
  if (userRes.rows.length === 0) return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
  const userId = userRes.rows[0].id as number

  const body = await req.json()
  const rawWorkouts = Array.isArray(body.workouts) ? body.workouts as Record<string, unknown>[] : []
  const rawHr = Array.isArray(body.hrSamples) ? body.hrSamples as Record<string, unknown>[] : []

  if (rawWorkouts.length === 0) return NextResponse.json({ error: 'No workouts provided' }, { status: 400 })

  // Flatten HR samples sorted by timestamp
  const hrFlat = rawHr
    .map(s => {
      const dateStr = String(field(s, 'date', 'startDate', 'timestamp') ?? '')
      const bpm = Number(field(s, 'bpm', 'value', 'heartRate') ?? NaN)
      if (!dateStr || isNaN(bpm) || bpm <= 0) return null
      const ts = new Date(dateStr).getTime()
      return isNaN(ts) ? null : { ts, bpm: Math.round(bpm) }
    })
    .filter(Boolean) as Array<{ ts: number; bpm: number }>
  hrFlat.sort((a, b) => a.ts - b.ts)

  let imported = 0
  let duplicates = 0

  for (const raw of rawWorkouts) {
    try {
      const typeStr = String(field(raw, 'type', 'workoutType', 'activity') ?? '').toLowerCase().trim()
      let activity = ACTIVITY_MAP[typeStr]
      if (!activity) continue
      if (raw.isIndoor && activity === 'Outdoor run') activity = 'Indoor run'

      const startStr = String(field(raw, 'startDate', 'start', 'startedAt') ?? '')
      const endStr = String(field(raw, 'endDate', 'end', 'endedAt') ?? '')
      const startTs = new Date(startStr).getTime()
      const endTs = new Date(endStr).getTime()
      if (isNaN(startTs) || isNaN(endTs) || endTs <= startTs) continue

      const date = startStr.split('T')[0]

      // Duplicate check by started_at
      const dupCheck = await db.execute({
        sql: `SELECT c.id FROM cardio c
              JOIN blocks b ON b.id = c.block_id
              JOIN sessions s ON s.id = b.session_id
              WHERE s.user_id = ? AND c.started_at = ?
              LIMIT 1`,
        args: [userId, startStr],
      })
      if (dupCheck.rows.length > 0) { duplicates++; continue }

      // Duration
      const durSec = field(raw, 'durationSec', 'duration')
      const durMin = field(raw, 'durationMin')
      let totalSec: number
      if (durSec !== undefined && !isNaN(Number(durSec))) totalSec = Math.round(Number(durSec))
      else if (durMin !== undefined && !isNaN(Number(durMin))) totalSec = Math.round(Number(durMin) * 60)
      else totalSec = Math.round((endTs - startTs) / 1000)

      const hh = Math.floor(totalSec / 3600)
      const mm = Math.floor((totalSec % 3600) / 60)
      const ss = totalSec % 60
      const duration = hh > 0
        ? `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
        : `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`

      // Distance
      let distKm = 0
      const distKmField = field(raw, 'distanceKm')
      const distMiField = field(raw, 'distanceMi')
      const distMField = field(raw, 'distanceM')
      const distField = field(raw, 'distance')
      const distUnit = String(field(raw, 'distanceUnit', 'unit') ?? '').toLowerCase()
      if (distKmField !== undefined) distKm = Number(distKmField)
      else if (distMiField !== undefined) distKm = Number(distMiField) * 1.60934
      else if (distMField !== undefined) distKm = Number(distMField) / 1000
      else if (distField !== undefined) {
        const v = Number(distField)
        if (distUnit === 'mi') distKm = v * 1.60934
        else if (distUnit === 'm') distKm = v / 1000
        else if (distUnit === 'km') distKm = v
        else distKm = v > 500 ? v / 1000 : v
      }
      if (isNaN(distKm)) distKm = 0

      const paceSecPerKm = distKm > 0.1 ? totalSec / distKm : null
      const pace = paceSecPerKm
        ? `${Math.floor(paceSecPerKm / 60)}:${String(Math.round(paceSecPerKm % 60)).padStart(2, '0')}`
        : null

      const avgHR = Number(field(raw, 'avgHR', 'averageHeartRate', 'heartRate') ?? NaN)
      const minHR = Number(field(raw, 'minHR', 'minimumHeartRate') ?? NaN)
      const maxHR = Number(field(raw, 'maxHR', 'maximumHeartRate') ?? NaN)
      const cals = Number(field(raw, 'calories', 'activeEnergyKcal', 'totalEnergyBurned') ?? NaN)

      // Match HR samples
      const samples: Array<{ offsetSec: number; bpm: number }> = []
      for (const s of hrFlat) {
        if (s.ts < startTs) continue
        if (s.ts > endTs) break
        samples.push({ offsetSec: Math.round((s.ts - startTs) / 1000), bpm: s.bpm })
      }

      const blockType = activity === 'Cycling' ? 'cycle' : activity === 'Walking' ? 'cardio' : 'run'

      const sessionRes = await db.execute({
        sql: 'INSERT INTO sessions (user_id, date) VALUES (?, ?) RETURNING id',
        args: [userId, date],
      })
      const sessionId = sessionRes.rows[0].id as number

      const blockRes = await db.execute({
        sql: 'INSERT INTO blocks (session_id, type, position) VALUES (?, ?, 0) RETURNING id',
        args: [sessionId, blockType],
      })
      const blockId = blockRes.rows[0].id as number

      const cardioRes = await db.execute({
        sql: `INSERT INTO cardio
              (block_id, activity, distance, duration, pace, calories, heart_rate, hr_min, hr_max, started_at, ended_at, imported_from)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
        args: [
          blockId, activity,
          distKm > 0 ? distKm.toFixed(2) : null,
          duration || null, pace || null,
          isNaN(cals) || cals <= 0 ? null : Math.round(cals),
          isNaN(avgHR) || avgHR <= 0 ? null : Math.round(avgHR),
          isNaN(minHR) || minHR <= 0 ? null : Math.round(minHR),
          isNaN(maxHR) || maxHR <= 0 ? null : Math.round(maxHR),
          startStr, endStr,
          'shortcut',
        ],
      })
      const cardioId = cardioRes.rows[0].id as number

      if (samples.length > 0) {
        await db.batch(samples.map(s => ({
          sql: 'INSERT INTO cardio_hr_samples (cardio_id, time_offset_sec, hr_bpm) VALUES (?, ?, ?)',
          args: [cardioId, s.offsetSec, s.bpm],
        })))
      }

      // Distance samples (optional — requires Shortcut to supply distanceSamples array)
      const rawDistArr = Array.isArray(body.distanceSamples) ? body.distanceSamples as Record<string, unknown>[] : []
      const distSamples: Array<{ offsetSec: number; distKm: number }> = []
      if (rawDistArr.length > 0) {
        const distFlat = rawDistArr
          .map(s => {
            const dateStr = String(field(s, 'date', 'startDate', 'timestamp') ?? '')
            const val = Number(field(s, 'distanceKm', 'distance', 'value') ?? NaN)
            if (!dateStr || isNaN(val) || val < 0) return null
            const ts = new Date(dateStr).getTime()
            return isNaN(ts) ? null : { ts, distKm: val }
          })
          .filter(Boolean) as Array<{ ts: number; distKm: number }>
        distFlat.sort((a, b) => a.ts - b.ts)
        let cumKm = 0
        for (const s of distFlat) {
          if (s.ts < startTs || s.ts > endTs) continue
          cumKm += s.distKm
          distSamples.push({ offsetSec: Math.round((s.ts - startTs) / 1000), distKm: cumKm })
        }
      }
      if (distSamples.length > 0) {
        await db.batch(distSamples.map(s => ({
          sql: 'INSERT INTO cardio_distance_samples (cardio_id, time_offset_sec, distance_km) VALUES (?, ?, ?)',
          args: [cardioId, s.offsetSec, s.distKm],
        })))
      }

      imported++
    } catch { /* skip failed rows */ }
  }

  return NextResponse.json({
    ok: true,
    imported,
    duplicates,
    total: rawWorkouts.length,
    message: `${imported} workout${imported !== 1 ? 's' : ''} imported${duplicates > 0 ? `, ${duplicates} already existed` : ''}`,
  })
}
