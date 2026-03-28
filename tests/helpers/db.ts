import Database from 'better-sqlite3'

/** Creates a fresh in-memory SQLite DB with the full SweatSheet schema */
export function makeDb() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')

  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL DEFAULT '',
      unit_pref TEXT NOT NULL DEFAULT 'metric',
      api_key TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE blocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE sets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      block_id INTEGER NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
      exercise TEXT NOT NULL,
      weight REAL NOT NULL,
      reps INTEGER NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      logged_at TEXT
    );

    CREATE TABLE cardio (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      block_id INTEGER NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
      activity TEXT NOT NULL,
      distance REAL,
      duration TEXT,
      pace TEXT,
      calories INTEGER,
      heart_rate INTEGER,
      started_at TEXT
    );

    CREATE TABLE cardio_hr_samples (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cardio_id INTEGER NOT NULL REFERENCES cardio(id) ON DELETE CASCADE,
      time_offset_sec INTEGER NOT NULL,
      hr_bpm INTEGER NOT NULL
    );

    CREATE TABLE cardio_distance_samples (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cardio_id INTEGER NOT NULL REFERENCES cardio(id) ON DELETE CASCADE,
      time_offset_sec INTEGER NOT NULL,
      distance_km REAL NOT NULL
    );

    CREATE INDEX idx_sessions_user_date ON sessions(user_id, date);
    CREATE INDEX idx_blocks_session ON blocks(session_id);
    CREATE INDEX idx_cardio_block ON cardio(block_id);
    CREATE INDEX idx_sets_block ON sets(block_id);
    CREATE INDEX idx_hr_samples_cardio ON cardio_hr_samples(cardio_id);
    CREATE INDEX idx_dist_samples_cardio ON cardio_distance_samples(cardio_id);
  `)

  return db
}

export type TestDb = ReturnType<typeof makeDb>

/** Seed a user and return their id */
export function seedUser(db: TestDb, username = 'alice'): number {
  const r = db.prepare('INSERT INTO users (username) VALUES (?) RETURNING id').get(username) as { id: number }
  return r.id
}

/** Seed N sessions with cardio + HR/distance samples for a given user. Returns counts. */
export function seedHeavyData(db: TestDb, userId: number, numSessions = 10, samplesPerRun = 300) {
  let totalHr = 0, totalDist = 0

  for (let i = 0; i < numSessions; i++) {
    const sess = db.prepare('INSERT INTO sessions (user_id, date) VALUES (?, ?) RETURNING id')
      .get(userId, `2025-0${(i % 9) + 1}-01`) as { id: number }

    const block = db.prepare('INSERT INTO blocks (session_id, type) VALUES (?, ?) RETURNING id')
      .get(sess.id, 'run') as { id: number }

    const cardio = db.prepare('INSERT INTO cardio (block_id, activity, distance) VALUES (?, ?, ?) RETURNING id')
      .get(block.id, 'Run', 5.0 + i) as { id: number }

    const hrStmt = db.prepare('INSERT INTO cardio_hr_samples (cardio_id, time_offset_sec, hr_bpm) VALUES (?, ?, ?)')
    const distStmt = db.prepare('INSERT INTO cardio_distance_samples (cardio_id, time_offset_sec, distance_km) VALUES (?, ?, ?)')

    const insertMany = db.transaction(() => {
      for (let s = 0; s < samplesPerRun; s++) {
        hrStmt.run(cardio.id, s * 5, 140 + (s % 20))
        distStmt.run(cardio.id, s * 5, (s * 5 * 3) / 3600)
        totalHr++
        totalDist++
      }
    })
    insertMany()
  }

  return { totalHr, totalDist }
}

/** Count rows in a table */
export function count(db: TestDb, table: string): number {
  const r = db.prepare(`SELECT COUNT(*) as n FROM ${table}`).get() as { n: number }
  return r.n
}

/** The explicit bottom-up delete (mirrors the fixed reset route) */
export function resetUser(db: TestDb, userId: number) {
  db.prepare(`
    DELETE FROM cardio_hr_samples WHERE cardio_id IN (
      SELECT c.id FROM cardio c
      JOIN blocks b ON c.block_id = b.id
      JOIN sessions s ON b.session_id = s.id
      WHERE s.user_id = ?
    )
  `).run(userId)

  db.prepare(`
    DELETE FROM cardio_distance_samples WHERE cardio_id IN (
      SELECT c.id FROM cardio c
      JOIN blocks b ON c.block_id = b.id
      JOIN sessions s ON b.session_id = s.id
      WHERE s.user_id = ?
    )
  `).run(userId)

  db.prepare(`
    DELETE FROM cardio WHERE block_id IN (
      SELECT b.id FROM blocks b
      JOIN sessions s ON b.session_id = s.id
      WHERE s.user_id = ?
    )
  `).run(userId)

  db.prepare(`
    DELETE FROM sets WHERE block_id IN (
      SELECT b.id FROM blocks b
      JOIN sessions s ON b.session_id = s.id
      WHERE s.user_id = ?
    )
  `).run(userId)

  db.prepare(`
    DELETE FROM blocks WHERE session_id IN (
      SELECT id FROM sessions WHERE user_id = ?
    )
  `).run(userId)

  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId)
}
