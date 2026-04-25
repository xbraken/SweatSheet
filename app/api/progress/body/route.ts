import { NextRequest, NextResponse } from 'next/server'
import { db, initDb } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { EXERCISES } from '@/lib/exercises'

await initDb()

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const since = searchParams.get('since')
  if (!since) return NextResponse.json({ error: 'Missing since' }, { status: 400 })

  try {
    const res = await db.execute({
      sql: `SELECT s.date, st.exercise, COUNT(st.id) as set_count
            FROM sets st
            JOIN blocks b ON st.block_id = b.id
            JOIN sessions s ON b.session_id = s.id
            WHERE s.user_id = ? AND s.date >= ?
            GROUP BY s.date, st.exercise`,
      args: [session.userId, since],
    })

    const exMap = new Map(EXERCISES.map(e => [e.name, e.category]))
    const byCategory = new Map<string, { sets: number; lastDate: string }>()
    for (const r of res.rows) {
      const exercise = r.exercise as string
      const date = r.date as string
      const sets = Number(r.set_count)
      const cat = exMap.get(exercise)
      if (!cat) continue
      const cur = byCategory.get(cat) ?? { sets: 0, lastDate: '' }
      cur.sets += sets
      if (date > cur.lastDate) cur.lastDate = date
      byCategory.set(cat, cur)
    }

    const categories = Array.from(byCategory.entries()).map(([category, d]) => ({
      category, sets: d.sets, lastDate: d.lastDate,
    }))

    return NextResponse.json({ categories })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    console.error('GET /api/progress/body error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
