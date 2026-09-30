// Client-safe power helpers for cycling (indoor bike / power meter data from Intervals.icu).

export type PowerSample = { time_offset_sec: number; watts: number }

/**
 * Per-second power stream → one averaged sample per `bucketSec` (default 10s).
 * Power is spiky second-to-second, so bucket averages keep the shape without the noise
 * (unlike HR, where point-sampling every 10s is fine).
 */
export function bucketPower(watts: number[], time: number[], bucketSec = 10): PowerSample[] {
  const out: PowerSample[] = []
  let bucketStart = -1
  let sum = 0
  let n = 0
  const flush = () => { if (n > 0) out.push({ time_offset_sec: bucketStart, watts: Math.round(sum / n) }) }
  for (let i = 0; i < watts.length && i < time.length; i++) {
    const t = time[i]
    const w = watts[i]
    if (typeof w !== 'number' || !isFinite(w) || w < 0 || w > 3000) continue
    const b = Math.floor(t / bucketSec) * bucketSec
    if (b !== bucketStart) {
      flush()
      bucketStart = b
      sum = 0
      n = 0
    }
    sum += w
    n++
  }
  flush()
  return out
}

/** Highest single reading, ignoring obvious sensor glitches */
export function maxPower(watts: number[]): number | null {
  let m = 0
  for (const w of watts) if (typeof w === 'number' && w <= 3000 && w > m) m = w
  return m > 0 ? Math.round(m) : null
}

/**
 * Best average power over any `windowSec` stretch of the ride, from bucketed samples.
 * Samples are assumed evenly spaced (bucketPower output); gaps count as zero, which is
 * what a head unit would show for a stop.
 */
export function bestAvgPower(samples: PowerSample[], windowSec: number): number | null {
  if (samples.length < 2) return null
  const step = samples[1].time_offset_sec - samples[0].time_offset_sec || 10
  const span = samples[samples.length - 1].time_offset_sec - samples[0].time_offset_sec + step
  if (span < windowSec) return null
  // Place samples on an even grid so missing buckets count as 0 W
  const start = samples[0].time_offset_sec
  const grid = new Array(Math.round(span / step)).fill(0)
  for (const s of samples) {
    const i = Math.round((s.time_offset_sec - start) / step)
    if (i >= 0 && i < grid.length) grid[i] = s.watts
  }
  const w = Math.round(windowSec / step)
  let sum = 0
  for (let i = 0; i < w; i++) sum += grid[i]
  let best = sum
  for (let i = w; i < grid.length; i++) {
    sum += grid[i] - grid[i - w]
    if (sum > best) best = sum
  }
  return Math.round(best / w)
}

/**
 * Efficiency factor: watts produced per heartbeat (normalized power ÷ avg HR, the
 * TrainingPeaks definition). Same watts at a lower HR = fitter. Only meaningful for rides
 * long enough for HR to settle.
 */
export function efficiencyFactor(watts: number | null | undefined, avgHr: number | null | undefined): number | null {
  if (!watts || !avgHr || watts <= 0 || avgHr < 60 || avgHr > 220) return null
  return Math.round((watts / avgHr) * 100) / 100
}
