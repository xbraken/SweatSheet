'use client'
import { useState, useEffect } from 'react'
import BottomNav from '@/components/BottomNav'

type LiftEntry = { date: string; max_weight: number; volume: number; set_count: number }
type CardioEntry = { date: string; activity: string; distance: string | null; duration: string | null }

function formatDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

export default function ProgressPage() {
  const [tab, setTab] = useState<'lifts' | 'cardio'>('lifts')
  const [exercise, setExercise] = useState('')
  const [open, setOpen] = useState(false)
  const [exercises, setExercises] = useState<string[]>([])
  const [liftHistory, setLiftHistory] = useState<LiftEntry[]>([])
  const [cardioHistory, setCardioHistory] = useState<CardioEntry[]>([])
  const [loading, setLoading] = useState(true)

  // Load initial data (exercises + cardio history)
  useEffect(() => {
    fetch('/api/progress')
      .then(r => r.json())
      .then(data => {
        setExercises(data.exercises ?? [])
        setCardioHistory(data.cardioHistory ?? [])
        if (data.exercises?.length > 0) {
          setExercise(data.exercises[0])
        } else {
          setLoading(false)
        }
      })
      .catch(() => setLoading(false))
  }, [])

  // Load lift history when exercise changes
  useEffect(() => {
    if (!exercise) return
    setLoading(true)
    fetch(`/api/progress?exercise=${encodeURIComponent(exercise)}`)
      .then(r => r.json())
      .then(data => {
        setLiftHistory(data.liftHistory ?? [])
        setCardioHistory(data.cardioHistory ?? [])
      })
      .finally(() => setLoading(false))
  }, [exercise])

  // Build chart from lift history (oldest → newest)
  const chartData = [...liftHistory].reverse()
  const pts = chartData.length > 1
    ? chartData.map(e => Number(e.max_weight))
    : [60, 65, 62, 70, 75, 72, 80, 85, 90, 95, 100, 105]

  const max = Math.max(...pts)
  const min = Math.min(...pts)
  const range = max - min || 1
  const svgPts = pts
    .map((v, i) => `${(i / Math.max(pts.length - 1, 1)) * 300},${80 - ((v - min) / range) * 70}`)
    .join(' ')
  const peakWeight = liftHistory.length > 0 ? Math.max(...liftHistory.map(e => Number(e.max_weight))) : null

  return (
    <main className="w-full max-w-[390px] mx-auto px-6 pt-2 pb-32 flex flex-col gap-10">
      {/* Header */}
      <header className="flex justify-between items-center py-4">
        <h1 className="text-2xl font-black text-primary tracking-tighter font-headline">SweatSheet</h1>
        <span className="material-symbols-outlined text-primary text-2xl">account_circle</span>
      </header>

      {/* Tabs */}
      <section className="flex flex-col gap-6">
        <div className="flex gap-8 items-end">
          <button
            onClick={() => setTab('lifts')}
            className={`font-headline text-3xl font-bold tracking-tight transition-colors ${tab === 'lifts' ? 'text-primary-container' : 'text-on-surface/30'}`}
          >
            LIFTS
          </button>
          <button
            onClick={() => setTab('cardio')}
            className={`font-headline text-xl font-bold tracking-tight transition-colors ${tab === 'cardio' ? 'text-primary-container' : 'text-on-surface/30 hover:text-on-surface'}`}
          >
            CARDIO
          </button>
        </div>

        {tab === 'lifts' && exercises.length > 0 && (
          <div className="relative">
            <div
              onClick={() => setOpen(o => !o)}
              className="bg-surface-container-low p-4 flex justify-between items-center rounded-xl cursor-pointer hover:bg-surface-container-high transition-colors"
            >
              <div>
                <p className="text-[10px] font-bold font-label uppercase tracking-widest text-primary-container mb-1">Current exercise</p>
                <h2 className="font-headline text-xl font-bold">{exercise}</h2>
              </div>
              <span className="material-symbols-outlined text-primary">expand_more</span>
            </div>
            {open && (
              <div className="absolute top-full left-0 right-0 bg-surface-container-high rounded-xl mt-1 z-10 border border-outline-variant/20 overflow-hidden">
                {exercises.map(ex => (
                  <button
                    key={ex}
                    onClick={() => { setExercise(ex); setOpen(false) }}
                    className="w-full px-4 py-3 text-left font-body hover:bg-surface-container-highest transition-colors"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'lifts' && !loading && exercises.length === 0 && (
          <p className="text-sm text-on-surface-variant text-center py-4">
            No lift data yet. Log a session to see progress.
          </p>
        )}
      </section>

      {/* Chart */}
      <section className="flex flex-col gap-4">
        <div className="flex justify-between items-baseline">
          <h3 className="font-headline text-sm font-bold text-on-surface-variant">
            {tab === 'lifts' ? 'Weight trend' : 'Cardio history'}
          </h3>
        </div>
        <div className="bg-surface-container rounded-xl p-6 aspect-[4/3] relative overflow-hidden flex flex-col justify-end">
          {tab === 'lifts' && peakWeight !== null && (
            <div className="absolute top-10 right-10 flex flex-col items-end">
              <span className="text-3xl font-black font-headline text-primary-container leading-none">{peakWeight}</span>
              <span className="text-[10px] font-bold font-label uppercase text-on-surface-variant">kg peak</span>
            </div>
          )}
          <svg
            className="w-full h-32 text-[#ff9066] drop-shadow-[0_0_8px_rgba(255,144,102,0.4)]"
            viewBox="0 0 300 100"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ff9066" stopOpacity="0.2" />
                <stop offset="100%" stopColor="#ff9066" stopOpacity="0" />
              </linearGradient>
            </defs>
            <polyline points={svgPts} fill="none" stroke="#ff9066" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            <polygon points={`0,80 ${svgPts} 300,80`} fill="url(#grad)" />
            {chartData.length > 1 && (
              <circle
                cx={(chartData.length - 1) / Math.max(chartData.length - 1, 1) * 300}
                cy={80 - ((pts[pts.length - 1] - min) / range) * 70}
                r="5"
                fill="#ff9066"
              />
            )}
          </svg>
        </div>
      </section>

      {/* Session history */}
      <section className="flex flex-col gap-4">
        <h3 className="font-headline text-sm font-bold text-on-surface-variant uppercase tracking-widest">Session history</h3>
        <div className="flex flex-col gap-[0.35rem]">
          {tab === 'lifts' ? (
            liftHistory.length > 0 ? (
              liftHistory.map((s, i) => (
                <div key={i} className="bg-surface-container p-5 flex justify-between items-center hover:bg-surface-container-high transition-all cursor-pointer rounded-lg">
                  <div className="flex flex-col gap-1">
                    <p className="text-[10px] font-bold font-label text-on-surface-variant uppercase">{formatDate(s.date)}</p>
                    <span className="text-2xl font-black font-headline text-on-surface">
                      {Number(s.max_weight)}{' '}
                      <span className="text-xs font-normal text-on-surface-variant">kg</span>
                    </span>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-bold font-label text-on-surface-variant uppercase mb-1">Volume</p>
                    <p className="font-bold text-on-surface">{Number(s.volume).toFixed(0)} kg</p>
                  </div>
                </div>
              ))
            ) : (
              !loading && <p className="text-sm text-on-surface-variant text-center py-4">No lift history yet for this exercise</p>
            )
          ) : (
            cardioHistory.length > 0 ? (
              cardioHistory.map((s, i) => (
                <div key={i} className="bg-surface-container p-5 flex justify-between items-center hover:bg-surface-container-high transition-all cursor-pointer rounded-lg">
                  <div className="flex flex-col gap-1">
                    <p className="text-[10px] font-bold font-label text-on-surface-variant uppercase">{formatDate(s.date)}</p>
                    <span className="text-2xl font-black font-headline text-on-surface">
                      {s.distance ? `${s.distance} km` : s.duration ?? s.activity}
                    </span>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-bold font-label text-on-surface-variant uppercase mb-1">{s.activity}</p>
                    {s.duration && <p className="font-bold text-on-surface">{s.duration}</p>}
                  </div>
                </div>
              ))
            ) : (
              !loading && <p className="text-sm text-on-surface-variant text-center py-4">No cardio history yet</p>
            )
          )}
          {loading && (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-2 border-primary-container border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>
      </section>

      {/* Motivational strip */}
      <section className="relative h-40 w-full overflow-hidden rounded-xl">
        <div className="absolute inset-0 bg-surface-container-high" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
        <div className="absolute bottom-4 left-4">
          <h4 className="font-headline font-bold text-lg leading-tight">
            Keep pushing.<br /><span className="text-primary-container">Consistency is fuel.</span>
          </h4>
        </div>
      </section>

      <BottomNav />
    </main>
  )
}
