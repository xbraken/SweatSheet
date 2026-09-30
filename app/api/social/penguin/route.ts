import { NextRequest, NextResponse } from 'next/server'
import { db, initDb } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { FRIENDS_BEST_SQL, PENGUIN, UPSERT_BEST_SQL, validScore } from '@/lib/game-scores'

await initDb()

async function board(userId: number) {
  const res = await db.execute({ sql: FRIENDS_BEST_SQL, args: [userId, userId, PENGUIN] })
  return res.rows.map(r => ({
    username: r.username as string,
    best: Number(r.best),
    isMe: Number(r.user_id) === Number(userId),
  }))
}

/** GET — penguin leaderboard for you + the people you follow */
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ rows: await board(session.userId) })
}

/** POST { score } — record a run; only raises your best. Returns the updated leaderboard. */
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { score } = await req.json().catch(() => ({})) as { score?: unknown }
  if (!validScore(score)) return NextResponse.json({ error: 'Invalid score' }, { status: 400 })
  await db.execute({ sql: UPSERT_BEST_SQL, args: [session.userId, PENGUIN, score] })
  return NextResponse.json({ rows: await board(session.userId) })
}
