import BottomNav from '@/components/BottomNav'
import Link from 'next/link'

export default function TodayPage() {
  const now = new Date()
  const dayName = now.toLocaleDateString('en-GB', { weekday: 'long' })
  const dateStr = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  const hour = now.getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  const week = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
  const todayIdx = (now.getDay() + 6) % 7 // Mon=0
  const completedDays = [0] // Monday done

  return (
    <main className="max-w-[390px] mx-auto min-h-screen pb-32 px-6 pt-12">
      {/* Header */}
      <header className="mb-10">
        <p className="font-label text-on-surface-variant text-sm tracking-wide mb-1">{dayName}, {dateStr}</p>
        <h1 className="font-headline text-3xl font-black tracking-tight text-on-surface">{greeting}, Edmond.</h1>
      </header>

      {/* Active Session Card */}
      <section className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-primary-container animate-pulse" />
            <h2 className="font-headline text-lg font-bold tracking-tight">Active session</h2>
          </div>
          <span className="font-label text-xs font-bold text-primary-container uppercase tracking-widest">42:15</span>
        </div>
        <div className="bg-surface-container rounded-xl overflow-hidden p-1 space-y-1">
          {/* Lift block */}
          <div className="bg-surface-container-high rounded-lg p-5">
            <div className="flex justify-between items-start mb-4">
              <span className="font-headline text-sm font-bold text-primary-container">Lift</span>
              <span className="material-symbols-outlined text-on-surface-variant">fitness_center</span>
            </div>
            <div className="flex justify-between items-end">
              <div>
                <p className="font-label text-xs text-on-surface-variant mb-1">Current exercise</p>
                <p className="font-headline text-xl font-bold leading-tight">Barbell back squat</p>
              </div>
              <p className="font-headline text-3xl font-black text-on-surface">225<span className="text-sm font-bold text-on-surface-variant ml-1">lbs</span></p>
            </div>
            <div className="mt-4 flex gap-2">
              <div className="px-3 py-1 bg-surface-container-highest rounded-full text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">Set 3 of 5</div>
              <div className="px-3 py-1 bg-surface-container-highest rounded-full text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">RPE 8</div>
            </div>
          </div>
          {/* Run block */}
          <div className="bg-surface-container-high rounded-lg p-5">
            <div className="flex justify-between items-start mb-4">
              <span className="font-headline text-sm font-bold text-tertiary">Run</span>
              <span className="material-symbols-outlined text-on-surface-variant">directions_run</span>
            </div>
            <div className="flex justify-between items-end">
              <div>
                <p className="font-label text-xs text-on-surface-variant mb-1">Distance covered</p>
                <p className="font-headline text-3xl font-black text-on-surface">3.2<span className="text-sm font-bold text-on-surface-variant ml-1">km</span></p>
              </div>
              <div className="text-right">
                <p className="font-label text-xs text-on-surface-variant mb-1">Pace</p>
                <p className="font-headline text-xl font-bold">5:30</p>
              </div>
            </div>
          </div>
        </div>
        <Link href="/log" className="w-full mt-4 bg-surface-container-highest py-4 rounded-xl flex items-center justify-center gap-2 font-headline font-bold text-sm tracking-wide text-on-surface hover:bg-surface-bright transition-colors">
          <span className="material-symbols-outlined text-lg">add_circle</span>
          Add block
        </Link>
      </section>

      {/* This week */}
      <section className="mb-10">
        <h3 className="font-headline text-sm font-bold text-on-surface-variant mb-6 uppercase tracking-widest">This week</h3>
        <div className="flex justify-between items-center bg-surface-container-low p-4 rounded-xl">
          {week.map((d, i) => {
            const done = completedDays.includes(i)
            const isToday = i === todayIdx
            return (
              <div key={i} className="flex flex-col items-center gap-2">
                <span className={`font-label text-[10px] font-bold ${isToday ? 'text-primary-container' : 'text-on-surface-variant'}`}>{d}</span>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center
                  ${done ? 'bg-primary-container' : isToday ? 'bg-primary/20 border-2 border-primary-container' : 'border border-outline-variant'}`}>
                  {done && <span className="material-symbols-outlined text-on-primary-container text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>check</span>}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Recent PRs */}
      <section>
        <h3 className="font-headline text-sm font-bold text-on-surface-variant mb-4 uppercase tracking-widest">Recent PRs</h3>
        <div className="flex gap-3 overflow-x-auto pb-4 no-scrollbar">
          {[
            { label: 'Deadlift', value: '405', unit: 'lbs' },
            { label: 'Bench Press', value: '275', unit: 'lbs' },
            { label: '5k Run', value: '22:45', unit: '' },
          ].map(pr => (
            <div key={pr.label} className="flex-shrink-0 bg-surface-container p-4 rounded-xl min-w-[140px]">
              <p className="font-label text-[10px] text-on-surface-variant uppercase tracking-widest mb-1">{pr.label}</p>
              <p className="font-headline text-xl font-black text-tertiary">{pr.value}{pr.unit && <span className="text-xs ml-1">{pr.unit}</span>}</p>
            </div>
          ))}
        </div>
      </section>

      <BottomNav />

      {/* Floating finish button */}
      <div className="fixed bottom-28 right-6 z-50">
        <button className="bg-gradient-to-br from-primary to-primary-container p-4 rounded-full shadow-2xl shadow-primary-container/40 active:scale-95 transition-transform">
          <span className="material-symbols-outlined text-on-primary-container text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>done_all</span>
        </button>
      </div>
    </main>
  )
}
