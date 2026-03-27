import { NextResponse } from 'next/server'
import { db, initDb } from '@/lib/db'
import { getSession } from '@/lib/auth'

await initDb()

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [historyRes, starredRes] = await Promise.all([
    db.execute({
      sql: `SELECT exercise, last_weight, last_reps FROM (
              SELECT st.exercise,
                st.weight as last_weight,
                st.reps as last_reps,
                ROW_NUMBER() OVER (PARTITION BY st.exercise ORDER BY s.date DESC, b.id DESC, st.id DESC) as rn
              FROM sets st
              JOIN blocks b ON st.block_id = b.id
              JOIN sessions s ON b.session_id = s.id
              WHERE s.user_id = ?
            ) WHERE rn = 1
            ORDER BY exercise`,
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
