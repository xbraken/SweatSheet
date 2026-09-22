import { NextResponse } from 'next/server'
import { db, initDb } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { getUserTz } from '@/lib/tz'
import { addDays, todayIn, weekStartMon } from '@/lib/dates'

await initDb()

/**
 * GET — this week's (Mon–Sun, viewer's timezone) standings for you + everyone you follow.
 * Returns all three metrics so the client can switch tabs without refetching.
 */
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const today = todayIn(await getUserTz())
  const weekStart = weekStartMon(today)
  const weekEnd = addDays(weekStart, 6)

  const res = await db.execute({
    sql: `WITH people AS (
            SELECT id, username, avatar FROM users WHERE id = ?
            UNION
            SELECT u.id, u.username, u.avatar FROM follows f JOIN users u ON u.id = f.following_id WHERE f.follower_id = ?
          )
          SELECT p.id as user_id, p.username, p.avatar,
            (SELECT COUNT(DISTINCT s.date) FROM sessions s
               WHERE s.user_id = p.id AND s.date BETWEEN ? AND ?
               AND EXISTS (SELECT 1 FROM blocks b WHERE b.session_id = s.id)) as sessions,
            (SELECT COALESCE(SUM(st.weight * st.reps), 0) FROM sets st
               JOIN blocks b ON st.block_id = b.id JOIN sessions s ON b.session_id = s.id
               WHERE s.user_id = p.id AND s.date BETWEEN ? AND ? AND COALESCE(st.is_warmup, 0) = 0) as volume,
            (SELECT COALESCE(SUM(c.distance), 0) FROM cardio c
               JOIN blocks b ON c.block_id = b.id JOIN sessions s ON b.session_id = s.id
               WHERE s.user_id = p.id AND s.date BETWEEN ? AND ?) as distance
          FROM people p`,
    args: [session.userId, session.userId, weekStart, weekEnd, weekStart, weekEnd, weekStart, weekEnd],
  })

  const rows = res.rows.map(r => ({
    userId: r.user_id as number,
    username: r.username as string,
    avatar: (r.avatar as string | null) ?? null,
    isMe: Number(r.user_id) === Number(session.userId),
    sessions: Number(r.sessions),
    volume: Math.round(Number(r.volume)),
    distance: Math.round(Number(r.distance) * 10) / 10,
  }))

  return NextResponse.json({ weekStart, weekEnd, rows })
}
