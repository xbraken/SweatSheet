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

      const blockType = w.activity === 'Cycling' ? 'cycle' : 'run'
      const blockRes = await db.execute({
        sql: 'INSERT INTO blocks (session_id, type, position) VALUES (?, ?, 0) RETURNING id',
        args: [sessionId, blockType],
      })
      const blockId = blockRes.rows[0].id as number

      await db.execute({
        sql: 'INSERT INTO cardio (block_id, activity, distance, duration, pace, calories, heart_rate, imported_from) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        args: [
          blockId,
          w.activity,
          w.distance || null,
          w.duration || null,
          w.pace || null,
          w.calories || null,
          w.heartRate || null,
          'apple_health',
        ],
      })
      count++
    } catch { /* skip failed rows, continue */ }
  }

  return NextResponse.json({ imported: count, total: workouts.length })
}
