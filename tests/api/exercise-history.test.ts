import { describe, it, expect, beforeEach } from 'vitest'
import { makeDb, seedUser, type TestDb } from '../helpers/db'

let db: TestDb

// Mirrors the query in app/api/exercises/history/route.ts
const HISTORY_SQL = `
  SELECT s.date, b.id as block_id, b.notes, st.weight, st.reps, st.duration_secs
  FROM sets st
  JOIN blocks b ON st.block_id = b.id
  JOIN sessions s ON b.session_id = s.id
  WHERE st.exercise = ? AND s.user_id = ? AND b.id IN (
    SELECT b2.id
    FROM blocks b2
    JOIN sessions s2 ON b2.session_id = s2.id
    JOIN sets st2 ON st2.block_id = b2.id
    WHERE st2.exercise = ? AND s2.user_id = ?
    GROUP BY b2.id
    ORDER BY s2.date DESC, b2.id DESC
    LIMIT ?
  )
  ORDER BY s.date DESC, b.id DESC, st.position ASC, st.id ASC
`

type Row = { date: string; block_id: number; notes: string | null; weight: number; reps: number; duration_secs: number | null }

function history(userId: number, exercise: string, limit = 5): Row[] {
  return db.prepare(HISTORY_SQL).all(exercise, userId, exercise, userId, limit) as Row[]
}

/** Log one block of an exercise on a date. Returns the block id. */
function logBlock(
  userId: number,
  date: string,
  exercise: string,
  sets: { weight: number; reps: number; duration_secs?: number }[],
  notes: string | null = null,
): number {
  let sess = db.prepare('SELECT id FROM sessions WHERE user_id = ? AND date = ?').get(userId, date) as { id: number } | undefined
  if (!sess) {
    sess = db.prepare('INSERT INTO sessions (user_id, date) VALUES (?, ?) RETURNING id').get(userId, date) as { id: number }
  }
  const block = db.prepare('INSERT INTO blocks (session_id, type, notes) VALUES (?, ?, ?) RETURNING id')
    .get(sess.id, 'lift', notes) as { id: number }
  sets.forEach((s, i) => {
    db.prepare('INSERT INTO sets (block_id, exercise, weight, reps, position, duration_secs) VALUES (?, ?, ?, ?, ?, ?)')
      .run(block.id, exercise, s.weight, s.reps, i, s.duration_secs ?? null)
  })
  return block.id
}

beforeEach(() => {
  db = makeDb()
})

describe('exercise history', () => {
  it('returns sets for the exercise, newest session first, in logged order', () => {
    const userId = seedUser(db)
    logBlock(userId, '2025-03-01', 'Bench Press', [{ weight: 80, reps: 8 }, { weight: 80, reps: 7 }])
    logBlock(userId, '2025-03-08', 'Bench Press', [{ weight: 85, reps: 6 }, { weight: 82.5, reps: 8 }])

    const rows = history(userId, 'Bench Press')

    expect(rows).toHaveLength(4)
    expect(rows[0].date).toBe('2025-03-08')
    expect([rows[0].weight, rows[1].weight]).toEqual([85, 82.5])
    expect(rows[2].date).toBe('2025-03-01')
  })

  it('excludes other exercises and other users', () => {
    const alice = seedUser(db, 'alice')
    const bob = seedUser(db, 'bob')
    logBlock(alice, '2025-03-01', 'Bench Press', [{ weight: 80, reps: 8 }])
    logBlock(alice, '2025-03-01', 'Squat', [{ weight: 100, reps: 5 }])
    logBlock(bob, '2025-03-01', 'Bench Press', [{ weight: 60, reps: 10 }])

    const rows = history(alice, 'Bench Press')

    expect(rows).toHaveLength(1)
    expect(rows[0].weight).toBe(80)
  })

  it('keeps two blocks of the same exercise on one day separate', () => {
    const userId = seedUser(db)
    const morning = logBlock(userId, '2025-03-01', 'Bench Press', [{ weight: 80, reps: 8 }])
    const evening = logBlock(userId, '2025-03-01', 'Bench Press', [{ weight: 70, reps: 12 }])

    const rows = history(userId, 'Bench Press')
    const blockIds = [...new Set(rows.map(r => r.block_id))]

    expect(blockIds).toEqual([evening, morning])
  })

  it('caps the result at the most recent N blocks', () => {
    const userId = seedUser(db)
    for (let i = 1; i <= 8; i++) {
      logBlock(userId, `2025-03-0${i}`, 'Bench Press', [{ weight: 70 + i, reps: 5 }])
    }

    const rows = history(userId, 'Bench Press', 5)
    const dates = [...new Set(rows.map(r => r.date))]

    expect(dates).toEqual(['2025-03-08', '2025-03-07', '2025-03-06', '2025-03-05', '2025-03-04'])
  })

  it('carries block notes and durations through', () => {
    const userId = seedUser(db)
    logBlock(userId, '2025-03-01', 'Plank', [{ weight: 0, reps: 1, duration_secs: 90 }], 'felt easy')

    const rows = history(userId, 'Plank')

    expect(rows[0].notes).toBe('felt easy')
    expect(rows[0].duration_secs).toBe(90)
  })

  it('returns nothing for an exercise never logged', () => {
    const userId = seedUser(db)
    logBlock(userId, '2025-03-01', 'Squat', [{ weight: 100, reps: 5 }])

    expect(history(userId, 'Bench Press')).toHaveLength(0)
  })
})
