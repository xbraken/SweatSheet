import { NextRequest, NextResponse } from 'next/server'
import { db, initDb } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { prsFor, reactionsFor } from '@/lib/social'

await initDb()

const PAGE_SIZE = 20

/**
 * GET — timeline of sessions from people you follow, plus your own, newest first.
 * Paginate with ?before=<cursor> using the `nextCursor` from the previous page.
 */
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Cursor is "<created_at>|<id>" so sessions created in the same second still page cleanly
  const before = new URL(req.url).searchParams.get('before')
  const [beforeTs, beforeId] = before?.split('|') ?? []
  const cursorSql = beforeTs && beforeId ? 'AND (s.created_at < ? OR (s.created_at = ? AND s.id < ?))' : ''
  const cursorArgs = beforeTs && beforeId ? [beforeTs, beforeTs, Number(beforeId)] : []

  const followingRes = await db.execute({
    sql: 'SELECT COUNT(*) as n FROM follows WHERE follower_id = ?',
    args: [session.userId],
  })
  const followingCount = Number(followingRes.rows[0].n)

  const sessionsRes = await db.execute({
    sql: `SELECT s.id as session_id, s.date, s.created_at as session_time, s.notes,
                 u.id as user_id, u.username, u.avatar
          FROM sessions s
          JOIN users u ON u.id = s.user_id
          WHERE (s.user_id = ? OR s.user_id IN (SELECT following_id FROM follows WHERE follower_id = ?))
            AND EXISTS (SELECT 1 FROM blocks b WHERE b.session_id = s.id)
            ${cursorSql}
          ORDER BY s.created_at DESC, s.id DESC
          LIMIT ?`,
    args: [session.userId, session.userId, ...cursorArgs, PAGE_SIZE + 1],
  })

  const rows = sessionsRes.rows.slice(0, PAGE_SIZE)
  const hasMore = sessionsRes.rows.length > PAGE_SIZE
  if (rows.length === 0) return NextResponse.json({ feed: [], nextCursor: null, followingCount })

  const sessionIds = rows.map(r => r.session_id as number)
  const sph = sessionIds.map(() => '?').join(',')

  const [blocksRes, reactions, prs] = await Promise.all([
    db.execute({ sql: `SELECT id, session_id, type FROM blocks WHERE session_id IN (${sph}) ORDER BY position, id`, args: sessionIds }),
    reactionsFor(sessionIds, session.userId),
    prsFor(sessionIds),
  ])

  const liftBlockIds = blocksRes.rows.filter(b => b.type === 'lift').map(b => b.id as number)
  const cardioBlockIds = blocksRes.rows.filter(b => b.type !== 'lift').map(b => b.id as number)

  let setsRows: Record<string, unknown>[] = []
  if (liftBlockIds.length > 0) {
    const ph = liftBlockIds.map(() => '?').join(',')
    const r = await db.execute({
      sql: `SELECT block_id, exercise, weight, reps FROM sets WHERE block_id IN (${ph}) AND COALESCE(is_warmup, 0) = 0`,
      args: liftBlockIds,
    })
    setsRows = r.rows as Record<string, unknown>[]
  }

  let cardioRows: Record<string, unknown>[] = []
  if (cardioBlockIds.length > 0) {
    const ph = cardioBlockIds.map(() => '?').join(',')
    const r = await db.execute({
      sql: `SELECT block_id, activity, distance, duration, pace, heart_rate FROM cardio WHERE block_id IN (${ph})`,
      args: cardioBlockIds,
    })
    cardioRows = r.rows as Record<string, unknown>[]
  }

  const blocksBySession = new Map<number, typeof blocksRes.rows>()
  for (const b of blocksRes.rows) {
    const sid = b.session_id as number
    if (!blocksBySession.has(sid)) blocksBySession.set(sid, [])
    blocksBySession.get(sid)!.push(b)
  }
  const setsByBlock = new Map<number, typeof setsRows>()
  for (const s of setsRows) {
    const bid = s.block_id as number
    if (!setsByBlock.has(bid)) setsByBlock.set(bid, [])
    setsByBlock.get(bid)!.push(s)
  }
  const cardioByBlock = new Map<number, Record<string, unknown>>()
  for (const c of cardioRows) cardioByBlock.set(c.block_id as number, c)

  const feed = rows.map(row => {
    const sessionId = row.session_id as number
    const blocks = blocksBySession.get(sessionId) ?? []
    const liftBlocks = blocks.filter(b => b.type === 'lift')
    const cardioBlocks = blocks.filter(b => b.type !== 'lift')

    let totalVolume = 0
    let totalSets = 0
    const exMap = new Map<string, { volume: number; sets: number; topWeight: number }>()
    for (const b of liftBlocks) {
      for (const s of setsByBlock.get(b.id as number) ?? []) {
        const w = Number(s.weight)
        const vol = w * Number(s.reps)
        totalVolume += vol
        totalSets++
        const ex = s.exercise as string
        const cur = exMap.get(ex) ?? { volume: 0, sets: 0, topWeight: 0 }
        exMap.set(ex, { volume: cur.volume + vol, sets: cur.sets + 1, topWeight: Math.max(cur.topWeight, w) })
      }
    }
    const exercises = Array.from(exMap.entries()).map(([name, st]) => ({ name, volume: Math.round(st.volume), sets: st.sets, topWeight: st.topWeight }))
    const cardioList = cardioBlocks.map(b => cardioByBlock.get(b.id as number)).filter(Boolean) as Record<string, unknown>[]

    return {
      userId: row.user_id as number,
      username: row.username as string,
      avatar: row.avatar as string | null,
      isMine: Number(row.user_id) === Number(session.userId),
      sessionId,
      date: row.date as string,
      createdAt: row.session_time as string,
      notes: (row.notes as string | null) ?? null,
      lift: exercises.length > 0 ? { volume: Math.round(totalVolume), sets: totalSets, exercises } : null,
      cardio: cardioList.length > 0 ? cardioList : null,
      prs: prs.get(sessionId) ?? [],
      reactions: reactions.get(sessionId) ?? { counts: {}, mine: [], names: [] },
    }
  })

  const last = rows[rows.length - 1]
  return NextResponse.json({
    feed,
    nextCursor: hasMore ? `${last.session_time}|${last.session_id}` : null,
    followingCount,
  })
}
