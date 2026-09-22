import { db } from '@/lib/db'
import { findBestSegment, plausibleSamples, type DistanceSample } from '@/lib/run-analysis'

// Cardio PRs recorded into the shared `prs` table so they show in the feed and recap.
//   kind 'distance' — longest run / ride (value = km)
//   kind 'segment'  — fastest 5K / 10K within any run (value = seconds), from distance samples
// A new entry is compared against ALL the user's other entries (not just earlier ones), so a
// backfilled old activity only counts if it genuinely beats everything.

export type CardioPr = { exercise: string; kind: 'distance' | 'segment'; value: number }

// Anything beyond these is a typo/troll, not a real activity — ignore it on both sides of the comparison
const MAX_KM = { Run: 300, Cycling: 1000 } as const
const RECENT_DAYS = 14
const SEGMENTS = [{ label: 'Fastest 5K', km: 5 }, { label: 'Fastest 10K', km: 10 }]

export function cardioBase(activity: string): 'Run' | 'Cycling' | null {
  if (activity.toLowerCase().includes('run')) return 'Run'
  if (activity === 'Cycling') return 'Cycling'
  return null
}

const sameBaseSql = (base: 'Run' | 'Cycling') =>
  base === 'Run' ? `lower(c.activity) LIKE '%run%'` : `c.activity = 'Cycling'`

/** Check one saved cardio entry for PRs and record them. Never throws — PRs are a bonus, not critical. */
export async function recordCardioPrs(cardioId: number): Promise<CardioPr[]> {
  try {
    const rowRes = await db.execute({
      sql: `SELECT c.id, c.activity, c.distance, b.id as block_id, s.id as session_id, s.user_id, s.date
            FROM cardio c JOIN blocks b ON c.block_id = b.id JOIN sessions s ON b.session_id = s.id
            WHERE c.id = ?`,
      args: [cardioId],
    })
    const row = rowRes.rows[0]
    if (!row || row.user_id == null) return []
    // Only recent activities — bulk imports of old history aren't news, and each check scans all runs
    const ageDays = (Date.now() - new Date(String(row.date) + 'T12:00:00Z').getTime()) / 86400000
    if (ageDays > RECENT_DAYS) return []
    const base = cardioBase(String(row.activity))
    if (!base) return []
    const userId = Number(row.user_id)
    const distKm = Number(row.distance ?? 0)
    const found: CardioPr[] = []

    // Longest distance
    if (distKm > 0 && distKm <= MAX_KM[base]) {
      const prev = await db.execute({
        sql: `SELECT MAX(c.distance) as max_km FROM cardio c
              JOIN blocks b ON c.block_id = b.id JOIN sessions s ON b.session_id = s.id
              WHERE s.user_id = ? AND c.id != ? AND ${sameBaseSql(base)} AND c.distance > 0 AND c.distance <= ?`,
        args: [userId, cardioId, MAX_KM[base]],
      })
      const prevMax = prev.rows[0]?.max_km != null ? Number(prev.rows[0].max_km) : null
      // First ever entry isn't a PR worth announcing
      if (prevMax != null && distKm > prevMax + 0.05) {
        found.push({ exercise: base === 'Run' ? 'Longest run' : 'Longest ride', kind: 'distance', value: Math.round(distKm * 100) / 100 })
      }
    }

    // Fastest 5K / 10K — runs with trustworthy distance samples only
    if (base === 'Run' && distKm >= 5) {
      const samplesRes = await db.execute({
        sql: `SELECT d.cardio_id, d.time_offset_sec, d.distance_km, c.distance
              FROM cardio_distance_samples d
              JOIN cardio c ON c.id = d.cardio_id
              JOIN blocks b ON c.block_id = b.id JOIN sessions s ON b.session_id = s.id
              WHERE s.user_id = ? AND ${sameBaseSql('Run')} AND c.distance >= 5 AND c.distance <= ?
              ORDER BY d.cardio_id, d.time_offset_sec`,
        args: [userId, MAX_KM.Run],
      })
      const byRun = new Map<number, { km: number; samples: DistanceSample[] }>()
      for (const r of samplesRes.rows) {
        const id = Number(r.cardio_id)
        if (!byRun.has(id)) byRun.set(id, { km: Number(r.distance ?? 0), samples: [] })
        byRun.get(id)!.samples.push({ time_offset_sec: Number(r.time_offset_sec), distance_km: Number(r.distance_km) })
      }
      const mine = byRun.get(cardioId)
      if (mine) {
        const mineSamples = plausibleSamples(mine.samples, mine.km)
        for (const seg of SEGMENTS) {
          const t = findBestSegment(mineSamples, seg.km)
          if (t == null) continue
          let prevBest: number | null = null
          for (const [id, r] of byRun) {
            if (id === cardioId) continue
            const other = findBestSegment(plausibleSamples(r.samples, r.km), seg.km)
            if (other != null && (prevBest == null || other < prevBest)) prevBest = other
          }
          if (prevBest != null && t < prevBest) found.push({ exercise: seg.label, kind: 'segment', value: t })
        }
      }
    }

    for (const pr of found) {
      // Re-imports of the same activity shouldn't double up
      await db.execute({
        sql: `INSERT INTO prs (user_id, session_id, block_id, exercise, kind, value)
              SELECT ?, ?, ?, ?, ?, ?
              WHERE NOT EXISTS (SELECT 1 FROM prs WHERE block_id = ? AND exercise = ?)`,
        args: [userId, Number(row.session_id), Number(row.block_id), pr.exercise, pr.kind, pr.value, Number(row.block_id), pr.exercise],
      })
    }
    return found
  } catch (e) {
    console.error('recordCardioPrs failed:', e instanceof Error ? e.message : e)
    return []
  }
}
