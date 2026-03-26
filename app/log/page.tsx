'use client'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import Link from 'next/link'
import BottomNav from '@/components/BottomNav'
import { EXERCISES, CATEGORIES, type ExerciseCategory } from '@/lib/exercises'

type SetRow = { id: number; weight: number; reps: number; done: boolean }
type ExerciseHint = { exercise: string; last_weight: number; last_reps: number }
type LoggedLift = { block_id: number; exercise: string; set_count: number; max_weight: number; sets: {id: number; weight: number; reps: number}[] }
type LoggedCardio = { block_id: number; cardio_id: number; activity: string; distance: string | null; duration: string | null; pace: string | null }

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

// ── Rest Timer Button ─────────────────────────────────────────────────────────
function RestButton({ seconds, total, onSkip }: { seconds: number; total: number; onSkip: () => void }) {
  const elapsed = ((total - seconds) / total) * 100
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return (
    <button
      onClick={onSkip}
      className="relative w-full py-3.5 rounded-xl font-headline font-bold text-sm overflow-hidden flex items-center justify-center gap-2 text-[#a48b83] border border-[#353534]"
    >
      <span
        className="absolute inset-0 bg-[#ff9066]/20"
        style={{ transform: `scaleX(${elapsed / 100})`, transformOrigin: 'left', transition: 'transform 1s linear' }}
      />
      <span className="material-symbols-outlined text-base text-[#ff9066] relative">timer</span>
      <span className="relative">Resting {m}:{String(s).padStart(2, '0')} — tap to skip</span>
    </button>
  )
}

// ── PR Toast ──────────────────────────────────────────────────────────────────
function PrToast({ exercise, weight, onDone }: { exercise: string; weight: number; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3500)
    return () => clearTimeout(t)
  }, [onDone])
  return (
    <div className="fixed bottom-32 left-1/2 -translate-x-1/2 z-50">
      <div className="bg-[#ff9066] text-[#752805] px-5 py-3 rounded-2xl shadow-xl flex items-center gap-2 font-headline font-bold text-sm">
        <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>emoji_events</span>
        New PR! {exercise} — {weight} kg
      </div>
    </div>
  )
}

// ── Exercise Picker Sheet ─────────────────────────────────────────────────────
function ExercisePicker({
  hints, starred, onSelect, onToggleStar, onClose,
}: {
  hints: ExerciseHint[]
  starred: Set<string>
  onSelect: (name: string, hint?: ExerciseHint) => void
  onToggleStar: (name: string) => void
  onClose: () => void
}) {
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState<ExerciseCategory | null>(null)

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

  const starredList = useMemo(() => filtered.filter(e => starred.has(e.name)), [filtered, starred])
  const unstarredList = useMemo(() => filtered.filter(e => !starred.has(e.name)), [filtered, starred])

  const renderRow = (name: string) => {
    const hint = hintMap.get(name)
    const isStarred = starred.has(name)
    return (
      <div key={name} className="flex items-center">
        <button
          onClick={() => onSelect(name, hint)}
          className="flex-1 flex items-center justify-between py-3 px-4 hover:bg-[#2a2a2a] active:bg-[#353534] transition-colors text-left rounded-xl"
        >
          <span className="font-body text-sm text-[#e5e2e1]">{name}</span>
          {hint && <span className="text-[10px] text-[#a48b83]">{hint.last_weight} kg × {hint.last_reps}</span>}
        </button>
        <button onClick={() => onToggleStar(name)} className="p-2 shrink-0">
          <span
            className={`material-symbols-outlined text-lg ${isStarred ? 'text-[#ff9066]' : 'text-[#56423c]'}`}
            style={{ fontVariationSettings: isStarred ? "'FILL' 1" : "'FILL' 0" }}
          >star</span>
        </button>
      </div>
    )
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 top-12 md:top-0 md:left-56 z-50 bg-[#131313] rounded-t-3xl md:rounded-none flex flex-col overflow-hidden">
        <div className="px-5 pt-5 pb-3 border-b border-[#201f1f]">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-headline text-lg font-bold">Choose exercise</h2>
            <button onClick={onClose}><span className="material-symbols-outlined text-[#a48b83]">close</span></button>
          </div>
          <div className="flex items-center gap-2 bg-[#201f1f] rounded-xl px-3 py-2.5">
            <span className="material-symbols-outlined text-[#a48b83] text-lg">search</span>
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search exercises…"
              className="flex-1 bg-transparent outline-none text-sm text-[#e5e2e1] placeholder:text-[#56423c]"
            />
            {search && <button onClick={() => setSearch('')}><span className="material-symbols-outlined text-[#a48b83] text-sm">close</span></button>}
          </div>
          <div className="flex gap-1.5 mt-3 overflow-x-auto no-scrollbar">
            <button
              onClick={() => setFilterCat(null)}
              className={`px-3 py-1.5 rounded-full text-[10px] font-bold font-label uppercase tracking-widest whitespace-nowrap transition-colors ${!filterCat ? 'bg-[#ff9066] text-[#752805]' : 'bg-[#201f1f] text-[#a48b83]'}`}
            >All</button>
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => setFilterCat(filterCat === cat ? null : cat)}
                className={`px-3 py-1.5 rounded-full text-[10px] font-bold font-label uppercase tracking-widest whitespace-nowrap transition-colors ${filterCat === cat ? 'bg-[#ff9066] text-[#752805]' : 'bg-[#201f1f] text-[#a48b83]'}`}
              >{cat}</button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-32 md:pb-8">
          {starredList.length > 0 && (
            <>
              <p className="text-[10px] font-bold font-label uppercase tracking-widest text-[#ff9066] px-4 pt-4 pb-1">Starred</p>
              {starredList.map(e => renderRow(e.name))}
            </>
          )}
          {unstarredList.length > 0 && (
            <>
              {starredList.length > 0 && <div className="mx-4 my-2 border-t border-[#201f1f]" />}
              {!search && !filterCat
                ? CATEGORIES.filter(cat => unstarredList.some(e => e.category === cat)).map(cat => (
                    <div key={cat}>
                      <p className="text-[10px] font-bold font-label uppercase tracking-widest text-[#a48b83] px-4 pt-4 pb-1">{cat}</p>
                      {unstarredList.filter(e => e.category === cat).map(e => renderRow(e.name))}
                    </div>
                  ))
                : unstarredList.map(e => renderRow(e.name))
              }
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

// ── Cardio type picker sheet ──────────────────────────────────────────────────
function CardioPicker({ onSelect, onClose }: {
  onSelect: (activity: string) => void
  onClose: () => void
}) {
  const options = [
    { label: 'Run', icon: 'directions_run' },
    { label: 'Walking', icon: 'directions_walk' },
    { label: 'Cycling', icon: 'directions_bike' },
    { label: 'Interval run', icon: 'directions_run' },
  ]
  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[390px] md:max-w-lg md:left-[calc(50%+7rem)] md:rounded-2xl md:bottom-4 z-50 bg-[#181818] rounded-t-3xl px-5 pt-5 pb-6 shadow-2xl overflow-y-auto max-h-[70vh]">
        <div className="w-10 h-1 bg-[#353534] rounded-full mx-auto mb-6" />
        <p className="text-[10px] font-bold font-label uppercase tracking-widest text-[#a48b83] mb-4">Select activity</p>
        <div className="flex flex-col gap-3">
          {options.map(o => (
            <button
              key={o.label}
              onClick={() => { onSelect(o.label); onClose() }}
              className="flex items-center gap-4 p-4 bg-[#201f1f] rounded-2xl active:scale-95 transition-all text-left"
            >
              <div className="w-10 h-10 rounded-xl bg-[#4bdece]/10 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[#4bdece]">{o.icon}</span>
              </div>
              <span className="font-headline font-bold text-[#e5e2e1]">{o.label}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ── Calendar Sheet ────────────────────────────────────────────────────────────
function CalendarSheet({ month, workoutDates, today, onSelectDate, onPrev, onNext, onClose }: {
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
      <div className="fixed inset-x-0 bottom-0 max-w-[390px] mx-auto z-50 bg-[#181818] rounded-t-3xl px-5 pt-5 pb-[env(safe-area-inset-bottom,16px)] max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <button onClick={onPrev} className="w-8 h-8 flex items-center justify-center">
            <span className="material-symbols-outlined text-[#a48b83]">chevron_left</span>
          </button>
          <p className="font-headline font-bold text-[#e5e2e1]">
            {month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
          </p>
          <button onClick={onNext} disabled={month >= new Date(new Date().getFullYear(), new Date().getMonth(), 1)} className="w-8 h-8 flex items-center justify-center disabled:opacity-30">
            <span className="material-symbols-outlined text-[#a48b83]">chevron_right</span>
          </button>
        </div>
        <div className="grid grid-cols-7 mb-1">
          {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
            <div key={d} className="text-center text-[10px] font-bold font-label text-[#56423c] py-1">{d}</div>
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
                className={`flex flex-col items-center justify-center py-2.5 rounded-xl text-sm font-bold transition-colors disabled:opacity-20 active:scale-95
                  ${isToday ? 'bg-[#ff9066]/20 text-[#ff9066]' : hasWorkout ? 'text-[#e5e2e1] hover:bg-[#2a2a2a]' : 'text-[#353534]'}`}
              >
                {day}
                {hasWorkout && <div className="w-1 h-1 rounded-full bg-[#4bdece] mt-0.5" />}
              </button>
            )
          })}
        </div>
      </div>
    </>
  )
}

type View =
  | { type: 'list' }
  | { type: 'lift'; exercise: string }
  | { type: 'cardio'; activity: string }

export default function LogPage() {
  const [view, setView] = useState<View>({ type: 'list' })

  // Today's logged exercises
  const [loggedLifts, setLoggedLifts] = useState<LoggedLift[]>([])
  const [loggedCardio, setLoggedCardio] = useState<LoggedCardio[]>([])
  const [loadingToday, setLoadingToday] = useState(true)

  // Exercise picker / cardio picker
  const [showExPicker, setShowExPicker] = useState(false)
  const [showCardioPicker, setShowCardioPicker] = useState(false)

  // Lift logging state
  const [sets, setSets] = useState<SetRow[]>([{ id: 1, weight: 60, reps: 8, done: false }])
  const [restingId, setRestingId] = useState<number | null>(null)
  const [restRemaining, setRestRemaining] = useState(0)
  const [restDuration, setRestDuration] = useState(90)

  // Cardio logging state
  const [cardioDistance, setCardioDistance] = useState('')
  const [cardioTime, setCardioTime] = useState('')
  const cardioPace = useMemo(() => calcPace(cardioDistance, cardioTime), [cardioDistance, cardioTime])

  // Screenshot parsing
  const parseInputRef = useRef<HTMLInputElement>(null)
  const [parseLoading, setParseLoading] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)

  const handleParseImage = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) { setParseError('Please upload an image file'); return }
    setParseLoading(true); setParseError(null)
    try {
      const formData = new FormData()
      formData.append('image', file)
      const res = await fetch('/api/parse-workout', { method: 'POST', body: formData })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      if (data.distance) setCardioDistance(data.distance.replace(/[^\d.]/g, ''))
      if (data.duration) setCardioTime(data.duration)
    } catch (e) {
      setParseError(e instanceof Error ? e.message : 'Failed to parse screenshot')
    } finally {
      setParseLoading(false)
    }
  }, [])

  // Hints + stars
  const [hints, setHints] = useState<ExerciseHint[]>([])
  const [starred, setStarred] = useState<Set<string>>(new Set())

  // Saving
  const [saving, setSaving] = useState(false)
  const [pr, setPr] = useState<{ exercise: string; weight: number } | null>(null)

  // Edit sheets
  const [editLift, setEditLift] = useState<{blockId: number; exercise: string; sets: {id: number; weight: number; reps: number}[]} | null>(null)
  const [editCardio, setEditCardio] = useState<{blockId: number; cardioId: number; activity: string; distance: string; duration: string} | null>(null)
  const [editSaving, setEditSaving] = useState(false)

  // Calendar / history browsing
  const browsedDateRef = useRef<string | null>(null)
  const [browsedDate, setBrowsedDate] = useState<string | null>(null)
  const [calOpen, setCalOpen] = useState(false)
  const [calMonth, setCalMonth] = useState(() => new Date())
  const [workoutDates, setWorkoutDates] = useState<Set<string>>(new Set())

  // Load rest duration from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('ss_rest_duration')
    if (saved) setRestDuration(parseInt(saved))
  }, [])

  const setAndSaveRestDuration = (v: number) => {
    setRestDuration(v)
    localStorage.setItem('ss_rest_duration', String(v))
  }

  // Fetch log for current browsed date (or today)
  const refreshCurrent = useCallback(() => {
    const date = browsedDateRef.current
    const url = date ? `/api/log?date=${date}` : '/api/log'
    setLoadingToday(true)
    fetch(url).then(r => r.json()).then(data => {
      setLoggedLifts(data.lifts ?? [])
      setLoggedCardio(data.cardio ?? [])
      setLoadingToday(false)
    }).catch(() => setLoadingToday(false))
  }, [])

  // Keep ref in sync and reload when date changes
  useEffect(() => {
    browsedDateRef.current = browsedDate
    refreshCurrent()
  }, [browsedDate, refreshCurrent])

  // Load workout dates for calendar dots
  useEffect(() => {
    fetch('/api/calendar').then(r => r.json()).then(d => {
      if (d.dates) setWorkoutDates(new Set(d.dates as string[]))
    }).catch(() => {})
  }, [])

  // Fetch hints + starred
  useEffect(() => {
    fetch('/api/exercises').then(r => r.json()).then(data => {
      if (data.history) setHints(data.history)
      if (data.starred) setStarred(new Set(data.starred))
    }).catch(() => {})
  }, [])

  // Rest countdown
  useEffect(() => {
    if (restingId === null) return
    if (restRemaining <= 0) { setRestingId(null); return }
    const t = setTimeout(() => setRestRemaining(r => r - 1), 1000)
    return () => clearTimeout(t)
  }, [restingId, restRemaining])

  const toggleStar = useCallback((exercise: string) => {
    setStarred(prev => {
      const next = new Set(prev)
      const isStarred = next.has(exercise)
      if (isStarred) {
        next.delete(exercise)
        fetch('/api/exercises/starred', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ exercise }) })
      } else {
        next.add(exercise)
        fetch('/api/exercises/starred', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ exercise }) })
      }
      return next
    })
  }, [])

  // Start logging a lift exercise
  const startLift = (name: string, hint?: ExerciseHint) => {
    setSets([{ id: Date.now(), weight: hint?.last_weight ?? 60, reps: hint?.last_reps ?? 8, done: false }])
    setRestingId(null)
    setView({ type: 'lift', exercise: name })
    setShowExPicker(false)
  }

  // Start logging cardio
  const startCardio = (activity: string) => {
    setCardioDistance('')
    setCardioTime('')
    setParseError(null)
    setView({ type: 'cardio', activity })
  }

  // Toggle set done/undone + auto-queue next
  const toggleSet = (setId: number) => {
    setSets(prev => {
      const updated = prev.map(s => s.id === setId ? { ...s, done: !s.done } : s)
      const justDone = updated.find(s => s.id === setId)?.done
      if (justDone) {
        if (restDuration > 0) { setRestingId(setId); setRestRemaining(restDuration) }
        const loggedSet = updated.find(s => s.id === setId)!
        if (!updated.some(s => !s.done)) {
          updated.push({ id: Date.now(), weight: loggedSet.weight, reps: loggedSet.reps, done: false })
        }
      }
      return updated
    })
  }

  const updateSet = (setId: number, field: 'weight' | 'reps', delta: number) => {
    setSets(prev => prev.map(s => s.id === setId ? { ...s, [field]: Math.max(0, +(s[field] + delta).toFixed(1)) } : s))
  }

  const setSetField = (setId: number, field: 'weight' | 'reps', value: number) => {
    setSets(prev => prev.map(s => s.id === setId ? { ...s, [field]: Math.max(0, +value.toFixed(1)) } : s))
  }

  // Save lift
  const saveLift = async () => {
    if (view.type !== 'lift') return
    const doneSets = sets.filter(s => s.done)
    if (doneSets.length === 0) { setView({ type: 'list' }); return }
    setSaving(true)
    try {
      const res = await fetch('/api/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'lift', exercise: view.exercise, sets }),
      })
      const data = await res.json()
      if (data.isPr) setPr({ exercise: data.exercise, weight: data.weight })
      refreshCurrent()
      setView({ type: 'list' })
    } finally {
      setSaving(false)
    }
  }

  // Save cardio
  const saveCardio = async () => {
    if (view.type !== 'cardio') return
    setSaving(true)
    try {
      const res = await fetch('/api/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'cardio', activity: view.activity, distance: cardioDistance, time: cardioTime, pace: cardioPace }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        alert(`Save failed: ${data.error ?? res.status}`)
        return
      }
      await new Promise<void>(resolve => {
        fetch('/api/log').then(r => r.json()).then(data => {
          setLoggedLifts(data.lifts ?? [])
          setLoggedCardio(data.cardio ?? [])
        }).finally(resolve)
      })
      setView({ type: 'list' })
    } finally {
      setSaving(false)
    }
  }

  const adjustEditLiftSet = (setId: number, field: 'weight' | 'reps', delta: number) => {
    setEditLift(prev => prev ? { ...prev, sets: prev.sets.map(s => s.id === setId ? { ...s, [field]: Math.max(0, +(s[field] + delta).toFixed(1)) } : s) } : prev)
  }

  const saveEditLift = async () => {
    if (!editLift) return
    setEditSaving(true)
    await Promise.all(editLift.sets.map(s =>
      fetch('/api/sets', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: s.id, weight: s.weight, reps: s.reps }) })
    ))
    setEditSaving(false)
    setEditLift(null)
    refreshCurrent()
  }

  const saveEditCardio = async () => {
    if (!editCardio) return
    setEditSaving(true)
    const pace = calcPace(editCardio.distance, editCardio.duration)
    await fetch('/api/log', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cardioId: editCardio.cardioId, distance: editCardio.distance, duration: editCardio.duration, pace }) })
    setEditSaving(false)
    setEditCardio(null)
    refreshCurrent()
  }

  // Delete a logged block
  const deleteBlock = async (blockId: number) => {
    await fetch('/api/log', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blockId }),
    })
    refreshCurrent()
  }

  // ── List view ───────────────────────────────────────────────────────────────
  if (view.type === 'list') {
    return (
      <main className="max-w-[390px] md:max-w-3xl mx-auto min-h-screen pb-32 md:pb-12 flex flex-col px-4 pt-6">
        {pr && <PrToast exercise={pr.exercise} weight={pr.weight} onDone={() => setPr(null)} />}
        {showExPicker && (
          <ExercisePicker
            hints={hints} starred={starred} onToggleStar={toggleStar}
            onSelect={startLift}
            onClose={() => setShowExPicker(false)}
          />
        )}
        {showCardioPicker && (
          <CardioPicker onSelect={startCardio} onClose={() => setShowCardioPicker(false)} />
        )}

        <header className="mb-6 flex items-start justify-between">
          <div>
            <p className="font-label text-[#a48b83] text-xs uppercase tracking-widest mb-1">
              {browsedDate
                ? new Date(browsedDate + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
                : 'Today'}
            </p>
            <h1 className="font-headline text-2xl font-black text-[#e5e2e1]">Log</h1>
          </div>
          <div className="flex items-center gap-2 pt-1">
            {browsedDate && (
              <button onClick={() => { setBrowsedDate(null) }} className="text-xs text-[#a48b83] font-bold font-label flex items-center gap-1 px-2.5 py-1.5 bg-[#201f1f] rounded-lg">
                <span className="material-symbols-outlined text-sm">today</span>
                Back to today
              </button>
            )}
            <button onClick={() => setCalOpen(true)} className="w-9 h-9 flex items-center justify-center rounded-xl bg-[#201f1f]">
              <span className="material-symbols-outlined text-[#a48b83]">calendar_month</span>
            </button>
          </div>
        </header>

        {/* Today's logged exercises */}
        {loadingToday ? (
          <div className="flex justify-center py-12">
            <div className="w-5 h-5 border-2 border-[#ff9066] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (loggedLifts.length === 0 && loggedCardio.length === 0) ? (
          <div className="flex flex-col items-center justify-center py-16 text-center flex-1">
            <span className="material-symbols-outlined text-5xl text-[#353534] mb-4">fitness_center</span>
            <p className="font-headline font-bold text-lg text-[#dcc1b8]">{browsedDate ? 'Rest day' : 'Nothing logged yet'}</p>
            <p className="text-sm text-[#a48b83] mt-1">{browsedDate ? 'No workout recorded for this day' : 'Add a lift or cardio below'}</p>
          </div>
        ) : (
          <div className="space-y-3 mb-6">
            {loggedLifts.map(l => (
              <div key={l.block_id} className="bg-[#201f1f] rounded-2xl px-4 py-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-[#ff9066]">fitness_center</span>
                    <div>
                      <p className="font-headline font-bold text-[#e5e2e1]">{l.exercise}</p>
                      <p className="text-xs text-[#a48b83]">{l.set_count} sets · {l.max_weight} kg peak</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setEditLift({ blockId: l.block_id, exercise: l.exercise, sets: [...l.sets] })}>
                      <span className="material-symbols-outlined text-[#a48b83] text-lg">edit</span>
                    </button>
                    <button onClick={() => deleteBlock(l.block_id)}>
                      <span className="material-symbols-outlined text-[#56423c] text-lg">close</span>
                    </button>
                  </div>
                </div>
                {l.sets.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2.5 ml-9">
                    {l.sets.map((s, i) => (
                      <span key={s.id} className="text-[11px] bg-[#131313] text-[#a48b83] px-2 py-1 rounded-lg font-label">
                        {i + 1}. {s.weight}kg × {s.reps}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {loggedCardio.map(c => (
              <div key={c.block_id} className="bg-[#201f1f] rounded-2xl px-4 py-3.5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-[#4bdece]">
                    {c.activity === 'Cycling' ? 'directions_bike' : c.activity === 'Walking' ? 'directions_walk' : c.activity.toLowerCase().includes('run') ? 'directions_run' : 'directions_run'}
                  </span>
                  <div>
                    <p className="font-headline font-bold text-[#e5e2e1]">{c.activity}</p>
                    <p className="text-xs text-[#a48b83]">
                      {c.distance ? `${c.distance} km` : ''}{c.distance && c.duration ? ' · ' : ''}{c.duration ?? ''}
                      {c.pace ? ` · ${c.pace}/km` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setEditCardio({ blockId: c.block_id, cardioId: c.cardio_id, activity: c.activity, distance: c.distance ?? '', duration: c.duration ?? '' })}>
                    <span className="material-symbols-outlined text-[#a48b83] text-lg">edit</span>
                  </button>
                  <button onClick={() => deleteBlock(c.block_id)}>
                    <span className="material-symbols-outlined text-[#56423c] text-lg">close</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add buttons — only shown for today */}
        {!browsedDate && (
          <div className="flex flex-col gap-3 mt-auto">
            <button
              onClick={() => setShowExPicker(true)}
              className="w-full flex items-center justify-center gap-3 p-4 bg-[#201f1f] rounded-2xl active:scale-95 transition-all border border-dashed border-[#353534] hover:border-[#ff9066]/40"
            >
              <span className="material-symbols-outlined text-[#ff9066]">fitness_center</span>
              <span className="font-headline font-bold text-[#dcc1b8]">Log exercise</span>
            </button>
            <button
              onClick={() => setShowCardioPicker(true)}
              className="w-full flex items-center justify-center gap-3 p-4 bg-[#201f1f] rounded-2xl active:scale-95 transition-all border border-dashed border-[#353534] hover:border-[#4bdece]/40"
            >
              <span className="material-symbols-outlined text-[#4bdece]">directions_run</span>
              <span className="font-headline font-bold text-[#dcc1b8]">Log cardio</span>
            </button>
          </div>
        )}

        {/* Edit lift sheet */}
        {editLift && (
          <>
            <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" onClick={() => setEditLift(null)} />
            <div className="fixed bottom-0 inset-x-0 max-w-[390px] mx-auto z-50 bg-[#181818] rounded-t-3xl px-5 pt-5 pb-12">
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-headline font-bold text-[#e5e2e1]">{editLift.exercise}</h3>
                <button onClick={() => setEditLift(null)}><span className="material-symbols-outlined text-[#a48b83]">close</span></button>
              </div>
              <div className="space-y-3 mb-6">
                {editLift.sets.map((s, i) => (
                  <div key={s.id} className="flex items-center gap-2">
                    <span className="text-xs text-[#a48b83] w-10 shrink-0">Set {i + 1}</span>
                    <div className="flex items-center gap-1.5 flex-1">
                      <button onClick={() => adjustEditLiftSet(s.id, 'weight', -2.5)} className="w-8 h-8 rounded-lg bg-[#353534] flex items-center justify-center active:scale-90 transition-transform">
                        <span className="material-symbols-outlined text-sm">remove</span>
                      </button>
                      <span className="font-headline font-bold text-sm w-16 text-center">{s.weight}<span className="text-[10px] font-normal text-[#a48b83]"> kg</span></span>
                      <button onClick={() => adjustEditLiftSet(s.id, 'weight', 2.5)} className="w-8 h-8 rounded-lg bg-[#353534] flex items-center justify-center active:scale-90 transition-transform">
                        <span className="material-symbols-outlined text-sm">add</span>
                      </button>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => adjustEditLiftSet(s.id, 'reps', -1)} className="w-8 h-8 rounded-lg bg-[#353534] flex items-center justify-center active:scale-90 transition-transform">
                        <span className="material-symbols-outlined text-sm">remove</span>
                      </button>
                      <span className="font-headline font-bold text-sm w-10 text-center">{s.reps}<span className="text-[10px] font-normal text-[#a48b83]"> r</span></span>
                      <button onClick={() => adjustEditLiftSet(s.id, 'reps', 1)} className="w-8 h-8 rounded-lg bg-[#353534] flex items-center justify-center active:scale-90 transition-transform">
                        <span className="material-symbols-outlined text-sm">add</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={saveEditLift} disabled={editSaving} className="w-full py-3.5 bg-[#ff9066] text-[#752805] rounded-xl font-headline font-bold text-sm active:scale-95 transition-transform disabled:opacity-50">
                {editSaving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </>
        )}

        {/* Edit cardio sheet */}
        {editCardio && (
          <>
            <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" onClick={() => setEditCardio(null)} />
            <div className="fixed bottom-0 inset-x-0 max-w-[390px] mx-auto z-50 bg-[#181818] rounded-t-3xl px-5 pt-5 pb-12">
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-headline font-bold text-[#e5e2e1]">{editCardio.activity}</h3>
                <button onClick={() => setEditCardio(null)}><span className="material-symbols-outlined text-[#a48b83]">close</span></button>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="bg-[#201f1f] rounded-2xl p-4 text-center">
                  <input type="number" value={editCardio.distance} onChange={e => setEditCardio(prev => prev ? { ...prev, distance: e.target.value } : prev)} placeholder="0.0" className="w-full bg-transparent text-center font-headline text-3xl font-black outline-none placeholder:text-[#353534]" />
                  <span className="block font-label text-[10px] uppercase tracking-widest text-[#a48b83] mt-1">Distance km</span>
                </div>
                <div className="bg-[#201f1f] rounded-2xl p-4 text-center">
                  <input type="text" value={editCardio.duration} onChange={e => setEditCardio(prev => prev ? { ...prev, duration: e.target.value } : prev)} placeholder="00:00" className="w-full bg-transparent text-center font-headline text-3xl font-black outline-none placeholder:text-[#353534]" />
                  <span className="block font-label text-[10px] uppercase tracking-widest text-[#a48b83] mt-1">Duration</span>
                </div>
              </div>
              {(() => {
                const pace = calcPace(editCardio.distance, editCardio.duration)
                return pace ? (
                  <div className="bg-[#201f1f] rounded-xl px-4 py-2.5 flex items-center justify-between mb-3">
                    <span className="text-[10px] font-bold font-label uppercase tracking-widest text-[#a48b83]">Avg Pace</span>
                    <span className="font-headline font-bold text-[#4bdece]">{pace} /km</span>
                  </div>
                ) : null
              })()}
              <button onClick={saveEditCardio} disabled={editSaving} className="w-full py-3.5 bg-[#4bdece] text-[#003732] rounded-xl font-headline font-bold text-sm active:scale-95 transition-transform disabled:opacity-50">
                {editSaving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </>
        )}

        {/* Calendar sheet */}
        {calOpen && (
          <CalendarSheet
            month={calMonth}
            workoutDates={workoutDates}
            today={new Date().toISOString().split('T')[0]}
            onSelectDate={(date) => {
              const todayStr = new Date().toISOString().split('T')[0]
              setBrowsedDate(date === todayStr ? null : date)
            }}
            onPrev={() => setCalMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
            onNext={() => setCalMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
            onClose={() => setCalOpen(false)}
          />
        )}

        <BottomNav />
      </main>
    )
  }

  // ── Lift logging view ───────────────────────────────────────────────────────
  if (view.type === 'lift') {
    const activeIdx = sets.findIndex(s => !s.done)
    const activeSet = activeIdx !== -1 ? sets[activeIdx] : null

    return (
      <main className="max-w-[390px] md:max-w-3xl mx-auto min-h-screen pb-32 md:pb-12 flex flex-col">
        {/* Header */}
        <div className="sticky top-0 z-40 px-4 py-4 flex flex-col gap-3 bg-[#0e0e0e]/90 backdrop-blur-md border-b border-[#201f1f]">
          <div className="flex items-center justify-between">
            <button onClick={() => setView({ type: 'list' })} className="flex items-center gap-1 text-[#a48b83]">
              <span className="material-symbols-outlined text-lg">arrow_back</span>
              <span className="text-sm font-bold">Back</span>
            </button>
            <h2 className="font-headline font-bold text-[#e5e2e1]">{view.exercise}</h2>
            <div className="w-16" />
          </div>
          {/* Rest timer config */}
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#a48b83] text-base">timer</span>
            <div className="flex gap-1">
              {REST_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setAndSaveRestDuration(opt.value)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold font-label transition-colors ${
                    restDuration === opt.value ? 'bg-[#ff9066]/20 text-[#ff9066]' : 'text-[#a48b83]/60 hover:text-[#a48b83]'
                  }`}
                >{opt.label}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex-grow px-4 pt-6 space-y-2">
          {/* Done sets */}
          {sets.filter(s => s.done).map((set, i) => (
            <div key={set.id} className="flex items-center gap-3 opacity-40 px-1">
              <span className="w-5 font-headline text-sm font-bold text-[#dcc1b8]">{i + 1}</span>
              <div className="flex-1 flex gap-6">
                <span className="font-headline font-bold">{set.weight} <span className="text-xs font-normal text-[#a48b83]">kg</span></span>
                <span className="font-headline font-bold">{set.reps} <span className="text-xs font-normal text-[#a48b83]">reps</span></span>
              </div>
              <button onClick={() => toggleSet(set.id)} className="w-6 h-6 rounded-full bg-[#4bdece] flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-[#003732] text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>check</span>
              </button>
            </div>
          ))}

          {/* Active set */}
          {activeSet && (
            <div className="bg-[#201f1f] rounded-2xl p-4 border border-[#ff9066]/20">
              {restingId !== null ? (
                <RestButton seconds={restRemaining} total={restDuration} onSkip={() => setRestingId(null)} />
              ) : (
                <>
                  <div className="flex items-center gap-1 mb-2">
                    <span className="font-headline text-lg font-black text-[#ff9066] w-6">{sets.filter(s => s.done).length + 1}</span>
                    <div className="flex-1 flex gap-3">
                      <div className="flex-1">
                        <p className="text-[10px] text-[#a48b83] uppercase tracking-widest mb-2">Weight kg</p>
                        <div className="flex items-center gap-2">
                          <button onClick={() => updateSet(activeSet.id, 'weight', -2.5)} className="w-8 h-8 rounded-lg bg-[#353534] flex items-center justify-center active:scale-90 transition-transform">
                            <span className="material-symbols-outlined text-sm">remove</span>
                          </button>
                          <span className="font-headline text-2xl font-black w-16 text-center">{activeSet.weight}</span>
                          <button onClick={() => updateSet(activeSet.id, 'weight', 2.5)} className="w-8 h-8 rounded-lg bg-[#353534] flex items-center justify-center active:scale-90 transition-transform">
                            <span className="material-symbols-outlined text-sm">add</span>
                          </button>
                        </div>
                      </div>
                      <div className="flex-1">
                        <p className="text-[10px] text-[#a48b83] uppercase tracking-widest mb-2">Reps</p>
                        <div className="flex items-center gap-2">
                          <button onClick={() => updateSet(activeSet.id, 'reps', -1)} className="w-8 h-8 rounded-lg bg-[#353534] flex items-center justify-center active:scale-90 transition-transform">
                            <span className="material-symbols-outlined text-sm">remove</span>
                          </button>
                          <span className="font-headline text-2xl font-black w-10 text-center">{activeSet.reps}</span>
                          <button onClick={() => updateSet(activeSet.id, 'reps', 1)} className="w-8 h-8 rounded-lg bg-[#353534] flex items-center justify-center active:scale-90 transition-transform">
                            <span className="material-symbols-outlined text-sm">add</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                  {/* Weight slider */}
                  <div className="mb-4 px-1">
                    <input
                      type="range"
                      min={0}
                      max={300}
                      step={2.5}
                      value={activeSet.weight}
                      onChange={e => setSetField(activeSet.id, 'weight', parseFloat(e.target.value))}
                      className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                      style={{ accentColor: '#ff9066' }}
                    />
                  </div>
                  <button
                    onClick={() => toggleSet(activeSet.id)}
                    className="w-full py-3.5 bg-[#ff9066] text-[#752805] rounded-xl font-headline font-bold text-sm active:scale-95 transition-transform flex items-center justify-center gap-2"
                  >
                    <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                    Log set
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Save */}
        <div className="px-4 pb-8 pt-6">
          <button
            onClick={saveLift}
            disabled={saving || sets.every(s => !s.done)}
            className="w-full py-4 bg-[#201f1f] text-[#e5e2e1] rounded-2xl font-headline font-bold text-base active:scale-95 transition-all disabled:opacity-30 hover:bg-[#2a2a2a]"
          >
            {saving ? 'Saving…' : `Save — ${sets.filter(s => s.done).length} set${sets.filter(s => s.done).length !== 1 ? 's' : ''}`}
          </button>
        </div>

        <BottomNav />
      </main>
    )
  }

  // ── Cardio logging view ─────────────────────────────────────────────────────
  return (
    <main className="max-w-[390px] md:max-w-3xl mx-auto min-h-screen pb-32 md:pb-12 flex flex-col">
      <div className="sticky top-0 z-40 px-4 py-4 bg-[#0e0e0e]/90 backdrop-blur-md border-b border-[#201f1f]">
        <div className="flex items-center justify-between">
          <button onClick={() => setView({ type: 'list' })} className="flex items-center gap-1 text-[#a48b83]">
            <span className="material-symbols-outlined text-lg">arrow_back</span>
            <span className="text-sm font-bold">Back</span>
          </button>
          <h2 className="font-headline font-bold text-[#e5e2e1]">{view.activity}</h2>
          <div className="w-16" />
        </div>
      </div>

      <div className="flex-grow px-4 pt-6">
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="bg-[#201f1f] rounded-2xl p-4 text-center">
            <input
              type="number"
              value={cardioDistance}
              onChange={e => setCardioDistance(e.target.value)}
              placeholder="0.0"
              className="w-full bg-transparent text-center font-headline text-3xl font-black outline-none placeholder:text-[#353534]"
            />
            <span className="block font-label text-[10px] uppercase tracking-widest text-[#a48b83] mt-1">Distance km</span>
          </div>
          <div className="bg-[#201f1f] rounded-2xl p-4 text-center">
            <input
              type="text"
              value={cardioTime}
              onChange={e => setCardioTime(e.target.value)}
              placeholder="00:00"
              className="w-full bg-transparent text-center font-headline text-3xl font-black outline-none placeholder:text-[#353534]"
            />
            <span className="block font-label text-[10px] uppercase tracking-widest text-[#a48b83] mt-1">Duration</span>
          </div>
        </div>
        {cardioPace && (
          <div className="bg-[#201f1f] rounded-xl px-4 py-2.5 flex items-center justify-between mb-3">
            <span className="text-[10px] font-bold font-label uppercase tracking-widest text-[#a48b83]">Avg Pace</span>
            <span className="font-headline font-bold text-[#4bdece]">{cardioPace} /km</span>
          </div>
        )}
        {/* Screenshot scan */}
        <input
          ref={parseInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleParseImage(f); e.target.value = '' }}
        />
        <button
          onClick={() => parseInputRef.current?.click()}
          disabled={parseLoading}
          className="w-full py-3 rounded-xl border border-[#56423c]/40 flex items-center justify-center gap-2 text-[#dcc1b8] text-sm hover:bg-[#201f1f] transition-colors mt-2 active:scale-95 disabled:opacity-50"
        >
          {parseLoading ? (
            <div className="w-4 h-4 border-2 border-[#ff9066] border-t-transparent rounded-full animate-spin" />
          ) : (
            <span className="material-symbols-outlined text-base text-[#ff9066]">photo_camera</span>
          )}
          {parseLoading ? 'Scanning…' : 'Scan run screenshot'}
        </button>
        {parseError && <p className="text-red-400 text-xs mt-2 text-center">{parseError}</p>}
        <Link href="/import" className="w-full py-3 rounded-xl border border-[#56423c]/40 flex items-center justify-center gap-2 text-[#dcc1b8] text-sm hover:bg-[#201f1f] transition-colors mt-2">
          <span className="material-symbols-outlined text-base">ios_share</span>
          Import from Apple Health
        </Link>
      </div>

      <div className="px-4 pb-8 pt-6">
        <button
          onClick={saveCardio}
          disabled={saving}
          className="w-full py-4 bg-[#201f1f] text-[#e5e2e1] rounded-2xl font-headline font-bold text-base active:scale-95 transition-all disabled:opacity-30 hover:bg-[#2a2a2a]"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      <BottomNav />
    </main>
  )
}
