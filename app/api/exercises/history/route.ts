import { NextRequest, NextResponse } from 'next/server'
import { db, initDb } from '@/lib/db'
import { getSession } from '@/lib/auth'

await initDb()

const DEFAULT_LIMIT = 5
const MAX_LIMIT = 15

type HistorySet = { weight: number; reps: number; duration_secs: number | null; is_warmup: boolean; rpe: number | null }
type HistoryEntry = { date: string; block_id: number; notes: string | null; sets: HistorySet[] }

/**
 * GET — the last few times this exercise was logged, newest first.
 * Used as a reference/baseline while logging the same exercise today.
 * One entry per block, so two blocks of the same exercise in one day stay separate.
 */
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const exercise = searchParams.get('exercise')
  if (!exercise) return NextResponse.json({ error: 'exercise required' }, { status: 400 })

  const parsedLimit = parseInt(searchParams.get('limit') ?? '', 10)
  const limit = Number.isFinite(parsedLimit)
    ? Math.min(Math.max(parsedLimit, 1), MAX_LIMIT)
    : DEFAULT_LIMIT

  const res = await db.execute({
    sql: `SELECT s.date, b.id as block_id, b.notes, st.weight, st.reps, st.duration_secs, st.is_warmup, st.rpe
          FROM sets st
          JOIN blocks b ON st.block_id = b.id
          JOIN sessions s ON b.session_id = s.id
          WHERE st.exercise = ? AND s.user_id = ? AND b.id IN (
            SELECT b2.id
            FROM blocks b2
            JOIN sessions s2 ON b2.session_id = s2.id
            JOIN sets st2 ON st2.block_id = b2.id
            WHERE st2.exercise = ? AND s2.user_id = ?
            GROUP BY b2.id
            ORDER BY s2.date DESC, b2.id DESC
            LIMIT ?
          )
          ORDER BY s.date DESC, b.id DESC, st.position ASC, st.id ASC`,
    args: [exercise, session.userId, exercise, session.userId, limit],
  })

  const byBlock = new Map<number, HistoryEntry>()
  for (const r of res.rows) {
    const bid = r.block_id as number
    if (!byBlock.has(bid)) {
      byBlock.set(bid, { date: r.date as string, block_id: bid, notes: (r.notes as string | null) ?? null, sets: [] })
    }
    byBlock.get(bid)!.sets.push({
      weight: Number(r.weight),
      reps: Number(r.reps),
      duration_secs: r.duration_secs != null ? Number(r.duration_secs) : null,
      is_warmup: Number(r.is_warmup ?? 0) === 1,
      rpe: r.rpe != null ? Number(r.rpe) : null,
    })
  }

  return NextResponse.json({ exercise, entries: [...byBlock.values()] })
}
