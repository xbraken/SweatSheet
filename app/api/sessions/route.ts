import { NextRequest, NextResponse } from 'next/server'
import { db, initDb } from '@/lib/db'

await initDb()

export async function GET() {
  const result = await db.execute(`
    SELECT s.id, s.date, s.created_at,
      COUNT(DISTINCT b.id) as block_count
    FROM sessions s
    LEFT JOIN blocks b ON b.session_id = s.id
    GROUP BY s.id
    ORDER BY s.created_at DESC
    LIMIT 20
  `)
  return NextResponse.json(result.rows)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { blocks } = body

  if (!blocks || blocks.length === 0) {
    return NextResponse.json({ error: 'No blocks provided' }, { status: 400 })
  }

  const date = body.date ?? new Date().toISOString().split('T')[0]

  try {
    // Create session
    const sessionRes = await db.execute({
      sql: 'INSERT INTO sessions (date) VALUES (?) RETURNING id',
      args: [date],
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

    return NextResponse.json({ id: sessionId, date })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    console.error('POST /api/sessions error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
