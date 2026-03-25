import { NextResponse } from 'next/server'
import { db, initDb } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { EXERCISES } from '@/lib/exercises'

await initDb()

const VALID_NAMES = new Set(EXERCISES.map(e => e.name))

/** GET: list all exercise names in the user's history that aren't in the master list */
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const res = await db.execute({
    sql: `SELECT DISTINCT st.exercise, COUNT(*) as set_count
          FROM sets st
          JOIN blocks b ON st.block_id = b.id
          JOIN sessions s ON b.session_id = s.id
          WHERE s.user_id = ?
          GROUP BY st.exercise
          ORDER BY st.exercise`,
    args: [session.userId],
  })

  const invalid = res.rows.filter(r => !VALID_NAMES.has(r.exercise as string))
  return NextResponse.json({ invalid, total: res.rows.length })
}

/** DELETE: remove all sets with exercise names not in the master list */
export async function DELETE() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Delete sets with invalid exercise names for this user
  const res = await db.execute({
    sql: `DELETE FROM sets WHERE id IN (
      SELECT st.id FROM sets st
      JOIN blocks b ON st.block_id = b.id
      JOIN sessions s ON b.session_id = s.id
      WHERE s.user_id = ? AND st.exercise NOT IN (${EXERCISES.map(() => '?').join(',')})
    )`,
    args: [session.userId, ...EXERCISES.map(e => e.name)],
  })

  // Clean up any empty lift blocks (blocks with no sets left)
  await db.execute({
    sql: `DELETE FROM blocks WHERE id IN (
      SELECT b.id FROM blocks b
      JOIN sessions s ON b.session_id = s.id
      WHERE s.user_id = ? AND b.type = 'lift'
      AND NOT EXISTS (SELECT 1 FROM sets st WHERE st.block_id = b.id)
    )`,
    args: [session.userId],
  })

  // Clean up any empty sessions (no blocks left)
  await db.execute({
    sql: `DELETE FROM sessions WHERE id IN (
      SELECT s.id FROM sessions s
      WHERE s.user_id = ?
      AND NOT EXISTS (SELECT 1 FROM blocks b WHERE b.session_id = s.id)
    )`,
    args: [session.userId],
  })

  return NextResponse.json({ ok: true, deleted: res.rowsAffected })
}
