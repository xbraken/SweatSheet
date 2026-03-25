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

  const date = new Date().toISOString().split('T')[0]

  // Create session
  const sessionRes = await db.execute({
    sql: 'INSERT INTO sessions (date) VALUES (?) RETURNING id',
    args: [date],
  })
  const sessionId = sessionRes.rows[0].id as number

  // Save each block
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]

    const blockRes = await db.execute({
      sql: 'INSERT INTO blocks (session_id, type, position) VALUES (?, ?, ?) RETURNING id',
      args: [sessionId, block.type, i],
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
        sql: 'INSERT INTO cardio (block_id, activity, distance, duration) VALUES (?, ?, ?, ?)',
        args: [blockId, block.activity, block.distance || null, block.time || null],
      })
    }
  }

  return NextResponse.json({ id: sessionId, date })
}
