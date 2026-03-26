import { NextResponse } from 'next/server'
import { db, initDb } from '@/lib/db'
import { getSession } from '@/lib/auth'

await initDb()

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Get followed users + their most recent session each
  const followedRes = await db.execute({
    sql: `SELECT u.id as user_id, u.username,
                 s.id as session_id, s.date, s.created_at as session_time
          FROM follows f
          JOIN users u ON u.id = f.following_id
          JOIN sessions s ON s.id = (
            SELECT id FROM sessions WHERE user_id = u.id
            ORDER BY created_at DESC LIMIT 1
          )
          WHERE f.follower_id = ?
          ORDER BY s.created_at DESC
          LIMIT 20`,
    args: [session.userId],
  })

  if (followedRes.rows.length === 0) return NextResponse.json({ feed: [] })

  const sessionIds = followedRes.rows.map(r => r.session_id as number)
  const sph = sessionIds.map(() => '?').join(',')

  const blocksRes = await db.execute({
    sql: `SELECT id, session_id, type FROM blocks WHERE session_id IN (${sph})`,
    args: sessionIds,
  })

  const liftBlockIds = blocksRes.rows.filter(b => b.type === 'lift').map(b => b.id as number)
  const cardioBlockIds = blocksRes.rows.filter(b => b.type !== 'lift').map(b => b.id as number)

  let setsRows: Record<string, unknown>[] = []
  if (liftBlockIds.length > 0) {
    const ph = liftBlockIds.map(() => '?').join(',')
    const r = await db.execute({
      sql: `SELECT block_id, exercise, weight, reps FROM sets WHERE block_id IN (${ph})`,
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

  // Build lookup maps
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
  for (const c of cardioRows) {
    cardioByBlock.set(c.block_id as number, c)
  }

  const feed = followedRes.rows.map(row => {
    const sessionId = row.session_id as number
    const blocks = blocksBySession.get(sessionId) ?? []

    const liftBlocks = blocks.filter(b => b.type === 'lift')
    const cardioBlocks = blocks.filter(b => b.type !== 'lift')

    let totalVolume = 0
    let totalSets = 0
    const exercises: string[] = []
    for (const b of liftBlocks) {
      const sets = setsByBlock.get(b.id as number) ?? []
      for (const s of sets) {
        totalVolume += (s.weight as number) * (s.reps as number)
        totalSets++
        if (!exercises.includes(s.exercise as string)) exercises.push(s.exercise as string)
      }
    }

    const cardioList = cardioBlocks
      .map(b => cardioByBlock.get(b.id as number))
      .filter(Boolean) as Record<string, unknown>[]

    return {
      userId: row.user_id as number,
      username: row.username as string,
      sessionId,
      date: row.date as string,
      createdAt: row.session_time as string,
      lift: liftBlocks.length > 0 ? { volume: Math.round(totalVolume), sets: totalSets, exercises } : null,
      cardio: cardioList.length > 0 ? cardioList : null,
    }
  })

  return NextResponse.json({ feed })
}
