import { describe, it, expect } from 'vitest'
import { warmupSet } from '@/lib/warmup'

describe('warmupSet', () => {
  it('machine: ~60% rounded to 5 kg', () => {
    expect(warmupSet(70, false)).toEqual({ weight: 40, reps: 8 })
    expect(warmupSet(100, false)).toEqual({ weight: 60, reps: 8 })
  })

  it('light dumbbell work rounds to 2.5 kg', () => {
    expect(warmupSet(14, false)).toEqual({ weight: 7.5, reps: 8 })
  })

  it('barbell: 2.5 kg jumps and never below the bar', () => {
    expect(warmupSet(80, false, 20)).toEqual({ weight: 47.5, reps: 8 })
    expect(warmupSet(30, false, 20)).toEqual({ weight: 20, reps: 8 })
  })

  it('pounds', () => {
    expect(warmupSet(150, true)).toEqual({ weight: 90, reps: 8 })
    expect(warmupSet(225, true, 45)).toEqual({ weight: 135, reps: 8 })
  })

  it('no warm-up when there is nothing lighter to do', () => {
    expect(warmupSet(0, false)).toBeNull()
    expect(warmupSet(20, false, 20)).toBeNull() // just the bar
    expect(warmupSet(2, false)).toBeNull()      // 60% of 2 kg rounds to 0
  })
})
