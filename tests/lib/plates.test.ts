import { describe, it, expect } from 'vitest'
import { platesPerSide } from '@/lib/plates'

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
