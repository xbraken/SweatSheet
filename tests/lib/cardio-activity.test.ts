import { describe, it, expect } from 'vitest'
import { baseActivity, isIntervalActivity, withInterval, cardioBlockType, cardioIcon } from '@/lib/cardio-activity'

describe('cardio activity intervals', () => {
  it('maps interval variants back to their base', () => {
    expect(baseActivity('Interval run')).toBe('Run')
    expect(baseActivity('Indoor run')).toBe('Run')
    expect(baseActivity('Interval ride')).toBe('Cycling')
    expect(baseActivity('Interval rowing')).toBe('Rowing')
    expect(baseActivity('Interval skiErg')).toBe('SkiErg')
    expect(baseActivity('Cycling')).toBe('Cycling')
  })

  it('round-trips withInterval', () => {
    for (const a of ['Run', 'Cycling', 'Walking', 'Rowing', 'SkiErg']) {
      const iv = withInterval(a, true)
      expect(isIntervalActivity(iv)).toBe(true)
      expect(baseActivity(iv)).toBe(a)
      expect(withInterval(iv, false)).toBe(a)
      expect(isIntervalActivity(a)).toBe(false)
    }
    expect(withInterval('Run', true)).toBe('Interval run')
    expect(withInterval('Cycling', true)).toBe('Interval ride')
    expect(withInterval('Indoor run', false)).toBe('Run')
  })

  it('stores interval rides as cycle blocks', () => {
    expect(cardioBlockType('Interval ride')).toBe('cycle')
    expect(cardioBlockType('Interval run')).toBe('run')
    expect(cardioIcon('Interval ride')).toBe('directions_bike')
  })
})
