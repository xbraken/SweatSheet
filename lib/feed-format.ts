// Client-safe formatting for exercises on the friends feed: one short summary per exercise,
// plus the full set list shown when a card is expanded.

/** One working set: weight in kg (0 = bodyweight), reps, hold seconds (timed exercises) */
export type FeedSet = { w: number; r: number; s: number }

/** kg → display number in the viewer's unit (unit label is added by the caller) */
export type WeightFmt = { num: (kg: number) => number; unit: string }

export function fmtSecs(s: number): string {
  return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${s}s`
}

/** Heaviest set; ties go to the one with more reps */
export function topSet(sets: FeedSet[]): FeedSet | null {
  let best: FeedSet | null = null
  for (const x of sets) {
    if (!best || x.w > best.w || (x.w === best.w && x.r > best.r)) best = x
  }
  return best
}

/**
 * Collapsed one-liner:
 *   weighted   → "80 kg × 10" (top set)
 *   timed      → "1:30 best"
 *   bodyweight → "3 × 25 reps" when every set matches, else total "66 reps"
 */
export function exerciseSummary(sets: FeedSet[], fmt: WeightFmt): string {
  if (sets.length === 0) return ''
  if (sets.some(x => x.s > 0)) return `${fmtSecs(Math.max(...sets.map(x => x.s)))} best`
  const top = topSet(sets)!
  if (top.w > 0) return `${fmt.num(top.w)} ${fmt.unit} × ${top.r}`
  const reps = sets.map(x => x.r)
  if (reps.every(r => r === reps[0])) return `${sets.length} × ${reps[0]} reps`
  return `${reps.reduce((a, b) => a + b, 0)} reps`
}

/** Expanded detail, every set in order: "80 × 10 · 80 × 10 · 75 × 8", "25 · 22 · 20 reps", "1:00 · 1:30" */
export function setsDetail(sets: FeedSet[], fmt: WeightFmt): string {
  if (sets.some(x => x.s > 0)) return sets.map(x => fmtSecs(x.s)).join(' · ')
  if (sets.some(x => x.w > 0)) return sets.map(x => `${x.w > 0 ? fmt.num(x.w) : 'BW'} × ${x.r}`).join(' · ')
  return `${sets.map(x => x.r).join(' · ')} reps`
}
