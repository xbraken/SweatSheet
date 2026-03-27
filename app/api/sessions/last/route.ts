import { NextResponse } from 'next/server'
import { db, initDb } from '@/lib/db'
import { getSession } from '@/lib/auth'

await initDb()

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Get the most recent session
  const sessionRes = await db.execute({
    sql: `SELECT id, date FROM sessions WHERE user_id = ? ORDER BY date DESC, created_at DESC LIMIT 1`,
    args: [session.userId],
  })
  if (sessionRes.rows.length === 0) return NextResponse.json(null)

  const lastSession = sessionRes.rows[0]
  const sessionId = lastSession.id as number

  // Get all blocks for that session
  const blocksRes = await db.execute({
    sql: `SELECT id, type, position FROM blocks WHERE session_id = ? ORDER BY position`,
    args: [sessionId],
  })

  const blockIds = blocksRes.rows.map(b => b.id as number)
  if (blockIds.length === 0) return NextResponse.json({ date: lastSession.date, blocks: [] })

  const placeholders = blockIds.map(() => '?').join(',')
  const [setsRes, cardioRes] = await Promise.all([
    db.execute({
      sql: `SELECT block_id, exercise, weight, reps FROM sets WHERE block_id IN (${placeholders}) ORDER BY block_id, position`,
      args: blockIds,
    }),
    db.execute({
      sql: `SELECT block_id, activity, distance, duration FROM cardio WHERE block_id IN (${placeholders})`,
      args: blockIds,
    }),
  ])

  const setsByBlock: Record<number, typeof setsRes.rows> = {}
  for (const r of setsRes.rows) {
    const bid = r.block_id as number
    if (!setsByBlock[bid]) setsByBlock[bid] = []
    setsByBlock[bid].push(r)
  }
  const cardioByBlock: Record<number, (typeof cardioRes.rows)[0]> = {}
  for (const r of cardioRes.rows) {
    cardioByBlock[r.block_id as number] = r
  }

  const blocks = []
  for (const block of blocksRes.rows) {
    const bid = block.id as number
    if (block.type === 'lift') {
      const sets = setsByBlock[bid]
      if (!sets || sets.length === 0) continue
      blocks.push({
        type: 'lift',
        exercise: sets[0].exercise as string,
        sets: sets.map(s => ({ weight: s.weight as number, reps: s.reps as number })),
      })
    } else {
      const c = cardioByBlock[bid]
      if (!c) continue
      blocks.push({
        type: 'cardio',
        activity: c.activity as string,
        distance: c.distance ? String(c.distance) : '',
        time: c.duration ?? '',
      })
    }
  }

  return NextResponse.json({ date: lastSession.date, blocks })
}
