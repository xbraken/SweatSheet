// Interval sessions are stored as their own activity name ("Interval run", "Interval ride",
// "Interval rowing"…) so they group under the base activity but can be filtered separately.
// These helpers are the one place that knows the naming scheme.

const INTERVAL_PREFIX = 'interval '

/** True for "Interval run", "Interval ride", "Interval rowing", etc. */
export function isIntervalActivity(activity: string): boolean {
  return activity.toLowerCase().startsWith(INTERVAL_PREFIX)
}

/** "Interval run" / "Indoor run" → "Run", "Interval ride" → "Cycling", "Interval rowing" → "Rowing" */
export function baseActivity(activity: string): string {
  let a = activity.trim()
  if (isIntervalActivity(a)) {
    const rest = a.slice(INTERVAL_PREFIX.length).trim()
    if (rest.toLowerCase() === 'ride') return 'Cycling'
    a = rest.charAt(0).toUpperCase() + rest.slice(1)
  }
  return a.toLowerCase().includes('run') ? 'Run' : a
}

/** Set or clear the interval flag on an activity, keeping its base: ("Cycling", true) → "Interval ride" */
export function withInterval(activity: string, interval: boolean): string {
  const base = baseActivity(activity)
  if (!interval) return base
  if (base === 'Run') return 'Interval run'
  if (base === 'Cycling') return 'Interval ride'
  return `Interval ${base.charAt(0).toLowerCase()}${base.slice(1)}`
}

export function isCyclingActivity(activity: string | null | undefined): boolean {
  return !!activity && baseActivity(activity) === 'Cycling'
}

/** Block type for a cardio entry — anything that isn't cycling is stored as a 'run' block */
export function cardioBlockType(activity: string | null | undefined): 'cycle' | 'run' {
  return isCyclingActivity(activity) ? 'cycle' : 'run'
}

/** Material Symbols icon for a cardio activity */
export function cardioIcon(activity: string): string {
  const base = baseActivity(activity)
  if (base === 'Cycling') return 'directions_bike'
  if (base === 'Walking') return 'directions_walk'
  return 'directions_run'
}
