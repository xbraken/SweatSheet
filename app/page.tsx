import BottomNav from '@/components/BottomNav'
import Link from 'next/link'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import LogoutButton from '@/components/LogoutButton'

async function getTodayData(userId: number) {
  const today = new Date().toISOString().split('T')[0]

  const now = new Date()
  const dayOfWeek = (now.getDay() + 6) % 7 // Mon=0
  const weekStart = new Date(now)
  weekStart.setDate(now.getDate() - dayOfWeek)

  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(weekStart.getDate() + i)
    return d.toISOString().split('T')[0]
  })

  const [todaySession, weekSessions, weekStats] = await Promise.all([
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
        COALESCE(SUM(st.weight * st.reps), 0) as total_volume,
        COALESCE(SUM(c.distance), 0) as total_distance
        FROM sessions s
        LEFT JOIN blocks b ON b.session_id = s.id
        LEFT JOIN sets st ON st.block_id = b.id
        LEFT JOIN cardio c ON c.block_id = b.id
        WHERE s.date >= ? AND s.date <= ? AND s.user_id = ?`,
      args: [weekDates[0], weekDates[6], userId],
    }),
  ])

  const ws = weekStats.rows[0]
  return {
    today: todaySession.rows[0] ?? null,
    completedDates: weekSessions.rows.map(r => r.date as string),
    weekDates,
    weekVolume: Number(ws?.total_volume ?? 0),
    weekDistance: Number(ws?.total_distance ?? 0),
    sessionCount: weekSessions.rows.length,
  }
}

export default async function TodayPage() {
  const session = await getSession()
  if (!session) redirect('/auth')

  const now = new Date()
  const dayName = now.toLocaleDateString('en-GB', { weekday: 'long' })
  const dateStr = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  const hour = now.getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  const { today, completedDates, weekDates, weekVolume, weekDistance, sessionCount } = await getTodayData(session.userId)

  const week = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
  const todayIdx = (now.getDay() + 6) % 7

  return (
    <main className="max-w-[390px] mx-auto min-h-screen pb-32 px-6 pt-12">
      {/* Header */}
      <header className="mb-10 flex justify-between items-start">
        <div>
          <p className="font-label text-[#a48b83] text-sm tracking-wide mb-1">{dayName}, {dateStr}</p>
          <h1 className="font-headline text-3xl font-black tracking-tight text-[#e5e2e1]">
            {greeting}, {session.username}.
          </h1>
        </div>
        <a href="/account" className="material-symbols-outlined text-[#a48b83] text-2xl">account_circle</a>
      </header>

      {/* Today's session or CTA */}
      <section className="mb-10">
        {today ? (
          <>
            <div className="flex items-center gap-2 mb-4">
              <span className="w-2 h-2 rounded-full bg-[#ff9066]" />
              <h2 className="font-headline text-lg font-bold tracking-tight">Today&apos;s session</h2>
            </div>
            <div className="bg-[#201f1f] rounded-2xl p-5 space-y-3">
              {Number(today.lift_blocks) > 0 && (
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-[#ff9066]">fitness_center</span>
                  <div>
                    <p className="font-headline font-bold text-[#e5e2e1]">Lift</p>
                    <p className="text-sm text-[#a48b83]">{String(today.total_sets)} sets completed</p>
                  </div>
                </div>
              )}
              {Number(today.cardio_blocks) > 0 && (
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-[#4bdece]">directions_run</span>
                  <div>
                    <p className="font-headline font-bold text-[#e5e2e1]">Cardio</p>
                    <p className="text-sm text-[#a48b83]">{String(today.cardio_blocks)} block{Number(today.cardio_blocks) > 1 ? 's' : ''}</p>
                  </div>
                </div>
              )}
            </div>
            <Link href="/log" className="w-full mt-3 bg-[#201f1f] py-4 rounded-xl flex items-center justify-center gap-2 font-headline font-bold text-sm tracking-wide text-[#e5e2e1] hover:bg-[#2a2a2a] transition-colors">
              <span className="material-symbols-outlined text-lg">add_circle</span>
              Log another session
            </Link>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <span className="material-symbols-outlined text-6xl text-[#353534] mb-5">fitness_center</span>
            <p className="font-headline font-bold text-xl text-[#e5e2e1] mb-2">No session yet today</p>
            <p className="text-sm text-[#a48b83] mb-8">Track your workout to start building your progress</p>
            <Link href="/log" className="bg-gradient-to-br from-[#ffb9a0] to-[#ff9066] text-[#752805] px-8 py-3.5 rounded-2xl font-headline font-bold text-base shadow-xl active:scale-95 transition-transform">
              Start session
            </Link>
          </div>
        )}
      </section>

      {/* This week */}
      <section className="mb-10">
        <h3 className="font-headline text-sm font-bold text-[#a48b83] mb-4 uppercase tracking-widest">This week</h3>
        <div className="flex justify-between items-center bg-[#201f1f] p-4 rounded-xl">
          {week.map((d, i) => {
            const done = completedDates.includes(weekDates[i])
            const isToday = i === todayIdx
            return (
              <div key={i} className="flex flex-col items-center gap-2">
                <span className={`font-label text-[10px] font-bold ${isToday ? 'text-[#ff9066]' : 'text-[#a48b83]'}`}>{d}</span>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center
                  ${done ? 'bg-[#ff9066]' : isToday ? 'border-2 border-[#ff9066]' : 'border border-[#353534]'}`}>
                  {done && <span className="material-symbols-outlined text-[#752805] text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>check</span>}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Weekly summary */}
      {(weekVolume > 0 || weekDistance > 0) && (
        <section className="mb-10 grid grid-cols-3 gap-3">
          <div className="bg-[#201f1f] rounded-xl p-3 flex flex-col items-center">
            <span className="font-headline font-black text-lg text-[#e5e2e1]">{sessionCount}</span>
            <span className="font-label text-[9px] uppercase tracking-widest text-[#a48b83] mt-0.5">Sessions</span>
          </div>
          {weekVolume > 0 && (
            <div className="bg-[#201f1f] rounded-xl p-3 flex flex-col items-center">
              <span className="font-headline font-black text-lg text-[#ff9066]">{(weekVolume / 1000).toFixed(1)}t</span>
              <span className="font-label text-[9px] uppercase tracking-widest text-[#a48b83] mt-0.5">Volume</span>
            </div>
          )}
          {weekDistance > 0 && (
            <div className="bg-[#201f1f] rounded-xl p-3 flex flex-col items-center">
              <span className="font-headline font-black text-lg text-[#4bdece]">{weekDistance.toFixed(1)}</span>
              <span className="font-label text-[9px] uppercase tracking-widest text-[#a48b83] mt-0.5">km run</span>
            </div>
          )}
        </section>
      )}

      <BottomNav />
    </main>
  )
}
