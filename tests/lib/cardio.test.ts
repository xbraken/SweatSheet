import { describe, it, expect } from 'vitest'
import { aerobicTrend, paceToKmh, fmtPace, paceAtTypicalHr } from '@/lib/cardio-trends'
import { riegelPredict } from '@/lib/run-analysis'
import { fmtPrValue } from '@/lib/pr-format'
import { addDays } from '@/lib/dates'

describe('aerobicTrend', () => {
  it('reports getting faster at easy heart rate', () => {
    // 20 runs over ~5 months, pace improving 360 → 322 s/km
    const pts = Array.from({ length: 20 }, (_, i) => ({ date: addDays('2026-04-01', i * 8), paceSec: 360 - i * 2 }))
    const t = aerobicTrend(pts)!
    expect(t.deltaSec).toBeLessThan(0)
    expect(t.baselineLabel).toBe('3 months ago')
    expect(t.smoothed).toHaveLength(20)
  })

  it('smooths out a single bad run', () => {
    const pts = [330, 331, 329, 420, 330, 332].map((p, i) => ({ date: addDays('2026-09-01', i), paceSec: p }))
    const t = aerobicTrend(pts)!
    expect(Math.max(...t.smoothed.map(s => s.paceSec))).toBeLessThan(340)
  })

  it('needs at least 3 runs in the last year', () => {
    expect(aerobicTrend([])).toBeNull()
    expect(aerobicTrend([{ date: '2026-09-01', paceSec: 330 }, { date: '2026-09-05', paceSec: 330 }])).toBeNull()
    const old = [{ date: '2024-01-01', paceSec: 400 }, { date: '2024-01-05', paceSec: 400 }]
    expect(aerobicTrend([...old, { date: '2026-09-01', paceSec: 330 }])).toBeNull()
  })

  it('falls back to earliest runs when there is no 3-month-old data', () => {
    const pts = [340, 335, 330, 325].map((p, i) => ({ date: addDays('2026-09-01', i * 3), paceSec: p }))
    expect(aerobicTrend(pts)!.baselineLabel).toBe('your earliest runs')
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

describe('paceAtTypicalHr', () => {
  it('a run at the typical HR keeps its own pace', () => {
    // 5:00/km (3.333 m/s) at 150 bpm
    const ef = (1000 / 300) / 150
    const r = paceAtTypicalHr([
      { date: '2026-09-01', ef, avgHr: 150 },
      { date: '2026-09-03', ef, avgHr: 150 },
    ])!
    expect(r.refHr).toBe(150)
    expect(Math.round(r.points[0].paceSec)).toBe(300)
  })

  it('same pace at a lower heart rate reads as faster at the typical HR', () => {
    const r = paceAtTypicalHr([
      { date: '2026-09-01', ef: (1000 / 300) / 160, avgHr: 160 },
      { date: '2026-09-02', ef: (1000 / 300) / 150, avgHr: 150 },
      { date: '2026-09-03', ef: (1000 / 300) / 140, avgHr: 140 },
    ])!
    expect(r.refHr).toBe(150)
    expect(r.points[2].paceSec).toBeLessThan(r.points[0].paceSec)
  })
})
