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
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { workouts } = await req.json() as { workouts: WorkoutPayload[] }

  if (!workouts || workouts.length === 0) {
    return NextResponse.json({ error: 'No workouts provided' }, { status: 400 })
  }

  let count = 0
  for (const w of workouts) {
    try {
      const sessionRes = await db.execute({
        sql: 'INSERT INTO sessions (user_id, date) VALUES (?, ?) RETURNING id',
        args: [session.userId, w.date],
      })
      const sessionId = sessionRes.rows[0].id as number

      const blockType = w.activity === 'Cycling' ? 'cycle' : w.activity === 'Walking' ? 'cardio' : 'run'
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

      // Batch insert HR samples if present
      if (w.hrSamples && w.hrSamples.length > 0) {
        await db.batch(
          w.hrSamples.map(s => ({
            sql: 'INSERT INTO cardio_hr_samples (cardio_id, time_offset_sec, hr_bpm) VALUES (?, ?, ?)',
            args: [cardioId, s.offsetSec, s.bpm],
          }))
        )
      }
      count++
    } catch { /* skip failed rows, continue */ }
  }

  return NextResponse.json({ imported: count, total: workouts.length })
}
