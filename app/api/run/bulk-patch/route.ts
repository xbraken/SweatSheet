import { NextRequest, NextResponse } from 'next/server'
import { db, initDb } from '@/lib/db'
import { getSession } from '@/lib/auth'

await initDb()

export async function PATCH(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { ids, activity } = await req.json() as { ids: number[]; activity: string }
  if (!Array.isArray(ids) || ids.length === 0) return NextResponse.json({ error: 'No ids provided' }, { status: 400 })
  if (!['Run', 'Indoor run', 'Interval run'].includes(activity)) return NextResponse.json({ error: 'Invalid activity' }, { status: 400 })

  await db.execute({
    sql: `UPDATE cardio SET activity = ?
          WHERE id IN (${ids.map(() => '?').join(',')})
          AND block_id IN (
            SELECT b.id FROM blocks b
            JOIN sessions s ON s.id = b.session_id
            WHERE s.user_id = ?
          )`,
    args: [activity, ...ids, session.userId],
  })

  return NextResponse.json({ ok: true, updated: ids.length })
}
