import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { exchangeCode } from '@/lib/strava'
import { db, initDb } from '@/lib/db'

await initDb()

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.redirect(new URL('/auth', req.url))

  const code = req.nextUrl.searchParams.get('code')
  const error = req.nextUrl.searchParams.get('error')

  if (error || !code) {
    return NextResponse.redirect(new URL('/settings?strava=denied', req.url))
  }

  try {
    const origin = req.nextUrl.origin
    const tokens = await exchangeCode(code)

    await db.execute({
      sql: `UPDATE users SET strava_access_token = ?, strava_refresh_token = ?, strava_token_expires_at = ?, strava_athlete_id = ? WHERE id = ?`,
      args: [tokens.access_token, tokens.refresh_token, tokens.expires_at, tokens.athlete.id, session.userId],
    })

    return NextResponse.redirect(new URL('/settings?strava=connected', req.url))
  } catch {
    return NextResponse.redirect(new URL('/settings?strava=error', req.url))
  }
}
