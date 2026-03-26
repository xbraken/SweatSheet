import { NextRequest, NextResponse } from 'next/server'
import { db, initDb } from '@/lib/db'
import { getSession } from '@/lib/auth'

await initDb()

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { username } = await req.json()
  const userRes = await db.execute({ sql: 'SELECT id FROM users WHERE username = ?', args: [username] })
  if (userRes.rows.length === 0) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const targetId = userRes.rows[0].id as number
  if (targetId === session.userId) return NextResponse.json({ error: 'Cannot follow yourself' }, { status: 400 })

  await db.execute({
    sql: 'INSERT OR IGNORE INTO follows (follower_id, following_id) VALUES (?, ?)',
    args: [session.userId, targetId],
  })

  return NextResponse.json({ ok: true })
}

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
