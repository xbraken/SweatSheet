import { NextResponse } from 'next/server'
import { db, initDb } from '@/lib/db'
import { getSession } from '@/lib/auth'

await initDb()

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [historyRes, starredRes] = await Promise.all([
    db.execute({
      sql: `SELECT st.exercise,
              st.weight as last_weight,
              st.reps as last_reps
            FROM sets st
            JOIN blocks b ON st.block_id = b.id
            JOIN sessions s ON b.session_id = s.id
            WHERE s.user_id = ?
            GROUP BY st.exercise
            HAVING s.date = MAX(s.date)
            ORDER BY st.exercise`,
      args: [session.userId],
    }),
    db.execute({
      sql: 'SELECT exercise FROM starred_exercises WHERE user_id = ?',
      args: [session.userId],
    }),
  ])

  return NextResponse.json({
    history: historyRes.rows,
    starred: starredRes.rows.map(r => r.exercise as string),
  })
}
