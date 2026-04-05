import { NextRequest, NextResponse } from 'next/server'
import { db, initDb } from '@/lib/db'
import { getSession } from '@/lib/auth'

await initDb()

/** GET — return logged blocks for a given date (defaults to today) */
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const today = searchParams.get('date') ?? new Date().toISOString().split('T')[0]
  const includeAll = searchParams.get('include') === 'all'

  // lastSession: return exercises from the most recent past session
  if (searchParams.get('lastSession') === '1') {
    const res = await db.execute({
      sql: `SELECT b.id as block_id, b.type, st.exercise, st.weight, st.reps, st.duration_secs,
                   c.activity, s.date
            FROM sessions s
            JOIN blocks b ON b.session_id = s.id
            LEFT JOIN sets st ON st.block_id = b.id AND b.type = 'lift'
            LEFT JOIN cardio c ON c.block_id = b.id AND b.type = 'cardio'
            WHERE s.user_id = ? AND s.date < ?
            ORDER BY s.date DESC, b.id ASC, st.position ASC
            LIMIT 80`,
      args: [session.userId, today],
    })
    if (res.rows.length === 0) return NextResponse.json({ exercises: [] })
    const targetDate = res.rows[0].date as string
    const byBlock = new Map<number, { type: string; exercise?: string; activity?: string; sets: {weight: number; reps: number; duration_secs: number | null}[] }>()
    for (const r of res.rows.filter(r => r.date === targetDate)) {
      const bid = r.block_id as number
      if (!byBlock.has(bid)) byBlock.set(bid, { type: r.type as string, exercise: r.exercise as string | undefined, activity: r.activity as string | undefined, sets: [] })
      if (r.type === 'lift' && r.exercise) byBlock.get(bid)!.sets.push({ weight: Number(r.weight), reps: Number(r.reps), duration_secs: r.duration_secs != null ? Number(r.duration_secs) : null })
    }
    return NextResponse.json({ exercises: [...byBlock.values()] })
  }

  const [liftRes, setsRes, cardioRes, calendarRes, hintsRes, starredRes] = await Promise.all([
    db.execute({
      sql: `SELECT b.id as block_id, st.exercise,
              COUNT(st.id) as set_count,
              MAX(st.weight) as max_weight,
              MAX(st.duration_secs) as max_duration
            FROM blocks b
            JOIN sessions s ON b.session_id = s.id
            JOIN sets st ON st.block_id = b.id
            WHERE s.user_id = ? AND s.date = ? AND b.type = 'lift'
            GROUP BY b.id, st.exercise
            ORDER BY b.id DESC`,
      args: [session.userId, today],
    }),
    db.execute({
      sql: `SELECT st.id, st.block_id, st.weight, st.reps, st.duration_secs
            FROM sets st
            JOIN blocks b ON st.block_id = b.id
            JOIN sessions s ON b.session_id = s.id
            WHERE s.user_id = ? AND s.date = ?
            ORDER BY b.id, st.position`,
      args: [session.userId, today],
    }),
    db.execute({
      sql: `SELECT b.id as block_id, c.id as cardio_id, c.activity, c.distance, c.duration, c.pace
            FROM blocks b
            JOIN sessions s ON b.session_id = s.id
            JOIN cardio c ON c.block_id = b.id
            WHERE s.user_id = ? AND s.date = ?
            ORDER BY b.id DESC`,
      args: [session.userId, today],
    }),
    includeAll
      ? db.execute({ sql: 'SELECT DISTINCT date FROM sessions WHERE user_id = ? ORDER BY date DESC', args: [session.userId] })
      : Promise.resolve({ rows: [] }),
    includeAll
      ? db.execute({
          sql: `SELECT exercise, last_weight, last_reps FROM (
                  SELECT st.exercise,
                    st.weight as last_weight,
                    st.reps as last_reps,
                    ROW_NUMBER() OVER (PARTITION BY st.exercise ORDER BY s.date DESC, b.id DESC, st.id DESC) as rn
                  FROM sets st
                  JOIN blocks b ON st.block_id = b.id
                  JOIN sessions s ON b.session_id = s.id
                  WHERE s.user_id = ?
                ) WHERE rn = 1
                ORDER BY exercise`,
          args: [session.userId],
        })
      : Promise.resolve({ rows: [] }),
    includeAll
      ? db.execute({ sql: 'SELECT exercise FROM starred_exercises WHERE user_id = ?', args: [session.userId] })
      : Promise.resolve({ rows: [] }),
  ])

  const setsByBlock: Record<number, {id: number; weight: number; reps: number; duration_secs: number | null}[]> = {}
  for (const r of setsRes.rows) {
    const bid = r.block_id as number
    if (!setsByBlock[bid]) setsByBlock[bid] = []
    setsByBlock[bid].push({ id: r.id as number, weight: Number(r.weight), reps: Number(r.reps), duration_secs: r.duration_secs != null ? Number(r.duration_secs) : null })
  }

  return NextResponse.json({
    lifts: liftRes.rows.map(r => ({ ...r, sets: setsByBlock[r.block_id as number] ?? [] })),
    cardio: cardioRes.rows,
    ...(includeAll && {
      dates: calendarRes.rows.map(r => r.date as string),
      history: hintsRes.rows,
      starred: starredRes.rows.map(r => r.exercise as string),
    }),
  })
}

/** POST — save one exercise or cardio block, reusing today's session */
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const today = new Date().toISOString().split('T')[0]

  try {
    // Find or create today's session
    let sessionId: number
    const existing = await db.execute({
      sql: 'SELECT id FROM sessions WHERE user_id = ? AND date = ? LIMIT 1',
      args: [session.userId, today],
    })
    if (existing.rows.length > 0) {
      sessionId = existing.rows[0].id as number
    } else {
      const created = await db.execute({
        sql: 'INSERT INTO sessions (user_id, date) VALUES (?, ?) RETURNING id',
        args: [session.userId, today],
      })
      sessionId = created.rows[0].id as number
    }

    // Get next position
    const posRes = await db.execute({
      sql: 'SELECT COUNT(*) as cnt FROM blocks WHERE session_id = ?',
      args: [sessionId],
    })
    const position = posRes.rows[0].cnt as number

    if (body.type === 'lift') {
      const { exercise, sets, exerciseType } = body
      const doneSets = sets.filter((s: { done: boolean }) => s.done)
      if (!exercise || doneSets.length === 0) {
        return NextResponse.json({ error: 'No completed sets' }, { status: 400 })
      }

      const blockRes = await db.execute({
        sql: 'INSERT INTO blocks (session_id, type, position) VALUES (?, ?, ?) RETURNING id',
        args: [sessionId, 'lift', position],
      })
      const blockId = blockRes.rows[0].id as number

      await Promise.all(doneSets.map((s: { weight: number; reps: number; duration_secs?: number }, j: number) =>
        db.execute({
          sql: 'INSERT INTO sets (block_id, exercise, weight, reps, position, logged_at, duration_secs) VALUES (?, ?, ?, ?, ?, datetime(\'now\'), ?)',
          args: [blockId, exercise, s.weight, s.reps, j, s.duration_secs ?? null],
        })
      ))

      // PR detection — skip for bodyweight, use duration for timed, weight for weights
      let isPr = false
      let prValue = 0
      if (exerciseType === 'timed') {
        const maxDur = Math.max(...doneSets.map((s: { duration_secs?: number }) => s.duration_secs ?? 0))
        const prevMax = await db.execute({
          sql: `SELECT MAX(st.duration_secs) as max_d FROM sets st
                JOIN blocks b ON st.block_id = b.id
                JOIN sessions s ON b.session_id = s.id
                WHERE st.exercise = ? AND s.user_id = ? AND b.id != ?`,
          args: [exercise, session.userId, blockId],
        })
        const prev = prevMax.rows[0].max_d as number | null
        isPr = prev === null || maxDur > prev
        prValue = maxDur
      } else if (exerciseType !== 'bodyweight') {
        const maxNew = Math.max(...doneSets.map((s: { weight: number }) => s.weight))
        const prevMax = await db.execute({
          sql: `SELECT MAX(st.weight) as max_w FROM sets st
                JOIN blocks b ON st.block_id = b.id
                JOIN sessions s ON b.session_id = s.id
                WHERE st.exercise = ? AND s.user_id = ? AND b.id != ?`,
          args: [exercise, session.userId, blockId],
        })
        const prev = prevMax.rows[0].max_w as number | null
        isPr = prev === null || maxNew > prev
        prValue = maxNew
      }

      return NextResponse.json({ ok: true, blockId, isPr, exercise, weight: prValue })
    } else {
      // Cardio
      const { activity, distance, time, pace } = body
      const blockType = activity === 'Cycling' ? 'cycle' : 'run'

      const blockRes = await db.execute({
        sql: 'INSERT INTO blocks (session_id, type, position) VALUES (?, ?, ?) RETURNING id',
        args: [sessionId, blockType, position],
      })
      const blockId = blockRes.rows[0].id as number

      await db.execute({
        sql: 'INSERT INTO cardio (block_id, activity, distance, duration, pace) VALUES (?, ?, ?, ?, ?)',
        args: [blockId, activity, distance || null, time || null, pace || null],
      })

      return NextResponse.json({ ok: true, blockId })
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/** PATCH — update a cardio entry */
export async function PATCH(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { cardioId, distance, duration, pace } = await req.json()
  if (!cardioId) return NextResponse.json({ error: 'cardioId required' }, { status: 400 })

  const check = await db.execute({
    sql: `SELECT c.id FROM cardio c
          JOIN blocks b ON c.block_id = b.id
          JOIN sessions s ON b.session_id = s.id
          WHERE c.id = ? AND s.user_id = ?`,
    args: [cardioId, session.userId],
  })
  if (check.rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await db.execute({
    sql: 'UPDATE cardio SET distance = ?, duration = ?, pace = ? WHERE id = ?',
    args: [distance || null, duration || null, pace || null, cardioId],
  })
  return NextResponse.json({ ok: true })
}

/** DELETE — remove a block (and its sets/cardio) from today */
export async function DELETE(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { blockId } = await req.json()
  if (!blockId) return NextResponse.json({ error: 'blockId required' }, { status: 400 })

  // Verify block belongs to this user
  const check = await db.execute({
    sql: `SELECT b.id FROM blocks b
          JOIN sessions s ON b.session_id = s.id
          WHERE b.id = ? AND s.user_id = ?`,
    args: [blockId, session.userId],
  })
  if (check.rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await Promise.all([
    db.execute({ sql: 'DELETE FROM sets WHERE block_id = ?', args: [blockId] }),
    db.execute({ sql: 'DELETE FROM cardio WHERE block_id = ?', args: [blockId] }),
  ])
  await db.execute({ sql: 'DELETE FROM blocks WHERE id = ?', args: [blockId] })

  return NextResponse.json({ ok: true })
}
