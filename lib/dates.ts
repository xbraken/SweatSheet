// Date helpers keyed on the user's local calendar day ("YYYY-MM-DD").
// Safe to import from both server and client code.

export const DEFAULT_TZ = 'Europe/London'
export const TZ_COOKIE = 'ss_tz'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function isDateStr(s: unknown): s is string {
  return typeof s === 'string' && DATE_RE.test(s)
}

export function isValidTz(tz: string | undefined | null): tz is string {
  if (!tz) return false
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/** Calendar date in the given timezone, e.g. "2026-09-22" */
export function todayIn(tz: string, now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

/** Hour of day (0–23) in the given timezone */
export function hourIn(tz: string, now: Date = new Date()): number {
  const h = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).format(now)
  return parseInt(h, 10)
}

/** Browser-local calendar date — use on the client instead of toISOString() (which is UTC) */
export function localToday(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

/** Shift a YYYY-MM-DD string by n days (pure calendar arithmetic, no timezone involved) */
export function addDays(date: string, n: number): string {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Day of week for a YYYY-MM-DD string, Monday = 0 */
export function weekdayMon0(date: string): number {
  return (new Date(date + 'T00:00:00Z').getUTCDay() + 6) % 7
}

/** Monday of the week containing `date` */
export function weekStartMon(date: string): string {
  return addDays(date, -weekdayMon0(date))
}
