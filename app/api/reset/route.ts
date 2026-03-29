import { NextResponse } from 'next/server'
import { db, initDb } from '@/lib/db'
import { getSession } from '@/lib/auth'

await initDb()

export async function POST() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const uid = session.userId

  try {
    // Delete innermost tables first to avoid SQLite scanning the full cascade chain.
    // Cascade deletes in SQLite traverse each parent row individually — with hundreds
    // of thousands of HR/distance samples this reads millions of rows. Explicit ordered
    // deletes using subqueries let the engine use indexes efficiently.
    await db.execute({
      sql: `DELETE FROM cardio_hr_samples WHERE cardio_id IN (
              SELECT c.id FROM cardio c
              JOIN blocks b ON c.block_id = b.id
              JOIN sessions s ON b.session_id = s.id
              WHERE s.user_id = ?
            )`,
      args: [uid],
    })
    await db.execute({
      sql: `DELETE FROM cardio_distance_samples WHERE cardio_id IN (
              SELECT c.id FROM cardio c
              JOIN blocks b ON c.block_id = b.id
              JOIN sessions s ON b.session_id = s.id
              WHERE s.user_id = ?
            )`,
      args: [uid],
    })
    await db.execute({
      sql: `DELETE FROM cardio WHERE block_id IN (
              SELECT b.id FROM blocks b
              JOIN sessions s ON b.session_id = s.id
              WHERE s.user_id = ?
            )`,
      args: [uid],
    })
    await db.execute({
      sql: `DELETE FROM sets WHERE block_id IN (
              SELECT b.id FROM blocks b
              JOIN sessions s ON b.session_id = s.id
              WHERE s.user_id = ?
            )`,
      args: [uid],
    })
    await db.execute({
      sql: `DELETE FROM blocks WHERE session_id IN (SELECT id FROM sessions WHERE user_id = ?)`,
      args: [uid],
    })
    // All children already gone — this delete has nothing left to cascade through
    const result = await db.execute({
      sql: 'DELETE FROM sessions WHERE user_id = ?',
      args: [uid],
    })

    return NextResponse.json({ ok: true, deleted: { sessions: result.rowsAffected } })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
