import { NextRequest, NextResponse } from 'next/server'
import { db, initDb } from '@/lib/db'
import { getSession } from '@/lib/auth'

await initDb()

/** POST { routineId } — copy a routine from someone you follow into your own routines */
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { routineId } = await req.json()
  if (!Number.isInteger(routineId)) return NextResponse.json({ error: 'routineId required' }, { status: 400 })

  const src = await db.execute({
    sql: `SELECT r.id, r.name, u.username FROM routines r JOIN users u ON u.id = r.user_id
          WHERE r.id = ? AND EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = ? AND f.following_id = r.user_id)`,
    args: [routineId, session.userId],
  })
  if (src.rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const exRes = await db.execute({
    sql: 'SELECT exercise FROM routine_exercises WHERE routine_id = ? ORDER BY position',
    args: [routineId],
  })
  if (exRes.rows.length === 0) return NextResponse.json({ error: 'Routine is empty' }, { status: 400 })

  const name = `${src.rows[0].name as string} (${src.rows[0].username as string})`
  const created = await db.execute({
    sql: 'INSERT INTO routines (user_id, name) VALUES (?, ?) RETURNING id',
    args: [session.userId, name],
  })
  const newId = created.rows[0].id as number
  await db.batch(exRes.rows.map((r, i) => ({
    sql: 'INSERT INTO routine_exercises (routine_id, exercise, position) VALUES (?, ?, ?)',
    args: [newId, r.exercise as string, i],
  })))

  return NextResponse.json({ ok: true, id: newId, name })
}
