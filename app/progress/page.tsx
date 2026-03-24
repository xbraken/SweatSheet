'use client'
import { useState } from 'react'
import BottomNav from '@/components/BottomNav'

const EXERCISES = ['Bench Press', 'Squat', 'Deadlift', 'Overhead Press', 'Bicep Curl']

const SESSION_LOG = [
  { date: 'NOV 02', name: 'Push Day A', time: '08:46 AM', sets: 3, duration: '48m', weight: 105, isPR: true },
  { date: 'OCT 28', name: 'Upper Body', time: '08:05 PM', sets: 4, duration: '52m', weight: 100, isPR: false },
  { date: 'OCT 20', name: 'Strength Focus', time: '07:00 AM', sets: 4, duration: '51m', weight: 80, isPR: false },
]

// Simple sparkline points for the chart
const CHART_POINTS = [60, 65, 62, 70, 75, 72, 80, 85, 90, 95, 100, 105]

export default function ProgressPage() {
  const [exercise, setExercise] = useState('Bench Press')
  const [open, setOpen] = useState(false)

  const max = Math.max(...CHART_POINTS)
  const min = Math.min(...CHART_POINTS)
  const pts = CHART_POINTS.map((v, i) => {
    const x = (i / (CHART_POINTS.length - 1)) * 300
    const y = 80 - ((v - min) / (max - min)) * 70
    return `${x},${y}`
  }).join(' ')

  return (
    <main className="pb-24 px-4 pt-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <span className="font-headline font-black text-primary text-xl tracking-tight">SWEATSHEET</span>
        <button className="material-symbols-outlined text-[#adaaaa]">account_circle</button>
      </div>

      {/* Exercise selector */}
      <div className="mb-6 relative">
        <p className="text-[10px] text-[#adaaaa] mb-2">CURRENT EXERCISE</p>
        <button
          onClick={() => setOpen(o => !o)}
          className="w-full bg-[#1a1919] rounded-xl px-4 py-3 flex items-center justify-between"
        >
          <span className="font-headline font-bold text-xl">{exercise}</span>
          <span className="material-symbols-outlined text-[#adaaaa]">expand_more</span>
        </button>
        {open && (
          <div className="absolute top-full left-0 right-0 bg-[#201f1f] rounded-xl mt-1 z-10 border border-[#484847]">
            {EXERCISES.map(ex => (
              <button
                key={ex}
                onClick={() => { setExercise(ex); setOpen(false) }}
                className="w-full px-4 py-3 text-left font-body hover:bg-[#262626] first:rounded-t-xl last:rounded-b-xl"
              >
                {ex}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Chart */}
      <div className="bg-[#1a1919] rounded-xl p-4 mb-6">
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-[10px] text-[#adaaaa]">PERFORMANCE ARC</p>
            <p className="font-headline font-black text-4xl">105 <span className="text-lg font-normal font-body text-[#adaaaa]">KG</span></p>
          </div>
          <div className="flex gap-2">
            <button className="text-xs bg-primary text-black px-2 py-1 rounded font-bold">1M</button>
            <button className="text-xs text-[#adaaaa] px-2 py-1">6M</button>
          </div>
        </div>
        <svg viewBox="0 0 300 90" className="w-full h-24" preserveAspectRatio="none">
          <defs>
            <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ff9066" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#ff9066" stopOpacity="0" />
            </linearGradient>
          </defs>
          <polyline points={pts} fill="none" stroke="#ff9066" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <polygon points={`0,80 ${pts} 300,80`} fill="url(#grad)" />
        </svg>
      </div>

      {/* Session log */}
      <p className="text-xs font-bold text-[#adaaaa] tracking-widest mb-3">SESSION LOG</p>
      <div className="flex flex-col gap-3">
        {SESSION_LOG.map((s, i) => (
          <div key={i} className="bg-[#1a1919] rounded-xl p-4">
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="font-headline font-bold text-lg">{s.date}</p>
                <p className="text-xs text-[#adaaaa]">{s.name} · {s.time}</p>
              </div>
              <div className="text-right">
                {s.isPR && <span className="text-[10px] bg-primary text-black px-2 py-0.5 rounded font-bold mr-1">NEW PR</span>}
                <p className="font-headline font-black text-2xl">{s.weight}kg</p>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex gap-3 text-xs text-[#adaaaa]">
                <span>⊕ {s.sets} SETS</span>
                <span>⏱ {s.duration}</span>
              </div>
              {s.isPR && <button className="text-xs text-primary font-bold">DETAILS →</button>}
            </div>
          </div>
        ))}
      </div>

      <BottomNav />
    </main>
  )
}
