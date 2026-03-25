'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import BottomNav from '@/components/BottomNav'

type SetRow = { id: number; weight: number; reps: number; done: boolean }
type LiftBlock = { id: number; type: 'lift'; exercise: string; sets: SetRow[] }
type CardioBlock = { id: number; type: 'cardio'; activity: string; distance: string; time: string; pace: string }
type Block = LiftBlock | CardioBlock
type ExerciseHint = { exercise: string; last_weight: number; last_reps: number }

const REST_OPTIONS = [
  { label: 'Off', value: 0 },
  { label: '30s', value: 30 },
  { label: '1m', value: 60 },
  { label: '90s', value: 90 },
  { label: '2m', value: 120 },
  { label: '3m', value: 180 },
]

function calcPace(distStr: string, timeStr: string): string {
  const dist = parseFloat(distStr)
  if (!dist || !timeStr) return ''
  const parts = timeStr.split(':').map(Number)
  if (parts.some(isNaN)) return ''
  const totalSecs = parts.length === 3
    ? parts[0] * 3600 + parts[1] * 60 + parts[2]
    : parts[0] * 60 + (parts[1] ?? 0)
  if (!totalSecs) return ''
  const secPerKm = totalSecs / dist
  const m = Math.floor(secPerKm / 60)
  const s = Math.round(secPerKm % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

// ── Rest Timer overlay ────────────────────────────────────────────────────────
function RestTimer({ seconds, onDone }: { seconds: number; onDone: () => void }) {
  const [remaining, setRemaining] = useState(seconds)
  useEffect(() => {
    if (remaining <= 0) { onDone(); return }
    const t = setTimeout(() => setRemaining(r => r - 1), 1000)
    return () => clearTimeout(t)
  }, [remaining, onDone])
  const pct = (remaining / seconds) * 100
  const m = Math.floor(remaining / 60)
  const s = remaining % 60
  return (
    <div className="fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-[390px] md:max-w-lg md:left-[calc(50%+7rem)] z-50 px-4 pt-safe pt-4">
      <div className="bg-[#1a1a1a] border border-[#ff9066]/30 rounded-2xl px-4 py-3 flex items-center gap-3 shadow-xl">
        <div className="relative w-10 h-10 flex-shrink-0">
          <svg className="w-10 h-10 -rotate-90" viewBox="0 0 36 36">
            <circle cx="18" cy="18" r="15" fill="none" stroke="#2a2a2a" strokeWidth="3" />
            <circle cx="18" cy="18" r="15" fill="none" stroke="#ff9066" strokeWidth="3"
              strokeDasharray={`${2 * Math.PI * 15}`}
              strokeDashoffset={`${2 * Math.PI * 15 * (1 - pct / 100)}`}
              strokeLinecap="round" className="transition-all duration-1000" />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-[9px] font-black font-headline text-[#ff9066]">
            {m}:{String(s).padStart(2, '0')}
          </span>
        </div>
        <div className="flex-1">
          <p className="text-xs font-bold text-[#e5e2e1]">Rest</p>
          <p className="text-[10px] text-[#a48b83]">Next set incoming…</p>
        </div>
        <button onClick={onDone} className="text-[10px] font-bold font-label uppercase tracking-widest text-[#a48b83] px-3 py-2 bg-[#2a2a2a] rounded-xl">
          Skip
        </button>
      </div>
    </div>
  )
}

// ── PR Toast ──────────────────────────────────────────────────────────────────
function PrToast({ prs, onDone }: { prs: { exercise: string; weight: number }[]; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3500)
    return () => clearTimeout(t)
  }, [onDone])
  return (
    <div className="fixed bottom-32 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 items-center">
      {prs.map((pr, i) => (
        <div key={i} className="bg-[#ff9066] text-[#752805] px-5 py-3 rounded-2xl shadow-xl flex items-center gap-2 font-headline font-bold text-sm">
          <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>emoji_events</span>
          New PR! {pr.exercise} — {pr.weight} kg
        </div>
      ))}
    </div>
  )
}

// ── Add Block Sheet ───────────────────────────────────────────────────────────
function AddBlockSheet({ onAdd, onClose }: {
  onAdd: (type: 'lift' | 'run' | 'cycle' | 'walk') => void
  onClose: () => void
}) {
  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[390px] md:max-w-lg md:left-[calc(50%+7rem)] md:rounded-2xl md:bottom-4 z-50 bg-[#181818] rounded-t-3xl px-5 pt-5 pb-28 md:pb-6 shadow-2xl">
        <div className="w-10 h-1 bg-[#353534] rounded-full mx-auto mb-6" />
        <p className="text-[10px] font-bold font-label uppercase tracking-widest text-[#a48b83] mb-4">Add to session</p>
        <div className="flex flex-col gap-3">
          <button
            onClick={() => { onAdd('lift'); onClose() }}
            className="flex items-center gap-4 p-5 bg-[#201f1f] rounded-2xl active:scale-95 transition-all text-left"
          >
            <div className="w-11 h-11 rounded-2xl bg-[#ff9066]/10 flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-[#ff9066] text-2xl">fitness_center</span>
            </div>
            <div>
              <p className="font-headline font-bold text-[#e5e2e1]">Lift exercise</p>
              <p className="text-xs text-[#a48b83] mt-0.5">Track sets, weight and reps</p>
            </div>
          </button>
          <button
            onClick={() => { onAdd('run'); onClose() }}
            className="flex items-center gap-4 p-5 bg-[#201f1f] rounded-2xl active:scale-95 transition-all text-left"
          >
            <div className="w-11 h-11 rounded-2xl bg-[#4bdece]/10 flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-[#4bdece] text-2xl">directions_run</span>
            </div>
            <div>
              <p className="font-headline font-bold text-[#e5e2e1]">Run</p>
              <p className="text-xs text-[#a48b83] mt-0.5">Distance, time and auto-pace</p>
            </div>
          </button>
          <button
            onClick={() => { onAdd('cycle'); onClose() }}
            className="flex items-center gap-4 p-5 bg-[#201f1f] rounded-2xl active:scale-95 transition-all text-left"
          >
            <div className="w-11 h-11 rounded-2xl bg-[#4bdece]/10 flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-[#4bdece] text-2xl">directions_bike</span>
            </div>
            <div>
              <p className="font-headline font-bold text-[#e5e2e1]">Cycle</p>
              <p className="text-xs text-[#a48b83] mt-0.5">Distance, time and auto-pace</p>
            </div>
          </button>
          <button
            onClick={() => { onAdd('walk'); onClose() }}
            className="flex items-center gap-4 p-5 bg-[#201f1f] rounded-2xl active:scale-95 transition-all text-left"
          >
            <div className="w-11 h-11 rounded-2xl bg-[#4bdece]/10 flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-[#4bdece] text-2xl">directions_walk</span>
            </div>
            <div>
              <p className="font-headline font-bold text-[#e5e2e1]">Walk</p>
              <p className="text-xs text-[#a48b83] mt-0.5">Distance, time and auto-pace</p>
            </div>
          </button>
        </div>
      </div>
    </>
  )
}

// ── Exercise Autocomplete Input ───────────────────────────────────────────────
function ExerciseInput({
  value, hints, onChange, onSelect,
}: {
  value: string
  hints: ExerciseHint[]
  onChange: (v: string) => void
  onSelect: (h: ExerciseHint) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const filtered = hints.filter(h =>
    h.exercise.toLowerCase().includes(value.toLowerCase()) && h.exercise !== value
  ).slice(0, 6)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} className="relative flex-1">
      <input
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        className="font-headline text-xl font-bold text-[#e5e2e1] bg-transparent outline-none w-full"
        placeholder="Exercise name"
      />
      {open && filtered.length > 0 && (
        <div className="absolute top-full left-0 right-0 bg-[#1e1e1e] border border-[#353534] rounded-xl mt-1 z-20 overflow-hidden shadow-xl">
          {filtered.map(h => (
            <button
              key={h.exercise}
              onMouseDown={e => { e.preventDefault(); onSelect(h); setOpen(false) }}
              className="w-full px-4 py-2.5 flex justify-between items-center hover:bg-[#2a2a2a] transition-colors text-left"
            >
              <span className="font-body text-[#e5e2e1] text-sm">{h.exercise}</span>
              <span className="text-[10px] text-[#a48b83]">{h.last_weight} kg × {h.last_reps}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
export default function LogPage() {
  const router = useRouter()
  const [blocks, setBlocks] = useState<Block[]>([])
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [hints, setHints] = useState<ExerciseHint[]>([])
  const [restTimer, setRestTimer] = useState<number | null>(null)
  const [restDuration, setRestDuration] = useState(90)
  const [showAddSheet, setShowAddSheet] = useState(false)
  const [prs, setPrs] = useState<{ exercise: string; weight: number }[]>([])
  const [showPrs, setShowPrs] = useState(false)
  const [loadingLast, setLoadingLast] = useState(false)

  // Load rest duration from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('ss_rest_duration')
    if (saved) setRestDuration(parseInt(saved))
  }, [])

  const setAndSaveRestDuration = (v: number) => {
    setRestDuration(v)
    localStorage.setItem('ss_rest_duration', String(v))
  }

  // Fetch exercise hints
  useEffect(() => {
    fetch('/api/exercises').then(r => r.json()).then(data => {
      if (Array.isArray(data)) setHints(data)
    }).catch(() => {})
  }, [])

  const updateSet = (blockId: number, setId: number, field: 'weight' | 'reps', delta: number) => {
    setBlocks(prev => prev.map(b => b.type === 'lift' && b.id === blockId
      ? { ...b, sets: b.sets.map(s => s.id === setId ? { ...s, [field]: Math.max(0, +(s[field] + delta).toFixed(1)) } : s) }
      : b))
  }

  const toggleSet = (blockId: number, setId: number) => {
    setBlocks(prev => prev.map(b => {
      if (b.type !== 'lift' || b.id !== blockId) return b
      const updated = b.sets.map(s => s.id === setId ? { ...s, done: !s.done } : s)
      const justDone = updated.find(s => s.id === setId)?.done
      if (justDone && restDuration > 0) setRestTimer(Date.now())
      return { ...b, sets: updated }
    }))
  }

  const addSet = (blockId: number) => {
    setBlocks(prev => prev.map(b => {
      if (b.type !== 'lift' || b.id !== blockId) return b
      const last = b.sets[b.sets.length - 1]
      return { ...b, sets: [...b.sets, { id: Date.now(), weight: last?.weight ?? 60, reps: last?.reps ?? 8, done: false }] }
    }))
  }

  const updateCardio = useCallback((blockId: number, field: 'distance' | 'time', value: string) => {
    setBlocks(prev => prev.map(b => {
      if (b.type !== 'cardio' || b.id !== blockId) return b
      const updated = { ...b, [field]: value }
      updated.pace = calcPace(
        field === 'distance' ? value : b.distance,
        field === 'time' ? value : b.time,
      )
      return updated
    }))
  }, [])

  const handleAddBlock = (type: 'lift' | 'run' | 'cycle' | 'walk') => {
    if (type === 'lift') {
      setBlocks(prev => [...prev, {
        id: Date.now(), type: 'lift', exercise: '',
        sets: [{ id: Date.now() + 1, weight: 60, reps: 8, done: false }],
      }])
    } else {
      const activityMap = { run: 'Outdoor run', cycle: 'Cycling', walk: 'Walking' } as const
      setBlocks(prev => [...prev, {
        id: Date.now(), type: 'cardio',
        activity: activityMap[type],
        distance: '', time: '', pace: '',
      }])
    }
  }

  const repeatLast = async () => {
    setLoadingLast(true)
    try {
      const res = await fetch('/api/sessions/last')
      const data = await res.json()
      if (!data?.blocks) return
      const newBlocks: Block[] = data.blocks.map((b: { type: string; exercise: string; sets: { weight: number; reps: number }[]; activity: string; distance: string; time: string }) => ({
        id: Date.now() + Math.random(),
        ...b,
        ...(b.type === 'lift' ? {
          sets: b.sets.map((s: { weight: number; reps: number }) => ({ id: Date.now() + Math.random(), ...s, done: false })),
        } : { pace: calcPace(b.distance, b.time) }),
      }))
      setBlocks(newBlocks)
    } finally {
      setLoadingLast(false)
    }
  }

  const finishSession = async () => {
    if (blocks.length === 0) return
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocks, notes: notes.trim() || null }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to save session')
      }
      const data = await res.json()
      if (data.prs?.length > 0) {
        setPrs(data.prs)
        setShowPrs(true)
        setTimeout(() => router.push('/'), 3600)
      } else {
        router.push('/')
      }
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Failed to save')
      setSaving(false)
    }
  }

  return (
    <main className="max-w-[390px] md:max-w-3xl mx-auto min-h-screen pb-32 md:pb-12 flex flex-col">
      {restTimer !== null && <RestTimer seconds={restDuration} onDone={() => setRestTimer(null)} />}
      {showPrs && prs.length > 0 && <PrToast prs={prs} onDone={() => setShowPrs(false)} />}
      {showAddSheet && <AddBlockSheet onAdd={handleAddBlock} onClose={() => setShowAddSheet(false)} />}

      {/* Top bar */}
      <div className="sticky top-0 z-40 px-4 py-4 flex flex-col gap-3 bg-[#0e0e0e]/90 backdrop-blur-md border-b border-[#201f1f]">
        <div className="flex justify-between items-center">
          <span className="font-label text-[#dcc1b8] text-sm uppercase tracking-widest">Session</span>
          <button
            onClick={finishSession}
            disabled={saving || blocks.length === 0}
            className="bg-gradient-to-br from-primary to-primary-container text-[#752805] px-6 py-2.5 rounded-xl font-body font-bold text-sm shadow-xl active:scale-95 transition-all disabled:opacity-30"
          >
            {saving ? 'Saving…' : 'Finish'}
          </button>
        </div>
        {/* Rest duration picker */}
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[#a48b83] text-base">timer</span>
          <div className="flex gap-1">
            {REST_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setAndSaveRestDuration(opt.value)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold font-label transition-colors ${
                  restDuration === opt.value
                    ? 'bg-[#ff9066]/20 text-[#ff9066]'
                    : 'text-[#a48b83]/60 hover:text-[#a48b83]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {saveError && (
        <div className="mx-4 mt-3 px-4 py-3 bg-red-900/40 border border-red-500/30 rounded-xl text-red-300 text-sm">
          {saveError}
        </div>
      )}

      <div className="flex-grow px-4 pt-6 space-y-6">
        {blocks.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <span className="material-symbols-outlined text-5xl text-[#353534] mb-4">fitness_center</span>
            <p className="font-headline font-bold text-lg text-[#dcc1b8]">Start your session</p>
            <p className="text-sm text-[#a48b83] mt-1 mb-6">Add a lift or cardio block below</p>
            <button
              onClick={repeatLast}
              disabled={loadingLast}
              className="flex items-center gap-2 px-5 py-3 bg-[#201f1f] rounded-xl text-sm font-bold text-[#dcc1b8] hover:bg-[#2a2a2a] transition-colors disabled:opacity-40"
            >
              <span className="material-symbols-outlined text-base text-[#ff9066]">replay</span>
              {loadingLast ? 'Loading…' : 'Repeat last session'}
            </button>
          </div>
        )}

        {blocks.map(block => block.type === 'lift' ? (
          <section key={block.id} className="bg-[#201f1f] rounded-3xl p-5">
            <div className="flex justify-between items-start mb-5">
              <ExerciseInput
                value={block.exercise}
                hints={hints}
                onChange={v => setBlocks(prev => prev.map(b => b.id === block.id ? { ...b, exercise: v } : b))}
                onSelect={h => setBlocks(prev => prev.map(b => {
                  if (b.id !== block.id || b.type !== 'lift') return b
                  return {
                    ...b,
                    exercise: h.exercise,
                    sets: b.sets.map((s, i) => i === 0 ? { ...s, weight: h.last_weight, reps: h.last_reps } : s),
                  }
                }))}
              />
              <button onClick={() => setBlocks(prev => prev.filter(b => b.id !== block.id))} className="ml-2 flex-shrink-0">
                <span className="material-symbols-outlined text-[#a48b83] text-lg">close</span>
              </button>
            </div>

            <div className="space-y-2">
              {block.sets.map((set, i) => {
                const isActive = !set.done && block.sets.findIndex(s => !s.done) === i

                if (set.done) return (
                  <div key={set.id} className="flex items-center gap-3 opacity-40 px-1">
                    <span className="w-5 font-headline text-sm font-bold text-[#dcc1b8]">{i + 1}</span>
                    <div className="flex-1 flex gap-6">
                      <span className="font-headline font-bold">{set.weight} <span className="text-xs font-normal text-[#a48b83]">kg</span></span>
                      <span className="font-headline font-bold">{set.reps} <span className="text-xs font-normal text-[#a48b83]">reps</span></span>
                    </div>
                    <button onClick={() => toggleSet(block.id, set.id)} className="w-6 h-6 rounded-full bg-[#4bdece] flex items-center justify-center flex-shrink-0">
                      <span className="material-symbols-outlined text-[#003732] text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>check</span>
                    </button>
                  </div>
                )

                if (isActive) return (
                  <div key={set.id} className="bg-[#2a2a2a] rounded-2xl p-4 border border-[#ff9066]/20">
                    <div className="flex items-center gap-1 mb-4">
                      <span className="font-headline text-lg font-black text-[#ff9066] w-6">{i + 1}</span>
                      <div className="flex-1 flex gap-3">
                        <div className="flex-1">
                          <p className="text-[10px] text-[#a48b83] uppercase tracking-widest mb-2">Weight kg</p>
                          <div className="flex items-center gap-2">
                            <button onClick={() => updateSet(block.id, set.id, 'weight', -2.5)} className="w-8 h-8 rounded-lg bg-[#353534] flex items-center justify-center active:scale-90 transition-transform">
                              <span className="material-symbols-outlined text-sm">remove</span>
                            </button>
                            <span className="font-headline text-2xl font-black w-12 text-center">{set.weight}</span>
                            <button onClick={() => updateSet(block.id, set.id, 'weight', 2.5)} className="w-8 h-8 rounded-lg bg-[#353534] flex items-center justify-center active:scale-90 transition-transform">
                              <span className="material-symbols-outlined text-sm">add</span>
                            </button>
                          </div>
                        </div>
                        <div className="flex-1">
                          <p className="text-[10px] text-[#a48b83] uppercase tracking-widest mb-2">Reps</p>
                          <div className="flex items-center gap-2">
                            <button onClick={() => updateSet(block.id, set.id, 'reps', -1)} className="w-8 h-8 rounded-lg bg-[#353534] flex items-center justify-center active:scale-90 transition-transform">
                              <span className="material-symbols-outlined text-sm">remove</span>
                            </button>
                            <span className="font-headline text-2xl font-black w-10 text-center">{set.reps}</span>
                            <button onClick={() => updateSet(block.id, set.id, 'reps', 1)} className="w-8 h-8 rounded-lg bg-[#353534] flex items-center justify-center active:scale-90 transition-transform">
                              <span className="material-symbols-outlined text-sm">add</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                    {/* Full-width log set button */}
                    <button
                      onClick={() => toggleSet(block.id, set.id)}
                      className="w-full py-3.5 bg-[#ff9066] text-[#752805] rounded-xl font-headline font-bold text-sm active:scale-95 transition-transform flex items-center justify-center gap-2"
                    >
                      <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                      Log set
                    </button>
                  </div>
                )

                return (
                  <div key={set.id} className="flex items-center gap-3 opacity-25 px-1 py-0.5">
                    <span className="w-5 font-headline text-sm font-bold text-[#dcc1b8]">{i + 1}</span>
                    <div className="flex-1 flex gap-6">
                      <span className="font-headline font-bold">{set.weight} <span className="text-xs font-normal text-[#a48b83]">kg</span></span>
                      <span className="font-headline font-bold">{set.reps} <span className="text-xs font-normal text-[#a48b83]">reps</span></span>
                    </div>
                    <div className="w-6 h-6 rounded-full border border-[#56423c]/50 flex-shrink-0" />
                  </div>
                )
              })}
            </div>

            <button onClick={() => addSet(block.id)} className="w-full mt-4 py-3 rounded-xl bg-[#2a2a2a] font-label text-[11px] font-bold uppercase tracking-widest text-[#dcc1b8] hover:text-[#ff9066] transition-colors">
              + Add set
            </button>
          </section>
        ) : (
          <section key={block.id} className="bg-[#201f1f] rounded-3xl p-5">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-[#4bdece]/10 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[#4bdece]">
                    {block.activity === 'Cycling' ? 'directions_bike' : 'directions_run'}
                  </span>
                </div>
                <span className="font-headline text-xl font-bold">{block.activity}</span>
              </div>
              <button onClick={() => setBlocks(prev => prev.filter(b => b.id !== block.id))}>
                <span className="material-symbols-outlined text-[#a48b83] text-lg">close</span>
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
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
            {block.pace && (
              <div className="bg-[#2a2a2a]/60 rounded-xl px-4 py-2.5 flex items-center justify-between mb-3">
                <span className="text-[10px] font-bold font-label uppercase tracking-widest text-[#a48b83]">Avg Pace</span>
                <span className="font-headline font-bold text-[#4bdece]">{block.pace} /km</span>
              </div>
            )}
            <Link href="/import" className="w-full py-3 rounded-xl border border-[#56423c]/40 flex items-center justify-center gap-2 text-[#dcc1b8] text-sm hover:bg-[#2a2a2a] transition-colors">
              <span className="material-symbols-outlined text-base">ios_share</span>
              Import from Apple Health
            </Link>
          </section>
        ))}

        {/* Notes */}
        {blocks.length > 0 && (
          <div className="bg-[#201f1f] rounded-2xl p-4">
            <p className="text-[10px] font-bold font-label uppercase tracking-widest text-[#a48b83] mb-2">Session notes</p>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="How did it feel? Any injuries, PRs, observations…"
              rows={3}
              className="w-full bg-transparent text-sm text-[#e5e2e1] placeholder:text-[#353534] outline-none resize-none font-body"
            />
          </div>
        )}

        {/* Single add button */}
        <div className="pb-8">
          <button
            onClick={() => setShowAddSheet(true)}
            className="w-full flex items-center justify-center gap-3 p-5 bg-[#201f1f] rounded-2xl active:scale-95 transition-all border border-dashed border-[#353534] hover:border-[#ff9066]/40 hover:bg-[#201f1f]/80"
          >
            <span className="material-symbols-outlined text-[#ff9066] text-2xl">add_circle</span>
            <span className="font-headline font-bold text-[#dcc1b8]">Add block</span>
          </button>
        </div>
      </div>

      <BottomNav />
    </main>
  )
}
