import { NextResponse } from 'next/server'
import { db, initDb } from '@/lib/db'
import { getSession } from '@/lib/auth'

await initDb()

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const res = await db.execute({
    sql: 'SELECT DISTINCT date FROM sessions WHERE user_id = ? ORDER BY date DESC',
    args: [session.userId],
  })

  return NextResponse.json({ dates: res.rows.map(r => r.date as string) })
}
