import { db } from '@/lib/db'

export const REACTION_EMOJIS = ['🔥', '💪', '👏'] as const
export type ReactionEmoji = typeof REACTION_EMOJIS[number]

/** A session is visible to its owner and to anyone who follows the owner */
export async function canSeeSession(viewerId: number, sessionId: number): Promise<boolean> {
  const res = await db.execute({
    sql: `SELECT 1 FROM sessions s
          WHERE s.id = ? AND (s.user_id = ? OR EXISTS (
            SELECT 1 FROM follows f WHERE f.follower_id = ? AND f.following_id = s.user_id
          ))`,
    args: [sessionId, viewerId, viewerId],
  })
  return res.rows.length > 0
}

export type Reactions = { counts: Record<string, number>; mine: string[]; names: string[] }

/** Reaction counts, the viewer's own reactions, and who reacted — keyed by session id */
export async function reactionsFor(sessionIds: number[], viewerId: number): Promise<Map<number, Reactions>> {
  const out = new Map<number, Reactions>()
  if (sessionIds.length === 0) return out
  const ph = sessionIds.map(() => '?').join(',')
  const res = await db.execute({
    sql: `SELECT r.session_id, r.emoji, r.user_id, u.username
          FROM session_reactions r JOIN users u ON u.id = r.user_id
          WHERE r.session_id IN (${ph})
          ORDER BY r.created_at`,
    args: sessionIds,
  })
  for (const row of res.rows) {
    const sid = row.session_id as number
    const cur = out.get(sid) ?? { counts: {}, mine: [], names: [] }
    const emoji = row.emoji as string
    cur.counts[emoji] = (cur.counts[emoji] ?? 0) + 1
    if (Number(row.user_id) === Number(viewerId)) cur.mine.push(emoji)
    const name = row.username as string
    if (!cur.names.includes(name)) cur.names.push(name)
    out.set(sid, cur)
  }
  return out
}

export type SessionPr = { exercise: string; kind: string; value: number; reps: number | null }

export async function prsFor(sessionIds: number[]): Promise<Map<number, SessionPr[]>> {
  const out = new Map<number, SessionPr[]>()
  if (sessionIds.length === 0) return out
  const ph = sessionIds.map(() => '?').join(',')
  const res = await db.execute({
    sql: `SELECT session_id, exercise, kind, value, reps FROM prs WHERE session_id IN (${ph}) ORDER BY id`,
    args: sessionIds,
  })
  for (const row of res.rows) {
    const sid = row.session_id as number
    const list = out.get(sid) ?? []
    list.push({ exercise: row.exercise as string, kind: row.kind as string, value: Number(row.value), reps: row.reps != null ? Number(row.reps) : null })
    out.set(sid, list)
  }
  return out
}
