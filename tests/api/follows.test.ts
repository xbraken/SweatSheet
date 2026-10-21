import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import {
  ACCEPTED_FOLLOWING, ACCEPT_REQUEST_SQL, FOLLOW_STATUS_SQL, INCOMING_REQUESTS_SQL,
  REMOVE_FOLLOWER_SQL, REQUEST_FOLLOW_SQL,
} from '@/lib/follows'
import { FRIENDS_BEST_SQL, PENGUIN } from '@/lib/game-scores'

let db: Database.Database
const ED = 1, CAM = 2, COWORKER = 3

beforeEach(() => {
  db = new Database(':memory:')
  // follows as it was before v15 — no status column
  db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE, avatar TEXT);
    CREATE TABLE follows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      follower_id INTEGER NOT NULL, following_id INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(follower_id, following_id)
    );
    CREATE TABLE sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, date TEXT);
    CREATE TABLE game_scores (user_id INTEGER, game TEXT, best INTEGER, updated_at TEXT, PRIMARY KEY (user_id, game));
    INSERT INTO users (username) VALUES ('edmond'), ('cameron'), ('coworker');
    INSERT INTO follows (follower_id, following_id) VALUES (${CAM}, ${ED}), (${ED}, ${CAM});
    INSERT INTO sessions (user_id, date) VALUES (${ED}, '2026-10-20'), (${CAM}, '2026-10-20');
  `)
  // The v15 migration, verbatim
  db.exec(`ALTER TABLE follows ADD COLUMN status TEXT NOT NULL DEFAULT 'accepted'`)
})

/** User ids whose workouts `viewer` can see (the feed's rule) */
const visibleTo = (viewer: number) =>
  (db.prepare(`SELECT DISTINCT user_id FROM sessions WHERE user_id = ? OR user_id IN (${ACCEPTED_FOLLOWING}) ORDER BY user_id`)
    .all(viewer, viewer) as { user_id: number }[]).map(r => r.user_id)
const status = (viewer: number, target: number) =>
  (db.prepare(FOLLOW_STATUS_SQL).get(viewer, target) as { status: string } | undefined)?.status ?? 'none'

describe('follow requests', () => {
  it('existing friends keep access after the migration', () => {
    expect(status(CAM, ED)).toBe('accepted')
    expect(visibleTo(CAM)).toEqual([ED, CAM])
  })

  it('a new follow is only a request — nothing is visible until accepted', () => {
    db.prepare(REQUEST_FOLLOW_SQL).run(COWORKER, ED)
    expect(status(COWORKER, ED)).toBe('pending')
    expect(visibleTo(COWORKER)).toEqual([])
    expect(db.prepare(INCOMING_REQUESTS_SQL).all(ED)).toEqual([expect.objectContaining({ username: 'coworker' })])
  })

  it('accepting shares workouts; only the person asked can accept', () => {
    db.prepare(REQUEST_FOLLOW_SQL).run(COWORKER, ED)
    db.prepare(ACCEPT_REQUEST_SQL).run(CAM, COWORKER)   // cameron can't approve on edmond's behalf
    expect(status(COWORKER, ED)).toBe('pending')
    db.prepare(ACCEPT_REQUEST_SQL).run(ED, COWORKER)
    expect(status(COWORKER, ED)).toBe('accepted')
    expect(visibleTo(COWORKER)).toEqual([ED])
    expect(db.prepare(INCOMING_REQUESTS_SQL).all(ED)).toEqual([])
  })

  it('declining removes the request', () => {
    db.prepare(REQUEST_FOLLOW_SQL).run(COWORKER, ED)
    db.prepare(REMOVE_FOLLOWER_SQL).run(ED, COWORKER)
    expect(status(COWORKER, ED)).toBe('none')
    expect(visibleTo(COWORKER)).toEqual([])
  })

  it('following again does not downgrade an accepted follow', () => {
    db.prepare(REQUEST_FOLLOW_SQL).run(CAM, ED)
    expect(status(CAM, ED)).toBe('accepted')
  })

  it('accepting is one-way — it does not show you their workouts', () => {
    db.prepare(REQUEST_FOLLOW_SQL).run(COWORKER, ED)
    db.prepare(ACCEPT_REQUEST_SQL).run(ED, COWORKER)
    expect(visibleTo(ED)).toEqual([ED, CAM])
  })

  it('pending followers are left off the penguin board too', () => {
    db.prepare(REQUEST_FOLLOW_SQL).run(COWORKER, ED)
    db.exec(`INSERT INTO game_scores VALUES (${ED}, '${PENGUIN}', 300, '2026-10-20')`)
    const board = db.prepare(FRIENDS_BEST_SQL).all(COWORKER, COWORKER, PENGUIN)
    expect(board).toEqual([])
  })
})

describe('removing a follower', () => {
  it('takes away access; they would have to request again', async () => {
    const { FOLLOWERS_SQL } = await import('@/lib/follows')
    expect((db.prepare(FOLLOWERS_SQL).all(ED) as { username: string }[]).map(r => r.username)).toEqual(['cameron'])
    db.prepare(REMOVE_FOLLOWER_SQL).run(ED, CAM)
    expect(visibleTo(CAM)).toEqual([CAM])
    expect(db.prepare(FOLLOWERS_SQL).all(ED)).toEqual([])
    db.prepare(REQUEST_FOLLOW_SQL).run(CAM, ED)
    expect(status(CAM, ED)).toBe('pending')
  })

  it('only removes your own followers', () => {
    db.prepare(REMOVE_FOLLOWER_SQL).run(COWORKER, CAM)   // coworker can't remove cam from edmond
    expect(status(CAM, ED)).toBe('accepted')
  })
})
