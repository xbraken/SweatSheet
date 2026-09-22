import BottomNav from '@/components/BottomNav'
import Link from 'next/link'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import LogoutButton from '@/components/LogoutButton'
import IntervalsSyncTrigger from '@/components/IntervalsSyncTrigger'
import WeeklyGoalRing from '@/components/WeeklyGoalRing'
import { getUserTz } from '@/lib/tz'
import { addDays, hourIn, todayIn, weekdayMon0 } from '@/lib/dates'

function toSecondsLoose(str: string | null): number {
  if (!str) return 0
  const parts = str.split(':').map(Number)
  if (parts.some(isNaN)) return 0
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  return 0
}

// All dates are the user's local calendar days (tz from the ss_tz cookie) — the server runs in UTC
async function getTodayData(userId: number, today: string) {
  const weekStart = addDays(today, -weekdayMon0(today))
  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  // Date 28 days back for load window
  const load28StartStr = addDays(today, -27)

  const [todaySession, weekSessions, weekStats, loadRows, todayLifts, todayCardio, goalRes] = await Promise.all([
    db.execute({
      sql: `SELECT s.id, s.date,
        (SELECT COUNT(*) FROM blocks b WHERE b.session_id = s.id AND b.type = 'lift') as lift_blocks,
        (SELECT COUNT(*) FROM blocks b WHERE b.session_id = s.id AND b.type != 'lift') as cardio_blocks,
        (SELECT COUNT(*) FROM sets st JOIN blocks b ON st.block_id = b.id WHERE b.session_id = s.id) as total_sets
        FROM sessions s WHERE s.date = ? AND s.user_id = ? LIMIT 1`,
      args: [today, userId],
    }),
    db.execute({
      sql: `SELECT DISTINCT date FROM sessions WHERE date >= ? AND date <= ? AND user_id = ? ORDER BY date`,
      args: [weekDates[0], weekDates[6], userId],
    }),
    db.execute({
      sql: `SELECT
        COALESCE(SUM(CASE WHEN COALESCE(st.is_warmup, 0) = 0 THEN st.weight * st.reps END), 0) as total_volume,
        COALESCE(SUM(c.distance), 0) as total_distance
        FROM sessions s
        LEFT JOIN blocks b ON b.session_id = s.id
        LEFT JOIN sets st ON st.block_id = b.id
        LEFT JOIN cardio c ON c.block_id = b.id
        WHERE s.date >= ? AND s.date <= ? AND s.user_id = ?`,
      args: [weekDates[0], weekDates[6], userId],
    }),
    db.execute({
      sql: `SELECT s.date,
              COUNT(DISTINCT st.id) as set_count,
              GROUP_CONCAT(c.duration) as cardio_durations
            FROM sessions s
            LEFT JOIN blocks b ON b.session_id = s.id
            LEFT JOIN sets st ON st.block_id = b.id
            LEFT JOIN cardio c ON c.block_id = b.id
            WHERE s.date >= ? AND s.user_id = ?
            GROUP BY s.date`,
      args: [load28StartStr, userId],
    }),
    // What was actually done today — exercise names, in logged order
    db.execute({
      sql: `SELECT st.exercise, COUNT(*) as sets, MAX(st.weight) as top_weight
            FROM sets st JOIN blocks b ON st.block_id = b.id JOIN sessions s ON b.session_id = s.id
            WHERE s.user_id = ? AND s.date = ? AND COALESCE(st.is_warmup, 0) = 0
            GROUP BY b.id ORDER BY b.position, b.id`,
      args: [userId, today],
    }),
    db.execute({
      sql: `SELECT c.activity, c.distance, c.duration
            FROM cardio c JOIN blocks b ON c.block_id = b.id JOIN sessions s ON b.session_id = s.id
            WHERE s.user_id = ? AND s.date = ?
            ORDER BY b.position, b.id`,
      args: [userId, today],
    }),
    db.execute({ sql: 'SELECT weekly_goal, unit_pref FROM users WHERE id = ?', args: [userId] }),
  ])

  // Build minutes-per-day map. Lifts approximated at 3 min/set (working+rest).
  const minutesByDate = new Map<string, number>()
  for (const r of loadRows.rows) {
    const date = r.date as string
    const sets = Number(r.set_count ?? 0)
    const cardios = (r.cardio_durations as string | null) ?? ''
    const cardioMin = cardios.split(',').filter(Boolean).reduce((a, s) => a + toSecondsLoose(s) / 60, 0)
    minutesByDate.set(date, Math.round(sets * 3 + cardioMin))
  }

  // Sum last 7 days vs prior 21 days + collect daily series (oldest → newest)
  let last7 = 0
  let prior21 = 0
  const dailyMinutes: number[] = []
  for (let i = 27; i >= 0; i--) {
    const key = addDays(today, -i)
    const m = minutesByDate.get(key) ?? 0
    dailyMinutes.push(m)
    if (i < 7) last7 += m
    else prior21 += m
  }
  const prior21Weekly = prior21 / 3 // normalize to weekly

  // Streak: consecutive days ending at today (or yesterday if today is rest)
  let streak = 0
  for (let i = 0; i < 28; i++) {
    const key = addDays(today, -i)
    if ((minutesByDate.get(key) ?? 0) > 0) streak++
    else if (i === 0) continue // allow today to be rest without breaking the streak
    else break
  }

  const ws = weekStats.rows[0]
  return {
    today: todaySession.rows[0] ?? null,
    todayLifts: todayLifts.rows.map(r => ({ exercise: r.exercise as string, sets: Number(r.sets), topWeight: Number(r.top_weight ?? 0) })),
    todayCardio: todayCardio.rows.map(r => ({ activity: r.activity as string, distance: r.distance != null ? Number(r.distance) : null, duration: (r.duration as string | null) ?? null })),
    weeklyGoal: goalRes.rows[0]?.weekly_goal != null ? Number(goalRes.rows[0].weekly_goal) : null,
    isLbs: goalRes.rows[0]?.unit_pref === 'imperial',
    completedDates: weekSessions.rows.map(r => r.date as string),
    weekDates,
    weekVolume: Number(ws?.total_volume ?? 0),
    weekDistance: Number(ws?.total_distance ?? 0),
    sessionCount: weekSessions.rows.length,
    load: {
      last7Min: last7,
      prior21Weekly: Math.round(prior21Weekly),
      ratio: prior21Weekly > 0 ? last7 / prior21Weekly : null,
      streak,
      dailyMinutes,
    },
  }
}

export default async function TodayPage() {
  const session = await getSession()
  if (!session) redirect('/auth')

  const tz = await getUserTz()
  const now = new Date()
  const todayStr = todayIn(tz, now)
  const dayName = now.toLocaleDateString('en-GB', { weekday: 'long', timeZone: tz })
  const dateStr = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: tz })
  const hour = hourIn(tz, now)
  const greeting = hour < 5 ? 'Late one' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  const { today, todayLifts, todayCardio, weeklyGoal, isLbs, completedDates, weekDates, weekVolume, weekDistance, sessionCount, load } = await getTodayData(session.userId, todayStr)

  // Monthly recap: in the first week of a month, point at last month's; otherwise this month so far
  const dayOfMonth = Number(todayStr.slice(8, 10))
  const recapMonth = dayOfMonth <= 7 ? addDays(todayStr.slice(0, 8) + '01', -1).slice(0, 7) : todayStr.slice(0, 7)
  const recapLabel = new Date(recapMonth + '-15T12:00:00Z').toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' })

  // Translate load signals into a tone + message
  const loadStatus = (() => {
    if (load.ratio === null && load.streak === 0) return null
    const r = load.ratio
    if (r !== null && r > 1.5) return { tone: 'warn', label: 'Ramping up fast', hint: 'Consider an easier day' }
    if (r !== null && r < 0.5 && load.prior21Weekly > 0) return { tone: 'muted', label: 'Detrained', hint: 'Easy build back up' }
    if (load.streak >= 6) return { tone: 'warn', label: `${load.streak} days straight`, hint: 'A rest day would help' }
    if (load.streak >= 3) return { tone: 'ok', label: `${load.streak} day streak`, hint: 'Looking consistent' }
    return { tone: 'ok', label: 'Balanced', hint: 'Train as planned' }
  })()

  const week = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
  const todayIdx = weekdayMon0(todayStr)

  return (
    <main className="max-w-[390px] md:max-w-3xl mx-auto min-h-screen pb-32 md:pb-12 px-6 pt-12 animate-fade-in-view">
      <IntervalsSyncTrigger />
      {/* Header */}
      <header className="mb-10 flex justify-between items-start">
        <div>
          <p className="font-label text-outline text-sm tracking-wide mb-1">{dayName}, {dateStr}</p>
          <h1 className="font-headline text-3xl font-black tracking-tight text-on-surface">
            {greeting}, {session.username}.
          </h1>
        </div>
        <a href="/account" className="material-symbols-outlined text-outline text-2xl">account_circle</a>
      </header>

      {/* Desktop: two-column layout for Today + Week */}
      <div className="md:grid md:grid-cols-2 md:gap-8">

      {/* Today's session or CTA */}
      <section className="mb-10">
        {today ? (
          <>
            <div className="flex items-center gap-2 mb-4">
              <span className="w-2 h-2 rounded-full bg-primary-container" />
              <h2 className="font-headline text-lg font-bold tracking-tight">Today&apos;s session</h2>
            </div>
            <div className="bg-surface-container rounded-2xl p-5 space-y-3">
              {todayLifts.map((l, i) => (
                <div key={`l${i}`} className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-primary-container">fitness_center</span>
                  <div className="flex-1 min-w-0 flex items-baseline justify-between gap-2">
                    <p className="font-headline font-bold text-on-surface truncate">{l.exercise}</p>
                    <p className="text-sm text-outline shrink-0">
                      {l.sets} set{l.sets === 1 ? '' : 's'}
                      {l.topWeight > 0 && ` · ${isLbs ? Math.round(l.topWeight * 2.20462) : l.topWeight} ${isLbs ? 'lbs' : 'kg'}`}
                    </p>
                  </div>
                </div>
              ))}
              {todayCardio.map((c, i) => (
                <div key={`c${i}`} className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-tertiary">{c.activity === 'Cycling' ? 'directions_bike' : c.activity === 'Walking' ? 'directions_walk' : 'directions_run'}</span>
                  <div className="flex-1 min-w-0 flex items-baseline justify-between gap-2">
                    <p className="font-headline font-bold text-on-surface truncate">{c.activity}</p>
                    <p className="text-sm text-outline shrink-0">
                      {[c.distance ? `${c.distance.toFixed(1)} km` : null, c.duration].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                </div>
              ))}
              {todayLifts.length === 0 && todayCardio.length === 0 && (
                <p className="text-sm text-outline">Session started — nothing logged yet</p>
              )}
            </div>
            <Link href="/log" className="w-full mt-3 bg-surface-container py-4 rounded-xl flex items-center justify-center gap-2 font-headline font-bold text-sm tracking-wide text-on-surface hover:bg-surface-container-high transition-colors">
              <span className="material-symbols-outlined text-lg">add_circle</span>
              Log another session
            </Link>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <span className="material-symbols-outlined text-6xl text-surface-container-highest mb-5">fitness_center</span>
            <p className="font-headline font-bold text-xl text-on-surface mb-2">No session yet today</p>
            <p className="text-sm text-outline mb-8">Track your workout to start building your progress</p>
            <Link href="/log" className="bg-gradient-to-br from-primary to-primary-container text-on-primary-container px-8 py-3.5 rounded-2xl font-headline font-bold text-base shadow-xl active:scale-95 transition-transform">
              Start session
            </Link>
          </div>
        )}
      </section>

      {/* This week */}
      <section className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-headline text-sm font-bold text-outline uppercase tracking-widest">This week</h3>
          <WeeklyGoalRing done={completedDates.length} goal={weeklyGoal} />
        </div>
        <div className="flex justify-between items-center bg-surface-container p-4 rounded-xl">
          {week.map((d, i) => {
            const done = completedDates.includes(weekDates[i])
            const isToday = i === todayIdx
            return (
              <div key={i} className="flex flex-col items-center gap-2">
                <span className={`font-label text-[10px] font-bold ${isToday ? 'text-primary-container' : 'text-outline'}`}>{d}</span>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center
                  ${done ? 'bg-primary-container' : isToday ? 'border-2 border-primary-container' : 'border border-surface-container-highest'}`}>
                  {done && <span className="material-symbols-outlined text-on-primary-container text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>check</span>}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      </div>{/* end two-column wrapper */}

      {/* Training load — last 7d minutes vs prior 21d baseline + streak */}
      {loadStatus && (load.last7Min > 0 || load.prior21Weekly > 0) && (() => {
        const toneClass = loadStatus.tone === 'warn'
          ? 'bg-orange-950/40 border-orange-900/40'
          : loadStatus.tone === 'muted'
            ? 'bg-surface-container border-surface-container-highest/40'
            : 'bg-surface-container border-surface-container-highest/40'
        const accent = loadStatus.tone === 'warn' ? 'text-orange-400' : loadStatus.tone === 'muted' ? 'text-outline' : 'text-tertiary'
        const ratioPct = load.ratio !== null ? Math.round((load.ratio - 1) * 100) : null
        return (
          <section className="mb-10">
            <h3 className="font-headline text-sm font-bold text-outline mb-4 uppercase tracking-widest">Load</h3>
            <div className={`rounded-2xl border p-4 flex flex-col gap-3 ${toneClass}`}>
              <div className="flex justify-between items-start">
                <div>
                  <p className={`font-headline font-black text-lg ${accent}`}>{loadStatus.label}</p>
                  <p className="text-xs text-outline mt-0.5">{loadStatus.hint}</p>
                </div>
                {ratioPct !== null && (
                  <div className="text-right">
                    <span className={`text-2xl font-black font-headline ${accent}`}>
                      {ratioPct >= 0 ? '+' : ''}{ratioPct}%
                    </span>
                    <p className="text-[9px] font-bold font-label uppercase tracking-widest text-outline">vs 3-wk avg</p>
                  </div>
                )}
              </div>
              {/* 28-day daily minutes sparkline (oldest → newest). Last 7 days highlighted. */}
              {load.dailyMinutes.some(m => m > 0) && (() => {
                const max = Math.max(1, ...load.dailyMinutes)
                return (
                  <div className="flex items-end gap-[2px] h-8">
                    {load.dailyMinutes.map((m, i) => {
                      const inLast7 = i >= load.dailyMinutes.length - 7
                      const heightPct = m > 0 ? Math.max(8, (m / max) * 100) : 0
                      const color = m === 0 ? '#2a2a2a' : inLast7
                        ? (loadStatus.tone === 'warn' ? '#fb923c' : '#4bdece')
                        : '#4a4a4a'
                      return (
                        <div
                          key={i}
                          className="flex-1 rounded-sm"
                          style={{ height: m > 0 ? `${heightPct}%` : '2px', backgroundColor: color }}
                          title={`${m} min`}
                        />
                      )
                    })}
                  </div>
                )
              })()}
              <div className="flex justify-between text-[10px] font-bold font-label uppercase tracking-widest text-outline">
                <span>Last 7d: <span className="text-on-surface normal-case">{Math.round(load.last7Min / 60)}h {load.last7Min % 60}m</span></span>
                <span>Streak: <span className="text-on-surface normal-case">{load.streak} day{load.streak === 1 ? '' : 's'}</span></span>
              </div>
            </div>
          </section>
        )
      })()}

      {/* Weekly summary */}
      {(weekVolume > 0 || weekDistance > 0) && (
        <section className="mb-10 grid grid-cols-3 gap-3">
          <div className="bg-surface-container rounded-xl p-3 flex flex-col items-center">
            <span className="font-headline font-black text-lg text-on-surface">{sessionCount}</span>
            <span className="font-label text-[9px] uppercase tracking-widest text-outline mt-0.5">Sessions</span>
          </div>
          {weekVolume > 0 && (
            <div className="bg-surface-container rounded-xl p-3 flex flex-col items-center">
              <span className="font-headline font-black text-lg text-primary-container">{(weekVolume / 1000).toFixed(1)}t</span>
              <span className="font-label text-[9px] uppercase tracking-widest text-outline mt-0.5">Volume</span>
            </div>
          )}
          {weekDistance > 0 && (
            <div className="bg-surface-container rounded-xl p-3 flex flex-col items-center">
              <span className="font-headline font-black text-lg text-tertiary">{weekDistance.toFixed(1)}</span>
              <span className="font-label text-[9px] uppercase tracking-widest text-outline mt-0.5">km run</span>
            </div>
          )}
        </section>
      )}

      {/* Monthly recap */}
      <Link href={`/recap?month=${recapMonth}`} className="mb-10 flex items-center gap-4 bg-surface-container hover:bg-surface-container-high transition-colors rounded-2xl p-4">
        <div className="w-11 h-11 rounded-xl bg-primary-container/10 flex items-center justify-center shrink-0">
          <span className="material-symbols-outlined text-primary-container">auto_awesome</span>
        </div>
        <div className="flex-1">
          <p className="font-headline font-bold text-on-surface">{recapLabel} recap</p>
          <p className="text-xs text-outline">{dayOfMonth <= 7 ? 'Your month in numbers — ready to share' : 'Your month so far'}</p>
        </div>
        <span className="material-symbols-outlined text-outline">chevron_right</span>
      </Link>

      <BottomNav />
    </main>
  )
}
