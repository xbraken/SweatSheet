'use client'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import Link from 'next/link'
import BottomNav from '@/components/BottomNav'
import Onboarding, { shouldShowOnboarding } from '@/components/Onboarding'
import { EXERCISES, CATEGORIES, type ExerciseCategory, type ExerciseType } from '@/lib/exercises'

type SetRow = { id: number; weight: number; reps: number; duration_secs: number; done: boolean }
type ExerciseHint = { exercise: string; last_weight: number; last_reps: number }
type ExercisePR = { exercise: string; pr_weight: number; pr_reps: number; pr_duration: number | null; pr_volume: number; pr_reps_total: number; pr_duration_total: number | null }
type LoggedLift = { block_id: number; exercise: string; set_count: number; max_weight: number; max_duration: number | null; sets: {id: number; weight: number; reps: number; duration_secs: number | null}[] }
type LoggedCardio = { block_id: number; cardio_id: number; activity: string; distance: string | null; duration: string | null; pace: string | null }
type Routine = { id: number; name: string; exercises: string[] }
type PendingBlock = { exercise: string; exerciseType: 'weights' | 'bodyweight' | 'timed'; sets: SetRow[] }
type ActiveRoutine = { id: number; name: string; exercises: string[]; currentIndex: number; pending: Record<number, PendingBlock> }

// ── Swipeable card (swipe left to delete on mobile, X on desktop) ─────────────
const ACTION_W = 72

function SwipeableCard({ onDelete, className, children }: { onDelete: () => void; className?: string; children: React.ReactNode }) {
  const cardRef = useRef<HTMLDivElement>(null)
  const actionRef = useRef<HTMLDivElement>(null)
  const startX = useRef(0)
  const curX = useRef(0)   // current committed offset (0 or -ACTION_W when snapped open)
  const isOpen = useRef(false)
  const onDeleteRef = useRef(onDelete)
  onDeleteRef.current = onDelete

  // Direct DOM style — no React re-renders during drag
  const setX = (x: number, animated: boolean) => {
    const el = cardRef.current
    const ac = actionRef.current
    if (!el || !ac) return
    el.style.transition = animated ? 'transform 0.28s cubic-bezier(0.25,1,0.5,1)' : 'none'
    el.style.transform = `translateX(${x}px)`
    ac.style.opacity = String(Math.min(1, Math.abs(x) / ACTION_W))
  }

  useEffect(() => {
    const el = cardRef.current
    if (!el) return

    let startY = 0
    let locked: 'none' | 'h' | 'v' = 'none'

    const onStart = (e: TouchEvent) => {
      // Clear any lingering animation so inline transform takes effect
      el.style.animation = 'none'
      startX.current = e.touches[0].clientX
      startY = e.touches[0].clientY
      curX.current = isOpen.current ? -ACTION_W : 0
      locked = 'none'
      el.style.transition = 'none'
    }

    const onMove = (e: TouchEvent) => {
      const dx = e.touches[0].clientX - startX.current
      const dy = e.touches[0].clientY - startY

      // Determine gesture direction on first meaningful movement
      if (locked === 'none') {
        if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return
        locked = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v'
      }

      if (locked === 'v') return  // let the browser scroll

      // Horizontal — claim the gesture
      e.preventDefault()
      const total = dx + curX.current
      if (total >= 4) { setX(0, false); return }
      const abs = Math.abs(Math.min(0, total))
      const x = abs <= ACTION_W ? -abs : -(ACTION_W + (abs - ACTION_W) * 0.2)
      setX(x, false)
    }

    const onEnd = () => {
      if (locked !== 'h') return
      const matrix = new DOMMatrixReadOnly(cardRef.current?.style.transform || '')
      const abs = Math.abs(matrix.m41)

      if (abs >= ACTION_W + 44) {
        setX(-500, true)
        setTimeout(() => onDeleteRef.current(), 260)
      } else if (abs >= ACTION_W * 0.38) {
        isOpen.current = true
        setX(-ACTION_W, true)
      } else {
        isOpen.current = false
        setX(0, true)
      }
    }

    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })  // needs preventDefault
    el.addEventListener('touchend', onEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Split className: animation classes go on wrapper (so they don't override card transform),
  // visual classes (bg, rounded, padding) go on the card div that slides
  const animClasses = (className ?? '').split(' ').filter(c => c.startsWith('animate-'))
  const cardClasses = (className ?? '').split(' ').filter(c => !c.startsWith('animate-'))

  return (
    <div className={`relative rounded-2xl overflow-hidden ${animClasses.join(' ')}`}>
      <div ref={actionRef}
        className="absolute inset-y-0 right-0 flex items-center justify-center bg-red-500 rounded-2xl"
        style={{ width: ACTION_W, opacity: 0 }}
      >
        <button onClick={() => { setX(-500, true); setTimeout(() => onDeleteRef.current(), 260) }}
          className="w-full h-full flex items-center justify-center">
          <span className="material-symbols-outlined text-white" style={{ fontVariationSettings: "'FILL' 1" }}>delete</span>
        </button>
      </div>
      <div ref={cardRef} className={cardClasses.join(' ')} style={{ willChange: 'transform', touchAction: 'pan-y' }}>
        {children}
      </div>
    </div>
  )
}

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
      className="relative w-full py-3.5 rounded-xl font-headline font-bold text-sm overflow-hidden flex items-center justify-center gap-2 text-[#a48b83] border border-[#353534] animate-fade-in"
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
  const [fading, setFading] = useState(false)
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone
  useEffect(() => {
    const fadeTimer = setTimeout(() => setFading(true), 4600)
    const doneTimer = setTimeout(() => onDoneRef.current(), 5000)
    return () => { clearTimeout(fadeTimer); clearTimeout(doneTimer) }
  }, [])
  return (
    <div className="fixed bottom-32 left-1/2 -translate-x-1/2 z-50" style={{ opacity: fading ? 0 : 1, transition: fading ? 'opacity 0.4s ease-out' : undefined }}>
      <div className="bg-[#ff9066] text-[#752805] px-5 py-3 rounded-2xl shadow-xl flex items-center gap-2 font-headline font-bold text-sm animate-slide-up">
        <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>emoji_events</span>
        New PR! {exercise} — {weight} kg
      </div>
    </div>
  )
}

// ── Exercise Picker Sheet ─────────────────────────────────────────────────────
function ExercisePicker({
  hints, starred, onSelect, onToggleStar, onClose, exerciseType, multiSelect, onMultiSelect,
}: {
  hints: ExerciseHint[]
  starred: Set<string>
  onSelect: (name: string, hint?: ExerciseHint) => void
  onToggleStar: (name: string) => void
  onClose: () => void
  exerciseType?: ExerciseType
  multiSelect?: boolean
  onMultiSelect?: (names: string[]) => void
}) {
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState<ExerciseCategory | null>(null)
  const [selected, setSelected] = useState<string[]>([])

  const hintMap = useMemo(() => {
    const m = new Map<string, ExerciseHint>()
    for (const h of hints) m.set(h.exercise, h)
    return m
  }, [hints])

  const q = search.toLowerCase()
  const filtered = useMemo(() => {
    let list = EXERCISES
    if (exerciseType) list = list.filter(e => e.type === exerciseType)
    if (filterCat) list = list.filter(e => e.category === filterCat)
    if (q) list = list.filter(e => e.name.toLowerCase().includes(q))
    return list
  }, [q, filterCat, exerciseType])

  const availableCategories = useMemo(() => {
    if (!exerciseType) return CATEGORIES
    return CATEGORIES.filter(cat => EXERCISES.some(e => e.type === exerciseType && e.category === cat))
  }, [exerciseType])

  const starredList = useMemo(() => filtered.filter(e => starred.has(e.name)), [filtered, starred])
  const unstarredList = useMemo(() => filtered.filter(e => !starred.has(e.name)), [filtered, starred])

  const renderRow = (name: string) => {
    const hint = hintMap.get(name)
    const isStarred = starred.has(name)
    const isSelected = multiSelect && selected.includes(name)
    const selIdx = multiSelect ? selected.indexOf(name) : -1
    return (
      <div key={name} className="flex items-center">
        <button
          onClick={() => {
            if (multiSelect) {
              setSelected(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name])
            } else {
              onSelect(name, hint)
            }
          }}
          className={`flex-1 flex items-center justify-between py-3 px-4 hover:bg-[#2a2a2a] active:bg-[#353534] transition-colors text-left rounded-xl ${isSelected ? 'bg-[#ff9066]/10' : ''}`}
        >
          <div className="flex items-center gap-3">
            {multiSelect && (
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center text-[10px] font-bold shrink-0 transition-colors ${isSelected ? 'bg-[#ff9066] border-[#ff9066] text-[#752805]' : 'border-[#56423c]'}`}>
                {isSelected && selIdx + 1}
              </div>
            )}
            <span className="font-body text-sm text-[#e5e2e1]">{name}</span>
          </div>
          {hint && !multiSelect && <span className="text-[10px] text-[#a48b83]">{
            (() => {
              const ex = EXERCISES.find(e => e.name === name)
              if (ex?.type === 'timed') return `${Math.floor(hint.last_reps / 60)}:${String(hint.last_reps % 60).padStart(2, '0')}`
              if (ex?.type === 'bodyweight') return hint.last_weight > 0 ? `${hint.last_weight} kg × ${hint.last_reps}` : `${hint.last_reps} reps`
              return `${hint.last_weight} kg × ${hint.last_reps}`
            })()
          }</span>}
        </button>
        {!multiSelect && (
          <button onClick={() => onToggleStar(name)} className="p-2 shrink-0">
            <span
              className={`material-symbols-outlined text-lg ${isStarred ? 'text-[#ff9066]' : 'text-[#56423c]'}`}
              style={{ fontVariationSettings: isStarred ? "'FILL' 1" : "'FILL' 0" }}
            >star</span>
          </button>
        )}
      </div>
    )
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 top-12 md:top-0 md:left-56 z-50 bg-[#131313] rounded-t-3xl md:rounded-none flex flex-col overflow-hidden animate-slide-up">
        <div className="px-5 pt-5 pb-3 border-b border-[#201f1f]">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-headline text-lg font-bold">Choose exercise</h2>
            <button onClick={onClose}><span className="material-symbols-outlined text-[#a48b83]">close</span></button>
          </div>
          <div className="flex items-center gap-2 bg-[#201f1f] rounded-xl px-3 py-2.5">
            <span className="material-symbols-outlined text-[#a48b83] text-lg">search</span>
            <input
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
            {availableCategories.map(cat => (
              <button
                key={cat}
                onClick={() => setFilterCat(filterCat === cat ? null : cat)}
                className={`px-3 py-1.5 rounded-full text-[10px] font-bold font-label uppercase tracking-widest whitespace-nowrap transition-colors ${filterCat === cat ? 'bg-[#ff9066] text-[#752805]' : 'bg-[#201f1f] text-[#a48b83]'}`}
              >{cat}</button>
            ))}
          </div>
        </div>
        <div className={`flex-1 overflow-y-auto px-2 ${multiSelect && selected.length > 0 ? 'pb-24' : 'pb-32 md:pb-8'}`}>
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
        {multiSelect && selected.length > 0 && (
          <div className="absolute bottom-0 inset-x-0 p-4 bg-gradient-to-t from-[#131313] via-[#131313] to-transparent pt-8">
            <button
              onClick={() => { onMultiSelect?.(selected); onClose() }}
              className="w-full py-4 bg-[#ff9066] text-[#752805] rounded-2xl font-headline font-bold text-sm active:scale-95 transition-transform"
            >
              Add {selected.length} exercise{selected.length !== 1 ? 's' : ''}
            </button>
          </div>
        )}
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
  const dragY = useRef(0)
  const dragDelta = useRef(0)
  const sheetRef = useRef<HTMLDivElement>(null)
  const handleRef = useRef<HTMLDivElement>(null)

  function setSheetY(y: number, animated: boolean) {
    const el = sheetRef.current
    if (!el) return
    el.style.animation = 'none'
    el.style.transition = animated ? 'transform 0.3s ease' : 'none'
    el.style.transform = `translateY(${y}px)`
  }

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  useEffect(() => {
    const handle = handleRef.current
    if (!handle) return

    const onTouchStart = (e: TouchEvent) => {
      dragY.current = e.touches[0].clientY
      dragDelta.current = 0
    }
    const onTouchMove = (e: TouchEvent) => {
      const delta = e.touches[0].clientY - dragY.current
      if (delta > 0) {
        e.preventDefault()
        dragDelta.current = delta
        setSheetY(delta, false)
      }
    }
    const onTouchEnd = () => {
      if (dragDelta.current > 80) {
        setSheetY(window.innerHeight, true)
        setTimeout(onClose, 300)
      } else {
        setSheetY(0, true)
      }
      dragDelta.current = 0
    }

    handle.addEventListener('touchstart', onTouchStart)
    handle.addEventListener('touchmove', onTouchMove, { passive: false })
    handle.addEventListener('touchend', onTouchEnd)
    return () => {
      handle.removeEventListener('touchstart', onTouchStart)
      handle.removeEventListener('touchmove', onTouchMove)
      handle.removeEventListener('touchend', onTouchEnd)
    }
  }, [onClose])

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={sheetRef}
        className="fixed inset-x-0 bottom-0 max-w-[390px] mx-auto z-50 bg-[#181818] rounded-t-3xl px-5 pt-5 pb-[calc(env(safe-area-inset-bottom,0px)+24px)] shadow-2xl overflow-y-auto max-h-[85vh] animate-slide-up"
      >
        <div ref={handleRef} className="w-full flex justify-center py-5 mb-2 cursor-grab active:cursor-grabbing" style={{ touchAction: 'none' }}>
          <div className="w-10 h-1 bg-[#353534] rounded-full" />
        </div>
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

// ── Workout Type Picker Sheet ────────────────────────────────────────────────
function WorkoutTypePicker({ onSelect, onRoutine, onClose }: {
  onSelect: (type: 'weights' | 'bodyweight' | 'timed' | 'cardio') => void
  onRoutine: () => void
  onClose: () => void
}) {
  const options: { label: string; value: 'weights' | 'bodyweight' | 'timed' | 'cardio'; icon: string; color: string; bgColor: string }[] = [
    { label: 'Weights', value: 'weights', icon: 'fitness_center', color: '#ff9066', bgColor: 'rgba(255,144,102,0.1)' },
    { label: 'Bodyweight', value: 'bodyweight', icon: 'accessibility_new', color: '#ff9066', bgColor: 'rgba(255,144,102,0.1)' },
    { label: 'Timed', value: 'timed', icon: 'timer', color: '#ff9066', bgColor: 'rgba(255,144,102,0.1)' },
    { label: 'Cardio', value: 'cardio', icon: 'directions_run', color: '#4bdece', bgColor: 'rgba(75,222,206,0.1)' },
  ]
  const dragY = useRef(0)
  const dragDelta = useRef(0)
  const sheetRef = useRef<HTMLDivElement>(null)
  const handleRef = useRef<HTMLDivElement>(null)

  function setSheetY(y: number, animated: boolean) {
    const el = sheetRef.current
    if (!el) return
    el.style.animation = 'none'
    el.style.transition = animated ? 'transform 0.3s ease' : 'none'
    el.style.transform = `translateY(${y}px)`
  }

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  useEffect(() => {
    const handle = handleRef.current
    if (!handle) return
    const onTouchStart = (e: TouchEvent) => { dragY.current = e.touches[0].clientY; dragDelta.current = 0 }
    const onTouchMove = (e: TouchEvent) => {
      const delta = e.touches[0].clientY - dragY.current
      if (delta > 0) { e.preventDefault(); dragDelta.current = delta; setSheetY(delta, false) }
    }
    const onTouchEnd = () => {
      if (dragDelta.current > 80) { setSheetY(window.innerHeight, true); setTimeout(onClose, 300) }
      else { setSheetY(0, true) }
      dragDelta.current = 0
    }
    handle.addEventListener('touchstart', onTouchStart)
    handle.addEventListener('touchmove', onTouchMove, { passive: false })
    handle.addEventListener('touchend', onTouchEnd)
    return () => { handle.removeEventListener('touchstart', onTouchStart); handle.removeEventListener('touchmove', onTouchMove); handle.removeEventListener('touchend', onTouchEnd) }
  }, [onClose])

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={sheetRef}
        className="fixed inset-x-0 bottom-0 max-w-[390px] mx-auto z-50 bg-[#181818] rounded-t-3xl px-5 pt-5 pb-[calc(env(safe-area-inset-bottom,0px)+24px)] shadow-2xl animate-slide-up"
      >
        <div ref={handleRef} className="w-full flex justify-center py-5 mb-2 cursor-grab active:cursor-grabbing" style={{ touchAction: 'none' }}>
          <div className="w-10 h-1 bg-[#353534] rounded-full" />
        </div>
        <p className="text-[10px] font-bold font-label uppercase tracking-widest text-[#a48b83] mb-4">What are you logging?</p>
        <div className="grid grid-cols-2 gap-3">
          {options.map(o => (
            <button
              key={o.value}
              onClick={() => { onSelect(o.value); onClose() }}
              className="flex flex-col items-center gap-3 p-5 bg-[#201f1f] rounded-2xl active:scale-95 transition-all"
            >
              <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: o.bgColor }}>
                <span className="material-symbols-outlined text-2xl" style={{ color: o.color }}>{o.icon}</span>
              </div>
              <span className="font-headline font-bold text-sm text-[#e5e2e1]">{o.label}</span>
            </button>
          ))}
        </div>
        <button
          onClick={() => { onRoutine(); onClose() }}
          className="mt-3 w-full flex items-center justify-center gap-2 p-4 bg-[#201f1f] rounded-2xl active:scale-95 transition-all border border-dashed border-[#353534]"
        >
          <span className="material-symbols-outlined text-xl text-[#ff9066]">assignment</span>
          <span className="font-headline font-bold text-sm text-[#dcc1b8]">Use a routine</span>
        </button>
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
      <div className="fixed inset-x-0 bottom-0 max-w-[390px] mx-auto z-50 bg-[#181818] rounded-t-3xl px-5 pt-5 pb-[calc(env(safe-area-inset-bottom,0px)+24px)] max-h-[92vh] overflow-y-auto animate-slide-up">
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
                className={`flex flex-col items-center justify-center py-1.5 rounded-xl text-sm font-bold transition-colors disabled:opacity-20 active:scale-95
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
  | { type: 'bodyweight'; exercise: string }
  | { type: 'timed'; exercise: string }
  | { type: 'cardio'; activity: string }

export default function LogPage() {
  const [view, setView] = useState<View>({ type: 'list' })

  // Today's logged exercises
  const [loggedLifts, setLoggedLifts] = useState<LoggedLift[]>([])
  const [loggedCardio, setLoggedCardio] = useState<LoggedCardio[]>([])
  const [loadingToday, setLoadingToday] = useState(true)

  // Pickers
  const [showTypePicker, setShowTypePicker] = useState(false)
  const [showExPicker, setShowExPicker] = useState(false)
  const [showCardioPicker, setShowCardioPicker] = useState(false)
  const [exerciseTypeFilter, setExerciseTypeFilter] = useState<ExerciseType | undefined>(undefined)

  // Routines
  const [routines, setRoutines] = useState<Routine[]>([])
  const [showRoutinePicker, setShowRoutinePicker] = useState(false)
  const [showRoutineEditor, setShowRoutineEditor] = useState(false)
  const [editingRoutine, setEditingRoutine] = useState<{ id?: number; name: string; exercises: string[] } | null>(null)
  const [activeRoutine, setActiveRoutine] = useState<ActiveRoutine | null>(null)
  const [routineExPickerOpen, setRoutineExPickerOpen] = useState(false)

  // Bodyweight add-weight toggle
  const [addWeightMode, setAddWeightMode] = useState(false)

  // Lift logging state
  const [sets, setSets] = useState<SetRow[]>([{ id: 1, weight: 60, reps: 8, duration_secs: 0, done: false }])
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

  const [repeatLoading, setRepeatLoading] = useState(false)

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

  // Hints + stars + PRs
  const [hints, setHints] = useState<ExerciseHint[]>([])
  const [prs, setPrs] = useState<Map<string, ExercisePR>>(new Map())
  const [starred, setStarred] = useState<Set<string>>(new Set())

  // Saving
  const [saving, setSaving] = useState(false)
  const [pr, setPr] = useState<{ exercise: string; weight: number } | null>(null)

  // Edit sheets
  const [editLift, setEditLift] = useState<{blockId: number; exercise: string; sets: {id: number; weight: number; reps: number; duration_secs: number | null}[]} | null>(null)
  const [editCardio, setEditCardio] = useState<{blockId: number; cardioId: number; activity: string; distance: string; duration: string} | null>(null)
  const [fadingBlocks, setFadingBlocks] = useState<Set<number>>(new Set())
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [pullY, setPullY] = useState(0)
  const [pulling, setPulling] = useState(false)
  const pullStartY = useRef(0)
  const PULL_THRESHOLD = 72

  // Calendar / history browsing
  const browsedDateRef = useRef<string | null>(null)
  const [browsedDate, setBrowsedDate] = useState<string | null>(null)
  const [calOpen, setCalOpen] = useState(false)
  const [calMonth, setCalMonth] = useState(() => new Date())
  const [workoutDates, setWorkoutDates] = useState<Set<string>>(new Set())

  // ── Draft persistence ────────────────────────────────────────────────────────
  const DRAFT_KEY = 'ss_workout_draft'
  const [draftRestored, setDraftRestored] = useState(false)

  // Restore draft on mount (batched with flag so save effect doesn't fire prematurely)
  useEffect(() => {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (raw) {
      try {
        const d = JSON.parse(raw) as { view?: View; sets?: SetRow[]; cardioDistance?: string; cardioTime?: string; activeRoutine?: ActiveRoutine; restSetId?: number; restEndsAt?: number; restDuration?: number }
        if (d.view?.type === 'lift' || d.view?.type === 'bodyweight' || d.view?.type === 'timed' || d.view?.type === 'cardio') setView(d.view)
        if (Array.isArray(d.sets) && d.sets.length > 0) setSets(d.sets)
        if (typeof d.cardioDistance === 'string') setCardioDistance(d.cardioDistance)
        if (typeof d.cardioTime === 'string') setCardioTime(d.cardioTime)
        if (d.activeRoutine) setActiveRoutine(d.activeRoutine)
        if (d.restSetId != null && d.restEndsAt != null) {
          const remaining = Math.max(0, Math.round((d.restEndsAt - Date.now()) / 1000))
          if (remaining > 0) {
            setRestingId(d.restSetId)
            setRestRemaining(remaining)
            if (d.restDuration) setRestDuration(d.restDuration)
          }
        }
      } catch { /* corrupt draft — ignore */ }
    }
    setDraftRestored(true)
  }, [])

  // Save draft whenever in-progress state changes (skips initial renders until restored)
  useEffect(() => {
    if (!draftRestored) return
    if (view.type === 'list') return
    localStorage.setItem(DRAFT_KEY, JSON.stringify({
      view, sets, cardioDistance, cardioTime, activeRoutine,
      restSetId: restingId ?? undefined,
      restEndsAt: restingId != null ? Date.now() + restRemaining * 1000 : undefined,
      restDuration: restingId != null ? restDuration : undefined,
    }))
  }, [draftRestored, view, sets, cardioDistance, cardioTime, activeRoutine, restingId, restRemaining, restDuration])

  // Load rest duration from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('ss_rest_duration')
    if (saved) setRestDuration(parseInt(saved))
  }, [])

  // Onboarding: show once on first visit
  useEffect(() => {
    if (shouldShowOnboarding()) setShowOnboarding(true)
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

  // Initial load — single request gets log + calendar dates + exercise hints
  const initialLoadDone = useRef(false)
  useEffect(() => {
    setLoadingToday(true)
    Promise.all([
      fetch('/api/log?include=all').then(r => r.json()),
      fetch('/api/routines').then(r => r.json()).catch(() => ({ routines: [] })),
    ]).then(([data, tplData]) => {
      setLoggedLifts(data.lifts ?? [])
      setLoggedCardio(data.cardio ?? [])
      if (data.dates) setWorkoutDates(new Set(data.dates as string[]))
      if (data.history) setHints(data.history)
      if (data.prs) setPrs(new Map((data.prs as ExercisePR[]).map(p => [p.exercise, p])))
      if (data.starred) setStarred(new Set(data.starred))
      setRoutines(tplData.routines ?? [])
      setLoadingToday(false)
      initialLoadDone.current = true
    }).catch(() => setLoadingToday(false))
  }, [])

  // Keep ref in sync and reload when date changes (skip initial mount — handled above)
  useEffect(() => {
    browsedDateRef.current = browsedDate
    if (!initialLoadDone.current) return
    refreshCurrent()
  }, [browsedDate, refreshCurrent])

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

  // Start logging an exercise — route to correct view based on type
  const startExercise = (name: string, hint?: ExerciseHint) => {
    const exType = EXERCISES.find(e => e.name === name)?.type ?? 'weights'
    setRestingId(null)
    setShowExPicker(false)
    if (exType === 'bodyweight') {
      setSets([{ id: Date.now(), weight: 0, reps: hint?.last_reps ?? 10, duration_secs: 0, done: false }])
      setAddWeightMode(false)
      setView({ type: 'bodyweight', exercise: name })
    } else if (exType === 'timed') {
      setSets([{ id: Date.now(), weight: 0, reps: 0, duration_secs: hint?.last_reps ?? 30, done: false }])
      setView({ type: 'timed', exercise: name })
    } else {
      setSets([{ id: Date.now(), weight: hint?.last_weight ?? 60, reps: hint?.last_reps ?? 8, duration_secs: 0, done: false }])
      setView({ type: 'lift', exercise: name })
    }
  }

  // Start logging cardio
  const startCardio = (activity: string) => {
    setCardioDistance('')
    setCardioTime('')
    setParseError(null)
    setView({ type: 'cardio', activity })
  }

  const repeatLastSession = async () => {
    setRepeatLoading(true)
    try {
      const data = await fetch('/api/log?lastSession=1').then(r => r.json())
      const exercises = data.exercises as { type: string; exercise?: string; activity?: string; sets: {weight: number; reps: number; duration_secs: number | null}[] }[]
      if (!exercises?.length) return
      // Collect all lift exercise names for the auto-advance routine
      const liftNames = exercises.filter(e => e.type === 'lift' && e.exercise).map(e => e.exercise!)
      if (liftNames.length > 1) {
        setActiveRoutine({ id: 0, name: 'Last session', exercises: liftNames, currentIndex: 0, pending: {} })
      }
      const first = exercises[0]
      if (first.type === 'lift' && first.exercise) {
        const best = first.sets.length > 0 ? first.sets.reduce((a, b) => (b.weight > a.weight ? b : a), first.sets[0]) : null
        startExercise(first.exercise, best ? { exercise: first.exercise, last_weight: best.weight, last_reps: best.reps } : undefined)
      } else if ((first.type === 'cardio' || first.type === 'run' || first.type === 'cycle') && first.activity) {
        startCardio(first.activity)
      }
    } finally {
      setRepeatLoading(false)
    }
  }

  // Toggle set done/undone + auto-queue next
  const toggleSet = (setId: number) => {
    const wasDone = sets.find(s => s.id === setId)?.done
    if (!wasDone && typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(40)
    setSets(prev => {
      const updated = prev.map(s => s.id === setId ? { ...s, done: !s.done } : s)
      const justDone = updated.find(s => s.id === setId)?.done
      if (justDone) {
        if (restDuration > 0) { setRestingId(setId); setRestRemaining(restDuration) }
        const loggedSet = updated.find(s => s.id === setId)!
        if (!updated.some(s => !s.done)) {
          updated.push({ id: Date.now(), weight: loggedSet.weight, reps: loggedSet.reps, duration_secs: loggedSet.duration_secs, done: false })
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

  // Save all pending routine blocks to DB then go to list
  const finishRoutine = async (pending: Record<number, PendingBlock>) => {
    const blocks = Object.values(pending)
    if (blocks.length === 0) { setActiveRoutine(null); setView({ type: 'list' }); return }
    setSaving(true)
    try {
      await Promise.all(blocks.map(b =>
        fetch('/api/log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'lift', exercise: b.exercise, sets: b.sets, exerciseType: b.exerciseType }),
        })
      ))
      localStorage.removeItem(DRAFT_KEY)
      setActiveRoutine(null)
      setSets([{ id: 1, weight: 60, reps: 8, duration_secs: 0, done: false }])
      refreshCurrent()
      setView({ type: 'list' })
    } finally {
      setSaving(false)
    }
  }

  // Save lift / bodyweight / timed
  const saveSets = async () => {
    if (view.type !== 'lift' && view.type !== 'bodyweight' && view.type !== 'timed') return
    const doneSets = sets.filter(s => s.done)
    if (doneSets.length === 0) { setView({ type: 'list' }); return }

    // In a routine — accumulate locally, save all at the end
    if (activeRoutine) {
      const exerciseType = (view.type === 'timed' ? 'timed' : view.type === 'bodyweight' ? 'bodyweight' : 'weights') as 'weights' | 'bodyweight' | 'timed'
      const updatedPending = { ...activeRoutine.pending, [activeRoutine.currentIndex]: { exercise: view.exercise, exerciseType, sets: doneSets } }
      if (activeRoutine.currentIndex < activeRoutine.exercises.length - 1) {
        // More exercises to go — advance
        const nextIndex = activeRoutine.currentIndex + 1
        setActiveRoutine(prev => prev ? { ...prev, currentIndex: nextIndex, pending: updatedPending } : null)
        const nextEx = activeRoutine.exercises[nextIndex]
        const hint = hints.find((h: ExerciseHint) => h.exercise === nextEx)
        startExercise(nextEx, hint)
      } else {
        // Last exercise — save everything
        await finishRoutine(updatedPending)
      }
      return
    }

    // Not in a routine — save immediately as before
    setSaving(true)
    try {
      const res = await fetch('/api/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'lift', exercise: view.exercise, sets, exerciseType: view.type === 'timed' ? 'timed' : view.type === 'bodyweight' ? 'bodyweight' : 'weights' }),
      })
      const data = await res.json()
      if (data.isPr) {
        setPr({ exercise: data.exercise, weight: data.weight })
        // Update local PR map so comparison stays live for the rest of the session
        const maxWeight = Math.max(...doneSets.map(s => s.weight))
        const maxReps = Math.max(...doneSets.filter(s => s.weight === maxWeight).map(s => s.reps))
        const maxDuration = Math.max(...doneSets.map(s => s.duration_secs ?? 0))
        const newVol = doneSets.reduce((sum: number, s: SetRow) => sum + s.weight * s.reps, 0)
        const newRepsTotal = doneSets.reduce((sum: number, s: SetRow) => sum + s.reps, 0)
        const newDurTotal = doneSets.reduce((sum: number, s: SetRow) => sum + (s.duration_secs ?? 0), 0)
        setPrs(prev => {
          const m = new Map(prev)
          const old = m.get(view.exercise)
          m.set(view.exercise, {
            exercise: view.exercise,
            pr_weight: maxWeight,
            pr_reps: maxReps,
            pr_duration: maxDuration || null,
            pr_volume: Math.max(newVol, old?.pr_volume ?? 0),
            pr_reps_total: Math.max(newRepsTotal, old?.pr_reps_total ?? 0),
            pr_duration_total: Math.max(newDurTotal, old?.pr_duration_total ?? 0) || null,
          })
          return m
        })
      }
      localStorage.removeItem(DRAFT_KEY)
      setSets([{ id: 1, weight: 60, reps: 8, duration_secs: 0, done: false }])
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
      localStorage.removeItem(DRAFT_KEY)
      setView({ type: 'list' })
    } finally {
      setSaving(false)
    }
  }

  const adjustEditLiftSet = (setId: number, field: 'weight' | 'reps', delta: number) => {
    setEditLift(prev => prev ? { ...prev, sets: prev.sets.map(s => s.id === setId ? { ...s, [field]: Math.max(0, +(s[field] + delta).toFixed(1)) } : s) } : prev)
  }

  const setEditLiftField = (setId: number, field: 'weight' | 'reps', value: number) => {
    setEditLift(prev => prev ? { ...prev, sets: prev.sets.map(s => s.id === setId ? { ...s, [field]: Math.max(0, +value.toFixed(1)) } : s) } : prev)
  }

  const saveEditLift = () => {
    if (!editLift) return
    const { blockId, sets } = editLift
    setLoggedLifts(prev => prev.map(l => l.block_id !== blockId ? l : {
      ...l,
      sets,
      max_weight: Math.max(...sets.map(s => s.weight)),
    }))
    setEditLift(null)
    Promise.all(sets.map(s =>
      fetch('/api/sets', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: s.id, weight: s.weight, reps: s.reps }) })
    ))
  }

  const saveEditCardio = () => {
    if (!editCardio) return
    const { blockId, cardioId, distance, duration } = editCardio
    const pace = calcPace(distance, duration)
    setLoggedCardio(prev => prev.map(c => c.block_id !== blockId ? c : {
      ...c, distance: distance || null, duration: duration || null, pace: pace || null,
    }))
    setEditCardio(null)
    fetch('/api/log', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cardioId, distance, duration, pace }) })
  }

  // Delete a logged block — fade out then remove
  const deleteBlock = (blockId: number) => {
    setFadingBlocks(prev => new Set([...prev, blockId]))
    setTimeout(() => {
      setLoggedLifts(prev => prev.filter(l => l.block_id !== blockId))
      setLoggedCardio(prev => prev.filter(c => c.block_id !== blockId))
      setFadingBlocks(prev => { const s = new Set(prev); s.delete(blockId); return s })
    }, 200)
    fetch('/api/log', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blockId }),
    })
  }

  // ── List view ───────────────────────────────────────────────────────────────
  if (view.type === 'list') {
    return (
      <main
        className="max-w-[390px] md:max-w-3xl mx-auto min-h-screen pb-32 md:pb-12 flex flex-col px-4 pt-6 animate-fade-in-view"
        onTouchStart={e => { if (window.scrollY === 0) { pullStartY.current = e.touches[0].clientY; setPulling(true) } }}
        onTouchMove={e => { if (!pulling) return; const dy = e.touches[0].clientY - pullStartY.current; if (dy > 0) setPullY(Math.min(dy, PULL_THRESHOLD * 1.5)) }}
        onTouchEnd={() => {
          if (pullY >= PULL_THRESHOLD) refreshCurrent()
          setPullY(0); setPulling(false)
        }}
      >
        {/* Pull to refresh indicator */}
        {pullY > 0 && (
          <div className="flex justify-center items-center overflow-hidden transition-all" style={{ height: pullY * 0.6 }}>
            <span className={`material-symbols-outlined text-[#ff9066] transition-transform ${pullY >= PULL_THRESHOLD ? 'text-[#ff9066]' : 'text-[#56423c]'}`}
              style={{ transform: `rotate(${(pullY / PULL_THRESHOLD) * 180}deg)` }}>refresh</span>
          </div>
        )}
        {showOnboarding && <Onboarding onDone={() => setShowOnboarding(false)} />}
        {pr && <PrToast exercise={pr.exercise} weight={pr.weight} onDone={() => setPr(null)} />}
        {showTypePicker && (
          <WorkoutTypePicker
            onSelect={(t) => {
              if (t === 'cardio') { setShowCardioPicker(true) }
              else { setExerciseTypeFilter(t); setShowExPicker(true) }
            }}
            onRoutine={() => setShowRoutinePicker(true)}
            onClose={() => setShowTypePicker(false)}
          />
        )}
        {showExPicker && (
          <ExercisePicker
            hints={hints} starred={starred} onToggleStar={toggleStar}
            exerciseType={exerciseTypeFilter}
            onSelect={startExercise}
            onClose={() => setShowExPicker(false)}
          />
        )}
        {showCardioPicker && (
          <CardioPicker onSelect={startCardio} onClose={() => setShowCardioPicker(false)} />
        )}

        {/* Routine Picker */}
        {showRoutinePicker && (
          <>
            <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" onClick={() => setShowRoutinePicker(false)} />
            <div className="fixed inset-x-0 bottom-0 max-w-[390px] mx-auto z-50 bg-[#181818] rounded-t-3xl px-5 pt-5 pb-[calc(env(safe-area-inset-bottom,0px)+24px)] max-h-[80vh] overflow-y-auto animate-slide-up">
              <div className="flex items-center justify-between mb-4">
                <p className="text-[10px] font-bold font-label uppercase tracking-widest text-[#a48b83]">Your routines</p>
                <button onClick={() => setShowRoutinePicker(false)}>
                  <span className="material-symbols-outlined text-[#a48b83]">close</span>
                </button>
              </div>
              {routines.length === 0 ? (
                <p className="text-sm text-[#a48b83] text-center py-6">No routines yet. Create one to get started.</p>
              ) : (
                <div className="flex flex-col gap-2 mb-4">
                  {routines.map(t => (
                    <div key={t.id} className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setShowRoutinePicker(false)
                          setActiveRoutine({ id: t.id, name: t.name, exercises: t.exercises, currentIndex: 0, pending: {} })
                          const firstEx = t.exercises[0]
                          const hint = hints.find((h: ExerciseHint) => h.exercise === firstEx)
                          startExercise(firstEx, hint)
                        }}
                        className="flex-1 p-4 bg-[#201f1f] rounded-xl text-left active:scale-[0.98] transition-transform"
                      >
                        <p className="font-headline font-bold text-[#e5e2e1] mb-1">{t.name}</p>
                        <p className="text-xs text-[#a48b83] line-clamp-1">
                          {t.exercises.length <= 3
                            ? t.exercises.join(', ')
                            : `${t.exercises.slice(0, 2).join(', ')} +${t.exercises.length - 2} more`}
                        </p>
                      </button>
                      <button
                        onClick={() => {
                          setEditingRoutine({ id: t.id, name: t.name, exercises: [...t.exercises] })
                          setShowRoutinePicker(false)
                          setShowRoutineEditor(true)
                        }}
                        className="w-10 h-10 flex items-center justify-center rounded-xl bg-[#201f1f] shrink-0"
                      >
                        <span className="material-symbols-outlined text-lg text-[#a48b83]">edit</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <button
                onClick={() => {
                  setEditingRoutine({ name: '', exercises: [] })
                  setShowRoutinePicker(false)
                  setShowRoutineEditor(true)
                }}
                className="w-full flex items-center justify-center gap-2 p-4 bg-[#ff9066] rounded-xl active:scale-95 transition-transform"
              >
                <span className="material-symbols-outlined text-lg text-[#752805]">add</span>
                <span className="font-headline font-bold text-sm text-[#752805]">Create new routine</span>
              </button>
            </div>
          </>
        )}

        {/* Routine Editor */}
        {showRoutineEditor && editingRoutine && (
          <>
            <div className="fixed inset-0 bg-black/60 z-[60] backdrop-blur-sm" onClick={() => setShowRoutineEditor(false)} />
            <div className="fixed inset-x-0 bottom-0 max-w-[390px] mx-auto z-[60] bg-[#181818] rounded-t-3xl px-5 pt-5 pb-[calc(env(safe-area-inset-bottom,0px)+24px)] max-h-[85vh] overflow-y-auto animate-slide-up">
              <div className="flex items-center justify-between mb-4">
                <p className="text-[10px] font-bold font-label uppercase tracking-widest text-[#a48b83]">
                  {editingRoutine.id ? 'Edit routine' : 'New routine'}
                </p>
                <button onClick={() => setShowRoutineEditor(false)}>
                  <span className="material-symbols-outlined text-[#a48b83]">close</span>
                </button>
              </div>
              <input
                type="text"
                placeholder="Routine name"
                value={editingRoutine.name}
                onChange={e => setEditingRoutine(prev => prev ? { ...prev, name: e.target.value } : prev)}
                className="w-full bg-[#201f1f] rounded-xl px-4 py-3 text-[#e5e2e1] font-headline font-bold placeholder-[#a48b83]/50 mb-4 outline-none focus:ring-1 focus:ring-[#ff9066]/40"
              />
              {editingRoutine.exercises.length > 0 && (
                <div className="flex flex-col gap-2 mb-4">
                  {editingRoutine.exercises.map((ex, i) => (
                    <div key={`${ex}-${i}`} className="flex items-center gap-2 bg-[#201f1f] rounded-xl px-4 py-3">
                      <span className="text-xs font-bold text-[#a48b83] w-5">{i + 1}</span>
                      <span className="flex-1 text-sm text-[#e5e2e1]">{ex}</span>
                      <button
                        onClick={() => setEditingRoutine(prev => {
                          if (!prev) return prev
                          const exercises = [...prev.exercises]
                          if (i > 0) { [exercises[i - 1], exercises[i]] = [exercises[i], exercises[i - 1]] }
                          return { ...prev, exercises }
                        })}
                        className={`w-7 h-7 flex items-center justify-center rounded-lg ${i > 0 ? 'bg-[#353534]' : 'opacity-20'}`}
                        disabled={i === 0}
                      >
                        <span className="material-symbols-outlined text-sm text-[#a48b83]">expand_less</span>
                      </button>
                      <button
                        onClick={() => setEditingRoutine(prev => {
                          if (!prev) return prev
                          const exercises = [...prev.exercises]
                          if (i < exercises.length - 1) { [exercises[i], exercises[i + 1]] = [exercises[i + 1], exercises[i]] }
                          return { ...prev, exercises }
                        })}
                        className={`w-7 h-7 flex items-center justify-center rounded-lg ${i < editingRoutine.exercises.length - 1 ? 'bg-[#353534]' : 'opacity-20'}`}
                        disabled={i === editingRoutine.exercises.length - 1}
                      >
                        <span className="material-symbols-outlined text-sm text-[#a48b83]">expand_more</span>
                      </button>
                      <button
                        onClick={() => setEditingRoutine(prev => prev ? { ...prev, exercises: prev.exercises.filter((_, j) => j !== i) } : prev)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg bg-[#353534]"
                      >
                        <span className="material-symbols-outlined text-sm text-red-400">close</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <button
                onClick={() => { setShowRoutineEditor(false); setRoutineExPickerOpen(true) }}
                className="w-full flex items-center justify-center gap-2 p-3 border border-dashed border-[#353534] rounded-xl mb-4 active:scale-95 transition-transform"
              >
                <span className="material-symbols-outlined text-lg text-[#ff9066]">add</span>
                <span className="text-sm font-bold text-[#dcc1b8]">Add exercise</span>
              </button>
              <div className="flex gap-2">
                {editingRoutine.id && (
                  <button
                    onClick={async () => {
                      await fetch('/api/routines', {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id: editingRoutine.id }),
                      })
                      setRoutines(prev => prev.filter(t => t.id !== editingRoutine.id))
                      setShowRoutineEditor(false)
                      setEditingRoutine(null)
                    }}
                    className="px-4 py-3.5 bg-red-500/10 text-red-400 rounded-xl font-headline font-bold text-sm active:scale-95 transition-transform"
                  >
                    Delete
                  </button>
                )}
                <button
                  disabled={!editingRoutine.name.trim() || editingRoutine.exercises.length === 0}
                  onClick={async () => {
                    const body = editingRoutine.id
                      ? { id: editingRoutine.id, name: editingRoutine.name, exercises: editingRoutine.exercises }
                      : { name: editingRoutine.name, exercises: editingRoutine.exercises }
                    const res = await fetch('/api/routines', {
                      method: editingRoutine.id ? 'PUT' : 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(body),
                    })
                    if (!res.ok) { alert(`Failed to save routine: ${res.status}`); return }
                    const data = await res.json()
                    if (editingRoutine.id) {
                      setRoutines(prev => prev.map(t => t.id === editingRoutine.id ? { ...t, name: editingRoutine.name, exercises: editingRoutine.exercises } : t))
                    } else {
                      setRoutines(prev => [{ id: data.id, name: editingRoutine.name, exercises: editingRoutine.exercises }, ...prev])
                    }
                    setShowRoutineEditor(false)
                    setEditingRoutine(null)
                  }}
                  className="flex-1 py-3.5 bg-[#ff9066] text-[#752805] rounded-xl font-headline font-bold text-sm active:scale-95 transition-transform disabled:opacity-40"
                >
                  {editingRoutine.id ? 'Save changes' : 'Create routine'}
                </button>
              </div>
            </div>
          </>
        )}

        {/* Exercise picker for routine editor */}
        {routineExPickerOpen && (
          <ExercisePicker
            hints={hints} starred={starred} onToggleStar={toggleStar}
            multiSelect
            onSelect={() => {}}
            onMultiSelect={(names) => {
              setEditingRoutine(prev => prev ? { ...prev, exercises: [...prev.exercises, ...names] } : prev)
              setRoutineExPickerOpen(false)
              setShowRoutineEditor(true)
            }}
            onClose={() => { setRoutineExPickerOpen(false); setShowRoutineEditor(true) }}
          />
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
            {!browsedDate && (
              <button onClick={repeatLastSession} disabled={repeatLoading} title="Repeat last session" className="w-9 h-9 flex items-center justify-center rounded-xl bg-[#201f1f] disabled:opacity-50">
                {repeatLoading
                  ? <span className="w-4 h-4 border-2 border-[#ff9066] border-t-transparent rounded-full animate-spin" />
                  : <span className="material-symbols-outlined text-[#a48b83] text-[18px]">replay</span>}
              </button>
            )}
            <button onClick={() => setCalOpen(true)} className="w-9 h-9 flex items-center justify-center rounded-xl bg-[#201f1f]">
              <span className="material-symbols-outlined text-[#a48b83]">calendar_month</span>
            </button>
          </div>
        </header>

        {/* Active routine progress on list view */}
        {activeRoutine && !browsedDate && (
          <div className="flex items-center gap-3 bg-[#201f1f] rounded-2xl px-4 py-3 mb-4 border border-[#ff9066]/20">
            <span className="material-symbols-outlined text-[#ff9066] text-lg">assignment</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-bold font-headline text-[#dcc1b8] truncate">{activeRoutine.name}</span>
                <span className="text-[10px] font-bold text-[#a48b83] ml-2 shrink-0">{activeRoutine.currentIndex + 1}/{activeRoutine.exercises.length}</span>
              </div>
              <div className="flex gap-1">
                {activeRoutine.exercises.map((ex, i) => (
                  <button key={i}
                    onClick={() => { if (i < activeRoutine.currentIndex) jumpToRoutineExercise(i) }}
                    title={i < activeRoutine.currentIndex ? ex : undefined}
                    className={`flex-1 h-2.5 rounded-full transition-colors ${i < activeRoutine.currentIndex ? 'cursor-pointer active:scale-90' : 'cursor-default'}`}
                    style={{ backgroundColor: i <= activeRoutine.currentIndex ? '#ff9066' : '#353534' }}
                  />
                ))}
              </div>
              <p className="text-xs text-[#a48b83] mt-1.5 truncate">Next: {activeRoutine.exercises[activeRoutine.currentIndex]}</p>
            </div>
            <button
              onClick={() => {
                const ex = activeRoutine.exercises[activeRoutine.currentIndex]
                const hint = hints.find(h => h.exercise === ex)
                startExercise(ex, hint)
              }}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-[#ff9066] shrink-0 active:scale-90 transition-transform"
            >
              <span className="material-symbols-outlined text-[#752805] text-lg">play_arrow</span>
            </button>
          </div>
        )}

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
            {!browsedDate && (
              <button
                onClick={repeatLastSession}
                disabled={repeatLoading}
                className="mt-5 flex items-center gap-2 px-4 py-2.5 bg-[#201f1f] rounded-xl text-sm font-bold text-[#dcc1b8] active:scale-95 transition-all disabled:opacity-50"
              >
                {repeatLoading
                  ? <span className="w-4 h-4 border-2 border-[#ff9066] border-t-transparent rounded-full animate-spin" />
                  : <span className="material-symbols-outlined text-base text-[#ff9066]">replay</span>}
                Repeat last session
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3 mb-6">
            {loggedLifts.map(l => (
              <SwipeableCard key={l.block_id} onDelete={() => deleteBlock(l.block_id)}
                className={`bg-[#201f1f] rounded-2xl px-4 py-3.5 ${fadingBlocks.has(l.block_id) ? 'animate-fade-out' : 'animate-fade-in'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-[#ff9066]">fitness_center</span>
                    <div>
                      <p className="font-headline font-bold text-[#e5e2e1]">{l.exercise}</p>
                      <p className="text-xs text-[#a48b83]">{l.set_count} sets{(() => {
                        const ex = EXERCISES.find(e => e.name === l.exercise)
                        if (ex?.type === 'timed') { const d = l.max_duration ?? 0; return ` · best ${Math.floor(d / 60)}:${String(d % 60).padStart(2, '0')}` }
                        if (ex?.type === 'bodyweight') return l.max_weight > 0 ? ` · ${l.max_weight} kg` : ' · bodyweight'
                        return ` · ${l.max_weight} kg peak`
                      })()}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setEditLift({ blockId: l.block_id, exercise: l.exercise, sets: [...l.sets] })}>
                      <span className="material-symbols-outlined text-[#a48b83] text-lg">edit</span>
                    </button>
                    <button onClick={() => deleteBlock(l.block_id)} className="hidden md:block">
                      <span className="material-symbols-outlined text-[#56423c] text-lg">close</span>
                    </button>
                  </div>
                </div>
                {l.sets.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2.5 ml-9">
                    {l.sets.map((s, i) => (
                      <span key={s.id} className="text-[11px] bg-[#131313] text-[#a48b83] px-2 py-1 rounded-lg font-label">
                        {i + 1}. {(() => {
                          const ex = EXERCISES.find(e => e.name === l.exercise)
                          if (ex?.type === 'timed') { const ds = s.duration_secs ?? 0; return `${Math.floor(ds / 60)}:${String(ds % 60).padStart(2, '0')}` }
                          if (ex?.type === 'bodyweight') return s.weight > 0 ? `${s.weight}kg × ${s.reps}` : `${s.reps} reps`
                          return `${s.weight}kg × ${s.reps}`
                        })()}
                      </span>
                    ))}
                  </div>
                )}
              </SwipeableCard>
            ))}
            {loggedCardio.map(c => (
              <SwipeableCard key={c.block_id} onDelete={() => deleteBlock(c.block_id)}
                className={`bg-[#201f1f] rounded-2xl px-4 py-3.5 flex items-center justify-between ${fadingBlocks.has(c.block_id) ? 'animate-fade-out' : 'animate-fade-in'}`}>
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
                  <button onClick={() => deleteBlock(c.block_id)} className="hidden md:block">
                    <span className="material-symbols-outlined text-[#56423c] text-lg">close</span>
                  </button>
                </div>
              </SwipeableCard>
            ))}
          </div>
        )}

        {/* Volume tracker — shown when there are lifts logged for today */}
        {loggedLifts.length > 0 && !browsedDate && (() => {
          const byGroup = new Map<string, { sets: number; tonnage: number }>()
          for (const lift of loggedLifts) {
            const ex = EXERCISES.find(e => e.name === lift.exercise)
            if (!ex) continue
            const existing = byGroup.get(ex.category) ?? { sets: 0, tonnage: 0 }
            const tonnage = lift.sets.reduce((sum, s) => sum + s.weight * s.reps, 0)
            byGroup.set(ex.category, { sets: existing.sets + lift.set_count, tonnage: existing.tonnage + tonnage })
          }
          if (byGroup.size === 0) return null
          const TARGET_SETS = 5
          const totalTonnage = [...byGroup.values()].reduce((s, v) => s + v.tonnage, 0)
          return (
            <div className="mb-4 bg-[#201f1f] rounded-2xl px-4 py-3">
              <p className="text-[10px] font-bold font-label uppercase tracking-widest text-[#a48b83] mb-3">Today&apos;s volume</p>
              <div className="space-y-2">
                {[...byGroup.entries()].map(([cat, { sets, tonnage }]) => {
                  const progress = Math.min(1, sets / TARGET_SETS)
                  const color = sets >= TARGET_SETS ? '#4bdece' : sets >= 3 ? '#f5a623' : '#ff9066'
                  return (
                    <div key={cat}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-[#dcc1b8]">{cat}</span>
                        <span className="text-[11px] text-[#a48b83]">
                          {sets} set{sets !== 1 ? 's' : ''} · {tonnage >= 1000 ? `${(tonnage / 1000).toFixed(1)}t` : `${tonnage} kg`}
                        </span>
                      </div>
                      <div className="h-1.5 bg-[#353534] rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${progress * 100}%`, backgroundColor: color }} />
                      </div>
                    </div>
                  )
                })}
              </div>
              <p className="text-[10px] text-[#56423c] mt-2.5">
                {totalTonnage >= 1000 ? `${(totalTonnage / 1000).toFixed(2)}t total today` : `${totalTonnage} kg total today`}
              </p>
            </div>
          )
        })()}

        {/* Add button — only shown for today */}
        {!browsedDate && (
          <div className="mt-auto">
            <button
              onClick={() => setShowTypePicker(true)}
              className="w-full flex items-center justify-center gap-3 p-4 bg-[#201f1f] rounded-2xl active:scale-95 transition-all border border-dashed border-[#353534] hover:border-[#ff9066]/40"
            >
              <span className="material-symbols-outlined text-[#ff9066]">add</span>
              <span className="font-headline font-bold text-[#dcc1b8]">Log workout</span>
            </button>
          </div>
        )}

        {/* Edit lift sheet */}
        {editLift && (
          <>
            <div className="fixed inset-0 bg-black/60 z-[60] backdrop-blur-sm" onClick={() => setEditLift(null)} />
            <div className="fixed bottom-0 inset-x-0 max-w-[390px] mx-auto z-[60] bg-[#181818] rounded-t-3xl px-5 pt-5 pb-[calc(env(safe-area-inset-bottom,0px)+24px)] animate-slide-up">
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
                      <input
                        type="number"
                        inputMode="decimal"
                        value={s.weight}
                        onChange={e => setEditLiftField(s.id, 'weight', parseFloat(e.target.value) || 0)}
                        onFocus={e => e.target.select()}
                        className="font-headline font-bold text-sm w-16 text-center bg-transparent outline-none border-b border-[#353534] focus:border-[#ff9066]"
                      />
                      <button onClick={() => adjustEditLiftSet(s.id, 'weight', 2.5)} className="w-8 h-8 rounded-lg bg-[#353534] flex items-center justify-center active:scale-90 transition-transform">
                        <span className="material-symbols-outlined text-sm">add</span>
                      </button>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => adjustEditLiftSet(s.id, 'reps', -1)} className="w-8 h-8 rounded-lg bg-[#353534] flex items-center justify-center active:scale-90 transition-transform">
                        <span className="material-symbols-outlined text-sm">remove</span>
                      </button>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={s.reps}
                        onChange={e => setEditLiftField(s.id, 'reps', parseInt(e.target.value) || 0)}
                        onFocus={e => e.target.select()}
                        className="font-headline font-bold text-sm w-10 text-center bg-transparent outline-none border-b border-[#353534] focus:border-[#ff9066]"
                      />
                      <button onClick={() => adjustEditLiftSet(s.id, 'reps', 1)} className="w-8 h-8 rounded-lg bg-[#353534] flex items-center justify-center active:scale-90 transition-transform">
                        <span className="material-symbols-outlined text-sm">add</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={saveEditLift} className="w-full py-3.5 bg-[#ff9066] text-[#752805] rounded-xl font-headline font-bold text-sm active:scale-95 transition-transform">
                Save changes
              </button>
            </div>
          </>
        )}

        {/* Edit cardio sheet */}
        {editCardio && (
          <>
            <div className="fixed inset-0 bg-black/60 z-[60] backdrop-blur-sm" onClick={() => setEditCardio(null)} />
            <div className="fixed bottom-0 inset-x-0 max-w-[390px] mx-auto z-[60] bg-[#181818] rounded-t-3xl px-5 pt-5 pb-[calc(env(safe-area-inset-bottom,0px)+24px)] animate-slide-up">
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
              <button onClick={saveEditCardio} className="w-full py-3.5 bg-[#4bdece] text-[#003732] rounded-xl font-headline font-bold text-sm active:scale-95 transition-transform">
                Save changes
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

  // ── Jump to a routine exercise by index ──────────────────────────────────
  const jumpToRoutineExercise = (index: number) => {
    if (!activeRoutine) return
    const pendingBlock = activeRoutine.pending[index]
    setActiveRoutine(prev => prev ? { ...prev, currentIndex: index } : null)
    const ex = activeRoutine.exercises[index]
    if (pendingBlock && pendingBlock.sets.length > 0) {
      // Restore previously accumulated sets (all done) + a fresh undone set
      const last = pendingBlock.sets[pendingBlock.sets.length - 1]
      setSets([...pendingBlock.sets, { id: Date.now(), weight: last.weight, reps: last.reps, duration_secs: last.duration_secs, done: false }])
      const exType = EXERCISES.find(e => e.name === ex)?.type ?? 'weights'
      setView({ type: exType === 'bodyweight' ? 'bodyweight' : exType === 'timed' ? 'timed' : 'lift', exercise: ex })
    } else {
      const hint = hints.find((h: ExerciseHint) => h.exercise === ex)
      startExercise(ex, hint)
    }
  }

  // ── Routine progress bar (shared across lift/bodyweight/timed views) ──────
  const routineProgressBar = activeRoutine && (
    <div className="flex items-center gap-3 px-1 py-2">
      <div className="flex-1 flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold font-label text-[#dcc1b8]">{activeRoutine.name}</span>
          <span className="text-[10px] font-bold text-[#a48b83]">{activeRoutine.currentIndex + 1}/{activeRoutine.exercises.length}</span>
        </div>
        <div className="flex gap-1">
          {activeRoutine.exercises.map((ex, i) => (
            <button
              key={i}
              onClick={() => { if (i < activeRoutine.currentIndex) jumpToRoutineExercise(i) }}
              title={i < activeRoutine.currentIndex ? ex : undefined}
              className={`flex-1 h-2.5 rounded-full transition-colors ${i < activeRoutine.currentIndex ? 'cursor-pointer active:scale-90' : 'cursor-default'}`}
              style={{ backgroundColor: i <= activeRoutine.currentIndex ? '#ff9066' : '#353534' }}
            />
          ))}
        </div>
      </div>
      <button
        onClick={() => finishRoutine(activeRoutine.pending)}
        className="w-7 h-7 flex items-center justify-center rounded-lg bg-[#353534] shrink-0"
      >
        <span className="material-symbols-outlined text-sm text-[#a48b83]">close</span>
      </button>
    </div>
  )

  // ── Skip function for routine mode ───────────────────────────────────────
  const skipRoutineExercise = () => {
    if (!activeRoutine) return
    if (activeRoutine.currentIndex < activeRoutine.exercises.length - 1) {
      const nextIndex = activeRoutine.currentIndex + 1
      setActiveRoutine(prev => prev ? { ...prev, currentIndex: nextIndex } : null)
      const nextEx = activeRoutine.exercises[nextIndex]
      const hint = hints.find((h: ExerciseHint) => h.exercise === nextEx)
      startExercise(nextEx, hint)
    } else {
      setActiveRoutine(null)
      setView({ type: 'list' })
    }
  }

  // ── Lift logging view ───────────────────────────────────────────────────────
  if (view.type === 'lift') {
    const activeIdx = sets.findIndex(s => !s.done)
    const activeSet = activeIdx !== -1 ? sets[activeIdx] : null
    const pr = prs.get(view.exercise) ?? null
    const currentVol = sets.filter(s => s.done).reduce((sum, s) => sum + s.weight * s.reps, 0)
    const isNewPR = pr != null && currentVol > 0 && currentVol > pr.pr_volume
    const fmtVol = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}t` : `${v} kg`

    return (
      <main className="max-w-[390px] md:max-w-3xl mx-auto min-h-screen pb-32 md:pb-12 flex flex-col animate-fade-in-view">
        {/* Header */}
        <div className="sticky top-0 z-40 px-4 py-4 flex flex-col gap-3 bg-[#0e0e0e]/90 backdrop-blur-md border-b border-[#201f1f]">
          <div className="flex items-center justify-between">
            <button onClick={() => {
              if (activeRoutine) { finishRoutine(activeRoutine.pending); return }
              const hasSets = sets.some(s => s.done)
              if (hasSets && !confirm('Discard this exercise?')) return
              localStorage.removeItem(DRAFT_KEY)
              setSets([{ id: 1, weight: 60, reps: 8, duration_secs: 0, done: false }])
              setView({ type: 'list' })
            }} className="flex items-center gap-1 text-[#a48b83]">
              <span className="material-symbols-outlined text-lg">arrow_back</span>
              <span className="text-sm font-bold">Back</span>
            </button>
            <div className="flex flex-col items-center gap-0.5">
              <h2 className="font-headline font-bold text-[#e5e2e1]">{view.exercise}</h2>
              {pr && pr.pr_volume > 0 && (
                <div className={`flex items-center gap-1.5 text-[10px] font-bold font-label transition-colors ${isNewPR ? 'text-[#ff9066]' : 'text-[#56423c]'}`}>
                  <span className="material-symbols-outlined text-[11px]" style={{ fontVariationSettings: `'FILL' ${isNewPR ? 1 : 0}` }}>emoji_events</span>
                  {isNewPR
                    ? `Vol PR! ${fmtVol(currentVol)}`
                    : currentVol > 0
                      ? `${fmtVol(currentVol)} / ${fmtVol(pr.pr_volume)}`
                      : `Best ${fmtVol(pr.pr_volume)}`}
                </div>
              )}
            </div>
            <div className="w-16" />
          </div>
          {routineProgressBar}
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
            <div key={set.id} className="flex items-center gap-3 opacity-40 px-1 animate-fade-in">
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
            <div key={activeSet.id} className="bg-[#201f1f] rounded-2xl p-4 border border-[#ff9066]/20 animate-fade-in">
              {restingId !== null ? (
                <RestButton key="rest" seconds={restRemaining} total={restDuration} onSkip={() => setRestingId(null)} />
              ) : (
                <div key={`controls-${sets.filter(s => s.done).length}`} className="animate-fade-in">
                  <div className="flex items-center gap-1 mb-2">
                    <span className="font-headline text-lg font-black text-[#ff9066] w-6">{sets.filter(s => s.done).length + 1}</span>
                    <div className="flex-1 flex gap-3">
                      <div className="flex-1">
                        <p className="text-[10px] text-[#a48b83] uppercase tracking-widest mb-2">Weight kg</p>
                        <div className="flex items-center gap-2">
                          <button onClick={() => updateSet(activeSet.id, 'weight', -2.5)} className="w-8 h-8 rounded-lg bg-[#353534] flex items-center justify-center active:scale-90 transition-transform">
                            <span className="material-symbols-outlined text-sm">remove</span>
                          </button>
                          <input
                            type="number"
                            inputMode="decimal"
                            value={activeSet.weight}
                            onChange={e => setSetField(activeSet.id, 'weight', parseFloat(e.target.value) || 0)}
                            onFocus={e => e.target.select()}
                            className="font-headline text-2xl font-black w-16 text-center bg-transparent outline-none border-b border-[#353534] focus:border-[#ff9066]"
                          />
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
                          <input
                            type="number"
                            inputMode="numeric"
                            value={activeSet.reps}
                            onChange={e => setSetField(activeSet.id, 'reps', parseInt(e.target.value) || 0)}
                            onFocus={e => e.target.select()}
                            className="font-headline text-2xl font-black w-10 text-center bg-transparent outline-none border-b border-[#353534] focus:border-[#ff9066]"
                          />
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
                      step={0.5}
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
                </div>
              )}
            </div>
          )}
        </div>

        {/* Save */}
        <div className="px-4 pb-8 pt-6 flex gap-2">
          {activeRoutine && (
            <button
              onClick={skipRoutineExercise}
              className="px-5 py-4 bg-[#201f1f] text-[#a48b83] rounded-2xl font-headline font-bold text-base active:scale-95 transition-all hover:bg-[#2a2a2a]"
            >
              Skip
            </button>
          )}
          <button
            onClick={saveSets}
            disabled={saving || sets.every(s => !s.done)}
            className="flex-1 py-4 bg-[#201f1f] text-[#e5e2e1] rounded-2xl font-headline font-bold text-base active:scale-95 transition-all disabled:opacity-30 hover:bg-[#2a2a2a]"
          >
            {saving ? 'Saving…' : `Save — ${sets.filter(s => s.done).length} set${sets.filter(s => s.done).length !== 1 ? 's' : ''}`}
          </button>
        </div>

        <BottomNav />
      </main>
    )
  }

  // ── Bodyweight logging view ───────────���─────────────────────��──────────────
  if (view.type === 'bodyweight') {
    const activeIdx = sets.findIndex(s => !s.done)
    const activeSet = activeIdx !== -1 ? sets[activeIdx] : null
    const pr = prs.get(view.exercise) ?? null
    const currentReps = sets.filter(s => s.done).reduce((sum, s) => sum + s.reps, 0)
    const isNewPR = pr != null && currentReps > 0 && currentReps > pr.pr_reps_total

    return (
      <main className="max-w-[390px] md:max-w-3xl mx-auto min-h-screen pb-32 md:pb-12 flex flex-col animate-fade-in-view">
        <div className="sticky top-0 z-40 px-4 py-4 flex flex-col gap-3 bg-[#0e0e0e]/90 backdrop-blur-md border-b border-[#201f1f]">
          <div className="flex items-center justify-between">
            <button onClick={() => {
              if (activeRoutine) { finishRoutine(activeRoutine.pending); return }
              const hasSets = sets.some(s => s.done)
              if (hasSets && !confirm('Discard this exercise?')) return
              localStorage.removeItem(DRAFT_KEY)
              setSets([{ id: 1, weight: 60, reps: 8, duration_secs: 0, done: false }])
              setView({ type: 'list' })
            }} className="flex items-center gap-1 text-[#a48b83]">
              <span className="material-symbols-outlined text-lg">arrow_back</span>
              <span className="text-sm font-bold">Back</span>
            </button>
            <div className="flex flex-col items-center gap-0.5">
              <h2 className="font-headline font-bold text-[#e5e2e1]">{view.exercise}</h2>
              {pr && pr.pr_reps_total > 0 && (
                <div className={`flex items-center gap-1.5 text-[10px] font-bold font-label transition-colors ${isNewPR ? 'text-[#ff9066]' : 'text-[#56423c]'}`}>
                  <span className="material-symbols-outlined text-[11px]" style={{ fontVariationSettings: `'FILL' ${isNewPR ? 1 : 0}` }}>emoji_events</span>
                  {isNewPR
                    ? `Rep PR! ${currentReps}`
                    : currentReps > 0
                      ? `${currentReps} / ${pr.pr_reps_total} reps`
                      : `Best ${pr.pr_reps_total} reps`}
                </div>
              )}
            </div>
            <div className="w-16" />
          </div>
          {routineProgressBar}
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
            <div key={set.id} className="flex items-center gap-3 opacity-40 px-1 animate-fade-in">
              <span className="w-5 font-headline text-sm font-bold text-[#dcc1b8]">{i + 1}</span>
              <div className="flex-1 flex gap-6">
                <span className="font-headline font-bold">{set.reps} <span className="text-xs font-normal text-[#a48b83]">reps</span></span>
                {set.weight > 0 && <span className="font-headline font-bold">{set.weight} <span className="text-xs font-normal text-[#a48b83]">kg</span></span>}
              </div>
              <button onClick={() => toggleSet(set.id)} className="w-6 h-6 rounded-full bg-[#4bdece] flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-[#003732] text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>check</span>
              </button>
            </div>
          ))}

          {/* Active set */}
          {activeSet && (
            <div key={activeSet.id} className="bg-[#201f1f] rounded-2xl p-4 border border-[#ff9066]/20 animate-fade-in">
              {restingId !== null ? (
                <RestButton key="rest" seconds={restRemaining} total={restDuration} onSkip={() => setRestingId(null)} />
              ) : (
                <div key={`controls-${sets.filter(s => s.done).length}`} className="animate-fade-in">
                  <div className="flex items-center gap-1 mb-2">
                    <span className="font-headline text-lg font-black text-[#ff9066] w-6">{sets.filter(s => s.done).length + 1}</span>
                    <div className="flex-1">
                      <p className="text-[10px] text-[#a48b83] uppercase tracking-widest mb-2">Reps</p>
                      <div className="flex items-center gap-2 justify-center">
                        <button onClick={() => updateSet(activeSet.id, 'reps', -1)} className="w-8 h-8 rounded-lg bg-[#353534] flex items-center justify-center active:scale-90 transition-transform">
                          <span className="material-symbols-outlined text-sm">remove</span>
                        </button>
                        <input
                          type="number"
                          inputMode="numeric"
                          value={activeSet.reps}
                          onChange={e => setSetField(activeSet.id, 'reps', parseInt(e.target.value) || 0)}
                          onFocus={e => e.target.select()}
                          className="font-headline text-2xl font-black w-14 text-center bg-transparent outline-none border-b border-[#353534] focus:border-[#ff9066]"
                        />
                        <button onClick={() => updateSet(activeSet.id, 'reps', 1)} className="w-8 h-8 rounded-lg bg-[#353534] flex items-center justify-center active:scale-90 transition-transform">
                          <span className="material-symbols-outlined text-sm">add</span>
                        </button>
                      </div>
                    </div>
                  </div>
                  {/* Add weight toggle */}
                  {!addWeightMode ? (
                    <button
                      onClick={() => setAddWeightMode(true)}
                      className="flex items-center gap-1.5 text-[10px] font-bold font-label uppercase tracking-widest text-[#a48b83] mb-3 px-1"
                    >
                      <span className="material-symbols-outlined text-sm">add</span>
                      Add weight
                    </button>
                  ) : (
                    <div className="mb-3">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-[10px] text-[#a48b83] uppercase tracking-widest">Weight kg</p>
                        <button onClick={() => { setAddWeightMode(false); setSetField(activeSet.id, 'weight', 0) }} className="text-[10px] font-bold text-[#a48b83]">Remove</button>
                      </div>
                      <div className="flex items-center gap-2 justify-center">
                        <button onClick={() => updateSet(activeSet.id, 'weight', -2.5)} className="w-8 h-8 rounded-lg bg-[#353534] flex items-center justify-center active:scale-90 transition-transform">
                          <span className="material-symbols-outlined text-sm">remove</span>
                        </button>
                        <input
                          type="number"
                          inputMode="decimal"
                          value={activeSet.weight}
                          onChange={e => setSetField(activeSet.id, 'weight', parseFloat(e.target.value) || 0)}
                          onFocus={e => e.target.select()}
                          className="font-headline text-2xl font-black w-16 text-center bg-transparent outline-none border-b border-[#353534] focus:border-[#ff9066]"
                        />
                        <button onClick={() => updateSet(activeSet.id, 'weight', 2.5)} className="w-8 h-8 rounded-lg bg-[#353534] flex items-center justify-center active:scale-90 transition-transform">
                          <span className="material-symbols-outlined text-sm">add</span>
                        </button>
                      </div>
                    </div>
                  )}
                  <button
                    onClick={() => toggleSet(activeSet.id)}
                    className="w-full py-3.5 bg-[#ff9066] text-[#752805] rounded-xl font-headline font-bold text-sm active:scale-95 transition-transform flex items-center justify-center gap-2"
                  >
                    <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                    Log set
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-4 pb-8 pt-6 flex gap-2">
          {activeRoutine && (
            <button onClick={skipRoutineExercise} className="px-5 py-4 bg-[#201f1f] text-[#a48b83] rounded-2xl font-headline font-bold text-base active:scale-95 transition-all hover:bg-[#2a2a2a]">Skip</button>
          )}
          <button
            onClick={saveSets}
            disabled={saving || sets.every(s => !s.done)}
            className="flex-1 py-4 bg-[#201f1f] text-[#e5e2e1] rounded-2xl font-headline font-bold text-base active:scale-95 transition-all disabled:opacity-30 hover:bg-[#2a2a2a]"
          >
            {saving ? 'Saving…' : `Save — ${sets.filter(s => s.done).length} set${sets.filter(s => s.done).length !== 1 ? 's' : ''}`}
          </button>
        </div>

        <BottomNav />
      </main>
    )
  }

  // ── Timed logging view ────────────────────────────────────────────────────
  if (view.type === 'timed') {
    const activeIdx = sets.findIndex(s => !s.done)
    const activeSet = activeIdx !== -1 ? sets[activeIdx] : null
    const fmtDur = (secs: number) => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`
    const pr = prs.get(view.exercise) ?? null
    const currentDur = sets.filter(s => s.done).reduce((sum, s) => sum + (s.duration_secs ?? 0), 0)
    const isNewPR = pr?.pr_duration_total != null && currentDur > 0 && currentDur > pr.pr_duration_total

    return (
      <main className="max-w-[390px] md:max-w-3xl mx-auto min-h-screen pb-32 md:pb-12 flex flex-col animate-fade-in-view">
        <div className="sticky top-0 z-40 px-4 py-4 flex flex-col gap-3 bg-[#0e0e0e]/90 backdrop-blur-md border-b border-[#201f1f]">
          <div className="flex items-center justify-between">
            <button onClick={() => {
              if (activeRoutine) { finishRoutine(activeRoutine.pending); return }
              const hasSets = sets.some(s => s.done)
              if (hasSets && !confirm('Discard this exercise?')) return
              localStorage.removeItem(DRAFT_KEY)
              setSets([{ id: 1, weight: 60, reps: 8, duration_secs: 0, done: false }])
              setView({ type: 'list' })
            }} className="flex items-center gap-1 text-[#a48b83]">
              <span className="material-symbols-outlined text-lg">arrow_back</span>
              <span className="text-sm font-bold">Back</span>
            </button>
            <div className="flex flex-col items-center gap-0.5">
              <h2 className="font-headline font-bold text-[#e5e2e1]">{view.exercise}</h2>
              {pr?.pr_duration_total != null && pr.pr_duration_total > 0 && (
                <div className={`flex items-center gap-1.5 text-[10px] font-bold font-label transition-colors ${isNewPR ? 'text-[#ff9066]' : 'text-[#56423c]'}`}>
                  <span className="material-symbols-outlined text-[11px]" style={{ fontVariationSettings: `'FILL' ${isNewPR ? 1 : 0}` }}>emoji_events</span>
                  {isNewPR
                    ? `Duration PR! ${fmtDur(currentDur)}`
                    : currentDur > 0
                      ? `${fmtDur(currentDur)} / ${fmtDur(pr.pr_duration_total)}`
                      : `Best ${fmtDur(pr.pr_duration_total)}`}
                </div>
              )}
            </div>
            <div className="w-16" />
          </div>
          {routineProgressBar}
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
            <div key={set.id} className="flex items-center gap-3 opacity-40 px-1 animate-fade-in">
              <span className="w-5 font-headline text-sm font-bold text-[#dcc1b8]">{i + 1}</span>
              <span className="font-headline font-bold">{fmtDur(set.duration_secs)}</span>
              <div className="flex-1" />
              <button onClick={() => toggleSet(set.id)} className="w-6 h-6 rounded-full bg-[#4bdece] flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-[#003732] text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>check</span>
              </button>
            </div>
          ))}

          {/* Active set */}
          {activeSet && (
            <div key={activeSet.id} className="bg-[#201f1f] rounded-2xl p-4 border border-[#ff9066]/20 animate-fade-in">
              {restingId !== null ? (
                <RestButton key="rest" seconds={restRemaining} total={restDuration} onSkip={() => setRestingId(null)} />
              ) : (
                <div key={`controls-${sets.filter(s => s.done).length}`} className="animate-fade-in">
                  <div className="flex items-center gap-1 mb-2">
                    <span className="font-headline text-lg font-black text-[#ff9066] w-6">{sets.filter(s => s.done).length + 1}</span>
                    <div className="flex-1">
                      <p className="text-[10px] text-[#a48b83] uppercase tracking-widest mb-2">Duration</p>
                      <div className="flex items-center gap-2 justify-center">
                        <button onClick={() => setSets(prev => prev.map(s => s.id === activeSet.id ? { ...s, duration_secs: Math.max(0, s.duration_secs - 15) } : s))} className="w-8 h-8 rounded-lg bg-[#353534] flex items-center justify-center active:scale-90 transition-transform">
                          <span className="material-symbols-outlined text-sm">remove</span>
                        </button>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            inputMode="numeric"
                            value={Math.floor(activeSet.duration_secs / 60)}
                            onChange={e => {
                              const mins = Math.max(0, parseInt(e.target.value) || 0)
                              setSets(prev => prev.map(s => s.id === activeSet.id ? { ...s, duration_secs: mins * 60 + (s.duration_secs % 60) } : s))
                            }}
                            onFocus={e => e.target.select()}
                            className="font-headline text-2xl font-black w-10 text-center bg-transparent outline-none border-b border-[#353534] focus:border-[#ff9066]"
                          />
                          <span className="font-headline text-2xl font-black text-[#a48b83]">:</span>
                          <input
                            type="number"
                            inputMode="numeric"
                            value={String(activeSet.duration_secs % 60).padStart(2, '0')}
                            onChange={e => {
                              const secs = Math.min(59, Math.max(0, parseInt(e.target.value) || 0))
                              setSets(prev => prev.map(s => s.id === activeSet.id ? { ...s, duration_secs: Math.floor(s.duration_secs / 60) * 60 + secs } : s))
                            }}
                            onFocus={e => e.target.select()}
                            className="font-headline text-2xl font-black w-10 text-center bg-transparent outline-none border-b border-[#353534] focus:border-[#ff9066]"
                          />
                        </div>
                        <button onClick={() => setSets(prev => prev.map(s => s.id === activeSet.id ? { ...s, duration_secs: s.duration_secs + 15 } : s))} className="w-8 h-8 rounded-lg bg-[#353534] flex items-center justify-center active:scale-90 transition-transform">
                          <span className="material-symbols-outlined text-sm">add</span>
                        </button>
                      </div>
                      <div className="flex justify-center gap-1 mt-1">
                        <span className="text-[10px] text-[#56423c] w-10 text-center">min</span>
                        <span className="w-3" />
                        <span className="text-[10px] text-[#56423c] w-10 text-center">sec</span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => toggleSet(activeSet.id)}
                    className="w-full py-3.5 bg-[#ff9066] text-[#752805] rounded-xl font-headline font-bold text-sm active:scale-95 transition-transform flex items-center justify-center gap-2 mt-2"
                  >
                    <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                    Log set
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-4 pb-8 pt-6 flex gap-2">
          {activeRoutine && (
            <button onClick={skipRoutineExercise} className="px-5 py-4 bg-[#201f1f] text-[#a48b83] rounded-2xl font-headline font-bold text-base active:scale-95 transition-all hover:bg-[#2a2a2a]">Skip</button>
          )}
          <button
            onClick={saveSets}
            disabled={saving || sets.every(s => !s.done)}
            className="flex-1 py-4 bg-[#201f1f] text-[#e5e2e1] rounded-2xl font-headline font-bold text-base active:scale-95 transition-all disabled:opacity-30 hover:bg-[#2a2a2a]"
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
    <main className="max-w-[390px] md:max-w-3xl mx-auto min-h-screen pb-32 md:pb-12 flex flex-col animate-fade-in-view">
      <div className="sticky top-0 z-40 px-4 py-4 bg-[#0e0e0e]/90 backdrop-blur-md border-b border-[#201f1f]">
        <div className="flex items-center justify-between">
          <button onClick={() => {
            const hasData = cardioDistance !== '' || cardioTime !== ''
            if (hasData && !confirm('Discard this cardio entry?')) return
            localStorage.removeItem(DRAFT_KEY)
            setCardioDistance('')
            setCardioTime('')
            setView({ type: 'list' })
          }} className="flex items-center gap-1 text-[#a48b83]">
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
