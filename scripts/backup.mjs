import { createClient } from '@libsql/client'

const url = process.env.TURSO_DATABASE_URL?.trim()
const authToken = process.env.TURSO_AUTH_TOKEN?.trim()
if (!url || !authToken) {
  console.error('Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN env vars')
  process.exit(1)
}

const client = createClient({ url, authToken })

const escape = (v) => {
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'number' || typeof v === 'bigint') return String(v)
  if (typeof v === 'boolean') return v ? '1' : '0'
  if (v instanceof Uint8Array) return `X'${Buffer.from(v).toString('hex')}'`
  return `'${String(v).replace(/'/g, "''")}'`
}

const out = []
out.push('PRAGMA foreign_keys=OFF;')
out.push('BEGIN TRANSACTION;')

const schema = await client.execute(
  `SELECT type, name, sql FROM sqlite_master
   WHERE name NOT LIKE 'sqlite_%' AND sql IS NOT NULL
   ORDER BY CASE type WHEN 'table' THEN 1 WHEN 'index' THEN 2 WHEN 'trigger' THEN 3 ELSE 4 END, name`
)
for (const row of schema.rows) out.push(`${row.sql};`)

const tables = await client.execute(
  `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
)
for (const t of tables.rows) {
  const name = t.name
  const data = await client.execute(`SELECT * FROM "${name}"`)
  if (data.rows.length === 0) continue
  const cols = data.columns.map(c => `"${c}"`).join(',')
  for (const row of data.rows) {
    const vals = data.columns.map(c => escape(row[c])).join(',')
    out.push(`INSERT INTO "${name}" (${cols}) VALUES (${vals});`)
  }
}

out.push('COMMIT;')
process.stdout.write(out.join('\n') + '\n')
