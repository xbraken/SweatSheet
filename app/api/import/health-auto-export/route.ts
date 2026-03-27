import { NextRequest, NextResponse } from 'next/server'
import { db, initDb } from '@/lib/db'

await initDb()

const ACTIVITY_MAP: Record<string, string> = {
  running: 'Run',
  'outdoor run': 'Run',
  'indoor run': 'Run',
  cycling: 'Cycling',
  'outdoor cycling': 'Cycling',
  'indoor cycling': 'Cycling',
  walking: 'Walking',
}

function qty(obj: unknown): number {
  if (obj && typeof obj === 'object' && 'qty' in obj) return Number((obj as Record<string, unknown>).qty)
  return NaN
}

function qtyInKm(obj: unknown): number {
  if (!obj || typeof obj !== 'object') return NaN
  const o = obj as Record<string, unknown>
  const v = Number(o.qty)
  if (isNaN(v)) return NaN
  const unit = String(o.units ?? '').toLowerCase()
  if (unit === 'mi') return v * 1.60934
  if (unit === 'm') return v / 1000
  return v // assume km
}

export async function POST(req: NextRequest) {
  const force = req.nextUrl.searchParams.get('force') === '1'
  const apiKey = req.headers.get('x-api-key') ?? req.headers.get('authorization')?.replace('Bearer ', '')
  if (!apiKey) return NextResponse.json({ error: 'Missing X-API-Key header' }, { status: 401 })

  const userRes = await db.execute({ sql: `SELECT id FROM users WHERE api_key = ?`, args: [apiKey] })
  if (userRes.rows.length === 0) return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
  const userId = userRes.rows[0].id as number

  const body = await req.json()

  // Health Auto Export: { data: { workouts: [...] } }
  let rawWorkouts: Record<string, unknown>[]
  if (Array.isArray(body)) rawWorkouts = body
  else if (Array.isArray(body.data)) rawWorkouts = body.data
  else if (body.data && Array.isArray((body.data as Record<string, unknown>).workouts)) rawWorkouts = (body.data as Record<string, unknown>).workouts as Record<string, unknown>[]
  else if (Array.isArray(body.workouts)) rawWorkouts = body.workouts
  else rawWorkouts = []

  // Debug mode — runs after rawWorkouts is parsed
  if (req.headers.get('x-debug') === '1') {
    return NextResponse.json({
      debug: true,
      total: rawWorkouts.length,
      workouts: rawWorkouts.map(w => ({
        name: w.name,
        start: w.start,
        keys: Object.keys(w),
        heartRateDataLength: Array.isArray(w.heartRateData) ? (w.heartRateData as unknown[]).length : 'missing',
        heartRateRecoveryLength: Array.isArray(w.heartRateRecovery) ? (w.heartRateRecovery as unknown[]).length : 'missing',
        heartRateSample: Array.isArray(w.heartRateData) ? (w.heartRateData as unknown[])[0] : (Array.isArray(w.heartRateRecovery) ? (w.heartRateRecovery as unknown[])[0] : null),
        heartRate: w.heartRate,
      })),
    })
  }

  if (rawWorkouts.length === 0) return NextResponse.json({ error: 'No workouts provided' }, { status: 400 })

  // Pre-parse all workouts
  const parsed = rawWorkouts.map(raw => {
    const typeStr = String(raw.name ?? '').toLowerCase().trim()
    const isWalking = typeStr === 'walking'
    if (!raw.intensity && !isWalking) return null

    let activity = ACTIVITY_MAP[typeStr]
    if (!activity) return null
    if (raw.isIndoor && activity === 'Run') activity = 'Indoor run'

    const startStr = String(raw.start ?? '')
    const endStr = String(raw.end ?? '')
    const startTs = new Date(startStr).getTime()
    const endTs = new Date(endStr).getTime()
    if (isNaN(startTs) || isNaN(endTs) || endTs <= startTs) return null

    return { raw, activity, startStr, endStr, startTs, endTs, date: startStr.slice(0, 10) }
  }).filter(Boolean) as Array<{
    raw: Record<string, unknown>; activity: string; startStr: string; endStr: string; startTs: number; endTs: number; date: string
  }>

  // Batch duplicate check — one query for all start times
  const allStartTimes = parsed.map(p => p.startStr)
  const existingByStart = new Map<string, { cardioId: number; blockId: number; hasSamples: boolean }>()
  if (allStartTimes.length > 0) {
    for (let i = 0; i < allStartTimes.length; i += 500) {
      const chunk = allStartTimes.slice(i, i + 500)
      const placeholders = chunk.map(() => '?').join(',')
      const dupRes = await db.execute({
        sql: `SELECT c.id, c.block_id, c.started_at,
                (SELECT COUNT(*) FROM cardio_hr_samples WHERE cardio_id = c.id) as hr_count
              FROM cardio c
              JOIN blocks b ON b.id = c.block_id
              JOIN sessions s ON s.id = b.session_id
              WHERE s.user_id = ? AND c.started_at IN (${placeholders})`,
        args: [userId, ...chunk],
      })
      for (const r of dupRes.rows) {
        existingByStart.set(r.started_at as string, {
          cardioId: r.id as number,
          blockId: r.block_id as number,
          hasSamples: (r.hr_count as number) > 0,
        })
      }
    }
  }

  let imported = 0
  let duplicates = 0

  for (const { raw, activity, startStr, endStr, startTs, endTs, date } of parsed) {
    try {
      let existingBlockId: number | null = null
      const existing = existingByStart.get(startStr)
      if (existing) {
        if (!force && existing.hasSamples) { duplicates++; continue }
        // Re-import: wipe cardio + samples, reuse existing block/session
        existingBlockId = existing.blockId
        await Promise.all([
          db.execute({ sql: `DELETE FROM cardio_hr_samples WHERE cardio_id = ?`, args: [existing.cardioId] }),
          db.execute({ sql: `DELETE FROM cardio_distance_samples WHERE cardio_id = ?`, args: [existing.cardioId] }),
          db.execute({ sql: `DELETE FROM cardio WHERE id = ?`, args: [existing.cardioId] }),
        ])
      }

      // Duration (already in seconds in v2)
      const totalSec = !isNaN(Number(raw.duration)) ? Math.round(Number(raw.duration)) : Math.round((endTs - startTs) / 1000)
      const hh = Math.floor(totalSec / 3600)
      const mm = Math.floor((totalSec % 3600) / 60)
      const ss = totalSec % 60
      const duration = hh > 0
        ? `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
        : `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`

      // Distance — v2 uses { qty, units }
      let distKm = qtyInKm(raw.distance)
      if (isNaN(distKm)) distKm = 0

      const paceSecPerKm = distKm > 0.1 ? totalSec / distKm : null
      const pace = paceSecPerKm
        ? `${Math.floor(paceSecPerKm / 60)}:${String(Math.round(paceSecPerKm % 60)).padStart(2, '0')}`
        : null

      // Calories — activeEnergyBurned takes priority over totalEnergy
      const cals = !isNaN(qty(raw.activeEnergyBurned)) ? qty(raw.activeEnergyBurned) : qty(raw.totalEnergy)

      // Heart rate — try both {qty} nested objects (v2) and plain numbers with capitalized keys
      function hrVal(obj: unknown): number {
        if (obj == null) return NaN
        if (typeof obj === 'number') return obj
        if (typeof obj === 'object') {
          const o = obj as Record<string, unknown>
          if ('qty' in o) return Number(o.qty)
        }
        return NaN
      }
      let avgHR = NaN, minHR = NaN, maxHR = NaN
      if (raw.heartRate && typeof raw.heartRate === 'object') {
        const hr = raw.heartRate as Record<string, unknown>
        avgHR = hrVal(hr.avg ?? hr.Avg)
        minHR = hrVal(hr.min ?? hr.Min)
        maxHR = hrVal(hr.max ?? hr.Max)
      }
      if (isNaN(avgHR)) avgHR = hrVal(raw.avgHeartRate)
      if (isNaN(maxHR)) maxHR = hrVal(raw.maxHeartRate)

      // HR time-series — heartRateData[]: [{ date, Avg, Min, Max }]
      const hrSamples: Array<{ offsetSec: number; bpm: number }> = []
      if (Array.isArray(raw.heartRateData)) {
        for (const s of raw.heartRateData as Record<string, unknown>[]) {
          const ts = new Date(String(s.date ?? s.startDate ?? '')).getTime()
          const bpm = Math.round(Number(s.Avg ?? s.avg ?? s.qty ?? s.value ?? NaN))
          if (isNaN(ts) || isNaN(bpm) || bpm <= 0) continue
          hrSamples.push({ offsetSec: Math.round((ts - startTs) / 1000), bpm })
        }
      }

      // Distance time-series — walkingAndRunningDistance[] or cyclingDistance[]: [{ date, qty, units }]
      const distArr = (raw.walkingAndRunningDistance ?? raw.cyclingDistance ?? []) as Record<string, unknown>[]
      const distSamples: Array<{ offsetSec: number; distKm: number }> = []
      if (Array.isArray(distArr) && distArr.length > 0) {
        let cumKm = 0
        for (const s of distArr) {
          const ts = new Date(String(s.date ?? s.startDate ?? '')).getTime()
          const dkm = qtyInKm(s)
          if (isNaN(ts) || isNaN(dkm) || dkm < 0) continue
          if (ts < startTs || ts > endTs) continue
          cumKm += dkm
          distSamples.push({ offsetSec: Math.round((ts - startTs) / 1000), distKm: cumKm })
        }
      }

      const blockType = activity === 'Cycling' ? 'cycle' : 'run'

      let blockId: number
      if (existingBlockId !== null) {
        blockId = existingBlockId
      } else {
        const sessionRes = await db.execute({
          sql: 'INSERT INTO sessions (user_id, date) VALUES (?, ?) RETURNING id',
          args: [userId, date],
        })
        const sessionId = sessionRes.rows[0].id as number

        const blockRes = await db.execute({
          sql: 'INSERT INTO blocks (session_id, type, position) VALUES (?, ?, 0) RETURNING id',
          args: [sessionId, blockType],
        })
        blockId = blockRes.rows[0].id as number
      }

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
          'health-auto-export',
        ],
      })
      const cardioId = cardioRes.rows[0].id as number

      if (hrSamples.length > 0) {
        await db.batch(hrSamples.map(s => ({
          sql: 'INSERT INTO cardio_hr_samples (cardio_id, time_offset_sec, hr_bpm) VALUES (?, ?, ?)',
          args: [cardioId, s.offsetSec, s.bpm],
        })))
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
