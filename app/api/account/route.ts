import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db, initDb } from '@/lib/db'
import { getSession } from '@/lib/auth'

await initDb()

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const result = await db.execute({
    sql: `SELECT username, unit_pref, api_key FROM users WHERE id = ?`,
    args: [session.userId],
  })
  if (result.rows.length === 0) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  // Auto-generate API key if not set
  let apiKey = result.rows[0].api_key as string | null
  if (!apiKey) {
    apiKey = crypto.randomUUID()
    await db.execute({ sql: `UPDATE users SET api_key = ? WHERE id = ?`, args: [apiKey, session.userId] })
  }

  return NextResponse.json({ ...result.rows[0], api_key: apiKey })
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { action } = body
  if (action === 'regenerate_api_key') {
    const newKey = crypto.randomUUID()
    await db.execute({ sql: `UPDATE users SET api_key = ? WHERE id = ?`, args: [newKey, session.userId] })
    return NextResponse.json({ api_key: newKey })
  }

  if (action === 'change_password') {
    const { currentPassword, newPassword } = body
    if (!currentPassword || !newPassword) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    if (newPassword.length < 6) return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })

    const result = await db.execute({ sql: `SELECT password_hash FROM users WHERE id = ?`, args: [session.userId] })
    const valid = await bcrypt.compare(currentPassword, result.rows[0].password_hash as string)
    if (!valid) return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 })

    const hash = await bcrypt.hash(newPassword, 10)
    await db.execute({ sql: `UPDATE users SET password_hash = ? WHERE id = ?`, args: [hash, session.userId] })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
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
