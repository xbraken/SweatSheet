import { NextRequest, NextResponse } from 'next/server'
import { db, initDb } from '@/lib/db'
import { getSession } from '@/lib/auth'

await initDb()

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const exercise = searchParams.get('exercise')
  const liftOnly = searchParams.get('liftOnly') === '1'
  const userId = session.userId

  try {
    // liftOnly mode: only fetch lift history for the given exercise (skip the 3 shared queries)
    if (liftOnly && exercise) {
      const liftRes = await db.execute({
        sql: `SELECT s.date, st.id, st.weight, st.reps, st.duration_secs, st.logged_at
              FROM sets st
              JOIN blocks b ON st.block_id = b.id
              JOIN sessions s ON b.session_id = s.id
              WHERE st.exercise = ? AND s.user_id = ?
              ORDER BY s.date DESC, b.id, st.id`,
        args: [exercise, userId],
      })
      const dateMap = new Map<string, { max_weight: number; volume: number; max_duration: number; total_duration: number; rows: { id: number; weight: number; reps: number; duration_secs: number | null; logged_at: string | null }[]; first_logged_at: string | null }>()
      for (const r of liftRes.rows) {
        const date = r.date as string
        const id = r.id as number
        const weight = Number(r.weight)
        const reps = Number(r.reps)
        const duration_secs = r.duration_secs != null ? Number(r.duration_secs) : null
        const logged_at = (r.logged_at as string | null) ?? null
        const cur = dateMap.get(date) ?? { max_weight: 0, volume: 0, max_duration: 0, total_duration: 0, rows: [], first_logged_at: null }
        cur.max_weight = Math.max(cur.max_weight, weight)
        cur.volume += weight * reps
        if (duration_secs != null) {
          cur.max_duration = Math.max(cur.max_duration, duration_secs)
          cur.total_duration += duration_secs
        }
        cur.rows.push({ id, weight, reps, duration_secs, logged_at })
        if (!cur.first_logged_at && logged_at) cur.first_logged_at = logged_at
        dateMap.set(date, cur)
      }
      const liftHistory = Array.from(dateMap.entries()).map(([date, d]) => ({
        date, max_weight: d.max_weight, volume: Math.round(d.volume), max_duration: d.max_duration, total_duration: d.total_duration, set_count: d.rows.length, rows: d.rows, first_logged_at: d.first_logged_at,
      }))
      return NextResponse.json({ liftHistory })
    }

    // Run independent queries in parallel
    const [exercisesRes, cardioRes, calendarRes, liftRes] = await Promise.all([
      db.execute({
        sql: `SELECT DISTINCT st.exercise FROM sets st
              JOIN blocks b ON st.block_id = b.id
              JOIN sessions s ON b.session_id = s.id
              WHERE s.user_id = ? ORDER BY st.exercise`,
        args: [userId],
      }),
      db.execute({
        sql: `SELECT c.id as cardio_id, s.date, c.activity, c.distance, c.duration, c.pace, c.calories, c.heart_rate, COALESCE(c.started_at, s.created_at) as started_at
              FROM cardio c
              JOIN blocks b ON c.block_id = b.id
              JOIN sessions s ON b.session_id = s.id
              WHERE s.user_id = ?
              ORDER BY s.date DESC
              LIMIT 500`,
        args: [userId],
      }),
      db.execute({
        sql: `SELECT s.date,
                MAX(CASE WHEN b.type = 'lift' THEN st.weight END) as max_weight,
                MAX(CASE WHEN b.type = 'lift' THEN st.duration_secs END) as max_duration,
                COUNT(DISTINCT CASE WHEN b.type = 'lift' THEN st.id END) as lift_count,
                SUM(c.distance) as total_distance,
                COUNT(DISTINCT c.id) as cardio_count
              FROM sessions s
              LEFT JOIN blocks b ON b.session_id = s.id
              LEFT JOIN sets st ON st.block_id = b.id
              LEFT JOIN cardio c ON c.block_id = b.id
              WHERE s.user_id = ?
              GROUP BY s.date`,
        args: [userId],
      }),
      exercise
        ? db.execute({
            sql: `SELECT s.date, st.id, st.weight, st.reps, st.duration_secs, st.logged_at
                  FROM sets st
                  JOIN blocks b ON st.block_id = b.id
                  JOIN sessions s ON b.session_id = s.id
                  WHERE st.exercise = ? AND s.user_id = ?
                  ORDER BY s.date DESC, b.id, st.id`,
            args: [exercise, userId],
          })
        : Promise.resolve({ rows: [] }),
    ])

    const exercises = exercisesRes.rows.map(r => r.exercise as string)

    let liftHistory: object[] = []
    if (exercise && liftRes.rows.length > 0) {
      const dateMap = new Map<string, { max_weight: number; volume: number; max_duration: number; total_duration: number; rows: { id: number; weight: number; reps: number; duration_secs: number | null; logged_at: string | null }[]; first_logged_at: string | null }>()
      for (const r of liftRes.rows) {
        const date = r.date as string
        const id = r.id as number
        const weight = Number(r.weight)
        const reps = Number(r.reps)
        const duration_secs = r.duration_secs != null ? Number(r.duration_secs) : null
        const logged_at = (r.logged_at as string | null) ?? null
        const cur = dateMap.get(date) ?? { max_weight: 0, volume: 0, max_duration: 0, total_duration: 0, rows: [], first_logged_at: null }
        cur.max_weight = Math.max(cur.max_weight, weight)
        cur.volume += weight * reps
        if (duration_secs != null) {
          cur.max_duration = Math.max(cur.max_duration, duration_secs)
          cur.total_duration += duration_secs
        }
        cur.rows.push({ id, weight, reps, duration_secs, logged_at })
        if (!cur.first_logged_at && logged_at) cur.first_logged_at = logged_at
        dateMap.set(date, cur)
      }
      liftHistory = Array.from(dateMap.entries()).map(([date, d]) => ({
        date,
        max_weight: d.max_weight,
        volume: Math.round(d.volume),
        max_duration: d.max_duration,
        total_duration: d.total_duration,
        set_count: d.rows.length,
        rows: d.rows,
        first_logged_at: d.first_logged_at,
      }))
    }

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
