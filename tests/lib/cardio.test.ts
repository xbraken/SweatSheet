import { describe, it, expect } from 'vitest'
import { smoothedTrend, paceToKmh, fmtPace } from '@/lib/cardio-trends'
import { riegelPredict, warmupHr } from '@/lib/run-analysis'
import { fmtPrValue } from '@/lib/pr-format'
import { addDays } from '@/lib/dates'

describe('smoothedTrend', () => {
  it('reports improvement vs 3 months ago', () => {
    // 20 runs over ~5 months, value falling 176 → 138
    const pts = Array.from({ length: 20 }, (_, i) => ({ date: addDays('2026-04-01', i * 8), value: 176 - i * 2 }))
    const t = smoothedTrend(pts)!
    expect(t.delta).toBeLessThan(0)
    expect(t.baselineLabel).toBe('3 months ago')
    expect(t.smoothed).toHaveLength(20)
  })

  it('smooths out a single bad run', () => {
    const pts = [160, 161, 159, 190, 160, 162].map((v, i) => ({ date: addDays('2026-09-01', i), value: v }))
    expect(Math.max(...smoothedTrend(pts)!.smoothed.map(s => s.value))).toBeLessThan(165)
  })

  it('needs at least 3 runs in the last year', () => {
    expect(smoothedTrend([])).toBeNull()
    expect(smoothedTrend([{ date: '2026-09-01', value: 150 }, { date: '2026-09-05', value: 150 }])).toBeNull()
    const old = [{ date: '2024-01-01', value: 170 }, { date: '2024-01-05', value: 170 }]
    expect(smoothedTrend([...old, { date: '2026-09-01', value: 150 }])).toBeNull()
  })

  it('falls back to earliest runs when there is no 3-month-old data', () => {
    const pts = [170, 168, 166, 164].map((v, i) => ({ date: addDays('2026-09-01', i * 3), value: v }))
    expect(smoothedTrend(pts)!.baselineLabel).toBe('your earliest runs')
  })
})

describe('riegelPredict', () => {
  it('matches the standard formula', () => {
    // 25:00 5K → ~52:07 10K
    expect(riegelPredict(1500, 5, 10)).toBe(Math.round(1500 * Math.pow(2, 1.06)))
    expect(riegelPredict(1500, 5, 10)).toBeGreaterThan(3000)
  })
  it('longer distances are slower per km', () => {
    const tenK = riegelPredict(3000, 10, 10)
    const half = riegelPredict(3000, 10, 21.0975)
    expect(half / 21.0975).toBeGreaterThan(tenK / 10)
  })
})

describe('formatting', () => {
  it('pace ↔ speed', () => {
    expect(paceToKmh(120)).toBe(30)   // 2:00/km = 30 km/h
    expect(paceToKmh(0)).toBe(0)
    expect(fmtPace(305)).toBe('5:05')
  })
  it('cardio PR values', () => {
    expect(fmtPrValue({ kind: 'distance', value: 21.1, reps: null }, false)).toBe('21.1 km')
    expect(fmtPrValue({ kind: 'segment', value: 1385, reps: null }, false)).toBe('23:05')
    expect(fmtPrValue({ kind: 'segment', value: 3725, reps: null }, false)).toBe('1:02:05')
    expect(fmtPrValue({ kind: 'weight', value: 100, reps: 5 }, false)).toBe('100 kg × 5')
  })
})

describe('warmupHr (minutes 5–9 of interval sessions)', () => {
  // 10-min warm-up at 8 km/h, then 12 km/h intervals. HR 130 early, 140 in minutes 5–9, 175 in intervals.
  const speedAt = (t: number) => (t < 600 ? 8 : 12)
  const dist: { time_offset_sec: number; distance_km: number }[] = []
  let km = 0
  for (let t = 0; t <= 1500; t += 10) { dist.push({ time_offset_sec: t, distance_km: km }); km += (speedAt(t) / 3600) * 10 }
  const hr = Array.from({ length: 301 }, (_, i) => ({ time_offset_sec: i * 5, hr_bpm: i * 5 < 300 ? 130 : i * 5 < 600 ? 140 : 175 }))

  it('averages HR over minutes 5–9 of the warm-up', () => {
    expect(warmupHr(hr, dist)).toBe(140)
  })

  it('rejects sessions where the intervals start early', () => {
    const early: typeof dist = []
    let k = 0
    for (let t = 0; t <= 1500; t += 10) { early.push({ time_offset_sec: t, distance_km: k }); k += ((t < 180 ? 8 : 12) / 3600) * 10 }
    expect(warmupHr(hr, early)).toBeNull()
  })

  it('works with sparse HR (one reading every ~40s)', () => {
    const sparse = hr.filter((_, i) => i % 8 === 0)
    expect(warmupHr(sparse, dist)).toBe(140)
  })

  it('null without data', () => {
    expect(warmupHr([], dist)).toBeNull()
  })
})
