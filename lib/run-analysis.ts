// Pure analysis functions for run/cardio data. Used by both the server-side
// insights endpoint and the client-side run detail sheet. No I/O, no React.

export type HrSample = { time_offset_sec: number; hr_bpm: number }
export type DistanceSample = { time_offset_sec: number; distance_km: number }

// HR zones as % of estimated HR max
export const ZONE_PCT = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0] as const
export type ZoneSeconds = { z1: number; z2: number; z3: number; z4: number; z5: number }

/** Fastest contiguous sub-segment covering targetKm (seconds). Sliding window over cumulative distance. */
export function findBestSegment(samples: DistanceSample[], targetKm: number): number | null {
  if (samples.length < 2) return null
  const maxDist = samples[samples.length - 1].distance_km
  if (maxDist < targetKm) return null
  let bestSec = Infinity
  let j = 0
  for (let i = 0; i < samples.length; i++) {
    if (j <= i) j = i + 1
    while (j < samples.length && samples[j].distance_km - samples[i].distance_km < targetKm) j++
    if (j >= samples.length) break
    const d0 = j > 0 ? samples[j - 1].distance_km - samples[i].distance_km : 0
    const d1 = samples[j].distance_km - samples[i].distance_km
    const frac = d1 > d0 ? (targetKm - d0) / (d1 - d0) : 0
    const endTime = samples[j - 1].time_offset_sec + frac * (samples[j].time_offset_sec - samples[j - 1].time_offset_sec)
    const segTime = endTime - samples[i].time_offset_sec
    if (segTime < bestSec) bestSec = segTime
  }
  return isFinite(bestSec) ? Math.round(bestSec) : null
}

/** Return seconds spent in each zone (based on HR samples). Assumes samples are ordered. */
export function zoneSeconds(samples: HrSample[], hrMax: number): ZoneSeconds {
  const out = { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 }
  if (samples.length < 2 || !hrMax) return out
  for (let i = 0; i < samples.length - 1; i++) {
    const raw = samples[i + 1].time_offset_sec - samples[i].time_offset_sec
    if (raw <= 0) continue
    // Cap the per-sample contribution at 10s so sparse imports don't over- or under-count.
    const dt = Math.min(raw, 10)
    const pct = samples[i].hr_bpm / hrMax
    if (pct < ZONE_PCT[1]) out.z1 += dt
    else if (pct < ZONE_PCT[2]) out.z2 += dt
    else if (pct < ZONE_PCT[3]) out.z3 += dt
    else if (pct < ZONE_PCT[4]) out.z4 += dt
    else out.z5 += dt
  }
  return out
}

/** Interpolate cumulative distance at a given time offset. */
function distAt(samples: DistanceSample[], t: number): number {
  if (samples.length === 0) return 0
  if (t <= samples[0].time_offset_sec) return samples[0].distance_km
  if (t >= samples[samples.length - 1].time_offset_sec) return samples[samples.length - 1].distance_km
  let j = samples.findIndex(s => s.time_offset_sec >= t)
  if (j <= 0) return samples[0].distance_km
  const a = samples[j - 1], b = samples[j]
  const span = b.time_offset_sec - a.time_offset_sec
  const frac = span > 0 ? (t - a.time_offset_sec) / span : 0
  return a.distance_km + frac * (b.distance_km - a.distance_km)
}

/** Aerobic decoupling % over the run: (EF1 - EF2) / EF1 * 100, where EF = speed/HR.
 *  Positive = pace drifted slower for same HR (or HR drifted up for same pace) — durability cost.
 *  Returns null unless duration ≥ minDurSec and both HR + distance samples exist. */
export function decouplingPct(
  hrSamples: HrSample[],
  distSamples: DistanceSample[],
  durationSec: number,
  minDurSec = 3600,
): number | null {
  if (durationSec < minDurSec) return null
  if (hrSamples.length < 10 || distSamples.length < 10) return null
  const half = durationSec / 2

  function avgHr(from: number, to: number): number | null {
    const slice = hrSamples.filter(s => s.time_offset_sec >= from && s.time_offset_sec < to)
    if (slice.length === 0) return null
    return slice.reduce((a, b) => a + b.hr_bpm, 0) / slice.length
  }

  const hr1 = avgHr(0, half)
  const hr2 = avgHr(half, durationSec)
  if (!hr1 || !hr2) return null
  const d0 = distAt(distSamples, 0)
  const dMid = distAt(distSamples, half)
  const dEnd = distAt(distSamples, durationSec)
  const dist1 = dMid - d0
  const dist2 = dEnd - dMid
  if (dist1 <= 0 || dist2 <= 0) return null
  const speed1 = dist1 / half
  const speed2 = dist2 / half
  const ef1 = speed1 / hr1
  const ef2 = speed2 / hr2
  if (ef1 === 0) return null
  return ((ef1 - ef2) / ef1) * 100
}

/** Negative split: time for second half of distance vs first half. */
export function negativeSplit(samples: DistanceSample[]): { firstHalfSec: number; secondHalfSec: number; delta: number } | null {
  if (samples.length < 4) return null
  const totalKm = samples[samples.length - 1].distance_km
  if (totalKm < 2) return null
  const halfKm = totalKm / 2
  function timeAtKm(km: number): number {
    if (km <= samples[0].distance_km) return samples[0].time_offset_sec
    const j = samples.findIndex(s => s.distance_km >= km)
    if (j <= 0) return samples[samples.length - 1].time_offset_sec
    const a = samples[j - 1], b = samples[j]
    const span = b.distance_km - a.distance_km
    const frac = span > 0 ? (km - a.distance_km) / span : 0
    return a.time_offset_sec + frac * (b.time_offset_sec - a.time_offset_sec)
  }
  const tMid = timeAtKm(halfKm)
  const tEnd = samples[samples.length - 1].time_offset_sec
  const tStart = samples[0].time_offset_sec
  const firstHalfSec = Math.round(tMid - tStart)
  const secondHalfSec = Math.round(tEnd - tMid)
  if (firstHalfSec <= 0 || secondHalfSec <= 0) return null
  return { firstHalfSec, secondHalfSec, delta: secondHalfSec - firstHalfSec }
}

/** Longest contiguous window where HR is in Z2 (60-70% hr_max). Returns pace within that window. */
export function longestZ2Window(
  hrSamples: HrSample[],
  distSamples: DistanceSample[],
  hrMax: number,
  minWindowSec = 600,
): { startSec: number; endSec: number; durationSec: number; paceSecPerKm: number } | null {
  if (hrSamples.length < 4 || distSamples.length < 4 || !hrMax) return null
  const lo = hrMax * ZONE_PCT[1]
  const hi = hrMax * ZONE_PCT[2]

  let bestStart = -1, bestEnd = -1, bestDur = 0
  let curStart = -1
  for (let i = 0; i < hrSamples.length; i++) {
    const inZone = hrSamples[i].hr_bpm >= lo && hrSamples[i].hr_bpm < hi
    if (inZone && curStart < 0) curStart = hrSamples[i].time_offset_sec
    if ((!inZone || i === hrSamples.length - 1) && curStart >= 0) {
      const end = inZone ? hrSamples[i].time_offset_sec : hrSamples[i - 1]?.time_offset_sec ?? curStart
      const dur = end - curStart
      if (dur > bestDur) { bestDur = dur; bestStart = curStart; bestEnd = end }
      curStart = -1
    }
  }
  if (bestDur < minWindowSec) return null
  const distStart = distAt(distSamples, bestStart)
  const distEnd = distAt(distSamples, bestEnd)
  const km = distEnd - distStart
  if (km <= 0) return null
  return {
    startSec: bestStart,
    endSec: bestEnd,
    durationSec: bestDur,
    paceSecPerKm: Math.round(bestDur / km),
  }
}

/** ISO week-start (Monday) date string YYYY-MM-DD for a given date string. */
export function weekStart(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  const dow = (d.getUTCDay() + 6) % 7 // Mon = 0
  d.setUTCDate(d.getUTCDate() - dow)
  return d.toISOString().slice(0, 10)
}
