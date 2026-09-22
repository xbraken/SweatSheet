import { db } from '@/lib/db'
import { addDays } from '@/lib/dates'

export type Recap = {
  month: string            // YYYY-MM
  label: string            // "September 2026"
  sessions: number         // distinct training days
  sets: number
  volumeKg: number
  distanceKm: number
  cardioMinutes: number
  longestStreak: number
  prs: { exercise: string; kind: string; value: number; reps: number | null }[]
  topExercises: { exercise: string; sets: number }[]
  trainedDates: string[]
  prevSessions: number
  isLbs: boolean
  username: string
}

export function isMonthStr(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s)
}

function toMinutes(str: string | null): number {
  if (!str) return 0
  const p = str.split(':').map(Number)
  if (p.some(isNaN)) return 0
  if (p.length === 3) return p[0] * 60 + p[1] + p[2] / 60
  if (p.length === 2) return p[0] + p[1] / 60
  return 0
}

export function monthBounds(month: string) {
  const start = `${month}-01`
  // 31 days after the 1st always lands in the next month
  const nextMonth = addDays(start, 31).slice(0, 8) + '01'
  const end = addDays(nextMonth, -1)
  const prevStart = addDays(start, -1).slice(0, 8) + '01'
  return { start, end, prevStart, prevEnd: addDays(start, -1) }
}

export async function getRecap(userId: number, month: string): Promise<Recap> {
  const { start, end, prevStart, prevEnd } = monthBounds(month)

  const [userRes, daysRes, liftRes, cardioRes, prsRes, topRes, prevRes] = await Promise.all([
    db.execute({ sql: 'SELECT username, unit_pref FROM users WHERE id = ?', args: [userId] }),
    db.execute({
      sql: `SELECT DISTINCT s.date FROM sessions s
            WHERE s.user_id = ? AND s.date BETWEEN ? AND ? AND EXISTS (SELECT 1 FROM blocks b WHERE b.session_id = s.id)
            ORDER BY s.date`,
      args: [userId, start, end],
    }),
    db.execute({
      sql: `SELECT COUNT(*) as sets, COALESCE(SUM(st.weight * st.reps), 0) as volume
            FROM sets st JOIN blocks b ON st.block_id = b.id JOIN sessions s ON b.session_id = s.id
            WHERE s.user_id = ? AND s.date BETWEEN ? AND ? AND COALESCE(st.is_warmup, 0) = 0`,
      args: [userId, start, end],
    }),
    db.execute({
      sql: `SELECT c.distance, c.duration FROM cardio c JOIN blocks b ON c.block_id = b.id JOIN sessions s ON b.session_id = s.id
            WHERE s.user_id = ? AND s.date BETWEEN ? AND ?`,
      args: [userId, start, end],
    }),
    db.execute({
      sql: `SELECT p.exercise, p.kind, p.value, p.reps FROM prs p JOIN sessions s ON p.session_id = s.id
            WHERE p.user_id = ? AND s.date BETWEEN ? AND ?
            ORDER BY p.id`,
      args: [userId, start, end],
    }),
    db.execute({
      sql: `SELECT st.exercise, COUNT(*) as sets FROM sets st JOIN blocks b ON st.block_id = b.id JOIN sessions s ON b.session_id = s.id
            WHERE s.user_id = ? AND s.date BETWEEN ? AND ? AND COALESCE(st.is_warmup, 0) = 0
            GROUP BY st.exercise ORDER BY sets DESC LIMIT 3`,
      args: [userId, start, end],
    }),
    db.execute({
      sql: `SELECT COUNT(DISTINCT s.date) as n FROM sessions s
            WHERE s.user_id = ? AND s.date BETWEEN ? AND ? AND EXISTS (SELECT 1 FROM blocks b WHERE b.session_id = s.id)`,
      args: [userId, prevStart, prevEnd],
    }),
  ])

  const trainedDates = daysRes.rows.map(r => r.date as string)
  let longestStreak = 0
  let run = 0
  for (let i = 0; i < trainedDates.length; i++) {
    run = i > 0 && addDays(trainedDates[i - 1], 1) === trainedDates[i] ? run + 1 : 1
    longestStreak = Math.max(longestStreak, run)
  }

  const distanceKm = cardioRes.rows.reduce((a, r) => a + Number(r.distance ?? 0), 0)
  const cardioMinutes = cardioRes.rows.reduce((a, r) => a + toMinutes(r.duration as string | null), 0)

  return {
    month,
    label: new Date(`${month}-15T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
    sessions: trainedDates.length,
    sets: Number(liftRes.rows[0]?.sets ?? 0),
    volumeKg: Math.round(Number(liftRes.rows[0]?.volume ?? 0)),
    distanceKm: Math.round(distanceKm * 10) / 10,
    cardioMinutes: Math.round(cardioMinutes),
    longestStreak,
    prs: bestPrPerExercise(prsRes.rows.map(r => ({ exercise: r.exercise as string, kind: r.kind as string, value: Number(r.value), reps: r.reps != null ? Number(r.reps) : null }))),
    topExercises: topRes.rows.map(r => ({ exercise: r.exercise as string, sets: Number(r.sets) })),
    trainedDates,
    prevSessions: Number(prevRes.rows[0]?.n ?? 0),
    isLbs: userRes.rows[0]?.unit_pref === 'imperial',
    username: (userRes.rows[0]?.username as string) ?? '',
  }
}

type PrRow = Recap['prs'][number]

/** One PR per exercise for the month — the best one (fastest for times, biggest otherwise) */
export function bestPrPerExercise(rows: PrRow[]): PrRow[] {
  const best = new Map<string, PrRow>()
  for (const r of rows) {
    const cur = best.get(r.exercise)
    const lowerIsBetter = r.kind === 'segment'
    if (!cur || (lowerIsBetter ? r.value < cur.value : r.value > cur.value)) best.set(r.exercise, r)
  }
  return [...best.values()]
}

export function fmtVolume(kg: number, isLbs: boolean): string {
  const v = isLbs ? kg * 2.20462 : kg
  if (v >= 1000) return `${(v / 1000).toFixed(1)}${isLbs ? 'k lbs' : 't'}`
  return `${Math.round(v)} ${isLbs ? 'lbs' : 'kg'}`
}

export { fmtPrValue as fmtPr } from '@/lib/pr-format'
