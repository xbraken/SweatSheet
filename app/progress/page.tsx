'use client'
import { useState } from 'react'
import BottomNav from '@/components/BottomNav'

const EXERCISES = ['Barbell back squat', 'Bench Press', 'Deadlift', 'Overhead Press', 'Bicep Curl']

const LIFT_LOG = [
  { date: 'May 24, 2024', weight: 315, volume: '3,780', isPR: true },
  { date: 'May 21, 2024', weight: 305, volume: '3,660', isPR: false },
  { date: 'May 18, 2024', weight: 295, volume: '3,540', isPR: false },
]

const CARDIO_LOG = [
  { date: 'May 23, 2024', activity: '5k Run', value: '22:45', unit: 'time', isPR: true },
  { date: 'May 20, 2024', activity: '5k Run', value: '23:12', unit: 'time', isPR: false },
  { date: 'May 17, 2024', activity: 'Cycle', value: '18.4', unit: 'km', isPR: false },
]

export default function ProgressPage() {
  const [tab, setTab] = useState<'lifts' | 'cardio'>('lifts')
  const [exercise, setExercise] = useState('Barbell back squat')
  const [open, setOpen] = useState(false)

  const pts = [60, 65, 62, 70, 75, 72, 80, 85, 90, 95, 100, 105]
  const max = Math.max(...pts), min = Math.min(...pts)
  const svgPts = pts.map((v, i) => `${(i / (pts.length - 1)) * 300},${80 - ((v - min) / (max - min)) * 70}`).join(' ')

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
          <button onClick={() => setTab('lifts')} className={`font-headline text-3xl font-bold tracking-tight transition-colors ${tab === 'lifts' ? 'text-primary-container' : 'text-on-surface/30'}`}>
            LIFTS
          </button>
          <button onClick={() => setTab('cardio')} className={`font-headline text-xl font-bold tracking-tight transition-colors ${tab === 'cardio' ? 'text-primary-container' : 'text-on-surface/30 hover:text-on-surface'}`}>
            CARDIO
          </button>
        </div>

        {tab === 'lifts' && (
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
                {EXERCISES.map(ex => (
                  <button key={ex} onClick={() => { setExercise(ex); setOpen(false) }}
                    className="w-full px-4 py-3 text-left font-body hover:bg-surface-container-highest transition-colors">
                    {ex}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Chart */}
      <section className="flex flex-col gap-4">
        <div className="flex justify-between items-baseline">
          <h3 className="font-headline text-sm font-bold text-on-surface-variant">{tab === 'lifts' ? 'Weight volume' : 'Pace trend'}</h3>
          <div className="flex items-center gap-1 text-tertiary">
            <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>trending_up</span>
            <span className="text-xs font-bold font-label">+12% this month</span>
          </div>
        </div>
        <div className="bg-surface-container rounded-xl p-6 aspect-[4/3] relative overflow-hidden flex flex-col justify-end">
          <div className="absolute top-10 right-10 flex flex-col items-end">
            <span className="text-3xl font-black font-headline text-primary-container leading-none">315</span>
            <span className="text-[10px] font-bold font-label uppercase text-on-surface-variant">{tab === 'lifts' ? 'lbs peak' : 'best pace'}</span>
          </div>
          <svg className="w-full h-32 text-[#ff9066] drop-shadow-[0_0_8px_rgba(255,144,102,0.4)]" viewBox="0 0 300 100" preserveAspectRatio="none">
            <defs>
              <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ff9066" stopOpacity="0.2" />
                <stop offset="100%" stopColor="#ff9066" stopOpacity="0" />
              </linearGradient>
            </defs>
            <polyline points={svgPts} fill="none" stroke="#ff9066" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            <polygon points={`0,80 ${svgPts} 300,80`} fill="url(#grad)" />
            <circle cx="300" cy="10" r="5" fill="#ff9066" />
          </svg>
          <div className="flex justify-between mt-4 text-[10px] font-bold font-label text-on-surface-variant uppercase tracking-tighter">
            {['Jan', 'Feb', 'Mar', 'Apr', 'May'].map(m => <span key={m}>{m}</span>)}
          </div>
        </div>
      </section>

      {/* Session log */}
      <section className="flex flex-col gap-4">
        <h3 className="font-headline text-sm font-bold text-on-surface-variant uppercase tracking-widest">Session history</h3>
        <div className="flex flex-col gap-[0.35rem]">
          {(tab === 'lifts' ? LIFT_LOG : CARDIO_LOG).map((s, i) => (
            <div key={i} className="bg-surface-container p-5 flex justify-between items-center hover:bg-surface-container-high transition-all cursor-pointer">
              <div className="flex flex-col gap-1">
                <p className="text-[10px] font-bold font-label text-on-surface-variant uppercase">{s.date}</p>
                <div className="flex items-center gap-3">
                  <span className="text-2xl font-black font-headline text-on-surface">
                    {'weight' in s ? `${s.weight} ` : s.value}
                    <span className="text-xs font-normal text-on-surface-variant">{'weight' in s ? 'lbs' : ''}</span>
                  </span>
                  {s.isPR && (
                    <div className="bg-primary-container/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <span className="material-symbols-outlined text-[12px] text-primary-container" style={{ fontVariationSettings: "'FILL' 1" }}>workspace_premium</span>
                      <span className="text-[9px] font-bold text-primary-container font-label uppercase">New PR</span>
                    </div>
                  )}
                </div>
              </div>
              {'volume' in s && (
                <div className="text-right">
                  <p className="text-[10px] font-bold font-label text-on-surface-variant uppercase mb-1">Volume</p>
                  <p className="font-bold text-on-surface">{s.volume} lbs</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Motivational image strip */}
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
