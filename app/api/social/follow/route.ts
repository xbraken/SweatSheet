import { NextRequest, NextResponse } from 'next/server'
import { db, initDb } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { FOLLOW_STATUS_SQL, REQUEST_FOLLOW_SQL, toFollowStatus } from '@/lib/follows'

await initDb()

/** POST { username } — send a follow request. They have to accept before you see their workouts. */
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { username } = await req.json()
  const userRes = await db.execute({ sql: 'SELECT id FROM users WHERE username = ?', args: [username] })
  if (userRes.rows.length === 0) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const targetId = userRes.rows[0].id as number
  if (targetId === session.userId) return NextResponse.json({ error: 'Cannot follow yourself' }, { status: 400 })

  await db.execute({ sql: REQUEST_FOLLOW_SQL, args: [session.userId, targetId] })
  const st = await db.execute({ sql: FOLLOW_STATUS_SQL, args: [session.userId, targetId] })

  return NextResponse.json({ ok: true, status: toFollowStatus(st.rows[0]?.status) })
}

/** DELETE ?username= — unfollow, or cancel a pending request */
export async function DELETE(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const username = new URL(req.url).searchParams.get('username')
  if (!username) return NextResponse.json({ error: 'Missing username' }, { status: 400 })

  const userRes = await db.execute({ sql: 'SELECT id FROM users WHERE username = ?', args: [username] })
  if (userRes.rows.length === 0) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const targetId = userRes.rows[0].id as number
  await db.execute({
    sql: 'DELETE FROM follows WHERE follower_id = ? AND following_id = ?',
    args: [session.userId, targetId],
  })

  return NextResponse.json({ ok: true })
}
