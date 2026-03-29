import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { stravaAuthUrl } from '@/lib/strava'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const origin = req.nextUrl.origin
  const redirectUri = `${origin}/api/strava/callback`
  return NextResponse.redirect(stravaAuthUrl(redirectUri))
}
