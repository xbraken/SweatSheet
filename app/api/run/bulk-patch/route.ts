import { NextRequest, NextResponse } from 'next/server'
import { db, initDb } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { withInterval } from '@/lib/cardio-activity'

await initDb()

export async function PATCH(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { ids, interval } = await req.json() as { ids: number[]; interval: boolean }
  if (!Array.isArray(ids) || ids.length === 0) return NextResponse.json({ error: 'No ids provided' }, { status: 400 })
  if (typeof interval !== 'boolean') return NextResponse.json({ error: 'Invalid interval flag' }, { status: 400 })

  // Each entry keeps its own base activity — a mixed selection of runs and rides
  // becomes "Interval run" / "Interval ride" respectively.
  const rows = await db.execute({
    sql: `SELECT c.id, c.activity FROM cardio c
          JOIN blocks b ON b.id = c.block_id
          JOIN sessions s ON s.id = b.session_id
          WHERE c.id IN (${ids.map(() => '?').join(',')}) AND s.user_id = ?`,
    args: [...ids, session.userId],
  })
  if (rows.rows.length > 0) {
    await db.batch(rows.rows.map(r => ({
      sql: 'UPDATE cardio SET activity = ? WHERE id = ?',
      args: [withInterval(String(r.activity ?? ''), interval), Number(r.id)],
    })))
  }

  return NextResponse.json({ ok: true, updated: rows.rows.length })
}
