import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { FRIENDS_BEST_SQL, PENGUIN, UPSERT_BEST_SQL, validScore } from '@/lib/game-scores'

let db: Database.Database

beforeEach(() => {
  db = new Database(':memory:')
  db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE);
    CREATE TABLE follows (follower_id INTEGER NOT NULL, following_id INTEGER NOT NULL);
    CREATE TABLE game_scores (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      game TEXT NOT NULL, best INTEGER NOT NULL, updated_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, game)
    );
    INSERT INTO users (username) VALUES ('edmond'), ('cameron'), ('stranger');
    INSERT INTO follows VALUES (1, 2);
  `)
})

const submit = (userId: number, score: number) => db.prepare(UPSERT_BEST_SQL).run(userId, PENGUIN, score)
const board = (userId: number) => db.prepare(FRIENDS_BEST_SQL).all(userId, userId, PENGUIN) as { username: string; best: number }[]

describe('penguin high scores', () => {
  it('keeps only the best run', () => {
    submit(1, 300)
    submit(1, 120)
    expect(board(1)).toEqual([expect.objectContaining({ username: 'edmond', best: 300 })])
    submit(1, 450)
    expect(board(1)[0].best).toBe(450)
  })

  it('shows you and the people you follow, highest first', () => {
    submit(1, 300)
    submit(2, 412)
    submit(3, 9999)   // not followed — hidden
    expect(board(1).map(r => r.username)).toEqual(['cameron', 'edmond'])
  })

  it('rejects junk scores', () => {
    expect(validScore(250)).toBe(true)
    for (const v of [0, -5, 1.5, '300', null, 5_000_000]) expect(validScore(v)).toBe(false)
  })
})
