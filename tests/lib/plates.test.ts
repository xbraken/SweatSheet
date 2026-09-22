import { describe, it, expect, beforeEach } from 'vitest'
import { platesPerSide, loadBar, saveBar } from '@/lib/plates'

const KG = [25, 20, 15, 10, 5, 2.5, 1.25]
const LB = [45, 35, 25, 10, 5, 2.5]

describe('platesPerSide', () => {
  it('100 kg on a 20 kg bar', () => {
    expect(platesPerSide(100, 20, KG)).toEqual({ plates: [25, 15], remainder: 0 })
  })
  it('62.5 kg', () => {
    expect(platesPerSide(62.5, 20, KG)).toEqual({ plates: [20, 1.25], remainder: 0 })
  })
  it('225 lb', () => {
    expect(platesPerSide(225, 45, LB)).toEqual({ plates: [45, 45], remainder: 0 })
  })
  it('reports what can’t be loaded', () => {
    expect(platesPerSide(21, 20, KG)).toEqual({ plates: [], remainder: 1 })
  })
  it('bar only / under bar', () => {
    expect(platesPerSide(20, 20, KG).plates).toEqual([])
    expect(platesPerSide(10, 20, KG).plates).toEqual([])
  })
})

describe('no bar (plate-loaded machines)', () => {
  it('0 kg bar splits the whole weight across both sides', () => {
    expect(platesPerSide(40, 0, KG)).toEqual({ plates: [20], remainder: 0 })
    expect(platesPerSide(65, 0, KG)).toEqual({ plates: [25, 5, 2.5], remainder: 0 })
  })
})

describe('loadBar / saveBar', () => {
  const store = new Map<string, string>()
  beforeEach(() => {
    store.clear()
    ;(globalThis as unknown as { localStorage: Storage }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v) },
    } as Storage
  })

  it('defaults to a standard bar when nothing is saved (not 0)', () => {
    expect(loadBar(false)).toBe(20)
    expect(loadBar(true, 'Bench Press')).toBe(45)
  })

  it('remembers 0 kg for one machine without changing other exercises', () => {
    saveBar(false, 20, 'Bench Press')
    saveBar(false, 0, 'Dip')
    expect(loadBar(false, 'Dip')).toBe(0)
    expect(loadBar(false, 'Bench Press')).toBe(20)
  })

  it('new exercises fall back to the last bar picked', () => {
    saveBar(false, 15, 'Front Squat')
    expect(loadBar(false, 'Overhead Press')).toBe(15)
  })
})
