'use client'
import { useState, useEffect } from 'react'
import BottomNav from '@/components/BottomNav'

type Set = { id: number; reps: number; weight: number; done: boolean }

export default function LogPage() {
  const [seconds, setSeconds] = useState(0)
  const [exercise, setExercise] = useState('Bench Press')
  const [sets, setSets] = useState<Set[]>([
    { id: 1, reps: 10, weight: 60, done: true },
    { id: 2, reps: 8, weight: 62.5, done: false },
  ])

  useEffect(() => {
    const t = setInterval(() => setSeconds(s => s + 1), 1000)
    return () => clearInterval(t)
  }, [])

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  const updateSet = (id: number, field: 'reps' | 'weight', delta: number) => {
    setSets(prev => prev.map(s => s.id === id ? { ...s, [field]: Math.max(0, +(s[field] + delta).toFixed(1)) } : s))
  }

  const toggleDone = (id: number) => {
    setSets(prev => prev.map(s => s.id === id ? { ...s, done: !s.done } : s))
  }

  const addSet = () => {
    const last = sets[sets.length - 1]
    setSets(prev => [...prev, { id: Date.now(), reps: last?.reps ?? 8, weight: last?.weight ?? 60, done: false }])
  }

  return (
    <main className="pb-24 px-4 pt-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <span className="font-headline font-black text-primary text-xl tracking-tight">SWEATSHEET</span>
        <button className="material-symbols-outlined text-[#adaaaa]">more_horiz</button>
      </div>

      {/* Timer */}
      <div className="flex items-center gap-2 mb-6">
        <span className="material-symbols-outlined text-primary text-lg">timer</span>
        <span className="font-headline font-black text-5xl">{fmt(seconds)}</span>
        <span className="text-xs text-[#adaaaa] self-end mb-2">SESSION TIME</span>
      </div>

      {/* Exercise name */}
      <div className="flex items-center justify-between bg-[#1a1919] rounded-xl px-4 py-3 mb-4">
        <div>
          <p className="text-[10px] text-[#adaaaa] mb-1">CURRENT EXERCISE</p>
          <input
            value={exercise}
            onChange={e => setExercise(e.target.value)}
            className="font-headline font-bold text-2xl bg-transparent outline-none text-white"
          />
        </div>
        <button className="material-symbols-outlined text-[#adaaaa]">more_vert</button>
      </div>

      {/* Sets */}
      <div className="flex flex-col gap-3 mb-4">
        {sets.map((set, i) => (
          <div key={set.id} className={`rounded-xl p-4 ${set.done ? 'bg-[#1a1919]' : 'bg-[#1a1919] border border-primary'}`}>
            {set.done ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-primary mb-1">COMPLETED</p>
                  <p className="font-body font-medium">{set.reps} reps · {set.weight} kg</p>
                </div>
                <button onClick={() => toggleDone(set.id)} className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                  <span className="material-symbols-outlined text-black text-base">check</span>
                </button>
              </div>
            ) : (
              <div>
                <p className="text-[10px] text-primary mb-3">SET {i + 1} · IN PROGRESS</p>
                <div className="flex gap-4 mb-4">
                  <div className="flex-1">
                    <p className="text-[10px] text-[#adaaaa] mb-2">WEIGHT (KG)</p>
                    <div className="flex items-center gap-3">
                      <button onClick={() => updateSet(set.id, 'weight', -2.5)} className="w-8 h-8 bg-[#262626] rounded-full flex items-center justify-center font-bold">−</button>
                      <span className="font-headline font-black text-2xl w-12 text-center">{set.weight}</span>
                      <button onClick={() => updateSet(set.id, 'weight', 2.5)} className="w-8 h-8 bg-[#262626] rounded-full flex items-center justify-center font-bold">+</button>
                    </div>
                  </div>
                  <div className="flex-1">
                    <p className="text-[10px] text-[#adaaaa] mb-2">REPS</p>
                    <div className="flex items-center gap-3">
                      <button onClick={() => updateSet(set.id, 'reps', -1)} className="w-8 h-8 bg-[#262626] rounded-full flex items-center justify-center font-bold">−</button>
                      <span className="font-headline font-black text-2xl w-12 text-center">{set.reps}</span>
                      <button onClick={() => updateSet(set.id, 'reps', 1)} className="w-8 h-8 bg-[#262626] rounded-full flex items-center justify-center font-bold">+</button>
                    </div>
                  </div>
                </div>
                <button onClick={() => toggleDone(set.id)} className="w-full bg-[#262626] text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2">
                  <span className="material-symbols-outlined text-base">check_circle</span>
                  COMPLETE SET
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add buttons */}
      <button onClick={addSet} className="w-full border border-[#484847] text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 mb-3">
        <span className="material-symbols-outlined text-base">add</span>
        ADD SET
      </button>
      <button className="w-full border border-[#484847] text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 mb-6">
        <span className="material-symbols-outlined text-base">add</span>
        ADD EXERCISE
      </button>

      {/* Finish */}
      <button className="w-full bg-primary text-black font-headline font-bold text-lg py-4 rounded-xl flex items-center justify-center gap-2">
        FINISH WORKOUT
        <span className="material-symbols-outlined text-base">flag</span>
      </button>

      <BottomNav />
    </main>
  )
}
