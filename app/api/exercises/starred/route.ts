import { NextRequest, NextResponse } from 'next/server'
import { db, initDb } from '@/lib/db'
import { getSession } from '@/lib/auth'

await initDb()

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const result = await db.execute({
    sql: 'SELECT exercise FROM starred_exercises WHERE user_id = ? ORDER BY exercise',
    args: [session.userId],
  })

  return NextResponse.json(result.rows.map(r => r.exercise as string))
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { exercise } = await req.json()
  if (!exercise) return NextResponse.json({ error: 'Exercise required' }, { status: 400 })

  await db.execute({
    sql: 'INSERT OR IGNORE INTO starred_exercises (user_id, exercise) VALUES (?, ?)',
    args: [session.userId, exercise],
  })

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { exercise } = await req.json()
  if (!exercise) return NextResponse.json({ error: 'Exercise required' }, { status: 400 })

  await db.execute({
    sql: 'DELETE FROM starred_exercises WHERE user_id = ? AND exercise = ?',
    args: [session.userId, exercise],
  })

  return NextResponse.json({ ok: true })
}
