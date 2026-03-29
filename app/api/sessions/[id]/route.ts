import { NextRequest, NextResponse } from 'next/server'
import { db, initDb } from '@/lib/db'
import { getSession } from '@/lib/auth'

await initDb()

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const sessionId = parseInt(id, 10)
  if (isNaN(sessionId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const check = await db.execute({ sql: 'SELECT user_id FROM sessions WHERE id = ?', args: [sessionId] })
  if (!check.rows.length || (check.rows[0].user_id as number) !== session.userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Delete all related data in dependency order
  await db.batch([
    {
      sql: `DELETE FROM cardio_hr_samples WHERE cardio_id IN (
        SELECT c.id FROM cardio c JOIN blocks b ON c.block_id = b.id WHERE b.session_id = ?
      )`,
      args: [sessionId],
    },
    {
      sql: `DELETE FROM cardio_distance_samples WHERE cardio_id IN (
        SELECT c.id FROM cardio c JOIN blocks b ON c.block_id = b.id WHERE b.session_id = ?
      )`,
      args: [sessionId],
    },
    { sql: 'DELETE FROM cardio WHERE block_id IN (SELECT id FROM blocks WHERE session_id = ?)', args: [sessionId] },
    { sql: 'DELETE FROM sets WHERE block_id IN (SELECT id FROM blocks WHERE session_id = ?)', args: [sessionId] },
    { sql: 'DELETE FROM blocks WHERE session_id = ?', args: [sessionId] },
    { sql: 'DELETE FROM sessions WHERE id = ?', args: [sessionId] },
  ])

  return NextResponse.json({ ok: true })
}
