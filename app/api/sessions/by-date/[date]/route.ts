import { NextRequest, NextResponse } from 'next/server'
import { db, initDb } from '@/lib/db'
import { getSession } from '@/lib/auth'

await initDb()

export async function GET(_req: NextRequest, { params }: { params: Promise<{ date: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { date } = await params

  const sessionsRes = await db.execute({
    sql: 'SELECT id, created_at FROM sessions WHERE user_id = ? AND date = ? ORDER BY created_at',
    args: [session.userId, date],
  })

  if (sessionsRes.rows.length === 0) return NextResponse.json({ date, sessions: [] })

  const sessionIds = sessionsRes.rows.map(r => r.id as number)
  const sph = sessionIds.map(() => '?').join(',')

  const blocksRes = await db.execute({
    sql: `SELECT id, session_id, type FROM blocks WHERE session_id IN (${sph}) ORDER BY session_id, position`,
    args: sessionIds,
  })

  const liftBlockIds = blocksRes.rows.filter(b => b.type === 'lift').map(b => b.id as number)
  const cardioBlockIds = blocksRes.rows.filter(b => b.type !== 'lift').map(b => b.id as number)

  let setsData: Record<string, unknown>[] = []
  if (liftBlockIds.length > 0) {
    const ph = liftBlockIds.map(() => '?').join(',')
    const r = await db.execute({
      sql: `SELECT block_id, exercise, weight, reps, logged_at FROM sets WHERE block_id IN (${ph}) ORDER BY block_id, position, id`,
      args: liftBlockIds,
    })
    setsData = r.rows as Record<string, unknown>[]
  }

  let cardioData: Record<string, unknown>[] = []
  if (cardioBlockIds.length > 0) {
    const ph = cardioBlockIds.map(() => '?').join(',')
    const r = await db.execute({
      sql: `SELECT block_id, activity, distance, duration, pace, calories, heart_rate, started_at FROM cardio WHERE block_id IN (${ph})`,
      args: cardioBlockIds,
    })
    cardioData = r.rows as Record<string, unknown>[]
  }

  // Index sets and cardio by block_id
  const setsByBlock = new Map<number, typeof setsData>()
  for (const s of setsData) {
    const bid = s.block_id as number
    if (!setsByBlock.has(bid)) setsByBlock.set(bid, [])
    setsByBlock.get(bid)!.push(s)
  }

  const cardioByBlock = new Map<number, Record<string, unknown>>()
  for (const c of cardioData) cardioByBlock.set(c.block_id as number, c)

  const blocksBySession = new Map<number, typeof blocksRes.rows>()
  for (const b of blocksRes.rows) {
    const sid = b.session_id as number
    if (!blocksBySession.has(sid)) blocksBySession.set(sid, [])
    blocksBySession.get(sid)!.push(b)
  }

  const sessions = sessionsRes.rows.map(row => {
    const sessionId = row.id as number
    const createdAt = row.created_at as string
    const blocks = blocksBySession.get(sessionId) ?? []

    // Group lift sets by exercise in order of first appearance
    const exOrder: string[] = []
    const exMap = new Map<string, Array<{ weight: number; reps: number; logged_at: string | null }>>()

    for (const b of blocks.filter(b => b.type === 'lift')) {
      for (const s of setsByBlock.get(b.id as number) ?? []) {
        const ex = s.exercise as string
        if (!exMap.has(ex)) { exMap.set(ex, []); exOrder.push(ex) }
        exMap.get(ex)!.push({
          weight: s.weight as number,
          reps: s.reps as number,
          logged_at: (s.logged_at as string | null) ?? null,
        })
      }
    }

    const lifts = exOrder.map(ex => ({ exercise: ex, sets: exMap.get(ex)! }))

    const cardio = blocks
      .filter(b => b.type !== 'lift')
      .map(b => cardioByBlock.get(b.id as number))
      .filter(Boolean)
      .map(c => ({
        activity: c!.activity as string,
        distance: c!.distance as number | null,
        duration: c!.duration as string | null,
        pace: c!.pace as string | null,
        calories: c!.calories as number | null,
        heart_rate: c!.heart_rate as number | null,
        started_at: (c!.started_at as string | null) ?? null,
      }))

    return { sessionId, createdAt, lifts, cardio }
  })

  return NextResponse.json({ date, sessions })
}
