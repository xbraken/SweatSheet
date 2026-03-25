import { NextRequest, NextResponse } from 'next/server'
import { db, initDb } from '@/lib/db'
import { getSession } from '@/lib/auth'

await initDb()

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const exercise = searchParams.get('exercise')
  const userId = session.userId

  try {
    // Distinct exercises that have been logged by this user
    const exercisesRes = await db.execute({
      sql: `SELECT DISTINCT st.exercise FROM sets st
            JOIN blocks b ON st.block_id = b.id
            JOIN sessions s ON b.session_id = s.id
            WHERE s.user_id = ? ORDER BY st.exercise`,
      args: [userId],
    })
    const exercises = exercisesRes.rows.map(r => r.exercise as string)

    // Lift history for the selected exercise
    let liftHistory: object[] = []
    if (exercise) {
      const liftRes = await db.execute({
        sql: `
          SELECT s.date,
            MAX(st.weight) as max_weight,
            SUM(st.weight * st.reps) as volume,
            COUNT(*) as set_count
          FROM sets st
          JOIN blocks b ON st.block_id = b.id
          JOIN sessions s ON b.session_id = s.id
          WHERE st.exercise = ? AND s.user_id = ?
          GROUP BY s.date
          ORDER BY s.date DESC
        `,
        args: [exercise, userId],
      })
      liftHistory = liftRes.rows
    }

    // Cardio history — all entries for trend analysis
    const cardioRes = await db.execute({
      sql: `SELECT c.id as cardio_id, s.date, c.activity, c.distance, c.duration, c.pace, c.calories, c.heart_rate
            FROM cardio c
            JOIN blocks b ON c.block_id = b.id
            JOIN sessions s ON b.session_id = s.id
            WHERE s.user_id = ?
            ORDER BY s.date DESC`,
      args: [userId],
    })

    // Calendar data — all time, aggregated per day
    const calendarRes = await db.execute({
      sql: `SELECT s.date,
              MAX(st.weight) as max_weight,
              SUM(c.distance) as total_distance
            FROM sessions s
            LEFT JOIN blocks b ON b.session_id = s.id
            LEFT JOIN sets st ON st.block_id = b.id
            LEFT JOIN cardio c ON c.block_id = b.id
            WHERE s.user_id = ?
            GROUP BY s.date`,
      args: [userId],
    })

    return NextResponse.json({
      exercises,
      liftHistory,
      cardioHistory: cardioRes.rows,
      calendarData: calendarRes.rows,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    console.error('GET /api/progress error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
