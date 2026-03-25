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

  const blocks = []
  for (const block of blocksRes.rows) {
    if (block.type === 'lift') {
      const setsRes = await db.execute({
        sql: `SELECT exercise, weight, reps FROM sets WHERE block_id = ? ORDER BY position`,
        args: [block.id as number],
      })
      if (setsRes.rows.length === 0) continue
      const exercise = setsRes.rows[0].exercise as string
      blocks.push({
        type: 'lift',
        exercise,
        sets: setsRes.rows.map(s => ({
          weight: s.weight as number,
          reps: s.reps as number,
        })),
      })
    } else {
      const cardioRes = await db.execute({
        sql: `SELECT activity, distance, duration FROM cardio WHERE block_id = ?`,
        args: [block.id as number],
      })
      if (cardioRes.rows.length === 0) continue
      const c = cardioRes.rows[0]
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
