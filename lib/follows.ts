// Follow requests. Following someone needs their approval: a follow starts 'pending' and only
// an 'accepted' follow lets you see their workouts. Rows from before requests existed were
// migrated as 'accepted' (v15), so existing friends kept access.
//
// Every query that shows one user's data to another must go through ACCEPTED_FOLLOWING —
// SQL lives here so routes and the better-sqlite3 tests use exactly the same statements.

export type FollowStatus = 'none' | 'pending' | 'accepted'

/** Subquery: ids the viewer may see (accepted follows). One arg: viewerId */
export const ACCEPTED_FOLLOWING = `SELECT following_id FROM follows WHERE follower_id = ? AND status = 'accepted'`

/** Viewer → target relationship. Args: [viewerId, targetId] */
export const FOLLOW_STATUS_SQL = `SELECT status FROM follows WHERE follower_id = ? AND following_id = ?`

/** Send a request; an existing follow (pending or accepted) is left as it is. Args: [viewerId, targetId] */
export const REQUEST_FOLLOW_SQL = `INSERT OR IGNORE INTO follows (follower_id, following_id, status) VALUES (?, ?, 'pending')`

/** Incoming requests waiting on me, oldest first. Args: [meId] */
export const INCOMING_REQUESTS_SQL = `
  SELECT u.username, u.avatar, f.created_at
  FROM follows f JOIN users u ON u.id = f.follower_id
  WHERE f.following_id = ? AND f.status = 'pending'
  ORDER BY f.created_at`

/** People who can see my workouts (accepted followers), A–Z. Args: [meId] */
export const FOLLOWERS_SQL = `
  SELECT u.username, u.avatar
  FROM follows f JOIN users u ON u.id = f.follower_id
  WHERE f.following_id = ? AND f.status = 'accepted'
  ORDER BY lower(u.username)`

/** Approve a request from `requester`. Args: [meId, requesterId] */
export const ACCEPT_REQUEST_SQL = `UPDATE follows SET status = 'accepted' WHERE following_id = ? AND follower_id = ? AND status = 'pending'`

/** Decline a request, or remove an existing follower. Args: [meId, followerId] */
export const REMOVE_FOLLOWER_SQL = `DELETE FROM follows WHERE following_id = ? AND follower_id = ?`

export function toFollowStatus(v: unknown): FollowStatus {
  return v === 'accepted' || v === 'pending' ? v : 'none'
}
