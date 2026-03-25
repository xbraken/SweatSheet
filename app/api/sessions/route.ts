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

    // Save each block
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i]

      // Map client-side 'cardio' type to DB-compatible type based on activity
      const blockType = block.type === 'lift' ? 'lift'
        : block.activity === 'Cycling' ? 'cycle' : 'run'

      const blockRes = await db.execute({
        sql: 'INSERT INTO blocks (session_id, type, position) VALUES (?, ?, ?) RETURNING id',
        args: [sessionId, blockType, i],
      })
      const blockId = blockRes.rows[0].id as number

      if (block.type === 'lift') {
        for (let j = 0; j < block.sets.length; j++) {
          const set = block.sets[j]
          if (!set.done) continue // only save completed sets
          await db.execute({
            sql: 'INSERT INTO sets (block_id, exercise, weight, reps, position) VALUES (?, ?, ?, ?, ?)',
            args: [blockId, block.exercise, set.weight, set.reps, j],
          })
        }
      } else {
        await db.execute({
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

    // Detect PRs: for each lift block, check if any set weight exceeds previous max
    const prs: { exercise: string; weight: number }[] = []
    for (const block of blocks) {
      if (block.type !== 'lift') continue
      const maxNew = Math.max(...block.sets.filter((s: { done: boolean }) => s.done).map((s: { weight: number }) => s.weight))
      if (!isFinite(maxNew)) continue
      const prevMax = await db.execute({
        sql: `SELECT MAX(st.weight) as max_w FROM sets st
              JOIN blocks b ON st.block_id = b.id
              JOIN sessions s ON b.session_id = s.id
              WHERE st.exercise = ? AND s.user_id = ? AND s.id != ?`,
        args: [block.exercise, session.userId, sessionId],
      })
      const prev = prevMax.rows[0].max_w as number | null
      if (prev === null || maxNew > prev) {
        prs.push({ exercise: block.exercise, weight: maxNew })
      }
    }

    return NextResponse.json({ id: sessionId, date, prs })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    console.error('POST /api/sessions error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
