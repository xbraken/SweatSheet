'use client'
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import BottomNav from '@/components/BottomNav'
import { EXERCISES, CATEGORIES, type ExerciseCategory } from '@/lib/exercises'

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

// ── Exercise Picker Sheet ─────────────────────────────────────────────────────
function ExercisePicker({
  hints,
  starred,
  onSelect,
  onToggleStar,
  onClose,
}: {
  hints: ExerciseHint[]
  starred: Set<string>
  onSelect: (name: string, hint?: ExerciseHint) => void
  onToggleStar: (name: string) => void
  onClose: () => void
}) {
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState<ExerciseCategory | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const hintMap = useMemo(() => {
    const m = new Map<string, ExerciseHint>()
    for (const h of hints) m.set(h.exercise, h)
    return m
  }, [hints])

  const q = search.toLowerCase()
  const filtered = useMemo(() => {
    let list = EXERCISES
    if (filterCat) list = list.filter(e => e.category === filterCat)
    if (q) list = list.filter(e => e.name.toLowerCase().includes(q))
    return list
  }, [q, filterCat])

  const starredExercises = useMemo(
    () => filtered.filter(e => starred.has(e.name)),
    [filtered, starred]
  )
  const unstarredExercises = useMemo(
    () => filtered.filter(e => !starred.has(e.name)),
    [filtered, starred]
  )

  const renderRow = (name: string) => {
    const hint = hintMap.get(name)
    const isStarred = starred.has(name)
    return (
      <div key={name} className="flex items-center">
        <button
          onClick={() => onSelect(name, hint)}
          className="flex-1 flex items-center justify-between py-3 px-4 hover:bg-[#2a2a2a] active:bg-[#353534] transition-colors text-left rounded-xl"
        >
          <div>
            <span className="font-body text-sm text-[#e5e2e1]">{name}</span>
            {hint && (
              <span className="ml-2 text-[10px] text-[#a48b83]">
                {hint.last_weight} kg × {hint.last_reps}
              </span>
            )}
          </div>
        </button>
        <button
          onClick={() => onToggleStar(name)}
          className="p-2 shrink-0"
        >
          <span
            className={`material-symbols-outlined text-lg ${isStarred ? 'text-[#ff9066]' : 'text-[#56423c]'}`}
            style={{ fontVariationSettings: isStarred ? "'FILL' 1" : "'FILL' 0" }}
          >
            star
          </span>
        </button>
      </div>
    )
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 top-12 md:top-0 md:left-56 z-50 bg-[#131313] rounded-t-3xl md:rounded-none flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b border-[#201f1f]">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-headline text-lg font-bold">Choose exercise</h2>
            <button onClick={onClose}>
              <span className="material-symbols-outlined text-[#a48b83]">close</span>
            </button>
          </div>
          {/* Search */}
          <div className="flex items-center gap-2 bg-[#201f1f] rounded-xl px-3 py-2.5">
            <span className="material-symbols-outlined text-[#a48b83] text-lg">search</span>
            <input
              ref={inputRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search exercises…"
              className="flex-1 bg-transparent outline-none text-sm text-[#e5e2e1] placeholder:text-[#56423c]"
            />
            {search && (
              <button onClick={() => setSearch('')}>
                <span className="material-symbols-outlined text-[#a48b83] text-sm">close</span>
              </button>
            )}
          </div>
          {/* Category filter */}
          <div className="flex gap-1.5 mt-3 overflow-x-auto no-scrollbar">
            <button
              onClick={() => setFilterCat(null)}
              className={`px-3 py-1.5 rounded-full text-[10px] font-bold font-label uppercase tracking-widest whitespace-nowrap transition-colors ${
                !filterCat ? 'bg-[#ff9066] text-[#752805]' : 'bg-[#201f1f] text-[#a48b83]'
              }`}
            >
              All
            </button>
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => setFilterCat(filterCat === cat ? null : cat)}
                className={`px-3 py-1.5 rounded-full text-[10px] font-bold font-label uppercase tracking-widest whitespace-nowrap transition-colors ${
                  filterCat === cat ? 'bg-[#ff9066] text-[#752805]' : 'bg-[#201f1f] text-[#a48b83]'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-2 pb-32 md:pb-8">
          {starredExercises.length > 0 && (
            <>
              <p className="text-[10px] font-bold font-label uppercase tracking-widest text-[#ff9066] px-4 pt-4 pb-1">
                Starred
              </p>
              {starredExercises.map(e => renderRow(e.name))}
            </>
          )}
          {unstarredExercises.length > 0 && (
            <>
              {starredExercises.length > 0 && (
                <div className="mx-4 my-2 border-t border-[#201f1f]" />
              )}
              {!search && !filterCat ? (
                // Group by category when no search/filter
                CATEGORIES.filter(cat => unstarredExercises.some(e => e.category === cat)).map(cat => (
                  <div key={cat}>
                    <p className="text-[10px] font-bold font-label uppercase tracking-widest text-[#a48b83] px-4 pt-4 pb-1">
                      {cat}
                    </p>
                    {unstarredExercises.filter(e => e.category === cat).map(e => renderRow(e.name))}
                  </div>
                ))
              ) : (
                unstarredExercises.map(e => renderRow(e.name))
              )}
            </>
          )}
          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <span className="material-symbols-outlined text-4xl text-[#353534] mb-3">search_off</span>
              <p className="text-sm text-[#a48b83]">No exercises match &ldquo;{search}&rdquo;</p>
            </div>
          )}
        </div>
      </div>
    </>
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
  const [starred, setStarred] = useState<Set<string>>(new Set())
  const [pickerBlockId, setPickerBlockId] = useState<number | null>(null)

  // Load rest duration from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('ss_rest_duration')
    if (saved) setRestDuration(parseInt(saved))
  }, [])

  const setAndSaveRestDuration = (v: number) => {
    setRestDuration(v)
    localStorage.setItem('ss_rest_duration', String(v))
  }

  // Fetch exercise hints + starred
  useEffect(() => {
    fetch('/api/exercises').then(r => r.json()).then(data => {
      if (data.history && Array.isArray(data.history)) setHints(data.history)
      if (data.starred && Array.isArray(data.starred)) setStarred(new Set(data.starred))
    }).catch(() => {})
  }, [])

  const toggleStar = useCallback((exercise: string) => {
    setStarred(prev => {
      const next = new Set(prev)
      const isStarred = next.has(exercise)
      if (isStarred) {
        next.delete(exercise)
        fetch('/api/exercises/starred', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ exercise }),
        })
      } else {
        next.add(exercise)
        fetch('/api/exercises/starred', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ exercise }),
        })
      }
      return next
    })
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
      const id = Date.now()
      setBlocks(prev => [...prev, {
        id, type: 'lift', exercise: '',
        sets: [{ id: id + 1, weight: 60, reps: 8, done: false }],
      }])
      setPickerBlockId(id) // immediately open picker
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
      {pickerBlockId !== null && (
        <ExercisePicker
          hints={hints}
          starred={starred}
          onToggleStar={toggleStar}
          onSelect={(name, hint) => {
            setBlocks(prev => prev.map(b => {
              if (b.id !== pickerBlockId || b.type !== 'lift') return b
              return {
                ...b,
                exercise: name,
                sets: hint
                  ? b.sets.map((s, i) => i === 0 ? { ...s, weight: hint.last_weight, reps: hint.last_reps } : s)
                  : b.sets,
              }
            }))
            setPickerBlockId(null)
          }}
          onClose={() => setPickerBlockId(null)}
        />
      )}

      {/* Top bar */}
      <div className="sticky top-0 z-40 px-4 py-4 flex flex-col gap-3 bg-[#0e0e0e]/90 backdrop-blur-md border-b border-[#201f1f]">
        <div className="flex justify-between items-center">
          <span className="font-label text-[#dcc1b8] text-sm uppercase tracking-widest">Session</span>
          <button
            onClick={finishSession}
            disabled={saving || blocks.length === 0 || blocks.some(b => b.type === 'lift' && !b.exercise)}
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
              {(() => {
                const anyDone = block.sets.some(s => s.done)
                return anyDone ? (
                  // Locked once sets are logged
                  <h3 className="font-headline text-xl font-bold text-[#e5e2e1] flex-1">{block.exercise}</h3>
                ) : (
                  <button onClick={() => setPickerBlockId(block.id)} className="flex-1 text-left">
                    {block.exercise ? (
                      <div className="flex items-center gap-2">
                        <h3 className="font-headline text-xl font-bold text-[#e5e2e1]">{block.exercise}</h3>
                        <span className="material-symbols-outlined text-[#a48b83] text-base">edit</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 py-2 px-3 bg-[#ff9066]/10 rounded-xl border border-[#ff9066]/30">
                        <span className="material-symbols-outlined text-[#ff9066] text-base">fitness_center</span>
                        <span className="font-headline text-base font-bold text-[#ff9066]">Pick exercise</span>
                      </div>
                    )}
                  </button>
                )
              })()}
              <button onClick={() => setBlocks(prev => prev.filter(b => b.id !== block.id))} className="ml-2 flex-shrink-0">
                <span className="material-symbols-outlined text-[#a48b83] text-lg">close</span>
              </button>
            </div>

            {/* Don't show sets until exercise is chosen */}
            {!block.exercise && (
              <p className="text-xs text-[#a48b83] text-center py-4">Pick an exercise above to start logging sets</p>
            )}

            {block.exercise && <div className="space-y-2">
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
            </div>}

            {block.exercise && (
              <button onClick={() => addSet(block.id)} className="w-full mt-4 py-3 rounded-xl bg-[#2a2a2a] font-label text-[11px] font-bold uppercase tracking-widest text-[#dcc1b8] hover:text-[#ff9066] transition-colors">
                + Add set
              </button>
            )}
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
