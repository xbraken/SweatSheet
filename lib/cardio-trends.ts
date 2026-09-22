// Client-safe helpers for cardio progress charts.
import { addDays } from '@/lib/dates'

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export type TrendPoint = { date: string; value: number }

/**
 * Smoothed trend for noisy per-run values (heat, hills, tired legs): a rolling median of the
 * last 5 runs, plus "now" (last 5 runs) vs roughly 3 months earlier.
 */
export function smoothedTrend(points: TrendPoint[], windowDays = 365) {
  if (points.length === 0) return null
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date))
  const latest = sorted[sorted.length - 1].date
  const inWindow = sorted.filter(p => p.date >= addDays(latest, -windowDays))
  if (inWindow.length < 3) return null

  const smoothed = inWindow.map((p, i) => ({
    date: p.date,
    value: Math.round(median(inWindow.slice(Math.max(0, i - 4), i + 1).map(x => x.value))),
  }))

  const current = Math.round(median(inWindow.slice(-5).map(p => p.value)))
  // Baseline: runs 60–120 days before the latest; fall back to the earliest runs in the window
  const quarterAgo = inWindow.filter(p => p.date >= addDays(latest, -120) && p.date <= addDays(latest, -60))
  const baselinePts = quarterAgo.length >= 2 ? quarterAgo : inWindow.slice(0, Math.min(5, inWindow.length - 1))
  const baseline = Math.round(median(baselinePts.map(p => p.value)))

  return {
    smoothed,
    current,
    baseline,
    delta: current - baseline,
    baselineLabel: quarterAgo.length >= 2 ? '3 months ago' : 'your earliest runs',
    runs: inWindow.length,
  }
}

export function fmtPace(sec: number): string {
  const s = Math.round(sec)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Pace string ("5:00", sec/km) → speed in km/h, for cycling */
export function paceToKmh(paceSec: number): number {
  return paceSec > 0 ? Math.round((3600 / paceSec) * 10) / 10 : 0
}

/** Cycling is shown as speed; everything else as pace */
export function usesSpeed(activity: string | null | undefined): boolean {
  return activity === 'Cycling'
}
