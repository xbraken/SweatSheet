import { NextRequest, NextResponse } from 'next/server'
import { db, initDb } from '@/lib/db'
import { getSession } from '@/lib/auth'

await initDb()

type WorkoutPayload = {
  date: string
  activity: string
  distance: string
  duration: string
  pace: string | null
  calories: number | null
  heartRate: number | null
  hrMin?: number | null
  hrMax?: number | null
  startedAt?: string | null
  endedAt?: string | null
  hrSamples?: Array<{ offsetSec: number; bpm: number }>
  distanceSamples?: Array<{ offsetSec: number; distKm: number }>
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { workouts } = await req.json() as { workouts: WorkoutPayload[] }

  if (!workouts || workouts.length === 0) {
    return NextResponse.json({ error: 'No workouts provided' }, { status: 400 })
  }

  // Batch duplicate check: fetch all existing started_at values in one query
  const startTimes = workouts.map(w => w.startedAt).filter(Boolean) as string[]
  const existingStarts = new Set<string>()
  if (startTimes.length > 0) {
    const placeholders = startTimes.map(() => '?').join(',')
    const dupRes = await db.execute({
      sql: `SELECT DISTINCT c.started_at FROM cardio c
            JOIN blocks b ON b.id = c.block_id
            JOIN sessions s ON s.id = b.session_id
            WHERE s.user_id = ? AND c.started_at IN (${placeholders})`,
      args: [session.userId, ...startTimes],
    })
    for (const r of dupRes.rows) existingStarts.add(r.started_at as string)
  }

  // Filter out duplicates
  const newWorkouts = workouts.filter(w => !w.startedAt || !existingStarts.has(w.startedAt))
  const duplicates = workouts.length - newWorkouts.length

  let count = 0
  for (const w of newWorkouts) {
    try {
      // Insert session + block + cardio sequentially (need RETURNING ids)
      const sessionRes = await db.execute({
        sql: 'INSERT INTO sessions (user_id, date) VALUES (?, ?) RETURNING id',
        args: [session.userId, w.date],
      })
      const sessionId = sessionRes.rows[0].id as number

      const blockType = w.activity === 'Cycling' ? 'cycle' : 'run'
      const blockRes = await db.execute({
        sql: 'INSERT INTO blocks (session_id, type, position) VALUES (?, ?, 0) RETURNING id',
        args: [sessionId, blockType],
      })
      const blockId = blockRes.rows[0].id as number

      const cardioRes = await db.execute({
        sql: 'INSERT INTO cardio (block_id, activity, distance, duration, pace, calories, heart_rate, hr_min, hr_max, started_at, ended_at, imported_from) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id',
        args: [
          blockId,
          w.activity,
          w.distance || null,
          w.duration || null,
          w.pace || null,
          w.calories || null,
          w.heartRate || null,
          w.hrMin || null,
          w.hrMax || null,
          w.startedAt || null,
          w.endedAt || null,
          'apple_health',
        ],
      })
      const cardioId = cardioRes.rows[0].id as number

      // Batch insert HR and distance samples in parallel
      await Promise.all([
        w.hrSamples && w.hrSamples.length > 0
          ? db.batch(w.hrSamples.map(s => ({
              sql: 'INSERT INTO cardio_hr_samples (cardio_id, time_offset_sec, hr_bpm) VALUES (?, ?, ?)',
              args: [cardioId, s.offsetSec, s.bpm],
            })))
          : Promise.resolve(),
        w.distanceSamples && w.distanceSamples.length > 0
          ? db.batch(w.distanceSamples.map(s => ({
              sql: 'INSERT INTO cardio_distance_samples (cardio_id, time_offset_sec, distance_km) VALUES (?, ?, ?)',
              args: [cardioId, s.offsetSec, s.distKm],
            })))
          : Promise.resolve(),
      ])
      count++
    } catch { /* skip failed rows, continue */ }
  }

  return NextResponse.json({ imported: count, duplicates, total: workouts.length })
}
