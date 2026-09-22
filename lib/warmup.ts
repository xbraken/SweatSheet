// One warm-up set before the working sets: ~60% of the working weight for 8 reps,
// rounded to something loadable. Kept to a single suggestion on purpose so there's
// one number to go off. Nothing here is logged — it's a guide.

export const BARBELL_EXERCISES = new Set([
  'Bench Press', 'Incline Bench Press', 'Decline Bench Press', 'Close Grip Bench Press',
  'Squat', 'Front Squat',
  'Deadlift', 'Sumo Deadlift', 'Romanian Deadlift', 'Stiff Leg Deadlift',
  'Barbell Row', 'Pendlay Row',
  'Overhead Press', 'Push Press',
  'Hip Thrust',
  'Clean and Jerk', 'Snatch', 'Power Clean', 'Clean Pull',
])

export const WARMUP_PCT = 0.6
export const WARMUP_REPS = 8

/**
 * @param work     working weight, in the user's display unit (kg or lbs)
 * @param isLbs    display unit
 * @param bar      bar weight for barbell lifts (display units) — the warm-up never goes below it
 * @returns the warm-up set, or null when the working weight is too light to need one
 */
export function warmupSet(work: number, isLbs: boolean, bar?: number): { weight: number; reps: number } | null {
  if (!(work > 0)) return null
  // Barbells load in 2.5 kg / 5 lb jumps; machines & dumbbells go up in bigger steps once heavier
  const light = work < (isLbs ? 66 : 30)
  const step = bar != null || light ? (isLbs ? 5 : 2.5) : (isLbs ? 10 : 5)
  let weight = Math.round((work * WARMUP_PCT) / step) * step
  if (bar != null) weight = Math.max(weight, bar)
  weight = Math.round(weight * 100) / 100
  if (weight <= 0 || weight >= work) return null
  return { weight, reps: WARMUP_REPS }
}
