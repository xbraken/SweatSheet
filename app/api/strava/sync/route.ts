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
  const body = await req.json().catch(() => ({})) as { pages?: number; perPage?: number }
  const pages = Math.min(body.pages ?? 1, 5)
  const perPage = Math.min(body.perPage ?? 30, 30)

  let imported = 0
  let skipped = 0
  let errors = 0

  for (let page = 1; page <= pages; page++) {
    const res = await fetch(
      `https://www.strava.com/api/v3/athlete/activities?per_page=${perPage}&page=${page}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (!res.ok) break

    const activities = await res.json() as { id: number }[]
    if (!activities.length) break

    // Import in parallel batches of 5 to avoid hammering Strava rate limits
    for (let i = 0; i < activities.length; i += 5) {
      const batch = activities.slice(i, i + 5)
      const results = await Promise.all(batch.map(a => importActivity(session.userId, a.id)))
      for (const r of results) {
        if (r.skipped) skipped++
        else if (r.ok) imported++
        else errors++
      }
    }
  }

  return NextResponse.json({ ok: true, imported, skipped, errors })
}
