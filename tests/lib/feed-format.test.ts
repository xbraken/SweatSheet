import { describe, it, expect } from 'vitest'
import { exerciseSummary, setsDetail, topSet } from '@/lib/feed-format'

const kg = { num: (x: number) => x, unit: 'kg' }
const lbs = { num: (x: number) => Math.round(x * 2.20462), unit: 'lbs' }
const set = (w: number, r: number, s = 0) => ({ w, r, s })

describe('topSet', () => {
  it('picks the heaviest set, ties go to more reps', () => {
    expect(topSet([set(80, 8), set(80, 10), set(75, 12)])).toEqual(set(80, 10))
    expect(topSet([])).toBeNull()
  })
})

describe('exerciseSummary', () => {
  it('weighted → top set', () => {
    expect(exerciseSummary([set(80, 10), set(80, 10), set(75, 8)], kg)).toBe('80 kg × 10')
    expect(exerciseSummary([set(100, 5)], lbs)).toBe('220 lbs × 5')
  })
  it('bodyweight → sets × reps when uniform, else total', () => {
    expect(exerciseSummary([set(0, 25), set(0, 25), set(0, 25)], kg)).toBe('3 × 25 reps')
    expect(exerciseSummary([set(0, 23), set(0, 22), set(0, 21)], kg)).toBe('66 reps')
  })
  it('timed → longest hold', () => {
    expect(exerciseSummary([set(0, 1, 60), set(0, 1, 90)], kg)).toBe('1:30 best')
    expect(exerciseSummary([set(0, 1, 45)], kg)).toBe('45s best')
  })
})

describe('setsDetail', () => {
  it('lists every set in order', () => {
    expect(setsDetail([set(80, 10), set(80, 10), set(75, 8)], kg)).toBe('80 × 10 · 80 × 10 · 75 × 8')
    expect(setsDetail([set(0, 10), set(10, 8)], kg)).toBe('BW × 10 · 10 × 8')
    expect(setsDetail([set(0, 23), set(0, 22)], kg)).toBe('23 · 22 reps')
    expect(setsDetail([set(0, 1, 60), set(0, 1, 75)], kg)).toBe('1:00 · 1:15')
  })
})
