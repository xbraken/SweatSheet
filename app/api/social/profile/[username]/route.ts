import { NextRequest, NextResponse } from 'next/server'
import { db, initDb } from '@/lib/db'
import { getSession } from '@/lib/auth'

await initDb()

export async function GET(_req: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { username } = await params

  const userRes = await db.execute({ sql: 'SELECT id FROM users WHERE username = ?', args: [username] })
  if (userRes.rows.length === 0) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  const targetId = userRes.rows[0].id as number

  const [followRes, countRes, sessionsRes] = await Promise.all([
    db.execute({ sql: 'SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?', args: [session.userId, targetId] }),
    db.execute({ sql: 'SELECT COUNT(*) as count FROM sessions WHERE user_id = ?', args: [targetId] }),
    db.execute({ sql: 'SELECT id, date, created_at FROM sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 20', args: [targetId] }),
  ])

  const isFollowing = followRes.rows.length > 0
  const isOwnProfile = targetId === session.userId
  const totalWorkouts = countRes.rows[0].count as number

  if (sessionsRes.rows.length === 0) {
    return NextResponse.json({ username, totalWorkouts, isFollowing, isOwnProfile, sessions: [] })
  }

  const sessionIds = sessionsRes.rows.map(r => r.id as number)
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
    const r = await db.execute({ sql: `SELECT block_id, exercise, weight, reps FROM sets WHERE block_id IN (${ph})`, args: liftBlockIds })
    setsRows = r.rows as Record<string, unknown>[]
  }

  let cardioRows: Record<string, unknown>[] = []
  if (cardioBlockIds.length > 0) {
    const ph = cardioBlockIds.map(() => '?').join(',')
    const r = await db.execute({ sql: `SELECT block_id, activity, distance, duration, pace, heart_rate FROM cardio WHERE block_id IN (${ph})`, args: cardioBlockIds })
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

  const sessions = sessionsRes.rows.map(row => {
    const sessionId = row.id as number
    const blocks = blocksBySession.get(sessionId) ?? []
    const liftBlocks = blocks.filter(b => b.type === 'lift')
    const cardioBlocks = blocks.filter(b => b.type !== 'lift')

    let totalVolume = 0, totalSets = 0
    const exMap = new Map<string, { volume: number; sets: number }>()
    for (const b of liftBlocks) {
      for (const s of setsByBlock.get(b.id as number) ?? []) {
        const vol = (s.weight as number) * (s.reps as number)
        totalVolume += vol
        totalSets++
        const ex = s.exercise as string
        const cur = exMap.get(ex) ?? { volume: 0, sets: 0 }
        exMap.set(ex, { volume: cur.volume + vol, sets: cur.sets + 1 })
      }
    }
    const exercises = Array.from(exMap.entries()).map(([name, st]) => ({ name, volume: Math.round(st.volume), sets: st.sets }))

    const cardioList = cardioBlocks.map(b => cardioByBlock.get(b.id as number)).filter(Boolean) as Record<string, unknown>[]

    return {
      sessionId,
      date: row.date as string,
      createdAt: row.created_at as string,
      lift: liftBlocks.length > 0 ? { volume: Math.round(totalVolume), sets: totalSets, exercises } : null,
      cardio: cardioList.length > 0 ? cardioList : null,
    }
  })

  return NextResponse.json({ username, totalWorkouts, isFollowing, isOwnProfile, sessions })
}
