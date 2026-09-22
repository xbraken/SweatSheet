// "What should I lift today?" — a simple double-progression rule based on the last session.
//
// Weights: if every working set at the top weight hit the reps of the first set at that
// weight, add one increment. If reps dropped off, stay at that weight and aim to match.
// A hard top set (RPE ≥ 9.5) holds the weight regardless.
// Bodyweight: +1 rep on the best set. Timed: +5s on the best set.

export type ProgressionSet = { weight: number; reps: number; duration_secs: number | null; is_warmup?: boolean; rpe?: number | null }
export type ExerciseKind = 'weights' | 'bodyweight' | 'timed'

export type Suggestion = {
  weight: number        // kg
  reps: number
  duration_secs: number
  kind: 'increase' | 'repeat' | 'more-reps' | 'longer'
  reason: string
}

export const KG_INCREMENT = 2.5
export const LB_INCREMENT_KG = 5 / 2.20462

export function suggestNext(sets: ProgressionSet[], kind: ExerciseKind, isLbs = false): Suggestion | null {
  const work = sets.filter(s => !s.is_warmup)
  if (work.length === 0) return null

  if (kind === 'timed') {
    const best = Math.max(...work.map(s => s.duration_secs ?? 0))
    if (best <= 0) return null
    return { weight: 0, reps: 0, duration_secs: best + 5, kind: 'longer', reason: 'Add 5 seconds to your best hold' }
  }

  if (kind === 'bodyweight') {
    const best = work.reduce((a, b) => (b.reps > a.reps ? b : a), work[0])
    return { weight: best.weight, reps: best.reps + 1, duration_secs: 0, kind: 'more-reps', reason: 'One more rep than your best set' }
  }

  const top = Math.max(...work.map(s => s.weight))
  if (top <= 0) return null
  const atTop = work.filter(s => s.weight === top)
  const target = atTop[0].reps
  const hitAll = atTop.every(s => s.reps >= target)
  const grinder = atTop.some(s => (s.rpe ?? 0) >= 9.5)
  const easy = atTop.length > 0 && atTop.every(s => s.rpe != null && s.rpe <= 8)

  // One set at the top weight tells us little unless RPE says it was easy
  const ready = hitAll && !grinder && (atTop.length >= 2 || easy)
  if (ready) {
    const inc = isLbs ? LB_INCREMENT_KG : KG_INCREMENT
    return {
      weight: Math.round((top + inc) * 100) / 100,
      reps: target,
      duration_secs: 0,
      kind: 'increase',
      reason: `You hit ${target} reps on every set — time to add weight`,
    }
  }

  if (grinder) {
    return { weight: top, reps: target, duration_secs: 0, kind: 'repeat', reason: 'Last top set was a grinder — own this weight first' }
  }

  if (!hitAll) {
    return { weight: top, reps: target, duration_secs: 0, kind: 'repeat', reason: `Match ${target} reps on every set, then go up` }
  }

  return { weight: top, reps: target + 1, duration_secs: 0, kind: 'more-reps', reason: 'Add a rep at the same weight' }
}
