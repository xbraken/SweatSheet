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

  const result = await db.execute({
    sql: 'SELECT id, password_hash FROM users WHERE username = ?',
    args: [username.toLowerCase()],
  })

  if (result.rows.length === 0) {
    return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 })
  }

  const user = result.rows[0]
  const valid = await bcrypt.compare(password, user.password_hash as string)
  if (!valid) {
    return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 })
  }

  const token = await signToken(user.id as number, username.toLowerCase())
  const res = NextResponse.json({ ok: true, username: username.toLowerCase() })
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  })
  return res
}
