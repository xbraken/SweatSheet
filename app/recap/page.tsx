import Link from 'next/link'
import { redirect } from 'next/navigation'
import BottomNav from '@/components/BottomNav'
import RecapShareButton from '@/components/RecapShareButton'
import { getSession } from '@/lib/auth'
import { initDb } from '@/lib/db'
import { getUserTz } from '@/lib/tz'
import { addDays, todayIn, weekdayMon0 } from '@/lib/dates'
import { fmtPr, fmtVolume, getRecap, isMonthStr, monthBounds } from '@/lib/recap'

await initDb()

export default async function RecapPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const session = await getSession()
  if (!session) redirect('/auth')

  const today = todayIn(await getUserTz())
  const thisMonth = today.slice(0, 7)
  const { month: m } = await searchParams
  const month = isMonthStr(m) && m <= thisMonth ? m : thisMonth
  const r = await getRecap(session.userId, month)

  const { start, end } = monthBounds(month)
  const prevMonth = addDays(start, -1).slice(0, 7)
  const nextMonth = addDays(end, 1).slice(0, 7)
  const trained = new Set(r.trainedDates)
  const daysInMonth = Number(end.slice(8, 10))
  const lead = weekdayMon0(start)
  const delta = r.sessions - r.prevSessions

  const tiles = [
    { label: 'Sessions', value: String(r.sessions), cls: 'text-on-surface',
      sub: r.prevSessions > 0 ? `${delta >= 0 ? '+' : ''}${delta} vs last month` : null },
    { label: 'Best streak', value: `${r.longestStreak}d`, cls: 'text-on-surface', sub: null },
    ...(r.volumeKg > 0 ? [{ label: 'Lifted', value: fmtVolume(r.volumeKg, r.isLbs), cls: 'text-primary-container', sub: `${r.sets} working sets` }] : []),
    ...(r.distanceKm > 0 ? [{ label: 'Distance', value: `${r.distanceKm} km`, cls: 'text-tertiary', sub: r.cardioMinutes > 0 ? `${Math.floor(r.cardioMinutes / 60)}h ${r.cardioMinutes % 60}m moving` : null }] : []),
  ]

  return (
    <main className="max-w-[390px] md:max-w-2xl mx-auto min-h-screen pb-32 md:pb-12 px-6 pt-10 animate-fade-in-view">
      <header className="flex items-center justify-between mb-8">
        <Link href={`/recap?month=${prevMonth}`} className="w-9 h-9 rounded-xl bg-surface-container flex items-center justify-center" aria-label="Previous month">
          <span className="material-symbols-outlined text-outline">chevron_left</span>
        </Link>
        <div className="text-center">
          <p className="font-label text-[11px] uppercase tracking-widest text-outline">Monthly recap</p>
          <h1 className="font-headline text-2xl font-black text-primary">{r.label}</h1>
        </div>
        {month < thisMonth ? (
          <Link href={`/recap?month=${nextMonth}`} className="w-9 h-9 rounded-xl bg-surface-container flex items-center justify-center" aria-label="Next month">
            <span className="material-symbols-outlined text-outline">chevron_right</span>
          </Link>
        ) : <div className="w-9" />}
      </header>

      {r.sessions === 0 ? (
        <div className="text-center py-20">
          <span className="material-symbols-outlined text-5xl text-surface-container-highest mb-3">event_busy</span>
          <p className="font-headline font-bold text-on-surface">Nothing logged in {r.label}</p>
          <Link href="/log" className="inline-block mt-6 text-sm font-bold text-primary-container">Log a workout →</Link>
        </div>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 mb-6">
            {tiles.map(t => (
              <div key={t.label} className="bg-surface-container rounded-2xl p-4">
                <p className={`font-headline text-3xl font-black ${t.cls}`}>{t.value}</p>
                <p className="font-label text-[10px] uppercase tracking-widest text-outline mt-1">{t.label}</p>
                {t.sub && <p className="text-[11px] text-outline-variant mt-1">{t.sub}</p>}
              </div>
            ))}
          </section>

          {/* Month calendar — filled days are training days */}
          <section className="bg-surface-container rounded-2xl p-4 mb-6">
            <div className="grid grid-cols-7 gap-1.5 text-center">
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                <span key={i} className="text-[10px] font-bold font-label text-outline-variant">{d}</span>
              ))}
              {Array.from({ length: lead }).map((_, i) => <span key={`p${i}`} />)}
              {Array.from({ length: daysInMonth }, (_, i) => {
                const date = `${month}-${String(i + 1).padStart(2, '0')}`
                const on = trained.has(date)
                return (
                  <span key={date} className={`aspect-square rounded-lg flex items-center justify-center text-xs font-bold ${
                    on ? 'bg-primary-container text-on-primary-container' : date > today ? 'text-surface-container-highest' : 'bg-surface-container-high/50 text-outline-variant'
                  }`}>{i + 1}</span>
                )
              })}
            </div>
          </section>

          {r.prs.length > 0 && (
            <section className="mb-6">
              <h2 className="font-headline text-sm font-bold text-outline uppercase tracking-widest mb-3">
                {r.prs.length} new PR{r.prs.length === 1 ? '' : 's'}
              </h2>
              <div className="space-y-2">
                {r.prs.map(p => (
                  <div key={p.exercise} className="flex items-center gap-3 bg-surface-container rounded-xl px-4 py-3">
                    <span className="material-symbols-outlined text-primary-container" style={{ fontVariationSettings: "'FILL' 1" }}>emoji_events</span>
                    <span className="flex-1 text-sm text-on-surface truncate">{p.exercise}</span>
                    <span className="font-headline font-bold text-primary-container">{fmtPr(p, r.isLbs)}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {r.topExercises.length > 0 && (
            <section className="mb-8">
              <h2 className="font-headline text-sm font-bold text-outline uppercase tracking-widest mb-3">Most trained</h2>
              <div className="space-y-2">
                {r.topExercises.map((e, i) => (
                  <div key={e.exercise} className="flex items-center gap-3 px-1">
                    <span className="w-5 font-headline font-black text-outline-variant">{i + 1}</span>
                    <span className="flex-1 text-sm text-on-surface truncate">{e.exercise}</span>
                    <span className="text-sm text-outline">{e.sets} sets</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <RecapShareButton month={month} label={r.label} />
        </>
      )}

      <BottomNav />
    </main>
  )
}
