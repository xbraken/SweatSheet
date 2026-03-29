import { NextRequest, NextResponse } from 'next/server'
import { db, initDb } from '@/lib/db'
import { getSession } from '@/lib/auth'

await initDb()

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const q = new URL(req.url).searchParams.get('q')?.trim().toLowerCase()
  if (!q || q.length < 1) return NextResponse.json({ users: [] })

  const res = await db.execute({
    sql: `SELECT u.id, u.username, u.avatar,
                 EXISTS(SELECT 1 FROM follows WHERE follower_id = ? AND following_id = u.id) as is_following
          FROM users u
          WHERE lower(u.username) LIKE ? AND u.id != ?
          LIMIT 10`,
    args: [session.userId, `%${q}%`, session.userId],
  })

  return NextResponse.json({ users: res.rows })
}
