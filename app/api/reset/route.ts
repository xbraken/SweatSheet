import { NextResponse } from 'next/server'
import { db, initDb } from '@/lib/db'
import { getSession } from '@/lib/auth'

await initDb()

export async function POST() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    // Deleting sessions cascades to blocks → sets + cardio
    const result = await db.execute({
      sql: 'DELETE FROM sessions WHERE user_id = ?',
      args: [session.userId],
    })
    return NextResponse.json({ ok: true, deleted: { sessions: result.rowsAffected } })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
