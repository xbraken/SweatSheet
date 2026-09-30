// Mini-game high scores (the Friends page penguin easter egg). SQL lives here so the API route
// and the better-sqlite3 tests run exactly the same statements.

export const PENGUIN = 'penguin'

/** Scores are client-reported; reject anything that isn't a sane whole number */
export function validScore(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v > 0 && v < 1_000_000
}

/** Keep only the best: insert, or raise the stored best if this run beat it */
export const UPSERT_BEST_SQL = `
  INSERT INTO game_scores (user_id, game, best, updated_at) VALUES (?, ?, ?, datetime('now'))
  ON CONFLICT(user_id, game) DO UPDATE SET best = excluded.best, updated_at = excluded.updated_at
  WHERE excluded.best > game_scores.best`

/** Best scores for you + everyone you follow, highest first. Args: [userId, userId, game] */
export const FRIENDS_BEST_SQL = `
  WITH people AS (
    SELECT id, username FROM users WHERE id = ?
    UNION
    SELECT u.id, u.username FROM follows f JOIN users u ON u.id = f.following_id WHERE f.follower_id = ?
  )
  SELECT p.id AS user_id, p.username, g.best
  FROM people p JOIN game_scores g ON g.user_id = p.id AND g.game = ?
  ORDER BY g.best DESC, g.updated_at ASC
  LIMIT 10`
