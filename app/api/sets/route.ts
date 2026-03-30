import { NextRequest, NextResponse } from 'next/server'
import { db, initDb } from '@/lib/db'
import { getSession } from '@/lib/auth'

await initDb()

export async function PATCH(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, weight, reps, duration_secs } = await req.json()
  if (!id || weight == null || reps == null) {
    return NextResponse.json({ error: 'id, weight, reps required' }, { status: 400 })
  }

  // Verify ownership
  const check = await db.execute({
    sql: `SELECT st.id FROM sets st
          JOIN blocks b ON st.block_id = b.id
          JOIN sessions s ON b.session_id = s.id
          WHERE st.id = ? AND s.user_id = ?`,
    args: [id, session.userId],
  })
  if (check.rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await db.execute({
    sql: 'UPDATE sets SET weight = ?, reps = ?, duration_secs = ? WHERE id = ?',
    args: [weight, reps, duration_secs ?? null, id],
  })
  return NextResponse.json({ ok: true })
}
