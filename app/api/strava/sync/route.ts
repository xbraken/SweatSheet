import { NextRequest, NextResponse } from 'next/server'
import { db, initDb } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { getValidToken, importActivity } from '@/lib/strava'

await initDb()

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const token = await getValidToken(session.userId)
  if (!token) return NextResponse.json({ error: 'No Strava connection' }, { status: 400 })

  // How many pages/activities to fetch
  const body = await req.json().catch(() => ({})) as { pages?: number; perPage?: number; force?: boolean }
  const pages = Math.min(body.pages ?? 1, 5)
  const perPage = Math.min(body.perPage ?? 30, 30)
  const force = body.force === true

  let imported = 0
  let skipped = 0
  let errors = 0
  const seen: { id: number; name: string; type: string; sport_type: string; start_date: string }[] = []
  const errorDetails: { id: number; error: string }[] = []

  for (let page = 1; page <= pages; page++) {
    const res = await fetch(
      `https://www.strava.com/api/v3/athlete/activities?per_page=${perPage}&page=${page}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (!res.ok) break

    const activities = await res.json() as { id: number; name: string; type: string; sport_type: string; start_date: string }[]
    if (!activities.length) break

    for (const a of activities) {
      seen.push({ id: a.id, name: a.name, type: a.type, sport_type: a.sport_type, start_date: a.start_date })
    }

    // Import in parallel batches of 5 to avoid hammering Strava rate limits
    for (let i = 0; i < activities.length; i += 5) {
      const batch = activities.slice(i, i + 5)
      const results = await Promise.all(batch.map(async a => ({ id: a.id, result: await importActivity(session.userId, a.id, { force }) })))
      for (const { id, result: r } of results) {
        if (r.skipped) skipped++
        else if (r.ok) imported++
        else {
          errors++
          errorDetails.push({ id, error: r.error ?? 'unknown' })
        }
      }
    }
  }

  return NextResponse.json({ ok: true, imported, skipped, errors, seen, errorDetails })
}
