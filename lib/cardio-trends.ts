// Client-safe helpers for cardio progress charts.
import { addDays } from '@/lib/dates'

export type Z2Point = { date: string; paceSec: number; cardio_id?: number }

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/**
 * Aerobic fitness trend: pace during the longest zone-2 (easy heart rate) stretch of each run.
 * Single runs are noisy (heat, hills, tired legs), so we plot a rolling median and compare
 * "now" (last 5 runs) against roughly 3 months earlier.
 */
export function aerobicTrend(points: Z2Point[], windowDays = 365) {
  if (points.length === 0) return null
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date))
  const latest = sorted[sorted.length - 1].date
  const inWindow = sorted.filter(p => p.date >= addDays(latest, -windowDays))
  if (inWindow.length < 3) return null

  const smoothed = inWindow.map((p, i) => ({
    date: p.date,
    paceSec: Math.round(median(inWindow.slice(Math.max(0, i - 4), i + 1).map(x => x.paceSec))),
  }))

  const currentSec = Math.round(median(inWindow.slice(-5).map(p => p.paceSec)))
  // Baseline: runs 60–120 days before the latest; fall back to the earliest runs in the window
  const quarterAgo = inWindow.filter(p => p.date >= addDays(latest, -120) && p.date <= addDays(latest, -60))
  const baselinePts = quarterAgo.length >= 2 ? quarterAgo : inWindow.slice(0, Math.min(5, inWindow.length - 1))
  const baselineSec = Math.round(median(baselinePts.map(p => p.paceSec)))

  return {
    smoothed,
    currentSec,
    baselineSec,
    // Negative = faster now = fitter
    deltaSec: currentSec - baselineSec,
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

export type EfficiencyPoint = { date: string; ef: number; avgHr: number; cardio_id?: number }

/**
 * Convert per-run efficiency (metres per second per bpm) into "pace at your typical heart rate",
 * so the chart reads in familiar units. The reference HR is the median average HR of the user's
 * runs in the window, rounded to a whole bpm.
 */
export function paceAtTypicalHr(points: EfficiencyPoint[], windowDays = 365): { refHr: number; points: Z2Point[] } | null {
  if (points.length === 0) return null
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date))
  const latest = sorted[sorted.length - 1].date
  const recent = sorted.filter(p => p.date >= addDays(latest, -windowDays))
  if (recent.length === 0) return null
  const refHr = Math.round(median(recent.map(p => p.avgHr)))
  return {
    refHr,
    points: recent.map(p => ({ date: p.date, paceSec: 1000 / (p.ef * refHr), cardio_id: p.cardio_id })),
  }
}
