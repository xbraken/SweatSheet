import { createClient } from '@libsql/client'

export const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
})

// Increment this whenever new migrations are added
const SCHEMA_VERSION = 7

let _initPromise: Promise<void> | null = null

export function initDb(): Promise<void> {
  if (_initPromise) return _initPromise
  _initPromise = _runInit()
  return _initPromise
}

async function _runInit() {
  // Fast path: single read to check if schema is already current
  // Avoids firing 30+ DDL write-transactions on every cold start
  try {
    const v = await db.execute(`SELECT value FROM _meta WHERE key = 'schema_version'`)
    if (v.rows.length > 0 && Number(v.rows[0].value) >= SCHEMA_VERSION) return
  } catch { /* _meta table doesn't exist yet — first run */ }

  // Core tables
  await db.execute(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )`)

  await db.execute(`CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`)

  await db.execute(`CREATE TABLE IF NOT EXISTS blocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK(type IN ('lift', 'run', 'cycle', 'cardio')),
    position INTEGER NOT NULL DEFAULT 0
  )`)

  await db.execute(`CREATE TABLE IF NOT EXISTS sets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    block_id INTEGER NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
    exercise TEXT NOT NULL,
    weight REAL NOT NULL,
    reps INTEGER NOT NULL,
    position INTEGER NOT NULL DEFAULT 0
  )`)

  await db.execute(`CREATE TABLE IF NOT EXISTS cardio (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    block_id INTEGER NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
    activity TEXT NOT NULL,
    distance REAL,
    duration TEXT,
    pace TEXT,
    calories INTEGER,
    heart_rate INTEGER,
    imported_from TEXT
  )`)

  await db.execute(`CREATE TABLE IF NOT EXISTS body_weight (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    weight_kg REAL NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, date)
  )`)

  await db.execute(`CREATE TABLE IF NOT EXISTS starred_exercises (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    exercise TEXT NOT NULL,
    UNIQUE(user_id, exercise)
  )`)

  // Migrate existing sessions table to have user_id if not present
  try {
    await db.execute(`ALTER TABLE sessions ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE`)
  } catch { /* column already exists */ }

  // Migrate users table to have unit_pref if not present
  try {
    await db.execute(`ALTER TABLE users ADD COLUMN unit_pref TEXT NOT NULL DEFAULT 'metric'`)
  } catch { /* column already exists */ }

  // HR detail columns for cardio rows
  try { await db.execute(`ALTER TABLE cardio ADD COLUMN hr_min INTEGER`) } catch { /* exists */ }
  try { await db.execute(`ALTER TABLE cardio ADD COLUMN hr_max INTEGER`) } catch { /* exists */ }
  try { await db.execute(`ALTER TABLE cardio ADD COLUMN started_at TEXT`) } catch { /* exists */ }
  try { await db.execute(`ALTER TABLE cardio ADD COLUMN ended_at TEXT`) } catch { /* exists */ }

  // API key for Shortcuts / external sync
  try {
    await db.execute(`ALTER TABLE users ADD COLUMN api_key TEXT`)
  } catch { /* exists */ }

  try {
    await db.execute(`ALTER TABLE sets ADD COLUMN logged_at TEXT`)
  } catch { /* exists */ }

  // HR samples over time (one row per ~5s reading during a workout)
  await db.execute(`CREATE TABLE IF NOT EXISTS cardio_hr_samples (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cardio_id INTEGER NOT NULL REFERENCES cardio(id) ON DELETE CASCADE,
    time_offset_sec INTEGER NOT NULL,
    hr_bpm INTEGER NOT NULL
  )`)

  // Cumulative distance samples over time (for pace graph + best-segment calculation)
  await db.execute(`CREATE TABLE IF NOT EXISTS cardio_distance_samples (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cardio_id INTEGER NOT NULL REFERENCES cardio(id) ON DELETE CASCADE,
    time_offset_sec INTEGER NOT NULL,
    distance_km REAL NOT NULL
  )`)

  // Social follows
  await db.execute(`CREATE TABLE IF NOT EXISTS follows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    following_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(follower_id, following_id)
  )`)

  // Indexes for common query patterns
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_sessions_user_date ON sessions(user_id, date)`)
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_blocks_session ON blocks(session_id)`)
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_sets_block ON sets(block_id)`)
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_sets_exercise ON sets(exercise)`)
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_cardio_block ON cardio(block_id)`)
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_hr_samples_cardio ON cardio_hr_samples(cardio_id)`)
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_dist_samples_cardio ON cardio_distance_samples(cardio_id)`)
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id)`)
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_blocks_session_type ON blocks(session_id, type)`)
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_sets_exercise_block ON sets(exercise, block_id)`)

  // Strava OAuth fields
  try { await db.execute(`ALTER TABLE users ADD COLUMN strava_athlete_id INTEGER`) } catch { /* exists */ }
  try { await db.execute(`ALTER TABLE users ADD COLUMN strava_access_token TEXT`) } catch { /* exists */ }
  try { await db.execute(`ALTER TABLE users ADD COLUMN strava_refresh_token TEXT`) } catch { /* exists */ }
  try { await db.execute(`ALTER TABLE users ADD COLUMN strava_token_expires_at INTEGER`) } catch { /* exists */ }

  // Avatar (base64 data URL, resized client-side to 160x160 before upload)
  try { await db.execute(`ALTER TABLE users ADD COLUMN avatar TEXT`) } catch { /* exists */ }

  // Duration for timed exercises (plank, wall sit etc.)
  try { await db.execute(`ALTER TABLE sets ADD COLUMN duration_secs INTEGER`) } catch { /* exists */ }

  // Workout templates
  await db.execute(`CREATE TABLE IF NOT EXISTS templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )`)
  await db.execute(`CREATE TABLE IF NOT EXISTS template_exercises (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    template_id INTEGER NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
    exercise TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0
  )`)
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_templates_user ON templates(user_id)`)
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_template_exercises_template ON template_exercises(template_id)`)

  // Mark schema as current — future cold starts skip all DDL above
  await db.execute(`CREATE TABLE IF NOT EXISTS _meta (key TEXT PRIMARY KEY, value TEXT)`)
  await db.execute({ sql: `INSERT OR REPLACE INTO _meta (key, value) VALUES ('schema_version', ?)`, args: [String(SCHEMA_VERSION)] })
}

