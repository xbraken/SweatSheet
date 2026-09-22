'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from '@/components/Toast'

/** "2 / 4" ring next to the week strip. Tap to set a weekly session target. */
export default function WeeklyGoalRing({ done, goal }: { done: number; goal: number | null }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const save = async (value: number | null) => {
    setSaving(true)
    try {
      const res = await fetch('/api/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weekly_goal: value }),
      })
      if (!res.ok) throw new Error()
      setOpen(false)
      router.refresh()
    } catch {
      toast('Could not save your goal', { tone: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const size = 36
  const stroke = 4
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const pct = goal ? Math.min(1, done / goal) : 0
  const hit = goal != null && done >= goal

  return (
    <>
      {goal ? (
        <button onClick={() => setOpen(true)} className="flex items-center gap-2 active:scale-95 transition-transform" aria-label="Edit weekly goal">
          <span className={`text-xs font-bold font-label ${hit ? 'text-tertiary' : 'text-outline'}`}>
            {hit ? 'Goal hit!' : `${done} / ${goal} sessions`}
          </span>
          <svg width={size} height={size} className="-rotate-90">
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-surface-container-highest" />
            <circle
              cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round"
              className={hit ? 'stroke-tertiary' : 'stroke-primary-container'}
              strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)}
              style={{ transition: 'stroke-dashoffset 0.6s ease-out' }}
            />
          </svg>
        </button>
      ) : (
        <button onClick={() => setOpen(true)} className="flex items-center gap-1 text-xs font-bold font-label text-primary-container active:scale-95 transition-transform">
          <span className="material-symbols-outlined text-base">flag</span>
          Set a goal
        </button>
      )}

      {open && (
        <>
          <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="fixed inset-x-0 bottom-0 max-w-[390px] mx-auto z-50 bg-surface-sheet rounded-t-3xl px-5 pt-5 pb-[calc(env(safe-area-inset-bottom,0px)+24px)] animate-slide-up">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-headline text-base font-bold">Weekly goal</h3>
              <button onClick={() => setOpen(false)}><span className="material-symbols-outlined text-outline">close</span></button>
            </div>
            <p className="text-sm text-outline mb-5">How many sessions do you want to hit each week?</p>
            <div className="grid grid-cols-7 gap-2 mb-4">
              {[1, 2, 3, 4, 5, 6, 7].map(n => (
                <button
                  key={n}
                  disabled={saving}
                  onClick={() => save(n)}
                  className={`aspect-square rounded-xl font-headline font-black text-lg transition-colors active:scale-90 ${
                    goal === n ? 'bg-primary-container text-on-primary-container' : 'bg-surface-container text-on-surface hover:bg-surface-container-high'
                  }`}
                >{n}</button>
              ))}
            </div>
            {goal != null && (
              <button disabled={saving} onClick={() => save(null)} className="w-full py-3 rounded-xl text-sm font-bold text-outline bg-surface-container">
                Remove goal
              </button>
            )}
          </div>
        </>
      )}
    </>
  )
}
