import { describe, it, expect, beforeEach } from 'vitest'
import { makeDb, seedUser, type TestDb } from '../helpers/db'

let db: TestDb

beforeEach(() => {
  db = makeDb()
})

describe('sessions', () => {
  it('retrieves sessions with blocks and sets for a date', () => {
    const userId = seedUser(db)

    const sess = db.prepare('INSERT INTO sessions (user_id, date) VALUES (?, ?) RETURNING id')
      .get(userId, '2025-03-01') as { id: number }
    const block = db.prepare('INSERT INTO blocks (session_id, type) VALUES (?, ?) RETURNING id')
      .get(sess.id, 'lift') as { id: number }
    db.prepare('INSERT INTO sets (block_id, exercise, weight, reps) VALUES (?, ?, ?, ?)').run(block.id, 'Squat', 100, 5)
    db.prepare('INSERT INTO sets (block_id, exercise, weight, reps) VALUES (?, ?, ?, ?)').run(block.id, 'Squat', 100, 5)
    db.prepare('INSERT INTO sets (block_id, exercise, weight, reps) VALUES (?, ?, ?, ?)').run(block.id, 'Squat', 100, 3)

    const sessions = db.prepare('SELECT id FROM sessions WHERE user_id = ? AND date = ?').all(userId, '2025-03-01') as { id: number }[]
    expect(sessions).toHaveLength(1)

    const blocks = db.prepare('SELECT id, type FROM blocks WHERE session_id = ?').all(sess.id) as { id: number; type: string }[]
    expect(blocks).toHaveLength(1)
    expect(blocks[0].type).toBe('lift')

    const sets = db.prepare('SELECT exercise, weight, reps FROM sets WHERE block_id = ?').all(block.id) as { exercise: string; weight: number; reps: number }[]
    expect(sets).toHaveLength(3)
    expect(sets[0].exercise).toBe('Squat')
    expect(sets[0].weight).toBe(100)
  })

  it('only returns sessions for the correct user', () => {
    const alice = seedUser(db, 'alice')
    const bob = seedUser(db, 'bob')

    db.prepare('INSERT INTO sessions (user_id, date) VALUES (?, ?)').run(alice, '2025-03-01')
    db.prepare('INSERT INTO sessions (user_id, date) VALUES (?, ?)').run(bob, '2025-03-01')

    const aliceSessions = db.prepare('SELECT id FROM sessions WHERE user_id = ? AND date = ?').all(alice, '2025-03-01')
    const bobSessions = db.prepare('SELECT id FROM sessions WHERE user_id = ? AND date = ?').all(bob, '2025-03-01')

    expect(aliceSessions).toHaveLength(1)
    expect(bobSessions).toHaveLength(1)
  })

  it('bulk-fetches sets for multiple blocks with a single IN query', () => {
    const userId = seedUser(db)

    // 3 sessions on same date
    for (let i = 0; i < 3; i++) {
      const sess = db.prepare('INSERT INTO sessions (user_id, date) VALUES (?, ?) RETURNING id')
        .get(userId, '2025-03-01') as { id: number }
      const block = db.prepare('INSERT INTO blocks (session_id, type) VALUES (?, ?) RETURNING id')
        .get(sess.id, 'lift') as { id: number }
      db.prepare('INSERT INTO sets (block_id, exercise, weight, reps) VALUES (?, ?, ?, ?)').run(block.id, 'Bench', 80, 8)
    }

    // Simulate the IN-query approach (not N+1)
    const sessions = db.prepare('SELECT id FROM sessions WHERE user_id = ? AND date = ?').all(userId, '2025-03-01') as { id: number }[]
    const sessionIds = sessions.map(s => s.id)
    const blocks = db.prepare(`SELECT id, session_id FROM blocks WHERE session_id IN (${sessionIds.map(() => '?').join(',')})`)
      .all(...sessionIds) as { id: number; session_id: number }[]
    const blockIds = blocks.map(b => b.id)
    const sets = db.prepare(`SELECT block_id, exercise FROM sets WHERE block_id IN (${blockIds.map(() => '?').join(',')})`)
      .all(...blockIds) as { block_id: number; exercise: string }[]

    // 3 blocks × 1 set each = 3 sets, all fetched in one query
    expect(sets).toHaveLength(3)
    expect(sets.every(s => s.exercise === 'Bench')).toBe(true)
  })
})

describe('cardio', () => {
  it('stores and retrieves HR and distance samples', () => {
    const userId = seedUser(db)
    const sess = db.prepare('INSERT INTO sessions (user_id, date) VALUES (?, ?) RETURNING id').get(userId, '2025-03-01') as { id: number }
    const block = db.prepare('INSERT INTO blocks (session_id, type) VALUES (?, ?) RETURNING id').get(sess.id, 'run') as { id: number }
    const cardio = db.prepare('INSERT INTO cardio (block_id, activity, distance) VALUES (?, ?, ?) RETURNING id').get(block.id, 'Run', 5.0) as { id: number }

    for (let i = 0; i < 10; i++) {
      db.prepare('INSERT INTO cardio_hr_samples (cardio_id, time_offset_sec, hr_bpm) VALUES (?, ?, ?)').run(cardio.id, i * 5, 140 + i)
      db.prepare('INSERT INTO cardio_distance_samples (cardio_id, time_offset_sec, distance_km) VALUES (?, ?, ?)').run(cardio.id, i * 5, i * 0.05)
    }

    const hrSamples = db.prepare('SELECT * FROM cardio_hr_samples WHERE cardio_id = ?').all(cardio.id)
    const distSamples = db.prepare('SELECT * FROM cardio_distance_samples WHERE cardio_id = ?').all(cardio.id)

    expect(hrSamples).toHaveLength(10)
    expect(distSamples).toHaveLength(10)
  })
})
