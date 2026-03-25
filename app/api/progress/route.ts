import { NextRequest, NextResponse } from 'next/server'
import { db, initDb } from '@/lib/db'

await initDb()

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const exercise = searchParams.get('exercise')

  try {
    // Distinct exercises that have been logged
    const exercisesRes = await db.execute(
      `SELECT DISTINCT exercise FROM sets ORDER BY exercise`
    )
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
          WHERE st.exercise = ?
          GROUP BY s.date
          ORDER BY s.date DESC
          LIMIT 20
        `,
        args: [exercise],
      })
      liftHistory = liftRes.rows
    }

    // Cardio history
    const cardioRes = await db.execute(`
      SELECT s.date, c.activity, c.distance, c.duration
      FROM cardio c
      JOIN blocks b ON c.block_id = b.id
      JOIN sessions s ON b.session_id = s.id
      ORDER BY s.date DESC
      LIMIT 20
    `)

    return NextResponse.json({
      exercises,
      liftHistory,
      cardioHistory: cardioRes.rows,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    console.error('GET /api/progress error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
