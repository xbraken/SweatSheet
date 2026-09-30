import { describe, it, expect } from 'vitest'
import {
  speedAt, spawnGap, collides, makeObstacle, newGame, step, score, pickKind, airborne, slipping, magnetised,
  PENGUIN_Y, PENGUIN_R, FISH_BONUS, NEAR_MISS_POINTS, type Game, type Obstacle,
} from '@/lib/penguin-game'

// Deterministic PRNG so spawns are repeatable
function seeded(seed = 1) {
  let s = seed
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646 }
}

const W = 360, H = 700, PY = H * PENGUIN_Y
/** A game with nothing spawning, and one thing placed relative to the penguin */
function withObstacle(o: Partial<Obstacle> & Pick<Obstacle, 'kind'>): Game {
  const g = newGame(W)
  g.nextSpawn = 99
  g.obstacles.push({ x: g.px, y: PY + 1, r: 15, ...o })
  return g
}
const types = (evs: { type: string }[]) => evs.map(e => e.type)

describe('difficulty', () => {
  it('gets faster over time but caps', () => {
    expect(speedAt(0)).toBe(260)
    expect(speedAt(20)).toBeGreaterThan(speedAt(10))
    expect(speedAt(1000)).toBe(900)
  })
  it('spawns rows closer together over time, with a floor', () => {
    expect(spawnGap(30)).toBeLessThan(spawnGap(0))
    expect(spawnGap(1000)).toBe(0.3)
  })
  it('unlocks new things as the run goes on', () => {
    const kindsAt = (t: number) => new Set(Array.from({ length: 1000 }, (_, i) => pickKind(t, i / 1000)))
    const early = kindsAt(0)
    for (const k of ['seal', 'ice', 'ramp', 'helmet', 'magnet'] as const) expect(early.has(k)).toBe(false)
    const late = kindsAt(60)
    for (const k of ['tree', 'rock', 'snowman', 'fish', 'seal', 'ice', 'ramp', 'helmet', 'magnet'] as const) expect(late.has(k)).toBe(true)
  })
})

describe('obstacles', () => {
  it('stay inside the slope', () => {
    const rand = seeded(7)
    for (let i = 0; i < 300; i++) {
      const o = makeObstacle(W, 0, rand, 60)
      expect(o.x).toBeGreaterThanOrEqual(o.r)
      expect(o.x).toBeLessThanOrEqual(W - o.r)
    }
  })
  it('a second obstacle in a row leaves a gap', () => {
    const rand = seeded(3)
    for (let i = 0; i < 200; i++) {
      const a = makeObstacle(W, 0, rand)
      const b = makeObstacle(W, 0, rand, 0, a.x)
      expect(Math.abs(a.x - b.x)).toBeGreaterThanOrEqual(60)
    }
  })
  it('collide on overlap only', () => {
    const o: Obstacle = { x: 100, y: 100, kind: 'rock', r: 13 }
    expect(collides(100, 110, o)).toBe(true)
    expect(collides(160, 100, o)).toBe(false)
  })
  it('seals slide sideways and bounce off the edges', () => {
    const g = withObstacle({ kind: 'seal', x: 20, y: H, vx: -100 })
    step(g, 0.3, W, H, seeded())
    expect(g.obstacles[0].vx).toBeGreaterThan(0)
  })
})

describe('step', () => {
  it('scores distance and moves obstacles up', () => {
    const g = withObstacle({ kind: 'tree', x: 20, y: 500 })
    step(g, 0.5, W, H, seeded())
    expect(g.obstacles[0].y).toBeLessThan(500)
    expect(score(g)).toBeGreaterThan(0)
  })
  it('crashes into a hazard and stops', () => {
    const g = withObstacle({ kind: 'tree' })
    expect(types(step(g, 0.016, W, H, seeded()))).toEqual(['crash'])
    expect(g.over).toBe(true)
    expect(step(g, 0.016, W, H, seeded())).toEqual([])
  })
  it('eats a fish for bonus points', () => {
    const g = withObstacle({ kind: 'fish', r: 11 })
    expect(types(step(g, 0.016, W, H, seeded()))).toEqual(['fish'])
    expect(g.bonus).toBe(FISH_BONUS)
    expect(g.obstacles).toHaveLength(0)
  })
  it('an idle penguin eventually crashes (obstacles really come)', () => {
    const g = newGame(W)
    const rand = seeded(11)
    for (let t = 0; !g.over && t < 120; t += 1 / 60) step(g, 1 / 60, W, H, rand)
    expect(g.over).toBe(true)
  })
})

describe('near misses', () => {
  // Hazard just below the penguin, offset so its hitbox edge clears the penguin's by `gap` px
  const skim = (gap: number) => withObstacle({ kind: 'rock', r: 13, x: W / 2 + PENGUIN_R + 13 * 0.8 + gap, y: PY + 2 })

  it('scores a close pass', () => {
    const g = skim(6)
    const evs = step(g, 0.05, W, H, seeded())
    expect(types(evs)).toEqual(['near'])
    expect(g.bonus).toBe(NEAR_MISS_POINTS)
  })
  it('ignores a wide pass', () => {
    const g = skim(60)
    expect(step(g, 0.05, W, H, seeded())).toEqual([])
    expect(g.bonus).toBe(0)
  })
  it('chains into a combo that multiplies points', () => {
    const g = skim(6)
    step(g, 0.05, W, H, seeded())
    g.obstacles.push({ x: g.px + PENGUIN_R + 13 * 0.8 + 6, y: PY + 2, kind: 'rock', r: 13 })
    const evs = step(g, 0.05, W, H, seeded())
    expect(evs[0]).toMatchObject({ type: 'near', combo: 2, points: NEAR_MISS_POINTS * 2 })
  })
})

describe('terrain and power-ups', () => {
  it('ramps launch you over hazards', () => {
    const g = withObstacle({ kind: 'ramp', r: 22 })
    expect(types(step(g, 0.016, W, H, seeded()))).toEqual(['jump'])
    expect(airborne(g)).toBe(true)
    g.obstacles.push({ x: g.px, y: PY + 1, kind: 'tree', r: 15 })
    step(g, 0.016, W, H, seeded())
    expect(g.over).toBe(false)
  })
  it('ice makes steering slippery', () => {
    const icy = withObstacle({ kind: 'ice', r: 30 })
    step(icy, 0.016, W, H, seeded())
    expect(slipping(icy)).toBe(true)
    const normal = newGame(W)
    normal.nextSpawn = 99
    icy.targetX = normal.targetX = 0
    step(icy, 0.1, W, H, seeded())
    step(normal, 0.1, W, H, seeded())
    expect(icy.px).toBeGreaterThan(normal.px)   // moved less toward the target
  })
  it('a helmet survives one crash', () => {
    const g = withObstacle({ kind: 'helmet', r: 12 })
    step(g, 0.016, W, H, seeded())
    expect(g.helmet).toBe(true)
    g.obstacles.push({ x: g.px, y: PY + 1, kind: 'rock', r: 13 })
    expect(types(step(g, 0.016, W, H, seeded()))).toEqual(['shield'])
    expect(g.over).toBe(false)
    expect(g.helmet).toBe(false)
  })
  it('a magnet pulls nearby fish in', () => {
    const g = withObstacle({ kind: 'magnet', r: 12 })
    step(g, 0.016, W, H, seeded())
    expect(magnetised(g)).toBe(true)
    g.obstacles.push({ x: g.px + 120, y: PY + 60, kind: 'fish', r: 11 })
    let got = false
    for (let i = 0; i < 30 && !got; i++) got = step(g, 1 / 60, W, H, seeded()).some(e => e.type === 'fish')
    expect(got).toBe(true)
  })
})
