import { NextRequest, NextResponse } from 'next/server'
import { db, initDb } from '@/lib/db'
import { getSession } from '@/lib/auth'

await initDb()

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const result = await db.execute({
    sql: `SELECT s.id, s.date, s.created_at,
      COUNT(DISTINCT b.id) as block_count
      FROM sessions s
      LEFT JOIN blocks b ON b.session_id = s.id
      WHERE s.user_id = ?
      GROUP BY s.id
      ORDER BY s.created_at DESC
      LIMIT 20`,
    args: [session.userId],
  })
  return NextResponse.json(result.rows)
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { blocks } = body

  if (!blocks || blocks.length === 0) {
    return NextResponse.json({ error: 'No blocks provided' }, { status: 400 })
  }

  const date = body.date ?? new Date().toISOString().split('T')[0]

  try {
    // Create session
    const sessionRes = await db.execute({
      sql: 'INSERT INTO sessions (user_id, date) VALUES (?, ?) RETURNING id',
      args: [session.userId, date],
    })
    const sessionId = sessionRes.rows[0].id as number

    // Insert all blocks in a batch
    const blockStmts = blocks.map((block: { type: string; activity?: string }, i: number) => {
      const blockType = block.type === 'lift' ? 'lift'
        : block.activity === 'Cycling' ? 'cycle'
        : 'run'
      return {
        sql: 'INSERT INTO blocks (session_id, type, position) VALUES (?, ?, ?) RETURNING id',
        args: [sessionId, blockType, i],
      }
    })
    const blockResults = await db.batch(blockStmts)

    // Collect all set and cardio inserts
    const setStmts: { sql: string; args: unknown[] }[] = []
    const cardioStmts: { sql: string; args: unknown[] }[] = []

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i]
      const blockId = blockResults[i].rows[0].id as number

      if (block.type === 'lift') {
        for (let j = 0; j < block.sets.length; j++) {
          const set = block.sets[j]
          if (!set.done) continue
          setStmts.push({
            sql: 'INSERT INTO sets (block_id, exercise, weight, reps, position, logged_at) VALUES (?, ?, ?, ?, ?, datetime(\'now\'))',
            args: [blockId, block.exercise, set.weight, set.reps, j],
          })
        }
      } else {
        cardioStmts.push({
          sql: 'INSERT INTO cardio (block_id, activity, distance, duration, pace, calories, heart_rate, imported_from) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          args: [
            blockId,
            block.activity,
            block.distance || null,
            block.time || null,
            block.pace || null,
            block.calories || null,
            block.heartRate || null,
            block.importedFrom || null,
          ],
        })
      }
    }

    // Batch insert all sets and cardio in parallel
    await Promise.all([
      setStmts.length > 0 ? db.batch(setStmts) : Promise.resolve(),
      cardioStmts.length > 0 ? db.batch(cardioStmts) : Promise.resolve(),
    ])

    // Detect PRs: batch all exercise max queries in parallel
    const liftBlocks = blocks.filter((b: { type: string }) => b.type === 'lift')
    const prChecks = liftBlocks
      .map((block: { sets: { done: boolean; weight: number }[]; exercise: string }) => {
        const maxNew = Math.max(...block.sets.filter(s => s.done).map(s => s.weight))
        if (!isFinite(maxNew)) return null
        return { exercise: block.exercise, maxNew }
      })
      .filter(Boolean) as { exercise: string; maxNew: number }[]

    const prResults = prChecks.length > 0
      ? await db.batch(prChecks.map(p => ({
          sql: `SELECT MAX(st.weight) as max_w FROM sets st
                JOIN blocks b ON st.block_id = b.id
                JOIN sessions s ON b.session_id = s.id
                WHERE st.exercise = ? AND s.user_id = ? AND s.id != ?`,
          args: [p.exercise, session.userId, sessionId],
        })))
      : []

    const prs: { exercise: string; weight: number }[] = []
    for (let i = 0; i < prChecks.length; i++) {
      const prev = prResults[i].rows[0].max_w as number | null
      if (prev === null || prChecks[i].maxNew > prev) {
        prs.push({ exercise: prChecks[i].exercise, weight: prChecks[i].maxNew })
      }
    }

    return NextResponse.json({ id: sessionId, date, prs })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    console.error('POST /api/sessions error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
