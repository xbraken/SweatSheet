'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import BottomNav from '@/components/BottomNav'

type SetRow = { id: number; weight: number; reps: number; done: boolean }
type LiftBlock = { id: number; type: 'lift'; exercise: string; sets: SetRow[] }
type CardioBlock = { id: number; type: 'cardio'; activity: string; distance: string; time: string }
type Block = LiftBlock | CardioBlock

export default function LogPage() {
  const router = useRouter()
  const [seconds, setSeconds] = useState(0)
  const [saving, setSaving] = useState(false)
  const [blocks, setBlocks] = useState<Block[]>([
    {
      id: 1, type: 'lift', exercise: 'Barbell back squat',
      sets: [
        { id: 1, weight: 225, reps: 5, done: true },
        { id: 2, weight: 225, reps: 5, done: false },
        { id: 3, weight: 225, reps: 5, done: false },
      ]
    },
    { id: 2, type: 'cardio', activity: 'Outdoor run', distance: '', time: '' },
  ])

  useEffect(() => {
    const t = setInterval(() => setSeconds(s => s + 1), 1000)
    return () => clearInterval(t)
  }, [])

  const fmt = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  const updateSet = (blockId: number, setId: number, field: 'weight' | 'reps', delta: number) => {
    setBlocks(prev => prev.map(b => b.type === 'lift' && b.id === blockId
      ? { ...b, sets: b.sets.map(s => s.id === setId ? { ...s, [field]: Math.max(0, +(s[field] + delta).toFixed(1)) } : s) }
      : b))
  }

  const toggleSet = (blockId: number, setId: number) => {
    setBlocks(prev => prev.map(b => b.type === 'lift' && b.id === blockId
      ? { ...b, sets: b.sets.map(s => s.id === setId ? { ...s, done: !s.done } : s) }
      : b))
  }

  const addSet = (blockId: number) => {
    setBlocks(prev => prev.map(b => {
      if (b.type !== 'lift' || b.id !== blockId) return b
      const last = b.sets[b.sets.length - 1]
      return { ...b, sets: [...b.sets, { id: Date.now(), weight: last?.weight ?? 100, reps: last?.reps ?? 8, done: false }] }
    }))
  }

  const updateCardio = (blockId: number, field: 'distance' | 'time', value: string) => {
    setBlocks(prev => prev.map(b => b.type === 'cardio' && b.id === blockId ? { ...b, [field]: value } : b))
  }

  const addLiftBlock = () => {
    setBlocks(prev => [...prev, { id: Date.now(), type: 'lift', exercise: 'New exercise', sets: [{ id: Date.now(), weight: 60, reps: 8, done: false }] }])
  }

  const addCardioBlock = () => {
    setBlocks(prev => [...prev, { id: Date.now(), type: 'cardio', activity: 'Outdoor run', distance: '', time: '' }])
  }

  const finishSession = async () => {
    setSaving(true)
    try {
      await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocks }),
      })
      router.push('/')
    } catch (e) {
      console.error(e)
      setSaving(false)
    }
  }

  return (
    <main className="max-w-[390px] mx-auto min-h-screen pb-32 flex flex-col">
      {/* Sticky timer bar */}
      <div className="sticky top-0 z-40 px-6 py-8 flex justify-between items-center bg-surface-container-lowest/80 backdrop-blur-md">
        <div className="flex flex-col">
          <span className="font-label text-on-surface-variant text-[10px] uppercase tracking-[0.2em]">Active session</span>
          <span className="font-headline text-3xl font-black text-on-surface tracking-tight">{fmt(seconds)}</span>
        </div>
        <button
          onClick={finishSession}
          disabled={saving}
          className="bg-gradient-to-br from-primary to-primary-container text-on-primary-container px-6 py-2.5 rounded-xl font-body font-bold text-sm shadow-xl active:scale-95 transition-all disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Finish'}
        </button>
      </div>

      {/* Blocks */}
      <div className="flex-grow px-4 space-y-10">
        {blocks.map(block => block.type === 'lift' ? (
          <section key={block.id} className="bg-surface-container rounded-3xl p-6">
            <div className="flex justify-between items-start mb-6">
              <div>
                <input
                  value={block.exercise}
                  onChange={e => setBlocks(prev => prev.map(b => b.id === block.id ? { ...b, exercise: e.target.value } : b))}
                  className="font-headline text-xl font-bold text-on-surface bg-transparent outline-none w-full"
                />
                <p className="text-on-surface-variant font-body text-sm">Compound · Quads</p>
              </div>
              <span className="material-symbols-outlined text-on-surface-variant/40">more_vert</span>
            </div>

            <div className="space-y-4">
              {block.sets.map((set, i) => {
                const isActive = !set.done && block.sets.findIndex(s => !s.done) === i
                if (set.done) return (
                  <div key={set.id} className="flex items-center justify-between opacity-40">
                    <span className="w-8 font-headline text-lg font-bold">{i + 1}</span>
                    <div className="flex-grow flex justify-center space-x-8">
                      <div className="text-center">
                        <span className="block font-headline text-lg font-bold">{set.weight}</span>
                        <span className="block font-label text-[10px] uppercase tracking-widest">lbs</span>
                      </div>
                      <div className="text-center">
                        <span className="block font-headline text-lg font-bold">{set.reps}</span>
                        <span className="block font-label text-[10px] uppercase tracking-widest">reps</span>
                      </div>
                    </div>
                    <button onClick={() => toggleSet(block.id, set.id)} className="w-8 h-8 rounded-full bg-tertiary flex items-center justify-center">
                      <span className="material-symbols-outlined text-on-tertiary text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>check</span>
                    </button>
                  </div>
                )
                if (isActive) return (
                  <div key={set.id} className="bg-surface-container-high rounded-2xl p-4 border border-primary-container/20 active-glow">
                    <div className="flex items-center justify-between mb-4">
                      <span className="w-8 font-headline text-2xl font-black text-primary-container">{i + 1}</span>
                      <div className="flex-grow flex justify-center space-x-12">
                        <div className="text-center">
                          <div className="flex items-center justify-center space-x-2">
                            <button onClick={() => updateSet(block.id, set.id, 'weight', -2.5)} className="w-8 h-8 rounded-lg bg-surface-container-highest flex items-center justify-center active:bg-primary-container">
                              <span className="material-symbols-outlined text-sm">remove</span>
                            </button>
                            <span className="w-16 text-center font-headline text-3xl font-black">{set.weight}</span>
                            <button onClick={() => updateSet(block.id, set.id, 'weight', 2.5)} className="w-8 h-8 rounded-lg bg-surface-container-highest flex items-center justify-center active:bg-primary-container">
                              <span className="material-symbols-outlined text-sm">add</span>
                            </button>
                          </div>
                          <span className="block font-label text-[10px] uppercase tracking-widest text-on-surface-variant mt-1">Weight lbs</span>
                        </div>
                        <div className="text-center">
                          <div className="flex items-center justify-center space-x-2">
                            <button onClick={() => updateSet(block.id, set.id, 'reps', -1)} className="w-8 h-8 rounded-lg bg-surface-container-highest flex items-center justify-center active:bg-primary-container">
                              <span className="material-symbols-outlined text-sm">remove</span>
                            </button>
                            <span className="w-12 text-center font-headline text-3xl font-black">{set.reps}</span>
                            <button onClick={() => updateSet(block.id, set.id, 'reps', 1)} className="w-8 h-8 rounded-lg bg-surface-container-highest flex items-center justify-center active:bg-primary-container">
                              <span className="material-symbols-outlined text-sm">add</span>
                            </button>
                          </div>
                          <span className="block font-label text-[10px] uppercase tracking-widest text-on-surface-variant mt-1">Reps</span>
                        </div>
                      </div>
                      <button onClick={() => toggleSet(block.id, set.id)} className="w-10 h-10 rounded-full border-2 border-primary-container/30 flex items-center justify-center">
                        <span className="material-symbols-outlined text-primary-container">check</span>
                      </button>
                    </div>
                  </div>
                )
                return (
                  <div key={set.id} className="flex items-center justify-between py-2 opacity-40">
                    <span className="w-8 font-headline text-lg font-bold text-on-surface-variant">{i + 1}</span>
                    <div className="flex-grow flex justify-center space-x-8 text-on-surface-variant">
                      <div className="text-center">
                        <span className="block font-headline text-lg font-bold">{set.weight}</span>
                        <span className="block font-label text-[10px] uppercase tracking-widest">lbs</span>
                      </div>
                      <div className="text-center">
                        <span className="block font-headline text-lg font-bold">{set.reps}</span>
                        <span className="block font-label text-[10px] uppercase tracking-widest">reps</span>
                      </div>
                    </div>
                    <div className="w-8 h-8 rounded-full border border-outline-variant/30" />
                  </div>
                )
              })}
            </div>
            <button onClick={() => addSet(block.id)} className="w-full mt-6 py-3 rounded-xl bg-surface-container-high font-label text-[11px] font-bold uppercase tracking-widest text-on-surface-variant hover:text-primary transition-colors">
              + Add set
            </button>
          </section>
        ) : (
          <section key={block.id} className="bg-surface-container rounded-3xl p-6">
            <div className="flex items-center space-x-3 mb-8">
              <div className="w-10 h-10 rounded-full bg-primary-container/10 flex items-center justify-center">
                <span className="material-symbols-outlined text-primary-container">directions_run</span>
              </div>
              <h2 className="font-headline text-xl font-bold text-on-surface">{block.activity}</h2>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-surface-container-high rounded-2xl p-5 text-center">
                <input
                  type="number"
                  value={block.distance}
                  onChange={e => updateCardio(block.id, 'distance', e.target.value)}
                  placeholder="0.0"
                  className="w-full bg-transparent border-none text-center font-headline text-4xl font-black p-0 focus:ring-0 placeholder:text-surface-container-highest outline-none"
                />
                <span className="block font-label text-[10px] uppercase tracking-widest text-on-surface-variant mt-2">Distance km</span>
              </div>
              <div className="bg-surface-container-high rounded-2xl p-5 text-center">
                <input
                  type="text"
                  value={block.time}
                  onChange={e => updateCardio(block.id, 'time', e.target.value)}
                  placeholder="00:00"
                  className="w-full bg-transparent border-none text-center font-headline text-4xl font-black p-0 focus:ring-0 placeholder:text-surface-container-highest outline-none"
                />
                <span className="block font-label text-[10px] uppercase tracking-widest text-on-surface-variant mt-2">Time</span>
              </div>
            </div>
            <button className="w-full py-4 rounded-xl border border-outline-variant/20 flex items-center justify-center space-x-2 text-on-surface-variant font-body text-sm hover:bg-surface-container-highest transition-colors">
              <span className="material-symbols-outlined text-lg">watch</span>
              <span>Import from Apple later</span>
            </button>
          </section>
        ))}

        {/* Add block buttons */}
        <div className="grid grid-cols-1 gap-4 pt-4 pb-8">
          <button onClick={addLiftBlock} className="flex items-center justify-between p-6 bg-surface-container-high rounded-3xl active:scale-95 transition-all">
            <div className="flex items-center space-x-4">
              <span className="material-symbols-outlined text-primary-container">fitness_center</span>
              <span className="font-headline font-bold text-on-surface">Add exercise</span>
            </div>
            <span className="material-symbols-outlined text-on-surface-variant">arrow_forward</span>
          </button>
          <button onClick={addCardioBlock} className="flex items-center justify-between p-6 bg-surface-container-high rounded-3xl active:scale-95 transition-all">
            <div className="flex items-center space-x-4">
              <span className="material-symbols-outlined text-tertiary">speed</span>
              <span className="font-headline font-bold text-on-surface">Add cardio block</span>
            </div>
            <span className="material-symbols-outlined text-on-surface-variant">arrow_forward</span>
          </button>
        </div>
      </div>

      <BottomNav />
    </main>
  )
}
