import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ db: {} }))
const { monthBounds, isMonthStr } = await import('@/lib/recap')

describe('monthBounds', () => {
  it('handles 30/31-day months, February and year ends', () => {
    expect(monthBounds('2026-09')).toEqual({ start: '2026-09-01', end: '2026-09-30', prevStart: '2026-08-01', prevEnd: '2026-08-31' })
    expect(monthBounds('2028-02').end).toBe('2028-02-29')
    expect(monthBounds('2026-02').end).toBe('2026-02-28')
    expect(monthBounds('2026-01')).toMatchObject({ end: '2026-01-31', prevStart: '2025-12-01', prevEnd: '2025-12-31' })
    expect(monthBounds('2026-12').end).toBe('2026-12-31')
  })
  it('validates month strings', () => {
    expect(isMonthStr('2026-09')).toBe(true)
    expect(isMonthStr('2026-13')).toBe(false)
    expect(isMonthStr('2026-9')).toBe(false)
  })
})
