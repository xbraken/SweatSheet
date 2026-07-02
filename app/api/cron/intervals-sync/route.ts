import { NextRequest, NextResponse } from 'next/server'
import { initDb } from '@/lib/db'
import { syncRecentActivities } from '@/lib/intervals'

await initDb()

// Vercel Cron sends `Authorization: Bearer $CRON_SECRET` — reject anything else so
// this route (which has no session cookie to gate it) can't be triggered by outsiders.
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // There's a single global Intervals.icu API key/account (not per-user OAuth like Strava),
  // so synced activities must be pinned to one specific SweatSheet user — never "whoever's
  // first in the users table" (SweatSheet has multiple real users now, not just Edmond).
  const userId = Number(process.env.INTERVALS_ICU_INTERNAL_USER_ID)
  if (!userId) return NextResponse.json({ error: 'INTERVALS_ICU_INTERNAL_USER_ID not configured' }, { status: 500 })

  // Lookback wider than the poll interval so a missed/delayed tick can't drop an activity —
  // dedup via imported_from makes re-scanning the same window safe.
  const result = await syncRecentActivities(userId, { lookbackDays: 3 })
  return NextResponse.json(result)
}
