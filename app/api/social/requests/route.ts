import { NextRequest, NextResponse } from 'next/server'
import { db, initDb } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { ACCEPT_REQUEST_SQL, FOLLOWERS_SQL, INCOMING_REQUESTS_SQL, REMOVE_FOLLOWER_SQL } from '@/lib/follows'

await initDb()

const person = (r: Record<string, unknown>) => ({ username: r.username as string, avatar: (r.avatar as string | null) ?? null })

/** GET — follow requests waiting on you, and the followers who can already see your workouts */
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const [reqRes, folRes] = await Promise.all([
    db.execute({ sql: INCOMING_REQUESTS_SQL, args: [session.userId] }),
    db.execute({ sql: FOLLOWERS_SQL, args: [session.userId] }),
  ])
  return NextResponse.json({ requests: reqRes.rows.map(person), followers: folRes.rows.map(person) })
}

/**
 * POST { username, action } — 'accept' / 'decline' a request, or 'remove' a follower
 * (they stop seeing your workouts; they'd have to request again).
 */
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { username, action } = await req.json().catch(() => ({})) as { username?: string; action?: string }
  if (!username || (action !== 'accept' && action !== 'decline' && action !== 'remove')) {
    return NextResponse.json({ error: 'username and action (accept|decline|remove) required' }, { status: 400 })
  }
  const userRes = await db.execute({ sql: 'SELECT id FROM users WHERE username = ?', args: [username] })
  if (userRes.rows.length === 0) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  const requesterId = userRes.rows[0].id as number

  await db.execute({ sql: action === 'accept' ? ACCEPT_REQUEST_SQL : REMOVE_FOLLOWER_SQL, args: [session.userId, requesterId] })
  return NextResponse.json({ ok: true })
}
