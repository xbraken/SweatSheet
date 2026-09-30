// Penguin slide — the Friends page easter egg. Pure game logic (no DOM) so it can be unit tested;
// components/social/PenguinGame.tsx owns the canvas, input, effects and render loop.
//
// The penguin sits near the top of the screen and the slope scrolls up past it, so everything
// spawns below the bottom edge and moves upward at the current speed.

export type Kind =
  | 'tree' | 'rock' | 'snowman' | 'seal'   // hazards
  | 'fish' | 'helmet' | 'magnet'           // pickups
  | 'ice' | 'ramp'                         // terrain

export type Obstacle = {
  x: number
  y: number
  kind: Kind
  r: number
  vx?: number       // seals slide sideways
  passed?: boolean  // already scored (or skipped) for a near miss
  used?: boolean    // terrain already triggered
}

export const EMOJI: Record<Kind, string> = {
  tree: '🌲', rock: '🪨', snowman: '⛄', seal: '🦭',
  fish: '🐟', helmet: '⛑️', magnet: '🧲',
  ice: '🧊', ramp: '⛰️',
}

const HAZARDS = new Set<Kind>(['tree', 'rock', 'snowman', 'seal'])
export const isHazard = (k: Kind) => HAZARDS.has(k)

export const PENGUIN_R = 12
/** Penguin's vertical position as a fraction of the play area height */
export const PENGUIN_Y = 0.28
export const FISH_BONUS = 25
export const NEAR_MISS_POINTS = 5
/** How close (px between hitbox edges) counts as a near miss */
export const NEAR_MISS_GAP = 16
const COMBO_WINDOW = 2.5
const AIR_TIME = 0.9
const SLIP_TIME = 1.2
const MAGNET_TIME = 6
const INVULN_TIME = 1

/** Slope speed in px/s: starts gentle, speeds up steadily, capped so it stays playable */
export function speedAt(t: number): number {
  return Math.min(260 + 16 * t, 900)
}

/** Average seconds between rows — rows come closer together over time */
export function spawnGap(t: number): number {
  return Math.max(0.3, 0.85 - 0.01 * t)
}

/**
 * What spawns next. New things unlock as the run goes on so the first seconds stay simple:
 * ramps from 8s, ice from 12s, seals from 15s, power-ups from 10s (rare).
 */
export function pickKind(t: number, roll: number): Kind {
  const table: [Kind, number][] = [
    ['tree', 30], ['rock', 24], ['snowman', 18], ['fish', 12],
    ['ramp', t >= 8 ? 5 : 0],
    ['ice', t >= 12 ? 7 : 0],
    ['seal', t >= 15 ? 9 : 0],
    ['helmet', t >= 10 ? 2 : 0],
    ['magnet', t >= 10 ? 2 : 0],
  ]
  const total = table.reduce((a, [, w]) => a + w, 0)
  let x = roll * total
  for (const [k, w] of table) {
    if (x < w) return k
    x -= w
  }
  return 'tree'
}

const RADIUS: Record<Kind, number> = {
  tree: 15, rock: 13, snowman: 15, seal: 15,
  fish: 11, helmet: 12, magnet: 12,
  ice: 30, ramp: 22,
}

export function makeObstacle(width: number, y: number, rand: () => number, t = 0, avoidX?: number): Obstacle {
  const kind = pickKind(t, rand())
  const r = RADIUS[kind]
  let x = r + rand() * (width - 2 * r)
  // Second obstacle in a row: keep it well clear of the first so there's always a way through
  if (avoidX != null && Math.abs(x - avoidX) < 110) x = avoidX + (avoidX < width / 2 ? 130 : -130)
  const o: Obstacle = { x: Math.max(r, Math.min(width - r, x)), y, kind, r }
  if (kind === 'seal') o.vx = (rand() < 0.5 ? -1 : 1) * (60 + rand() * 60)
  return o
}

/** Hitboxes are a bit forgiving (80% of the obstacle) so near misses feel fair */
export function collides(px: number, py: number, o: Obstacle): boolean {
  const dx = px - o.x
  const dy = py - o.y
  const rr = PENGUIN_R + o.r * 0.8
  return dx * dx + dy * dy < rr * rr
}

export type Game = {
  t: number
  dist: number
  bonus: number
  px: number
  targetX: number
  obstacles: Obstacle[]
  nextSpawn: number
  over: boolean
  combo: number
  comboUntil: number
  airUntil: number
  slipUntil: number
  magnetUntil: number
  invulnUntil: number
  helmet: boolean
}

export type GameEvent =
  | { type: 'crash'; x: number; y: number }
  | { type: 'fish'; x: number; y: number; points: number }
  | { type: 'near'; x: number; y: number; points: number; combo: number }
  | { type: 'jump' | 'ice' | 'helmet' | 'magnet' | 'shield'; x: number; y: number }

export function newGame(width: number): Game {
  return {
    t: 0, dist: 0, bonus: 0, px: width / 2, targetX: width / 2, obstacles: [], nextSpawn: 0.6, over: false,
    combo: 0, comboUntil: 0, airUntil: 0, slipUntil: 0, magnetUntil: 0, invulnUntil: 0, helmet: false,
  }
}

export function score(g: Game): number {
  return Math.floor(g.dist / 20) + g.bonus
}

export const airborne = (g: Game) => g.t < g.airUntil
export const slipping = (g: Game) => g.t < g.slipUntil
export const magnetised = (g: Game) => g.t < g.magnetUntil
export const comboActive = (g: Game) => g.combo > 1 && g.t < g.comboUntil

/** Advance the game by dt seconds. Returns everything that happened this frame. */
export function step(g: Game, dt: number, width: number, height: number, rand: () => number = Math.random): GameEvent[] {
  if (g.over) return []
  const events: GameEvent[] = []
  g.t += dt
  const v = speedAt(g.t)
  g.dist += v * dt
  const py = height * PENGUIN_Y

  // Ease toward the finger/keyboard target rather than teleporting — reads as sliding.
  // On ice the penguin barely responds, so it drifts.
  const grip = slipping(g) ? 1.5 : 10
  g.px += (g.targetX - g.px) * Math.min(1, dt * grip)
  g.px = Math.max(PENGUIN_R, Math.min(width - PENGUIN_R, g.px))

  for (const o of g.obstacles) {
    o.y -= v * dt
    if (o.vx) {
      o.x += o.vx * dt
      if (o.x < o.r || o.x > width - o.r) o.vx = -o.vx
    }
    // Magnet pulls nearby fish in
    if (o.kind === 'fish' && magnetised(g)) {
      const dx = g.px - o.x, dy = py - o.y
      const d = Math.hypot(dx, dy)
      if (d < 160 && d > 1) { o.x += (dx / d) * 420 * dt; o.y += (dy / d) * 420 * dt }
    }
  }
  g.obstacles = g.obstacles.filter(o => o.y > -60)

  g.nextSpawn -= dt
  while (g.nextSpawn <= 0) {
    const y = height + 30 + rand() * 40
    const first = makeObstacle(width, y, rand, g.t)
    g.obstacles.push(first)
    // After ~25s, some rows get a second obstacle
    if (g.t > 25 && rand() < Math.min(0.5, (g.t - 25) / 60)) g.obstacles.push(makeObstacle(width, y + rand() * 20, rand, g.t, first.x))
    g.nextSpawn += spawnGap(g.t) * (0.6 + rand() * 0.8)
  }

  const inAir = airborne(g)
  for (let i = g.obstacles.length - 1; i >= 0; i--) {
    const o = g.obstacles[i]
    const hit = collides(g.px, py, o)

    if (o.kind === 'fish' || o.kind === 'helmet' || o.kind === 'magnet') {
      if (!hit) continue
      g.obstacles.splice(i, 1)
      if (o.kind === 'fish') {
        g.bonus += FISH_BONUS
        events.push({ type: 'fish', x: o.x, y: o.y, points: FISH_BONUS })
      } else if (o.kind === 'helmet') {
        g.helmet = true
        events.push({ type: 'helmet', x: o.x, y: o.y })
      } else {
        g.magnetUntil = g.t + MAGNET_TIME
        events.push({ type: 'magnet', x: o.x, y: o.y })
      }
      continue
    }

    if (o.kind === 'ramp' || o.kind === 'ice') {
      if (!hit || o.used || inAir) continue
      o.used = true
      if (o.kind === 'ramp') {
        g.airUntil = g.t + AIR_TIME
        events.push({ type: 'jump', x: g.px, y: py })
      } else {
        g.slipUntil = g.t + SLIP_TIME
        events.push({ type: 'ice', x: g.px, y: py })
      }
      continue
    }

    // Hazards
    if (hit && !inAir && g.t >= g.invulnUntil) {
      if (g.helmet) {
        g.helmet = false
        g.invulnUntil = g.t + INVULN_TIME
        g.obstacles.splice(i, 1)
        events.push({ type: 'shield', x: o.x, y: o.y })
        continue
      }
      g.over = true
      events.push({ type: 'crash', x: g.px, y: py })
      return events
    }

    // Near miss: scored once, the moment the hazard passes the penguin
    if (!o.passed && o.y < py) {
      o.passed = true
      const gap = Math.abs(g.px - o.x) - (PENGUIN_R + o.r * 0.8)
      if (!inAir && gap >= 0 && gap < NEAR_MISS_GAP) {
        g.combo = g.t < g.comboUntil ? g.combo + 1 : 1
        g.comboUntil = g.t + COMBO_WINDOW
        const points = NEAR_MISS_POINTS * g.combo
        g.bonus += points
        events.push({ type: 'near', x: o.x, y: o.y, points, combo: g.combo })
      }
    }
  }
  return events
}
