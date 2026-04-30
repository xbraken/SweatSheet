import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { db, initDb } from '@/lib/db'
import { getSession } from '@/lib/auth'

await initDb()

function makeSlug(): string {
  return randomBytes(8).toString('base64url')
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { date?: string }
  const date = body.date
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
  }

  const existing = await db.execute({
    sql: 'SELECT slug FROM share_links WHERE user_id = ? AND date = ?',
    args: [session.userId, date],
  })
  if (existing.rows.length > 0) {
    return NextResponse.json({ slug: existing.rows[0].slug as string })
  }

  for (let i = 0; i < 5; i++) {
    const slug = makeSlug()
    try {
      await db.execute({
        sql: 'INSERT INTO share_links (slug, user_id, date) VALUES (?, ?, ?)',
        args: [slug, session.userId, date],
      })
      return NextResponse.json({ slug })
    } catch {
      // slug collision (PK conflict) — retry
    }
  }
  return NextResponse.json({ error: 'Failed to allocate slug' }, { status: 500 })
}

export async function DELETE(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date')
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
  }

  await db.execute({
    sql: 'DELETE FROM share_links WHERE user_id = ? AND date = ?',
    args: [session.userId, date],
  })
  return NextResponse.json({ ok: true })
}
