import { createClient } from '@libsql/client'

export const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
})

export async function initDb() {
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

  // HR samples over time (one row per ~5s reading during a workout)
  await db.execute(`CREATE TABLE IF NOT EXISTS cardio_hr_samples (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cardio_id INTEGER NOT NULL REFERENCES cardio(id) ON DELETE CASCADE,
    time_offset_sec INTEGER NOT NULL,
    hr_bpm INTEGER NOT NULL
  )`)
}

