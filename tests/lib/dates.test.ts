import { describe, it, expect } from 'vitest'
import { addDays, hourIn, todayIn, weekStartMon, weekdayMon0 } from '@/lib/dates'

describe('dates', () => {
  // 23:30 UTC on 21 Sep 2026
  const lateUtc = new Date('2026-09-21T23:30:00Z')

  it('todayIn uses the user’s timezone, not UTC', () => {
    expect(todayIn('UTC', lateUtc)).toBe('2026-09-21')
    expect(todayIn('Europe/London', lateUtc)).toBe('2026-09-22') // BST, 00:30
    expect(todayIn('Australia/Sydney', lateUtc)).toBe('2026-09-22')
    expect(todayIn('America/Los_Angeles', lateUtc)).toBe('2026-09-21')
  })

  it('hourIn', () => {
    expect(hourIn('Europe/London', lateUtc)).toBe(0)
    expect(hourIn('America/New_York', lateUtc)).toBe(19)
  })

  it('addDays crosses month and year boundaries', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30') // DST change day in the UK
  })

  it('weekdayMon0 / weekStartMon', () => {
    expect(weekdayMon0('2026-09-21')).toBe(0) // Monday
    expect(weekdayMon0('2026-09-27')).toBe(6) // Sunday
    expect(weekStartMon('2026-09-27')).toBe('2026-09-21')
    expect(weekStartMon('2026-09-21')).toBe('2026-09-21')
  })
})
