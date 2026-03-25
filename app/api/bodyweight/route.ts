import { NextRequest, NextResponse } from 'next/server'
import { db, initDb } from '@/lib/db'
import { getSession } from '@/lib/auth'

await initDb()

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const result = await db.execute({
    sql: `SELECT date, weight_kg FROM body_weight WHERE user_id = ? ORDER BY date DESC`,
    args: [session.userId],
  })
  return NextResponse.json(result.rows)
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { date, weight_kg } = await req.json()
  if (!date || !weight_kg) return NextResponse.json({ error: 'date and weight_kg required' }, { status: 400 })

  // Upsert — one entry per day
  await db.execute({
    sql: `INSERT INTO body_weight (user_id, date, weight_kg) VALUES (?, ?, ?)
          ON CONFLICT(user_id, date) DO UPDATE SET weight_kg = excluded.weight_kg`,
    args: [session.userId, date, weight_kg],
  })

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { date } = await req.json()
  await db.execute({
    sql: `DELETE FROM body_weight WHERE user_id = ? AND date = ?`,
    args: [session.userId, date],
  })
  return NextResponse.json({ ok: true })
}
