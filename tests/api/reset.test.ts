import { describe, it, expect, beforeEach } from 'vitest'
import { makeDb, seedUser, seedHeavyData, resetUser, count, type TestDb } from '../helpers/db'

let db: TestDb

beforeEach(() => {
  db = makeDb()
})

describe('reset (clear all data)', () => {
  it('deletes all sessions, blocks, cardio and samples for the user', () => {
    const userId = seedUser(db)
    const { totalHr, totalDist } = seedHeavyData(db, userId, 10, 300)

    expect(count(db, 'sessions')).toBe(10)
    expect(count(db, 'cardio_hr_samples')).toBe(totalHr)
    expect(count(db, 'cardio_distance_samples')).toBe(totalDist)

    resetUser(db, userId)

    expect(count(db, 'sessions')).toBe(0)
    expect(count(db, 'blocks')).toBe(0)
    expect(count(db, 'cardio')).toBe(0)
    expect(count(db, 'cardio_hr_samples')).toBe(0)
    expect(count(db, 'cardio_distance_samples')).toBe(0)
  })

  it('does not delete data belonging to other users', () => {
    const alice = seedUser(db, 'alice')
    const bob = seedUser(db, 'bob')

    seedHeavyData(db, alice, 5, 100)
    seedHeavyData(db, bob, 5, 100)

    resetUser(db, alice)

    // Alice's data gone
    const aliceSessions = db.prepare('SELECT id FROM sessions WHERE user_id = ?').all(alice)
    expect(aliceSessions).toHaveLength(0)

    // Bob's data untouched
    expect(count(db, 'sessions')).toBe(5)
    expect(count(db, 'blocks')).toBe(5)
    expect(count(db, 'cardio')).toBe(5)
    expect(count(db, 'cardio_hr_samples')).toBe(500)
    expect(count(db, 'cardio_distance_samples')).toBe(500)
  })

  it('is a no-op for a user with no data', () => {
    const alice = seedUser(db, 'alice')
    const bob = seedUser(db, 'bob')
    seedHeavyData(db, bob, 3, 50)

    expect(() => resetUser(db, alice)).not.toThrow()
    expect(count(db, 'sessions')).toBe(3)
  })

  it('handles large datasets without errors', () => {
    const userId = seedUser(db)
    seedHeavyData(db, userId, 50, 500) // 50 runs × 500 samples = 25k HR + 25k dist rows

    expect(count(db, 'cardio_hr_samples')).toBe(25000)

    resetUser(db, userId)

    expect(count(db, 'cardio_hr_samples')).toBe(0)
    expect(count(db, 'sessions')).toBe(0)
  })
})
