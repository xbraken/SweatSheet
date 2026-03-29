import { NextResponse } from 'next/server'
import { db, initDb } from '@/lib/db'
import { getSession } from '@/lib/auth'

await initDb()

export async function POST() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await db.execute({
    sql: 'UPDATE users SET strava_access_token = NULL, strava_refresh_token = NULL, strava_token_expires_at = NULL, strava_athlete_id = NULL WHERE id = ?',
    args: [session.userId],
  })

  return NextResponse.json({ ok: true })
}
