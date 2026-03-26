import { NextRequest, NextResponse } from 'next/server'
import { db, initDb } from '@/lib/db'
import { getSession } from '@/lib/auth'

await initDb()

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const cardioId = parseInt(id)
  if (isNaN(cardioId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const [runRes, samplesRes, distSamplesRes] = await Promise.all([
    db.execute({
      sql: `SELECT c.id as cardio_id, c.activity, c.distance, c.duration, c.pace,
                   c.calories, c.heart_rate, c.hr_min, c.hr_max, s.date,
                   COALESCE(c.started_at, s.created_at) as started_at
            FROM cardio c
            JOIN blocks b ON c.block_id = b.id
            JOIN sessions s ON b.session_id = s.id
            WHERE c.id = ? AND s.user_id = ?
            LIMIT 1`,
      args: [cardioId, session.userId],
    }),
    db.execute({
      sql: `SELECT time_offset_sec, hr_bpm FROM cardio_hr_samples
            WHERE cardio_id = ? ORDER BY time_offset_sec`,
      args: [cardioId],
    }),
    db.execute({
      sql: `SELECT time_offset_sec, distance_km FROM cardio_distance_samples
            WHERE cardio_id = ? ORDER BY time_offset_sec`,
      args: [cardioId],
    }),
  ])

  if (runRes.rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({
    ...runRes.rows[0],
    hrSamples: samplesRes.rows,
    distanceSamples: distSamplesRes.rows,
  })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const cardioId = parseInt(id)
  if (isNaN(cardioId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  // Get block + session IDs, verify ownership
  const res = await db.execute({
    sql: `SELECT b.id as block_id, s.id as session_id FROM cardio c
          JOIN blocks b ON b.id = c.block_id
          JOIN sessions s ON s.id = b.session_id
          WHERE c.id = ? AND s.user_id = ?`,
    args: [cardioId, session.userId],
  })
  if (res.rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const row = res.rows[0] as unknown as { block_id: number; session_id: number }

  await db.execute({ sql: `DELETE FROM cardio WHERE id = ?`, args: [cardioId] })

  // Clean up empty block and session
  const blockEmpty = await db.execute({ sql: `SELECT COUNT(*) as n FROM cardio WHERE block_id = ?`, args: [row.block_id] })
  if ((blockEmpty.rows[0].n as number) === 0) {
    await db.execute({ sql: `DELETE FROM blocks WHERE id = ?`, args: [row.block_id] })
    const sessionEmpty = await db.execute({ sql: `SELECT COUNT(*) as n FROM blocks WHERE session_id = ?`, args: [row.session_id] })
    if ((sessionEmpty.rows[0].n as number) === 0) {
      await db.execute({ sql: `DELETE FROM sessions WHERE id = ?`, args: [row.session_id] })
    }
  }

  return NextResponse.json({ ok: true })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const cardioId = parseInt(id)
  if (isNaN(cardioId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const body = await req.json()
  const { activity, distance, duration, pace } = body

  if (activity !== undefined) {
    if (!['Run', 'Indoor run', 'Interval run'].includes(activity)) {
      return NextResponse.json({ error: 'Invalid activity' }, { status: 400 })
    }
    await db.execute({
      sql: `UPDATE cardio SET activity = ? WHERE id = ? AND block_id IN (
              SELECT b.id FROM blocks b JOIN sessions s ON s.id = b.session_id WHERE s.user_id = ?
            )`,
      args: [activity, cardioId, session.userId],
    })
    return NextResponse.json({ ok: true, activity })
  }

  if (distance !== undefined || duration !== undefined || pace !== undefined) {
    await db.execute({
      sql: `UPDATE cardio SET distance = ?, duration = ?, pace = ? WHERE id = ? AND block_id IN (
              SELECT b.id FROM blocks b JOIN sessions s ON s.id = b.session_id WHERE s.user_id = ?
            )`,
      args: [distance || null, duration || null, pace || null, cardioId, session.userId],
    })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
}
