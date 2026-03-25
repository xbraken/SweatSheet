import { NextRequest, NextResponse } from 'next/server'
import { db, initDb } from '@/lib/db'
import { getSession } from '@/lib/auth'

await initDb()

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const result = await db.execute({
    sql: `SELECT username, unit_pref FROM users WHERE id = ?`,
    args: [session.userId],
  })
  if (result.rows.length === 0) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  return NextResponse.json(result.rows[0])
}

export async function PATCH(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { unit_pref } = await req.json()
  if (unit_pref && !['metric', 'imperial'].includes(unit_pref)) {
    return NextResponse.json({ error: 'unit_pref must be metric or imperial' }, { status: 400 })
  }

  await db.execute({
    sql: `UPDATE users SET unit_pref = ? WHERE id = ?`,
    args: [unit_pref, session.userId],
  })
  return NextResponse.json({ ok: true })
}
