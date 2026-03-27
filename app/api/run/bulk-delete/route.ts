import { NextRequest, NextResponse } from 'next/server'
import { db, initDb } from '@/lib/db'
import { getSession } from '@/lib/auth'

await initDb()

export async function DELETE(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { ids } = await req.json() as { ids: number[] }
  if (!Array.isArray(ids) || ids.length === 0) return NextResponse.json({ error: 'No ids provided' }, { status: 400 })

  const placeholders = ids.map(() => '?').join(',')

  // Fetch all valid cardio entries and their block/session IDs in one query
  const res = await db.execute({
    sql: `SELECT c.id as cardio_id, b.id as block_id, s.id as session_id
          FROM cardio c
          JOIN blocks b ON b.id = c.block_id
          JOIN sessions s ON s.id = b.session_id
          WHERE c.id IN (${placeholders}) AND s.user_id = ?`,
    args: [...ids, session.userId],
  })
  if (res.rows.length === 0) return NextResponse.json({ ok: true, deleted: 0 })

  const validIds = res.rows.map((r: { cardio_id: unknown }) => r.cardio_id as number)
  const blockIds = [...new Set(res.rows.map((r: { block_id: unknown }) => r.block_id as number))]
  const sessionIds = [...new Set(res.rows.map((r: { session_id: unknown }) => r.session_id as number))]

  const validPlaceholders = validIds.map(() => '?').join(',')
  const blockPlaceholders = blockIds.map(() => '?').join(',')
  const sessionPlaceholders = sessionIds.map(() => '?').join(',')

  // Delete all cardio entries and their samples in parallel
  await Promise.all([
    db.execute({ sql: `DELETE FROM cardio_hr_samples WHERE cardio_id IN (${validPlaceholders})`, args: validIds }),
    db.execute({ sql: `DELETE FROM cardio_distance_samples WHERE cardio_id IN (${validPlaceholders})`, args: validIds }),
    db.execute({ sql: `DELETE FROM cardio WHERE id IN (${validPlaceholders})`, args: validIds }),
  ])

  // Clean up empty blocks (blocks with no remaining cardio or sets)
  await db.execute({
    sql: `DELETE FROM blocks WHERE id IN (${blockPlaceholders})
          AND NOT EXISTS (SELECT 1 FROM cardio WHERE block_id = blocks.id)
          AND NOT EXISTS (SELECT 1 FROM sets WHERE block_id = blocks.id)`,
    args: blockIds,
  })

  // Clean up empty sessions (sessions with no remaining blocks)
  await db.execute({
    sql: `DELETE FROM sessions WHERE id IN (${sessionPlaceholders})
          AND NOT EXISTS (SELECT 1 FROM blocks WHERE session_id = sessions.id)`,
    args: sessionIds,
  })

  return NextResponse.json({ ok: true, deleted: validIds.length })
}
