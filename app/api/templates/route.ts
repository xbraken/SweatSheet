import { NextRequest, NextResponse } from 'next/server'
import { db, initDb } from '@/lib/db'
import { getSession } from '@/lib/auth'

await initDb()

/** GET — list all templates for current user */
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [tplRes, exRes] = await Promise.all([
    db.execute({ sql: 'SELECT id, name FROM templates WHERE user_id = ? ORDER BY created_at DESC', args: [session.userId] }),
    db.execute({
      sql: `SELECT te.template_id, te.exercise, te.position
            FROM template_exercises te
            JOIN templates t ON te.template_id = t.id
            WHERE t.user_id = ?
            ORDER BY te.position`,
      args: [session.userId],
    }),
  ])

  const exercisesByTemplate = new Map<number, string[]>()
  for (const r of exRes.rows) {
    const tid = r.template_id as number
    if (!exercisesByTemplate.has(tid)) exercisesByTemplate.set(tid, [])
    exercisesByTemplate.get(tid)!.push(r.exercise as string)
  }

  const templates = tplRes.rows.map(r => ({
    id: r.id as number,
    name: r.name as string,
    exercises: exercisesByTemplate.get(r.id as number) ?? [],
  }))

  return NextResponse.json({ templates })
}

/** POST — create a new template */
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name, exercises } = await req.json()
  if (!name?.trim() || !Array.isArray(exercises) || exercises.length === 0) {
    return NextResponse.json({ error: 'name and exercises required' }, { status: 400 })
  }

  const res = await db.execute({
    sql: 'INSERT INTO templates (user_id, name) VALUES (?, ?) RETURNING id',
    args: [session.userId, name.trim()],
  })
  const templateId = res.rows[0].id as number

  await Promise.all(exercises.map((ex: string, i: number) =>
    db.execute({
      sql: 'INSERT INTO template_exercises (template_id, exercise, position) VALUES (?, ?, ?)',
      args: [templateId, ex, i],
    })
  ))

  return NextResponse.json({ ok: true, id: templateId })
}

/** PUT — update a template (name + exercises) */
export async function PUT(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, name, exercises } = await req.json()
  if (!id || !name?.trim() || !Array.isArray(exercises) || exercises.length === 0) {
    return NextResponse.json({ error: 'id, name, exercises required' }, { status: 400 })
  }

  const check = await db.execute({
    sql: 'SELECT id FROM templates WHERE id = ? AND user_id = ?',
    args: [id, session.userId],
  })
  if (check.rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await db.execute({ sql: 'UPDATE templates SET name = ? WHERE id = ?', args: [name.trim(), id] })
  await db.execute({ sql: 'DELETE FROM template_exercises WHERE template_id = ?', args: [id] })
  await Promise.all(exercises.map((ex: string, i: number) =>
    db.execute({
      sql: 'INSERT INTO template_exercises (template_id, exercise, position) VALUES (?, ?, ?)',
      args: [id, ex, i],
    })
  ))

  return NextResponse.json({ ok: true })
}

/** DELETE — remove a template */
export async function DELETE(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const check = await db.execute({
    sql: 'SELECT id FROM templates WHERE id = ? AND user_id = ?',
    args: [id, session.userId],
  })
  if (check.rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await db.execute({ sql: 'DELETE FROM templates WHERE id = ?', args: [id] })
  return NextResponse.json({ ok: true })
}
