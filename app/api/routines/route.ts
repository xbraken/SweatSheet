import { NextRequest, NextResponse } from 'next/server'
import { db, initDb } from '@/lib/db'
import { getSession } from '@/lib/auth'

await initDb()

/** GET — list all routines for current user */
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [rtnRes, exRes] = await Promise.all([
    db.execute({ sql: 'SELECT id, name FROM routines WHERE user_id = ? ORDER BY created_at DESC', args: [session.userId] }),
    db.execute({
      sql: `SELECT re.routine_id, re.exercise, re.position
            FROM routine_exercises re
            JOIN routines r ON re.routine_id = r.id
            WHERE r.user_id = ?
            ORDER BY re.position`,
      args: [session.userId],
    }),
  ])

  const exercisesByRoutine = new Map<number, string[]>()
  for (const r of exRes.rows) {
    const rid = r.routine_id as number
    if (!exercisesByRoutine.has(rid)) exercisesByRoutine.set(rid, [])
    exercisesByRoutine.get(rid)!.push(r.exercise as string)
  }

  const routines = rtnRes.rows.map(r => ({
    id: r.id as number,
    name: r.name as string,
    exercises: exercisesByRoutine.get(r.id as number) ?? [],
  }))

  return NextResponse.json({ routines })
}

/** POST — create a new routine */
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name, exercises } = await req.json()
  if (!name?.trim() || !Array.isArray(exercises) || exercises.length === 0) {
    return NextResponse.json({ error: 'name and exercises required' }, { status: 400 })
  }

  const res = await db.execute({
    sql: 'INSERT INTO routines (user_id, name) VALUES (?, ?) RETURNING id',
    args: [session.userId, name.trim()],
  })
  const routineId = res.rows[0].id as number

  await Promise.all(exercises.map((ex: string, i: number) =>
    db.execute({
      sql: 'INSERT INTO routine_exercises (routine_id, exercise, position) VALUES (?, ?, ?)',
      args: [routineId, ex, i],
    })
  ))

  return NextResponse.json({ ok: true, id: routineId })
}

/** PUT — update a routine (name + exercises) */
export async function PUT(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, name, exercises } = await req.json()
  if (!id || !name?.trim() || !Array.isArray(exercises) || exercises.length === 0) {
    return NextResponse.json({ error: 'id, name, exercises required' }, { status: 400 })
  }

  const check = await db.execute({
    sql: 'SELECT id FROM routines WHERE id = ? AND user_id = ?',
    args: [id, session.userId],
  })
  if (check.rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await db.execute({ sql: 'UPDATE routines SET name = ? WHERE id = ?', args: [name.trim(), id] })
  await db.execute({ sql: 'DELETE FROM routine_exercises WHERE routine_id = ?', args: [id] })
  await Promise.all(exercises.map((ex: string, i: number) =>
    db.execute({
      sql: 'INSERT INTO routine_exercises (routine_id, exercise, position) VALUES (?, ?, ?)',
      args: [id, ex, i],
    })
  ))

  return NextResponse.json({ ok: true })
}

/** DELETE — remove a routine */
export async function DELETE(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const check = await db.execute({
    sql: 'SELECT id FROM routines WHERE id = ? AND user_id = ?',
    args: [id, session.userId],
  })
  if (check.rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await db.execute({ sql: 'DELETE FROM routines WHERE id = ?', args: [id] })
  return NextResponse.json({ ok: true })
}
