import { NextResponse } from 'next/server'
import { db, initDb } from '@/lib/db'
import { getSession } from '@/lib/auth'

await initDb()

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const res = await db.execute({
    sql: 'SELECT strava_athlete_id FROM users WHERE id = ?',
    args: [session.userId],
  })

  const athleteId = res.rows[0]?.strava_athlete_id
  return NextResponse.json({ connected: !!athleteId, athleteId: athleteId ?? null })
}
