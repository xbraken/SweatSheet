import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db, initDb } from '@/lib/db'

await initDb()

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const res = await db.execute({
    sql: `SELECT avatar FROM users WHERE id = ?`,
    args: [session.userId],
  })
  const avatar = (res.rows[0]?.avatar as string | null) ?? null
  return NextResponse.json({ userId: session.userId, username: session.username, avatar })
}
