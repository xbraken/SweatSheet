'use client'

// ── Calendar Sheet ────────────────────────────────────────────────────────────
export default function CalendarSheet({ month, workoutDates, today, onSelectDate, onPrev, onNext, onClose }: {
  month: Date; workoutDates: Set<string>; today: string
  onSelectDate: (date: string) => void; onPrev: () => void; onNext: () => void; onClose: () => void
}) {
  const year = month.getFullYear()
  const m = month.getMonth()
  const firstDay = new Date(year, m, 1).getDay()
  const daysInMonth = new Date(year, m + 1, 0).getDate()
  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 max-w-[390px] mx-auto z-50 bg-surface-sheet rounded-t-3xl px-5 pt-5 pb-[calc(env(safe-area-inset-bottom,0px)+24px)] max-h-[92vh] overflow-y-auto animate-slide-up">
        <div className="flex items-center justify-between mb-4">
          <button onClick={onPrev} className="w-8 h-8 flex items-center justify-center">
            <span className="material-symbols-outlined text-outline">chevron_left</span>
          </button>
          <p className="font-headline font-bold text-on-surface">
            {month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
          </p>
          <button onClick={onNext} disabled={month >= new Date(new Date().getFullYear(), new Date().getMonth(), 1)} className="w-8 h-8 flex items-center justify-center disabled:opacity-30">
            <span className="material-symbols-outlined text-outline">chevron_right</span>
          </button>
        </div>
        <div className="grid grid-cols-7 mb-1">
          {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
            <div key={d} className="text-center text-[10px] font-bold font-label text-outline-variant py-1">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-y-0.5">
          {Array.from({ length: firstDay }).map((_, i) => <div key={`p${i}`} />)}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const day = i + 1
            const date = `${year}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
            const hasWorkout = workoutDates.has(date)
            const isToday = date === today
            const isFuture = date > today
            return (
              <button
                key={date}
                disabled={isFuture}
                onClick={() => { onSelectDate(date); onClose() }}
                className={`flex flex-col items-center justify-center py-1.5 rounded-xl text-sm font-bold transition-colors disabled:opacity-20 active:scale-95
                  ${isToday ? 'bg-primary-container/20 text-primary-container' : hasWorkout ? 'text-on-surface hover:bg-surface-container-high' : 'text-surface-container-highest'}`}
              >
                {day}
                {hasWorkout && <div className="w-1 h-1 rounded-full bg-tertiary mt-0.5" />}
              </button>
            )
          })}
        </div>
      </div>
    </>
  )
}
