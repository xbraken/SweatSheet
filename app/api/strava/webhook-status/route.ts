import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'

const CLIENT_ID = process.env.STRAVA_CLIENT_ID!
const CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET!
const VERIFY_TOKEN = process.env.STRAVA_WEBHOOK_VERIFY_TOKEN ?? 'sweatsheet-strava-verify'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const res = await fetch(
    `https://www.strava.com/api/v3/push_subscriptions?client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}`
  )
  const data = await res.json() as Array<{ id: number; callback_url: string }>
  return NextResponse.json({ subscriptions: data })
}

export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { callbackUrl } = await req.json() as { callbackUrl: string }
  if (!callbackUrl) return NextResponse.json({ error: 'callbackUrl required' }, { status: 400 })

  // Delete any existing subscriptions first
  const existing = await fetch(
    `https://www.strava.com/api/v3/push_subscriptions?client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}`
  )
  const existingData = await existing.json() as Array<{ id: number }>
  for (const sub of existingData) {
    await fetch(`https://www.strava.com/api/v3/push_subscriptions/${sub.id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET }).toString(),
    })
  }

  // Register new subscription
  const res = await fetch('https://www.strava.com/api/v3/push_subscriptions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      callback_url: callbackUrl,
      verify_token: VERIFY_TOKEN,
    }).toString(),
  })

  const data = await res.json()
  if (!res.ok) return NextResponse.json({ error: data }, { status: 400 })
  return NextResponse.json({ ok: true, subscription: data })
}
