import { NextRequest, NextResponse } from 'next/server'
import { db, initDb } from '@/lib/db'
import { getSession } from '@/lib/auth'
import {
  type HrSample, type DistanceSample,
  findBestSegment, zoneSeconds, longestZ2Window, weekStart, plausibleSamples, warmupHr,
} from '@/lib/run-analysis'

await initDb()

const RACE_DISTANCES: { label: '5K' | '10K' | 'Half' | 'Marathon'; km: number }[] = [
  { label: '5K', km: 5.0 },
  { label: '10K', km: 10.0 },
  { label: 'Half', km: 21.0975 },
  { label: 'Marathon', km: 42.195 },
]

function toSeconds(str: string | null): number | null {
  if (!str) return null
  const parts = str.split(':').map(Number)
  if (parts.some(isNaN)) return null
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  return null
}

export async function GET(_req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.userId

  try {
    // Fetch all run-like cardio entries + their HR + distance samples in one go.
    // Friends-only scale: a few hundred runs at most.
    const [cardioRes, hrRes, distRes, hrMaxRes] = await Promise.all([
      db.execute({
        sql: `SELECT c.id, s.date, c.distance, c.duration, c.hr_max, c.activity, c.heart_rate
              FROM cardio c
              JOIN blocks b ON c.block_id = b.id
              JOIN sessions s ON b.session_id = s.id
              WHERE s.user_id = ?
              ORDER BY s.date DESC`,
        args: [userId],
      }),
      db.execute({
        sql: `SELECT h.cardio_id, h.time_offset_sec, h.hr_bpm
              FROM cardio_hr_samples h
              JOIN cardio c ON c.id = h.cardio_id
              JOIN blocks b ON c.block_id = b.id
              JOIN sessions s ON b.session_id = s.id
              WHERE s.user_id = ?
              ORDER BY h.cardio_id, h.time_offset_sec`,
        args: [userId],
      }),
      db.execute({
        sql: `SELECT d.cardio_id, d.time_offset_sec, d.distance_km
              FROM cardio_distance_samples d
              JOIN cardio c ON c.id = d.cardio_id
              JOIN blocks b ON c.block_id = b.id
              JOIN sessions s ON b.session_id = s.id
              WHERE s.user_id = ? AND lower(c.activity) LIKE '%run%'
              ORDER BY d.cardio_id, d.time_offset_sec`,
        args: [userId],
      }),
      db.execute({
        sql: `SELECT MAX(c.hr_max) as hr_max
              FROM cardio c
              JOIN blocks b ON c.block_id = b.id
              JOIN sessions s ON b.session_id = s.id
              WHERE s.user_id = ?`,
        args: [userId],
      }),
    ])

    const userHrMax = (hrMaxRes.rows[0]?.hr_max as number | null) ?? 0

    // Group samples by cardio_id
    const hrByRun = new Map<number, HrSample[]>()
    for (const r of hrRes.rows) {
      const id = Number(r.cardio_id)
      if (!hrByRun.has(id)) hrByRun.set(id, [])
      hrByRun.get(id)!.push({ time_offset_sec: Number(r.time_offset_sec), hr_bpm: Number(r.hr_bpm) })
    }
    const distByRun = new Map<number, DistanceSample[]>()
    for (const r of distRes.rows) {
      const id = Number(r.cardio_id)
      if (!distByRun.has(id)) distByRun.set(id, [])
      distByRun.get(id)!.push({ time_offset_sec: Number(r.time_offset_sec), distance_km: Number(r.distance_km) })
    }

    // Recent bests (last ~6 months) drive race predictions — an all-time PR from years ago would mislead
    const recentCutoff = new Date(Date.now() - 183 * 86400000).toISOString().slice(0, 10)
    const recentBest: Record<'5K' | '10K', { seconds: number; cardio_id: number; date: string } | null> = { '5K': null, '10K': null }

    // Best segments across all runs
    const bestSegments: Record<string, { seconds: number; cardio_id: number; date: string } | null> =
      Object.fromEntries(RACE_DISTANCES.map(d => [d.label, null]))

    // Normalize "Interval run" / "Trail run" / etc. to "Run" so they group with the activity selector.
    function baseAct(a: string): string {
      return a.toLowerCase().includes('run') ? 'Run' : a
    }

    // Per-activity weekly aggregates — the UI filters these by the active cardio activity selector.
    // Map key = `${weekStart}|${activity}`
    const weeklyVolume = new Map<string, { weekStart: string; activity: string; km: number; sessions: number }>()
    const weeklyZones = new Map<string, { weekStart: string; activity: string; z1: number; z2: number; z3: number; z4: number; z5: number }>()

    // Warm-up HR per interval session, for the warm-up heart rate card
    const warmupSessions: { date: string; cardio_id: number; avgHr: number }[] = []
    const seenSessions = new Set<string>()

    // Z2 trend points (runs only — paceSecPerKm is meaningless for cycling)
    const z2Trend: { date: string; cardio_id: number; paceSec: number; durationSec: number }[] = []

    for (const r of cardioRes.rows) {
      const cardioId = Number(r.id)
      const date = r.date as string
      const wk = weekStart(date)
      const activity = baseAct(typeof r.activity === 'string' ? r.activity : 'Other')
      const key = `${wk}|${activity}`
      const distKm = r.distance != null ? Number(r.distance) : 0
      const durSec = toSeconds(r.duration as string | null) ?? 0
      const isRun = activity === 'Run'

      // Weekly volume per activity (use logged distance — works even when samples are missing)
      if (distKm > 0) {
        const cur = weeklyVolume.get(key) ?? { weekStart: wk, activity, km: 0, sessions: 0 }
        cur.km += distKm
        cur.sessions += 1
        weeklyVolume.set(key, cur)
      }

      const hr = hrByRun.get(cardioId) ?? []

      // Sample-based metrics (best segments, Z2 trend) — runs only.
      // Sanity-check distance samples against recorded distance: >20% disagreement = corrupt import,
      // exclude from sample-based metrics rather than report fake PRs.
      let dist: DistanceSample[] = []
      if (isRun) {
        dist = plausibleSamples(distByRun.get(cardioId) ?? [], distKm)

        // Best segments
        for (const { label, km } of RACE_DISTANCES) {
          const sec = findBestSegment(dist, km)
          if (sec == null) continue
          const cur = bestSegments[label]
          if (cur == null || sec < cur.seconds) {
            bestSegments[label] = { seconds: sec, cardio_id: cardioId, date }
          }
          if ((label === '5K' || label === '10K') && date >= recentCutoff) {
            const rc = recentBest[label]
            if (rc == null || sec < rc.seconds) recentBest[label] = { seconds: sec, cardio_id: cardioId, date }
          }
        }
      }

      // Weekly zones per activity
      if (userHrMax > 0 && hr.length > 1) {
        const z = zoneSeconds(hr, userHrMax)
        const cur = weeklyZones.get(key) ?? { weekStart: wk, activity, z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 }
        cur.z1 += z.z1; cur.z2 += z.z2; cur.z3 += z.z3; cur.z4 += z.z4; cur.z5 += z.z5
        weeklyZones.set(key, cur)
      }

      // Z2 trend — runs only
      if (isRun && userHrMax > 0 && hr.length > 1 && dist.length > 1) {
        const w = longestZ2Window(hr, dist, userHrMax)
        if (w) z2Trend.push({ date, cardio_id: cardioId, paceSec: w.paceSecPerKm, durationSec: w.durationSec })
      }

      // Warm-up heart rate: minutes 5–9 of each interval session's warm-up — a repeatable,
      // same-effort check. The same session imported twice (e.g. Strava + Intervals) counts once.
      const isInterval = typeof r.activity === 'string' && r.activity.toLowerCase().includes('interval')
      if (isRun && isInterval) {
        const w = warmupHr(hr, dist)
        const dupKey = `${date}|${w}`
        if (w != null && w >= 80 && w <= 200 && !seenSessions.has(dupKey)) {
          seenSessions.add(dupKey)
          warmupSessions.push({ date, cardio_id: cardioId, avgHr: w })
        }
      }
    }

    const weeklyVolumeArr = Array.from(weeklyVolume.values())
      .map(v => ({ ...v, km: Math.round(v.km * 10) / 10 }))
      .sort((a, b) => a.weekStart.localeCompare(b.weekStart))

    const weeklyZonesArr = Array.from(weeklyZones.values())
      .sort((a, b) => a.weekStart.localeCompare(b.weekStart))

    z2Trend.sort((a, b) => a.date.localeCompare(b.date))
    warmupSessions.sort((a, b) => a.date.localeCompare(b.date))

    return NextResponse.json({
      userHrMax,
      bestSegments,
      recentBest,
      weeklyVolume: weeklyVolumeArr,
      weeklyZones: weeklyZonesArr,
      z2Trend,
      warmupSessions,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    console.error('GET /api/progress/cardio-insights error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
