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

  const runRes = await db.execute({
    sql: `SELECT c.id as cardio_id, c.activity, c.distance, c.duration, c.pace,
                 c.calories, c.heart_rate, c.hr_min, c.hr_max, s.date
          FROM cardio c
          JOIN blocks b ON c.block_id = b.id
          JOIN sessions s ON b.session_id = s.id
          WHERE c.id = ? AND s.user_id = ?
          LIMIT 1`,
    args: [cardioId, session.userId],
  })

  if (runRes.rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const samplesRes = await db.execute({
    sql: `SELECT time_offset_sec, hr_bpm FROM cardio_hr_samples
          WHERE cardio_id = ? ORDER BY time_offset_sec`,
    args: [cardioId],
  })

  const distSamplesRes = await db.execute({
    sql: `SELECT time_offset_sec, distance_km FROM cardio_distance_samples
          WHERE cardio_id = ? ORDER BY time_offset_sec`,
    args: [cardioId],
  })

  return NextResponse.json({
    ...runRes.rows[0],
    hrSamples: samplesRes.rows,
    distanceSamples: distSamplesRes.rows,
  })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const cardioId = parseInt(id)
  if (isNaN(cardioId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const { activity } = await req.json()
  if (!['Run', 'Indoor run', 'Interval run'].includes(activity)) {
    return NextResponse.json({ error: 'Invalid activity' }, { status: 400 })
  }

  await db.execute({
    sql: `UPDATE cardio SET activity = ?
          WHERE id = ? AND block_id IN (
            SELECT b.id FROM blocks b
            JOIN sessions s ON s.id = b.session_id
            WHERE s.user_id = ?
          )`,
    args: [activity, cardioId, session.userId],
  })

  return NextResponse.json({ ok: true, activity })
}
