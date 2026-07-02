import { NextRequest, NextResponse } from 'next/server'
import { initDb } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { syncRecentActivities } from '@/lib/intervals'

await initDb()

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Single global Intervals.icu account, not per-user OAuth — only the pinned owner's
  // session may trigger a sync. Otherwise another logged-in user's Today/Log visit would
  // pull the owner's activities into their own account.
  const ownerId = Number(process.env.INTERVALS_ICU_INTERNAL_USER_ID)
  if (session.userId !== ownerId) {
    return NextResponse.json({ ok: true, imported: 0, skipped: 0, errors: 0, errorDetails: [] })
  }

  const body = await req.json().catch(() => ({})) as { lookbackDays?: number; force?: boolean }
  const lookbackDays = Math.min(Math.max(body.lookbackDays ?? 30, 1), 90)
  const force = body.force === true

  const result = await syncRecentActivities(session.userId, { lookbackDays, force })
  return NextResponse.json(result)
}
