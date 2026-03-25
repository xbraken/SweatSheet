import { NextRequest, NextResponse } from 'next/server'
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

  const { action } = await req.json()
  if (action === 'regenerate_api_key') {
    const newKey = crypto.randomUUID()
    await db.execute({ sql: `UPDATE users SET api_key = ? WHERE id = ?`, args: [newKey, session.userId] })
    return NextResponse.json({ api_key: newKey })
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
