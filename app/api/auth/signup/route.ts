import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db, initDb } from '@/lib/db'
import { signToken, COOKIE_NAME, COOKIE_MAX_AGE } from '@/lib/auth'

await initDb()

export async function POST(req: NextRequest) {
  const { username, password } = await req.json()

  if (!username || !password) {
    return NextResponse.json({ error: 'Username and password are required' }, { status: 400 })
  }
  if (username.length < 2) {
    return NextResponse.json({ error: 'Username must be at least 2 characters' }, { status: 400 })
  }
  if (password.length < 6) {
    return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
  }

  const existing = await db.execute({
    sql: 'SELECT id FROM users WHERE username = ?',
    args: [username.toLowerCase()],
  })
  if (existing.rows.length > 0) {
    return NextResponse.json({ error: 'Username already taken' }, { status: 400 })
  }

  const passwordHash = await bcrypt.hash(password, 10)
  const result = await db.execute({
    sql: 'INSERT INTO users (username, password_hash) VALUES (?, ?) RETURNING id',
    args: [username.toLowerCase(), passwordHash],
  })
  const userId = result.rows[0].id as number

  const token = await signToken(userId, username.toLowerCase())
  const res = NextResponse.json({ ok: true, username: username.toLowerCase() })
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  })
  return res
}
