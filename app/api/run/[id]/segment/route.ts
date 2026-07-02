import { NextRequest, NextResponse } from 'next/server'
import { db, initDb } from '@/lib/db'
import { getSession } from '@/lib/auth'

await initDb()

type DistSample = { time_offset_sec: number; distance_km: number }

function toSeconds(duration: string): number {
  const parts = duration.split(':').map(Number)
  if (parts.some(isNaN)) return 0
  return parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + (parts[1] ?? 0)
}

function formatPace(secPerKm: number): string {
  return `${Math.floor(secPerKm / 60)}:${String(Math.round(secPerKm % 60)).padStart(2, '0')}`
}

// Last sample at or before `sec` (falls back to the first sample if `sec` precedes all of them)
function distanceAt(samples: DistSample[], sec: number): number {
  let result = samples[0]?.distance_km ?? 0
  for (const s of samples) {
    if (s.time_offset_sec <= sec) result = s.distance_km
    else break
  }
  return result
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const cardioId = parseInt(id)
  if (isNaN(cardioId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const body = await req.json()
  const { startSec, endSec, speedKmh } = body as { startSec: number; endSec: number; speedKmh: number }
  if (typeof startSec !== 'number' || typeof endSec !== 'number' || typeof speedKmh !== 'number'
      || startSec < 0 || endSec <= startSec || speedKmh <= 0) {
    return NextResponse.json({ error: 'Invalid segment' }, { status: 400 })
  }

  // Verify ownership and fetch the cardio row + its duration for the pace recompute
  const cardioRes = await db.execute({
    sql: `SELECT c.id, c.duration FROM cardio c
          JOIN blocks b ON b.id = c.block_id
          JOIN sessions s ON s.id = b.session_id
          WHERE c.id = ? AND s.user_id = ?`,
    args: [cardioId, session.userId],
  })
  if (cardioRes.rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const duration = cardioRes.rows[0].duration as string | null

  const samplesRes = await db.execute({
    sql: `SELECT id, time_offset_sec, distance_km FROM cardio_distance_samples WHERE cardio_id = ? ORDER BY time_offset_sec`,
    args: [cardioId],
  })
  const samples = samplesRes.rows as unknown as (DistSample & { id: number })[]
  if (samples.length === 0) return NextResponse.json({ error: 'No distance data to correct' }, { status: 400 })

  const baseDistanceKm = distanceAt(samples, startSec)
  const origDistanceAtEnd = distanceAt(samples, endSec)

  const updates: { id: number; distance_km: number }[] = []
  for (const s of samples) {
    if (s.time_offset_sec >= startSec && s.time_offset_sec <= endSec) {
      const newDistanceKm = baseDistanceKm + (speedKmh / 3600) * (s.time_offset_sec - startSec)
      updates.push({ id: s.id, distance_km: newDistanceKm })
    }
  }
  const newDistanceAtEnd = distanceAt(
    updates.length > 0 ? samples.map(s => {
      const u = updates.find(u => u.id === s.id)
      return u ? { time_offset_sec: s.time_offset_sec, distance_km: u.distance_km } : s
    }) : samples,
    endSec
  )
  const delta = newDistanceAtEnd - origDistanceAtEnd

  for (const s of samples) {
    if (s.time_offset_sec > endSec) {
      updates.push({ id: s.id, distance_km: s.distance_km + delta })
    }
  }

  if (updates.length > 0) {
    await db.batch(updates.map(u => ({
      sql: 'UPDATE cardio_distance_samples SET distance_km = ? WHERE id = ?',
      args: [u.distance_km, u.id] as (string | number)[],
    })))
  }

  const finalDistanceKm = samples.length > 0
    ? (updates.find(u => u.id === samples[samples.length - 1].id)?.distance_km ?? samples[samples.length - 1].distance_km)
    : 0

  const totalSec = duration ? toSeconds(duration) : 0
  const newPace = totalSec > 0 && finalDistanceKm > 0.1 ? formatPace(totalSec / finalDistanceKm) : null
  const newDistance = finalDistanceKm > 0 ? finalDistanceKm.toFixed(2) : null

  await db.execute({
    sql: 'UPDATE cardio SET distance = ?, pace = ? WHERE id = ?',
    args: [newDistance, newPace, cardioId],
  })

  const finalSamples = samples.map(s => {
    const u = updates.find(u => u.id === s.id)
    return { time_offset_sec: s.time_offset_sec, distance_km: u ? u.distance_km : s.distance_km }
  })

  return NextResponse.json({ ok: true, distance: newDistance, pace: newPace, distanceSamples: finalSamples })
}
