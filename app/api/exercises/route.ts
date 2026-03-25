import { NextResponse } from 'next/server'
import { db, initDb } from '@/lib/db'
import { getSession } from '@/lib/auth'

await initDb()

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Return exercises with their most recent weight/reps for prefill
  const result = await db.execute({
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
  })

  return NextResponse.json(result.rows)
}
