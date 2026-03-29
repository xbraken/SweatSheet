import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { db, initDb } from '@/lib/db'
import { importActivity } from '@/lib/strava'

await initDb()

const VERIFY_TOKEN = process.env.STRAVA_WEBHOOK_VERIFY_TOKEN ?? 'sweatsheet-strava-verify'

// Strava webhook verification (GET) — Strava sends this when registering the subscription
export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get('hub.mode')
  const token = req.nextUrl.searchParams.get('hub.verify_token')
  const challenge = req.nextUrl.searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === VERIFY_TOKEN && challenge) {
    return NextResponse.json({ 'hub.challenge': challenge })
  }
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

// Strava webhook event (POST) — fires when an athlete creates/updates/deletes an activity
export async function POST(req: NextRequest) {
  const event = await req.json() as {
    object_type: string
    aspect_type: string
    object_id: number
    owner_id: number
  }

  // Only handle new activity creations
  if (event.object_type !== 'activity' || event.aspect_type !== 'create') {
    return NextResponse.json({ ok: true })
  }

  // Look up user by Strava athlete ID
  const userRes = await db.execute({
    sql: 'SELECT id FROM users WHERE strava_athlete_id = ?',
    args: [event.owner_id],
  })
  if (!userRes.rows.length) return NextResponse.json({ ok: true })

  const userId = userRes.rows[0].id as number

  // Respond to Strava immediately (required within 2s) — import runs after response
  after(async () => {
    await importActivity(userId, event.object_id)
  })

  return NextResponse.json({ ok: true })
}
