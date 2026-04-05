/**
 * Seeds a fake workout session dated yesterday for testing "Repeat last session".
 *
 * Usage:  npx tsx scripts/seed-yesterday.ts <user_id>
 * Example: npx tsx scripts/seed-yesterday.ts 1
 */
import { createClient } from '@libsql/client'
import 'dotenv/config'

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
})

const userId = parseInt(process.argv[2] || '1')
const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]

async function seed() {
  // Create session
  const s = await db.execute({
    sql: 'INSERT INTO sessions (user_id, date) VALUES (?, ?) RETURNING id',
    args: [userId, yesterday],
  })
  const sessionId = s.rows[0].id as number

  // Block 1: Bench Press (weights)
  const b1 = await db.execute({
    sql: 'INSERT INTO blocks (session_id, type, position) VALUES (?, ?, ?) RETURNING id',
    args: [sessionId, 'lift', 0],
  })
  const block1 = b1.rows[0].id as number
  for (const [pos, w, r] of [[0, 60, 10], [1, 70, 8], [2, 80, 6]]) {
    await db.execute({
      sql: 'INSERT INTO sets (block_id, exercise, weight, reps, position) VALUES (?, ?, ?, ?, ?)',
      args: [block1, 'Bench Press', w, r, pos],
    })
  }

  // Block 2: Push-ups (bodyweight)
  const b2 = await db.execute({
    sql: 'INSERT INTO blocks (session_id, type, position) VALUES (?, ?, ?) RETURNING id',
    args: [sessionId, 'lift', 1],
  })
  const block2 = b2.rows[0].id as number
  for (const [pos, r] of [[0, 20], [1, 15], [2, 12]]) {
    await db.execute({
      sql: 'INSERT INTO sets (block_id, exercise, weight, reps, position) VALUES (?, ?, ?, ?, ?)',
      args: [block2, 'Push-ups', 0, r, pos],
    })
  }

  console.log(`Seeded session ${sessionId} for user ${userId} on ${yesterday}`)
  console.log('  → Bench Press: 60kg×10, 70kg×8, 80kg×6')
  console.log('  → Push-ups: 20, 15, 12 reps')
}

seed().catch(console.error)
