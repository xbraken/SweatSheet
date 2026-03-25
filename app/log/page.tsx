'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import BottomNav from '@/components/BottomNav'

type SetRow = { id: number; weight: number; reps: number; done: boolean }
type LiftBlock = { id: number; type: 'lift'; exercise: string; sets: SetRow[] }
type CardioBlock = { id: number; type: 'cardio'; activity: string; distance: string; time: string }
type Block = LiftBlock | CardioBlock

export default function LogPage() {
  const router = useRouter()
  const [blocks, setBlocks] = useState<Block[]>([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

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
      return { ...b, sets: [...b.sets, { id: Date.now(), weight: last?.weight ?? 60, reps: last?.reps ?? 8, done: false }] }
    }))
  }

  const updateCardio = (blockId: number, field: 'distance' | 'time', value: string) => {
    setBlocks(prev => prev.map(b => b.type === 'cardio' && b.id === blockId ? { ...b, [field]: value } : b))
  }

  const addLiftBlock = () => {
    setBlocks(prev => [...prev, {
      id: Date.now(), type: 'lift', exercise: 'Exercise name',
      sets: [{ id: Date.now() + 1, weight: 60, reps: 8, done: false }]
    }])
  }

  const addCardioBlock = (activity: string) => {
    setBlocks(prev => [...prev, { id: Date.now(), type: 'cardio', activity, distance: '', time: '' }])
  }

  const finishSession = async () => {
    if (blocks.length === 0) return
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocks }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to save session')
      }
      router.push('/')
    } catch (e) {
      console.error(e)
      setSaveError(e instanceof Error ? e.message : 'Failed to save')
      setSaving(false)
    }
  }

  return (
    <main className="max-w-[390px] mx-auto min-h-screen pb-32 flex flex-col">
      {/* Top bar */}
      <div className="sticky top-0 z-40 px-6 py-5 flex justify-between items-center bg-[#0e0e0e]/80 backdrop-blur-md border-b border-[#201f1f]">
        <span className="font-label text-[#dcc1b8] text-sm uppercase tracking-widest">Session</span>
        <button
          onClick={finishSession}
          disabled={saving || blocks.length === 0}
          className="bg-gradient-to-br from-primary to-primary-container text-[#752805] px-6 py-2.5 rounded-xl font-body font-bold text-sm shadow-xl active:scale-95 transition-all disabled:opacity-30"
        >
          {saving ? 'Saving...' : 'Finish'}
        </button>
      </div>

      {saveError && (
        <div className="mx-4 mt-3 px-4 py-3 bg-red-900/40 border border-red-500/30 rounded-xl text-red-300 text-sm">
          {saveError}
        </div>
      )}

      <div className="flex-grow px-4 pt-6 space-y-6">
        {blocks.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <span className="material-symbols-outlined text-5xl text-[#353534] mb-4">fitness_center</span>
            <p className="font-headline font-bold text-lg text-[#dcc1b8]">Start your session</p>
            <p className="text-sm text-[#a48b83] mt-1">Add a lift or cardio block below</p>
          </div>
        )}

        {blocks.map(block => block.type === 'lift' ? (
          <section key={block.id} className="bg-[#201f1f] rounded-3xl p-5">
            <div className="flex justify-between items-start mb-5">
              <input
                value={block.exercise}
                onChange={e => setBlocks(prev => prev.map(b => b.id === block.id ? { ...b, exercise: e.target.value } : b))}
                onFocus={e => { if (e.target.value === 'Exercise name') e.target.select() }}
                className="font-headline text-xl font-bold text-[#e5e2e1] bg-transparent outline-none flex-1"
                placeholder="Exercise name"
              />
              <button onClick={() => setBlocks(prev => prev.filter(b => b.id !== block.id))}>
                <span className="material-symbols-outlined text-[#a48b83] text-lg">close</span>
              </button>
            </div>

            <div className="space-y-3">
              {block.sets.map((set, i) => {
                const isActive = !set.done && block.sets.findIndex(s => !s.done) === i

                if (set.done) return (
                  <div key={set.id} className="flex items-center gap-3 opacity-40">
                    <span className="w-6 font-headline text-base font-bold text-[#dcc1b8]">{i + 1}</span>
                    <div className="flex-1 flex gap-6">
                      <span className="font-headline font-bold">{set.weight} <span className="text-xs font-normal text-[#a48b83]">kg</span></span>
                      <span className="font-headline font-bold">{set.reps} <span className="text-xs font-normal text-[#a48b83]">reps</span></span>
                    </div>
                    <button onClick={() => toggleSet(block.id, set.id)} className="w-7 h-7 rounded-full bg-[#4bdece] flex items-center justify-center flex-shrink-0">
                      <span className="material-symbols-outlined text-[#003732] text-base" style={{ fontVariationSettings: "'FILL' 1" }}>check</span>
                    </button>
                  </div>
                )

                if (isActive) return (
                  <div key={set.id} className="bg-[#2a2a2a] rounded-2xl p-4 border border-[#ff9066]/20 active-glow">
                    <div className="flex items-center gap-2 mb-4">
                      <span className="font-headline text-xl font-black text-[#ff9066] w-6">{i + 1}</span>
                      <div className="flex-1 flex gap-4">
                        <div className="flex-1">
                          <p className="text-[10px] text-[#a48b83] uppercase tracking-widest mb-2">Weight kg</p>
                          <div className="flex items-center gap-2">
                            <button onClick={() => updateSet(block.id, set.id, 'weight', -2.5)} className="w-8 h-8 rounded-lg bg-[#353534] flex items-center justify-center">
                              <span className="material-symbols-outlined text-sm">remove</span>
                            </button>
                            <span className="font-headline text-2xl font-black w-12 text-center">{set.weight}</span>
                            <button onClick={() => updateSet(block.id, set.id, 'weight', 2.5)} className="w-8 h-8 rounded-lg bg-[#353534] flex items-center justify-center">
                              <span className="material-symbols-outlined text-sm">add</span>
                            </button>
                          </div>
                        </div>
                        <div className="flex-1">
                          <p className="text-[10px] text-[#a48b83] uppercase tracking-widest mb-2">Reps</p>
                          <div className="flex items-center gap-2">
                            <button onClick={() => updateSet(block.id, set.id, 'reps', -1)} className="w-8 h-8 rounded-lg bg-[#353534] flex items-center justify-center">
                              <span className="material-symbols-outlined text-sm">remove</span>
                            </button>
                            <span className="font-headline text-2xl font-black w-10 text-center">{set.reps}</span>
                            <button onClick={() => updateSet(block.id, set.id, 'reps', 1)} className="w-8 h-8 rounded-lg bg-[#353534] flex items-center justify-center">
                              <span className="material-symbols-outlined text-sm">add</span>
                            </button>
                          </div>
                        </div>
                      </div>
                      <button onClick={() => toggleSet(block.id, set.id)} className="w-9 h-9 rounded-full border-2 border-[#ff9066]/40 flex items-center justify-center flex-shrink-0">
                        <span className="material-symbols-outlined text-[#ff9066]">check</span>
                      </button>
                    </div>
                  </div>
                )

                return (
                  <div key={set.id} className="flex items-center gap-3 opacity-30 py-1">
                    <span className="w-6 font-headline text-base font-bold text-[#dcc1b8]">{i + 1}</span>
                    <div className="flex-1 flex gap-6">
                      <span className="font-headline font-bold">{set.weight} <span className="text-xs font-normal text-[#a48b83]">kg</span></span>
                      <span className="font-headline font-bold">{set.reps} <span className="text-xs font-normal text-[#a48b83]">reps</span></span>
                    </div>
                    <div className="w-7 h-7 rounded-full border border-[#56423c]/50 flex-shrink-0" />
                  </div>
                )
              })}
            </div>

            <button onClick={() => addSet(block.id)} className="w-full mt-5 py-3 rounded-xl bg-[#2a2a2a] font-label text-[11px] font-bold uppercase tracking-widest text-[#dcc1b8] hover:text-[#ff9066] transition-colors">
              + Add set
            </button>
          </section>
        ) : (
          <section key={block.id} className="bg-[#201f1f] rounded-3xl p-5">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-[#ff9066]/10 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[#ff9066]">
                    {block.activity === 'Cycling' ? 'directions_bike' : 'directions_run'}
                  </span>
                </div>
                <span className="font-headline text-xl font-bold">{block.activity}</span>
              </div>
              <button onClick={() => setBlocks(prev => prev.filter(b => b.id !== block.id))}>
                <span className="material-symbols-outlined text-[#a48b83] text-lg">close</span>
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-[#2a2a2a] rounded-2xl p-4 text-center">
                <input
                  type="number"
                  value={block.distance}
                  onChange={e => updateCardio(block.id, 'distance', e.target.value)}
                  placeholder="0.0"
                  className="w-full bg-transparent text-center font-headline text-3xl font-black outline-none placeholder:text-[#353534]"
                />
                <span className="block font-label text-[10px] uppercase tracking-widest text-[#a48b83] mt-1">Distance km</span>
              </div>
              <div className="bg-[#2a2a2a] rounded-2xl p-4 text-center">
                <input
                  type="text"
                  value={block.time}
                  onChange={e => updateCardio(block.id, 'time', e.target.value)}
                  placeholder="00:00"
                  className="w-full bg-transparent text-center font-headline text-3xl font-black outline-none placeholder:text-[#353534]"
                />
                <span className="block font-label text-[10px] uppercase tracking-widest text-[#a48b83] mt-1">Duration</span>
              </div>
            </div>
            <Link href="/import" className="w-full py-3 rounded-xl border border-[#56423c]/40 flex items-center justify-center gap-2 text-[#dcc1b8] text-sm hover:bg-[#2a2a2a] transition-colors">
              <span className="material-symbols-outlined text-base">ios_share</span>
              Import from Apple Health
            </Link>
          </section>
        ))}

        {/* Add block buttons */}
        <div className="grid grid-cols-1 gap-3 pt-2 pb-8">
          <button onClick={addLiftBlock} className="flex items-center justify-between p-5 bg-[#201f1f] rounded-2xl active:scale-95 transition-all">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-[#ff9066]">fitness_center</span>
              <span className="font-headline font-bold">Add exercise</span>
            </div>
            <span className="material-symbols-outlined text-[#a48b83]">arrow_forward</span>
          </button>
          <button onClick={() => addCardioBlock('Outdoor run')} className="flex items-center justify-between p-5 bg-[#201f1f] rounded-2xl active:scale-95 transition-all">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-[#4bdece]">directions_run</span>
              <span className="font-headline font-bold">Add run</span>
            </div>
            <span className="material-symbols-outlined text-[#a48b83]">arrow_forward</span>
          </button>
          <button onClick={() => addCardioBlock('Cycling')} className="flex items-center justify-between p-5 bg-[#201f1f] rounded-2xl active:scale-95 transition-all">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-[#4bdece]">directions_bike</span>
              <span className="font-headline font-bold">Add cycle</span>
            </div>
            <span className="material-symbols-outlined text-[#a48b83]">arrow_forward</span>
          </button>
        </div>
      </div>

      <BottomNav />
    </main>
  )
}
