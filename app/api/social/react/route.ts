import { NextRequest, NextResponse } from 'next/server'
import { db, initDb } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { REACTION_EMOJIS, canSeeSession, reactionsFor } from '@/lib/social'

await initDb()

/** POST { sessionId, emoji } — toggle a reaction on a session you can see */
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { sessionId, emoji } = await req.json()
  if (!Number.isInteger(sessionId)) return NextResponse.json({ error: 'sessionId required' }, { status: 400 })
  if (!(REACTION_EMOJIS as readonly string[]).includes(emoji)) return NextResponse.json({ error: 'Unsupported reaction' }, { status: 400 })
  if (!(await canSeeSession(session.userId, sessionId))) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const existing = await db.execute({
    sql: 'SELECT id FROM session_reactions WHERE session_id = ? AND user_id = ? AND emoji = ?',
    args: [sessionId, session.userId, emoji],
  })
  if (existing.rows.length > 0) {
    await db.execute({ sql: 'DELETE FROM session_reactions WHERE id = ?', args: [existing.rows[0].id as number] })
  } else {
    await db.execute({
      sql: 'INSERT OR IGNORE INTO session_reactions (session_id, user_id, emoji) VALUES (?, ?, ?)',
      args: [sessionId, session.userId, emoji],
    })
  }

  const reactions = (await reactionsFor([sessionId], session.userId)).get(sessionId) ?? { counts: {}, mine: [], names: [] }
  return NextResponse.json({ ok: true, reactions })
}
