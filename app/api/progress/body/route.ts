import { NextRequest, NextResponse } from 'next/server'
import { db, initDb } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { EXERCISES, SECONDARY_MUSCLES, SECONDARY_WEIGHT } from '@/lib/exercises'

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
    type ExerciseStat = { exercise: string; sets: number; weight: number; lastDate: string }
    const byCategory = new Map<string, { sets: number; lastDate: string; exercises: Map<string, ExerciseStat> }>()

    const addContribution = (cat: string, exercise: string, sets: number, weight: number, date: string) => {
      const cur = byCategory.get(cat) ?? { sets: 0, lastDate: '', exercises: new Map() }
      cur.sets += sets * weight
      if (date > cur.lastDate) cur.lastDate = date
      const exCur = cur.exercises.get(exercise) ?? { exercise, sets: 0, weight, lastDate: '' }
      exCur.sets += sets
      if (date > exCur.lastDate) exCur.lastDate = date
      cur.exercises.set(exercise, exCur)
      byCategory.set(cat, cur)
    }

    for (const r of res.rows) {
      const exercise = r.exercise as string
      const date = r.date as string
      const sets = Number(r.set_count)
      const primary = exMap.get(exercise)
      if (!primary) continue
      addContribution(primary, exercise, sets, 1, date)
      const secondaries = SECONDARY_MUSCLES[exercise] ?? []
      for (const sec of secondaries) {
        addContribution(sec, exercise, sets, SECONDARY_WEIGHT, date)
      }
    }

    const categories = Array.from(byCategory.entries()).map(([category, d]) => ({
      category,
      sets: Math.round(d.sets * 10) / 10,
      lastDate: d.lastDate,
      exercises: Array.from(d.exercises.values())
        .sort((a, b) => b.sets * b.weight - a.sets * a.weight),
    }))

    return NextResponse.json({ categories })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    console.error('GET /api/progress/body error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
