import { describe, it, expect } from 'vitest'
import { bucketPower, maxPower, bestAvgPower, efficiencyFactor } from '@/lib/cycling-power'
import { cardioSummary } from '@/lib/cardio-trends'

const secs = (n: number) => Array.from({ length: n }, (_, i) => i)

describe('bucketPower', () => {
  it('averages each 10s bucket', () => {
    const watts = [...Array(10).fill(100), ...Array(10).fill(200), 300]
    expect(bucketPower(watts, secs(21))).toEqual([
      { time_offset_sec: 0, watts: 100 },
      { time_offset_sec: 10, watts: 200 },
      { time_offset_sec: 20, watts: 300 },
    ])
  })

  it('drops sensor glitches', () => {
    expect(bucketPower([100, 9999, 100, -5], secs(4))).toEqual([{ time_offset_sec: 0, watts: 100 }])
  })
})

describe('maxPower', () => {
  it('ignores glitches and empty streams', () => {
    expect(maxPower([120, 480, 9999])).toBe(480)
    expect(maxPower([0, 0])).toBeNull()
  })
})

describe('bestAvgPower', () => {
  // 40 min ride at 10s buckets: 150 W, with a 20 min block at 200 W in the middle
  const samples = Array.from({ length: 240 }, (_, i) => ({ time_offset_sec: i * 10, watts: i >= 60 && i < 180 ? 200 : 150 }))

  it('finds the hardest 20 minutes', () => {
    expect(bestAvgPower(samples, 1200)).toBe(200)
  })

  it('needs a ride at least as long as the window', () => {
    expect(bestAvgPower(samples.slice(0, 100), 1200)).toBeNull()
    expect(bestAvgPower([], 1200)).toBeNull()
  })

  it('counts missing buckets (stops) as zero', () => {
    const gappy = samples.filter((_, i) => i < 60 || i >= 120)   // 10 min pause in the 200 W block
    expect(bestAvgPower(gappy, 1200)).toBeLessThan(200)
  })
})

describe('efficiencyFactor', () => {
  it('is watts per heartbeat', () => {
    expect(efficiencyFactor(152, 158)).toBe(0.96)
  })
  it('rejects missing or implausible HR', () => {
    expect(efficiencyFactor(150, null)).toBeNull()
    expect(efficiencyFactor(150, 30)).toBeNull()
    expect(efficiencyFactor(0, 140)).toBeNull()
  })
})

describe('cardioSummary with power', () => {
  it('adds avg watts for rides only', () => {
    expect(cardioSummary({ activity: 'Cycling', distance: 19.5, duration: '43:11', pace: null, avg_watts: 125 })).toBe('19.5 km · 43:11 · 27.1 km/h · 125 W')
    expect(cardioSummary({ activity: 'Run', distance: 5, duration: '25:00', pace: '5:00', avg_watts: 250 })).toBe('5.0 km · 25:00 · 5:00/km')
  })
})
