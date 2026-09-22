import { describe, it, expect } from 'vitest'
import { suggestNext, KG_INCREMENT, LB_INCREMENT_KG } from '@/lib/progression'

const set = (weight: number, reps: number, extra: Partial<{ is_warmup: boolean; rpe: number; duration_secs: number }> = {}) =>
  ({ weight, reps, duration_secs: extra.duration_secs ?? null, is_warmup: extra.is_warmup, rpe: extra.rpe ?? null })

describe('suggestNext — weights', () => {
  it('adds an increment when every top set hit the target reps', () => {
    const s = suggestNext([set(60, 8), set(60, 8), set(60, 8)], 'weights')
    expect(s?.kind).toBe('increase')
    expect(s?.weight).toBe(60 + KG_INCREMENT)
    expect(s?.reps).toBe(8)
  })

  it('uses a 5 lb increment for imperial users', () => {
    const s = suggestNext([set(60, 8), set(60, 8)], 'weights', true)
    expect(s?.weight).toBeCloseTo(60 + LB_INCREMENT_KG, 1)
  })

  it('holds the weight when reps dropped off', () => {
    const s = suggestNext([set(60, 8), set(60, 8), set(60, 6)], 'weights')
    expect(s?.kind).toBe('repeat')
    expect(s?.weight).toBe(60)
    expect(s?.reps).toBe(8)
  })

  it('ignores warm-up sets', () => {
    const s = suggestNext([set(20, 10, { is_warmup: true }), set(40, 5, { is_warmup: true }), set(60, 8), set(60, 8)], 'weights')
    expect(s?.kind).toBe('increase')
    expect(s?.weight).toBe(62.5)
  })

  it('only looks at sets at the top weight (back-off sets don’t block progress)', () => {
    const s = suggestNext([set(80, 5), set(80, 5), set(70, 6)], 'weights')
    expect(s?.kind).toBe('increase')
    expect(s?.weight).toBe(82.5)
    expect(s?.reps).toBe(5)
  })

  it('holds after a grinder even if reps were hit', () => {
    const s = suggestNext([set(100, 3), set(100, 3, { rpe: 10 })], 'weights')
    expect(s?.kind).toBe('repeat')
    expect(s?.weight).toBe(100)
  })

  it('a single easy top set (RPE ≤ 8) is enough to go up', () => {
    const s = suggestNext([set(100, 5, { rpe: 7 })], 'weights')
    expect(s?.kind).toBe('increase')
  })

  it('a single top set with no RPE asks for another rep', () => {
    const s = suggestNext([set(100, 5)], 'weights')
    expect(s?.kind).toBe('more-reps')
    expect(s?.reps).toBe(6)
    expect(s?.weight).toBe(100)
  })

  it('returns null with no working sets', () => {
    expect(suggestNext([set(20, 10, { is_warmup: true })], 'weights')).toBeNull()
    expect(suggestNext([], 'weights')).toBeNull()
  })
})

describe('suggestNext — bodyweight & timed', () => {
  it('bodyweight: +1 rep on best set', () => {
    const s = suggestNext([set(0, 10), set(0, 12), set(0, 9)], 'bodyweight')
    expect(s?.reps).toBe(13)
  })

  it('timed: +5s on best hold', () => {
    const s = suggestNext([set(0, 0, { duration_secs: 45 }), set(0, 0, { duration_secs: 60 })], 'timed')
    expect(s?.duration_secs).toBe(65)
  })
})
