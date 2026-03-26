import { NextRequest, NextResponse } from 'next/server'
import { db, initDb } from '@/lib/db'
import { getSession } from '@/lib/auth'

await initDb()

export async function DELETE(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { ids } = await req.json() as { ids: number[] }
  if (!Array.isArray(ids) || ids.length === 0) return NextResponse.json({ error: 'No ids provided' }, { status: 400 })

  let deleted = 0
  for (const cardioId of ids) {
    const res = await db.execute({
      sql: `SELECT b.id as block_id, s.id as session_id FROM cardio c
            JOIN blocks b ON b.id = c.block_id
            JOIN sessions s ON s.id = b.session_id
            WHERE c.id = ? AND s.user_id = ?`,
      args: [cardioId, session.userId],
    })
    if (res.rows.length === 0) continue

    const { block_id, session_id } = res.rows[0] as unknown as { block_id: number; session_id: number }
    await db.execute({ sql: `DELETE FROM cardio WHERE id = ?`, args: [cardioId] })

    const blockEmpty = await db.execute({ sql: `SELECT COUNT(*) as n FROM cardio WHERE block_id = ?`, args: [block_id] })
    if ((blockEmpty.rows[0].n as number) === 0) {
      await db.execute({ sql: `DELETE FROM blocks WHERE id = ?`, args: [block_id] })
      const sessionEmpty = await db.execute({ sql: `SELECT COUNT(*) as n FROM blocks WHERE session_id = ?`, args: [session_id] })
      if ((sessionEmpty.rows[0].n as number) === 0) {
        await db.execute({ sql: `DELETE FROM sessions WHERE id = ?`, args: [session_id] })
      }
    }
    deleted++
  }

  return NextResponse.json({ ok: true, deleted })
}
