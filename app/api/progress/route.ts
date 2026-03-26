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

    // Calendar data — per day, using subqueries to avoid cross-product between sets and cardio
    const calendarRes = await db.execute({
      sql: `SELECT s.date,
              MAX(lft.max_weight) as max_weight,
              SUM(crd.total_distance) as total_distance,
              COALESCE(SUM(crd.cardio_count), 0) as cardio_count
            FROM sessions s
            LEFT JOIN (
              SELECT b.session_id, MAX(st.weight) as max_weight
              FROM sets st JOIN blocks b ON st.block_id = b.id AND b.type = 'lift'
              GROUP BY b.session_id
            ) lft ON lft.session_id = s.id
            LEFT JOIN (
              SELECT b.session_id, SUM(c.distance) as total_distance, COUNT(*) as cardio_count
              FROM cardio c JOIN blocks b ON c.block_id = b.id
              GROUP BY b.session_id
            ) crd ON crd.session_id = s.id
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
