'use client'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import BottomNav from '@/components/BottomNav'
import { useIntervalsSyncTrigger } from '@/components/IntervalsSyncTrigger'
import Onboarding, { shouldShowOnboarding } from '@/components/Onboarding'
import ExercisePicker, { type ExerciseHint, type ExercisePR } from '@/components/ExercisePicker'
import { EXERCISES, type ExerciseType } from '@/lib/exercises'
import { localToday } from '@/lib/dates'
import { FLUSHED_EVENT, sendOrQueue, type SendResult } from '@/lib/offline-queue'
import { suggestNext } from '@/lib/progression'
import { fmtPrValue } from '@/lib/pr-format'
import { toast } from '@/components/Toast'
import SwipeableCard from '@/components/log/SwipeableCard'
import CardioPicker from '@/components/log/CardioPicker'
import WorkoutTypePicker from '@/components/log/WorkoutTypePicker'
import CalendarSheet from '@/components/log/CalendarSheet'
import ExerciseShell from '@/components/log/ExerciseShell'
import PlateCalculator from '@/components/log/PlateCalculator'
import { BARBELL_EXERCISES, warmupSet } from '@/lib/warmup'
import { loadBar } from '@/lib/plates'
import NextSuggestion from '@/components/log/NextSuggestion'
import { RestButton, playChime, unlockChime } from '@/components/log/RestTimer'

type SetRow = { id: number; weight: number; reps: number; duration_secs: number; done: boolean }
type LoggedSet = { id: number; weight: number; reps: number; duration_secs: number | null }
type LoggedLift = { block_id: number; exercise: string; set_count: number; max_weight: number; max_duration: number | null; sets: LoggedSet[]; notes: string | null }
// Saved on this phone while offline, waiting for the queue to sync
type PendingSave = { key: number; label: string; detail: string; cardio: boolean }
type LoggedCardio = { block_id: number; cardio_id: number; activity: string; distance: string | null; duration: string | null; pace: string | null; notes: string | null }
type Routine = { id: number; name: string; exercises: string[] }
type PendingBlock = { exercise: string; exerciseType: 'weights' | 'bodyweight' | 'timed'; sets: SetRow[] }
type ActiveRoutine = { id: number; name: string; exercises: string[]; currentIndex: number; pending: Record<number, PendingBlock> }
type HistorySet = { weight: number; reps: number; duration_secs: number | null }
type HistoryEntry = { date: string; block_id: number; notes: string | null; sets: HistorySet[] }

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

// How long ago a logged session was — "today", "3d ago", "2w ago"
function relDay(dateStr: string): string {
  const days = Math.floor((Date.now() - new Date(dateStr + 'T00:00:00').getTime()) / 86400000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

type View =
  | { type: 'list' }
  | { type: 'lift'; exercise: string }
  | { type: 'bodyweight'; exercise: string }
  | { type: 'timed'; exercise: string }
  | { type: 'cardio'; activity: string }

export default function LogPage() {
  useIntervalsSyncTrigger()

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
  const [showPlanToday, setShowPlanToday] = useState(false)
  const [planTodayExercises, setPlanTodayExercises] = useState<string[]>([])
  const [planTodayExPickerOpen, setPlanTodayExPickerOpen] = useState(false)
  const [activeRoutine, setActiveRoutine] = useState<ActiveRoutine | null>(null)
  const [routineExPickerOpen, setRoutineExPickerOpen] = useState(false)

  // Bodyweight add-weight toggle
  const [addWeightMode, setAddWeightMode] = useState(false)

  // Lift logging state
  const [sets, setSets] = useState<SetRow[]>([{ id: 1, weight: 60, reps: 8, duration_secs: 0, done: false }])
  const [restingId, setRestingId] = useState<number | null>(null)
  // Rest is tracked as an end timestamp, not a ticking counter — iOS freezes JS timers
  // while the app is in the background, so a counter would pause; a timestamp doesn't.
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null)
  const [nowTs, setNowTs] = useState(() => Date.now())
  const restRemaining = restEndsAt ? Math.max(0, Math.ceil((restEndsAt - nowTs) / 1000)) : 0
  const [restDuration, setRestDuration] = useState(90)
  const startRest = (setId: number, secs: number) => { setRestingId(setId); setRestEndsAt(Date.now() + secs * 1000); setNowTs(Date.now()) }
  const stopRest = () => { setRestingId(null); setRestEndsAt(null) }

  // Plate calculator + next-weight suggestion
  const [plateCalcKg, setPlateCalcKg] = useState<number | null>(null)
  const [suggestApplied, setSuggestApplied] = useState(false)
  const [pendingSaves, setPendingSaves] = useState<PendingSave[]>([])

  // Cardio logging state
  const [cardioDistance, setCardioDistance] = useState('')
  const [cardioTime, setCardioTime] = useState('')
  const cardioPace = useMemo(() => calcPace(cardioDistance, cardioTime), [cardioDistance, cardioTime])

  // Unit preference + notes
  const [unitPref, setUnitPref] = useState<'metric' | 'imperial'>('metric')
  const [sessionNotes, setSessionNotes] = useState('')
  const [notesTarget, setNotesTarget] = useState<'session' | 'block' | null>(null)
  const [notesDraft, setNotesDraft] = useState('')
  const [blockNotes, setBlockNotes] = useState('')
  const notesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Screenshot parsing
  const parseInputRef = useRef<HTMLInputElement>(null)
  const [parseLoading, setParseLoading] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)

  const [repeatLoading, setRepeatLoading] = useState(false)

  const isLbs = unitPref === 'imperial'
  const weightLabel = isLbs ? 'lbs' : 'kg'
  const weightStep = isLbs ? 2.5 / 2.20462 : 2.5
  const kgToDisplay = (kg: number) => {
    if (!isLbs) return kg
    const lbs = kg * 2.20462
    const rounded = Math.round(lbs * 10) / 10
    // Snap to whole number if within 0.15 lbs (handles floating-point round-trip drift)
    const whole = Math.round(rounded)
    return Math.abs(rounded - whole) <= 0.15 ? whole : rounded
  }
  const displayToKg = (val: number) => isLbs ? Math.round((val / 2.20462) * 100) / 100 : val
  // Raw string while user is typing — avoids cursor jumping from kg↔lbs round-trip on iOS
  // null = not focused (show stored value); string = focused (show raw input, including empty)
  const [weightInputVal, setWeightInputVal] = useState<string | null>(null)
  const weightInputProps = (kgVal: number, onCommit: (kg: number) => void) => ({
    type: 'text' as const,
    inputMode: 'decimal' as const,
    value: weightInputVal !== null ? weightInputVal : String(kgToDisplay(kgVal) || ''),
    onFocus: (e: React.FocusEvent<HTMLInputElement>) => { setWeightInputVal(String(kgToDisplay(kgVal) || '')); e.target.select() },
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      setWeightInputVal(e.target.value)
      const num = parseFloat(e.target.value)
      if (!isNaN(num) && num >= 0) onCommit(displayToKg(num))
    },
    onBlur: () => setWeightInputVal(null),
  })

  const toggleUnit = () => {
    const next: 'metric' | 'imperial' = unitPref === 'metric' ? 'imperial' : 'metric'
    setUnitPref(next)
    fetch('/api/account', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ unit_pref: next }) })
  }

  const saveSessionNotes = (notes: string) => {
    if (notesTimerRef.current) clearTimeout(notesTimerRef.current)
    notesTimerRef.current = setTimeout(() => {
      fetch('/api/log', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionNotes: notes, date: localToday() }) })
        .catch(() => toast('Note not saved — no signal', { tone: 'error' }))
    }, 800)
  }

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

  // Recent sessions for the exercise being logged — reference/baseline sheet
  const [historyFor, setHistoryFor] = useState<string | null>(null)
  const [historyCache, setHistoryCache] = useState<Record<string, HistoryEntry[]>>({})
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)

  // Saving
  const [saving, setSaving] = useState(false)

  // Edit sheets
  const [editLift, setEditLift] = useState<{blockId: number; exercise: string; sets: {id: number; weight: number; reps: number; duration_secs: number | null}[]; notes: string} | null>(null)
  const [editCardio, setEditCardio] = useState<{blockId: number; cardioId: number; activity: string; distance: string; duration: string; notes: string} | null>(null)
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
        if (d.restSetId != null && d.restEndsAt != null && d.restEndsAt > Date.now()) {
          setRestingId(d.restSetId)
          setRestEndsAt(d.restEndsAt)
          if (d.restDuration) setRestDuration(d.restDuration)
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
      restEndsAt: restEndsAt ?? undefined,
      restDuration: restingId != null ? restDuration : undefined,
    }))
  }, [draftRestored, view, sets, cardioDistance, cardioTime, activeRoutine, restingId, restEndsAt, restDuration])

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
    const url = `/api/log?date=${date ?? localToday()}`
    setLoadingToday(true)
    fetch(url).then(r => r.json()).then(data => {
      setLoggedLifts(data.lifts ?? [])
      setLoggedCardio(data.cardio ?? [])
      setSessionNotes(data.sessionNotes ?? '')
      setLoadingToday(false)
    }).catch(() => setLoadingToday(false))
  }, [])

  // Initial load — single request gets log + calendar dates + exercise hints
  const initialLoadDone = useRef(false)
  useEffect(() => {
    setLoadingToday(true)
    Promise.all([
      fetch(`/api/log?include=all&date=${localToday()}`).then(r => r.json()),
      fetch('/api/routines').then(r => r.json()).catch(() => ({ routines: [] })),
    ]).then(([data, tplData]) => {
      setLoggedLifts(data.lifts ?? [])
      setLoggedCardio(data.cardio ?? [])
      if (data.unit_pref) setUnitPref(data.unit_pref as 'metric' | 'imperial')
      setSessionNotes(data.sessionNotes ?? '')
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

  // Rest countdown — recomputed from the end timestamp, so time spent outside the app counts
  useEffect(() => {
    if (restingId === null || restEndsAt === null) return
    const tick = () => {
      const t = Date.now()
      setNowTs(t)
      if (t >= restEndsAt) {
        setRestingId(null)
        setRestEndsAt(null)
        if (document.visibilityState === 'visible') playChime()
      }
    }
    tick()
    const iv = setInterval(tick, 250)
    const onVisible = () => { if (document.visibilityState === 'visible') tick() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', onVisible) }
  }, [restingId, restEndsAt])

  // Offline saves just synced — clear the placeholders and show the real data
  useEffect(() => {
    const onFlushed = () => { setPendingSaves([]); refreshCurrent() }
    window.addEventListener(FLUSHED_EVENT, onFlushed)
    return () => window.removeEventListener(FLUSHED_EVENT, onFlushed)
  }, [refreshCurrent])

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
    stopRest()
    setSuggestApplied(false)
    setShowExPicker(false)
    setBlockNotes('')
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
    setBlockNotes('')
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
        unlockChime()
        if (restDuration > 0) startRest(setId, restDuration)
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

  const fmtDurShort = (secs: number) => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`

  const showPrToast = (exercise: string, value: number, exerciseType: string) => {
    const v = exerciseType === 'timed' ? fmtDurShort(value) : `${kgToDisplay(value)} ${weightLabel}`
    toast(`New PR! ${exercise} — ${v}`, { tone: 'pr' })
  }

  const queuedToast = () => toast('No signal — saved on this phone, will sync automatically', { icon: 'cloud_off' })

  const pendingFromSets = (exercise: string, doneSets: SetRow[]): PendingSave => ({
    key: Date.now() + Math.random(),
    label: exercise,
    detail: `${doneSets.length} set${doneSets.length === 1 ? '' : 's'}`,
    cardio: false,
  })

  // Save all pending routine blocks to DB then go to list.
  // Sequential so blocks keep their order; anything the server rejects stays pending for a retry.
  const finishRoutine = async (pending: Record<number, PendingBlock>) => {
    const entries = Object.entries(pending)
    if (entries.length === 0) { setActiveRoutine(null); setView({ type: 'list' }); return }
    setSaving(true)
    try {
      const failed: Record<number, PendingBlock> = {}
      const queued: PendingSave[] = []
      const prsHit: { exercise: string; weight: number; exerciseType: string }[] = []
      let firstError: string | null = null
      for (const [idx, b] of entries) {
        const r: SendResult = await sendOrQueue('/api/log', 'POST', {
          type: 'lift', exercise: b.exercise, sets: b.sets, exerciseType: b.exerciseType, date: localToday(),
        })
        if (r.status === 'error') { failed[Number(idx)] = b; firstError ??= r.error }
        else if (r.status === 'queued') queued.push(pendingFromSets(b.exercise, b.sets))
        else if (r.data.isPr) prsHit.push({ exercise: b.exercise, weight: Number(r.data.weight), exerciseType: b.exerciseType })
      }
      if (queued.length > 0) { setPendingSaves(prev => [...prev, ...queued]); queuedToast() }
      if (prsHit.length > 0) {
        showPrToast(prsHit[0].exercise, prsHit[0].weight, prsHit[0].exerciseType)
        if (prsHit.length > 1) toast(`+${prsHit.length - 1} more PR${prsHit.length > 2 ? 's' : ''} this session`, { tone: 'pr' })
      }
      if (Object.keys(failed).length > 0) {
        setActiveRoutine(prev => prev ? { ...prev, pending: failed } : prev)
        toast(`Couldn't save ${Object.keys(failed).length} exercise(s): ${firstError}. Tap ✕ to retry.`, { tone: 'error' })
        refreshCurrent()
        return
      }
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
    const exerciseType = (view.type === 'timed' ? 'timed' : view.type === 'bodyweight' ? 'bodyweight' : 'weights') as 'weights' | 'bodyweight' | 'timed'

    // In a routine — accumulate locally, save all at the end
    if (activeRoutine) {
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

    // Not in a routine — save immediately
    setSaving(true)
    try {
      const r = await sendOrQueue('/api/log', 'POST', {
        type: 'lift', exercise: view.exercise, sets, exerciseType, notes: blockNotes || null, date: localToday(),
      })
      if (r.status === 'error') { toast(`Save failed: ${r.error}`, { tone: 'error' }); return }
      if (r.status === 'queued') {
        setPendingSaves(prev => [...prev, pendingFromSets(view.exercise, doneSets)])
        queuedToast()
      } else if (r.data.isPr) {
        showPrToast(view.exercise, Number(r.data.weight), exerciseType)
        // Update local PR map so comparison stays live for the rest of the session
        const work = doneSets
        const maxWeight = Math.max(...work.map(s => s.weight))
        const maxReps = Math.max(...work.filter(s => s.weight === maxWeight).map(s => s.reps))
        const maxDuration = Math.max(...work.map(s => s.duration_secs ?? 0))
        const newVol = work.reduce((sum: number, s: SetRow) => sum + s.weight * s.reps, 0)
        const newRepsTotal = work.reduce((sum: number, s: SetRow) => sum + s.reps, 0)
        const newDurTotal = work.reduce((sum: number, s: SetRow) => sum + (s.duration_secs ?? 0), 0)
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
            pr_e1rm: Math.max(Math.round(maxWeight * (1 + maxReps / 30)), old?.pr_e1rm ?? 0) || null,
          })
          return m
        })
      }
      localStorage.removeItem(DRAFT_KEY)
      setSets([{ id: 1, weight: 60, reps: 8, duration_secs: 0, done: false }])
      if (r.status === 'ok') refreshCurrent()
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
      const r = await sendOrQueue('/api/log', 'POST', {
        type: 'cardio', activity: view.activity, distance: cardioDistance, time: cardioTime, pace: cardioPace, notes: blockNotes || null, date: localToday(),
      })
      if (r.status === 'error') { toast(`Save failed: ${r.error}`, { tone: 'error' }); return }
      if (r.status === 'queued') {
        setPendingSaves(prev => [...prev, {
          key: Date.now(), label: view.activity, cardio: true,
          detail: [cardioDistance ? `${cardioDistance} km` : null, cardioTime || null].filter(Boolean).join(' · '),
        }])
        queuedToast()
      } else {
        const cardioPrs = (r.data.cardioPrs ?? []) as { exercise: string; kind: string; value: number }[]
        if (cardioPrs.length > 0) {
          const p = cardioPrs[0]
          toast(`New PR! ${p.exercise} — ${fmtPrValue({ ...p, reps: null }, isLbs)}`, { tone: 'pr' })
        }
        refreshCurrent()
      }
      localStorage.removeItem(DRAFT_KEY)
      setView({ type: 'list' })
    } finally {
      setSaving(false)
    }
  }

  const adjustEditLiftSet = (setId: number, field: 'weight' | 'reps', delta: number) => {
    const step = field === 'weight' ? weightStep * Math.sign(delta) : delta
    setEditLift(prev => prev ? { ...prev, sets: prev.sets.map(s => s.id === setId ? { ...s, [field]: Math.max(0, +(s[field] + step).toFixed(2)) } : s) } : prev)
  }

  const setEditLiftField = (setId: number, field: 'weight' | 'reps', value: number) => {
    setEditLift(prev => prev ? { ...prev, sets: prev.sets.map(s => s.id === setId ? { ...s, [field]: Math.max(0, +value.toFixed(2)) } : s) } : prev)
  }

  const saveEditLift = () => {
    if (!editLift) return
    const { blockId, sets, notes } = editLift
    setLoggedLifts(prev => prev.map(l => l.block_id !== blockId ? l : {
      ...l,
      sets,
      max_weight: Math.max(...sets.map(s => s.weight)),
      notes: notes ?? null,
    }))
    setEditLift(null)
    Promise.all([
      ...sets.map(s =>
        fetch('/api/sets', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: s.id, weight: s.weight, reps: s.reps }) })
      ),
      fetch('/api/log', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ blockId, blockNotes: notes ?? '' }) }),
    ])
  }

  const saveEditCardio = () => {
    if (!editCardio) return
    const { blockId, cardioId, distance, duration, notes } = editCardio
    const pace = calcPace(distance, duration)
    setLoggedCardio(prev => prev.map(c => c.block_id !== blockId ? c : {
      ...c, distance: distance || null, duration: duration || null, pace: pace || null, notes: notes ?? null,
    }))
    setEditCardio(null)
    fetch('/api/log', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cardioId, distance, duration, pace }) })
    fetch('/api/log', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ blockId, blockNotes: notes ?? '' }) })
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

  // ── Recent sessions for one exercise ──────────────────────────────────────
  // Opened from the logging header so the last few sessions are available as a
  // baseline mid-workout. Cached per exercise; re-fetched each open so a block
  // saved earlier today shows up.
  const fetchHistory = useCallback((exercise: string) =>
    fetch(`/api/exercises/history?exercise=${encodeURIComponent(exercise)}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error)
        setHistoryCache(prev => ({ ...prev, [exercise]: (data.entries ?? []) as HistoryEntry[] }))
      }), [])

  const openHistory = (exercise: string) => {
    setHistoryFor(exercise)
    setHistoryError(null)
    setHistoryLoading(historyCache[exercise] === undefined)
    fetchHistory(exercise)
      .catch(() => setHistoryError('Could not load recent sessions'))
      .finally(() => setHistoryLoading(false))
  }

  // Load recent sessions as soon as an exercise opens — feeds the "Try …" suggestion
  const viewExercise = view.type === 'lift' || view.type === 'bodyweight' || view.type === 'timed' ? view.exercise : null
  useEffect(() => {
    if (viewExercise) fetchHistory(viewExercise).catch(() => { /* suggestion is optional */ })
  }, [viewExercise, fetchHistory])

  // Suggestion for the open exercise, from the most recent previous session
  const suggestionFor = (exercise: string, kind: 'weights' | 'bodyweight' | 'timed') => {
    const last = historyCache[exercise]?.[0]
    if (!last) return null
    const suggestion = suggestNext(last.sets, kind, isLbs)
    return suggestion ? { last, suggestion } : null
  }

  // Header button — sits where the back-button spacer used to be
  const historyButton = (exercise: string) => (
    <div className="w-16 flex justify-end">
      <button
        onClick={() => openHistory(exercise)}
        aria-label={`Recent ${exercise} sessions`}
        title="Recent sessions"
        className="w-9 h-9 rounded-lg bg-surface-container flex items-center justify-center active:scale-90 transition-transform hover:bg-surface-container-high"
      >
        <span className="material-symbols-outlined text-outline text-lg">history</span>
      </button>
    </div>
  )

  // Notes editor — portaled to body so it overlays whichever view is active
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  const notesEditorPortal = notesTarget && mounted ? createPortal(
    <>
      <div className="fixed inset-0 bg-black/60 z-[70] backdrop-blur-sm" onClick={() => setNotesTarget(null)} />
      <div className="fixed inset-x-0 bottom-0 max-w-[390px] mx-auto z-[71] bg-surface-sheet rounded-t-3xl px-5 pt-5 pb-[calc(env(safe-area-inset-bottom,0px)+20px)] animate-slide-up">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-headline text-base font-bold">{notesTarget === 'session' ? 'Note for today' : 'Note for this exercise'}</h3>
          <button onClick={() => setNotesTarget(null)}>
            <span className="material-symbols-outlined text-outline">close</span>
          </button>
        </div>
        <textarea
          value={notesDraft}
          onChange={e => setNotesDraft(e.target.value)}
          placeholder={notesTarget === 'session' ? 'How did the session feel? Anything to remember…' : 'Form cues, RPE, anything to remember…'}
          rows={6}
          autoFocus
          className="w-full bg-surface-container rounded-xl px-4 py-3 text-sm text-on-surface placeholder:text-outline-variant resize-none outline-none focus:ring-1 focus:ring-primary-container/30"
        />
        <div className="flex gap-2 mt-4">
          <button
            onClick={() => setNotesTarget(null)}
            className="flex-1 py-3 rounded-xl bg-surface-container text-sm font-headline font-bold text-outline"
          >Cancel</button>
          <button
            onClick={() => {
              if (notesTarget === 'session') { setSessionNotes(notesDraft); saveSessionNotes(notesDraft) }
              else { setBlockNotes(notesDraft) }
              setNotesTarget(null)
            }}
            className="flex-1 py-3 rounded-xl bg-primary-container text-on-primary-container text-sm font-headline font-bold"
          >Save</button>
        </div>
      </div>
    </>,
    document.body
  ) : null

  // Recent-sessions sheet — portaled like the notes editor so it overlays any logging view
  const historySheetPortal = historyFor && mounted ? (() => {
    const exercise = historyFor
    const exType = EXERCISES.find(e => e.name === exercise)?.type ?? 'weights'
    const entries = historyCache[exercise]
    const fmtDur = (secs: number) => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`

    const fmtSet = (s: HistorySet) => {
      if (exType === 'timed') return fmtDur(s.duration_secs ?? 0)
      if (exType === 'bodyweight') return s.weight > 0 ? `+${kgToDisplay(s.weight)} ${weightLabel} × ${s.reps}` : `${s.reps} reps`
      return `${kgToDisplay(s.weight)} ${weightLabel} × ${s.reps}`
    }

    const summary = (entrySets: HistorySet[]) => {
      const n = `${entrySets.length} set${entrySets.length !== 1 ? 's' : ''}`
      if (exType === 'timed') return `${n} · ${fmtDur(entrySets.reduce((sum, s) => sum + (s.duration_secs ?? 0), 0))} total`
      if (exType === 'bodyweight') return `${n} · ${entrySets.reduce((sum, s) => sum + s.reps, 0)} reps`
      const top = entrySets.reduce((a, b) => (b.weight > a.weight ? b : a), entrySets[0])
      const vol = Math.round(kgToDisplay(entrySets.reduce((sum, s) => sum + s.weight * s.reps, 0)))
      const volStr = vol >= 10000 ? `${(vol / 1000).toFixed(1)}k ${weightLabel}` : `${vol} ${weightLabel}`
      return `${n} · top ${kgToDisplay(top.weight)} ${weightLabel} × ${top.reps} · ${volStr}`
    }

    return createPortal(
      <>
        <div className="fixed inset-0 bg-black/60 z-[70] backdrop-blur-sm" onClick={() => setHistoryFor(null)} />
        <div className="fixed inset-x-0 bottom-0 max-w-[390px] mx-auto z-[71] bg-surface-sheet rounded-t-3xl px-5 pt-5 pb-[calc(env(safe-area-inset-bottom,0px)+20px)] animate-slide-up flex flex-col max-h-[78vh]">
          <div className="flex items-start justify-between mb-3 shrink-0">
            <div>
              <h3 className="font-headline text-base font-bold">{exercise}</h3>
              <p className="text-[10px] font-bold font-label uppercase tracking-widest text-outline-variant mt-0.5">Recent sessions</p>
            </div>
            <button onClick={() => setHistoryFor(null)}>
              <span className="material-symbols-outlined text-outline">close</span>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto space-y-2 -mx-1 px-1">
            {!entries && historyLoading && (
              <div className="flex justify-center py-10">
                <div className="w-5 h-5 border-2 border-primary-container border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            {!entries && historyError && (
              <p className="text-sm text-red-400 text-center py-10">{historyError}</p>
            )}
            {entries?.length === 0 && (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <span className="material-symbols-outlined text-3xl text-surface-container-highest mb-2">history</span>
                <p className="text-sm text-outline">No previous sessions yet</p>
                <p className="text-xs text-outline-variant mt-1">Log this exercise once and it&rsquo;ll show up here as a baseline.</p>
              </div>
            )}
            {entries?.map(entry => (
              <div key={entry.block_id} className="bg-surface-container rounded-xl px-4 py-3">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-headline text-sm font-bold text-on-surface">
                    {new Date(entry.date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                  </p>
                  <span className="text-[10px] font-bold font-label text-outline-variant shrink-0">{relDay(entry.date)}</span>
                </div>
                <p className="text-[10px] font-bold font-label text-outline mt-0.5">{summary(entry.sets)}</p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {entry.sets.map((s, i) => (
                    <span key={i} className="px-2 py-1 rounded-lg bg-surface-container-high text-[11px] font-headline font-bold text-on-surface-variant">{fmtSet(s)}</span>
                  ))}
                </div>
                {entry.notes && <p className="text-xs text-outline italic mt-2 whitespace-pre-wrap">{entry.notes}</p>}
              </div>
            ))}
          </div>
        </div>
      </>,
      document.body
    )
  })() : null

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
            <span className={`material-symbols-outlined text-primary-container transition-transform ${pullY >= PULL_THRESHOLD ? 'text-primary-container' : 'text-outline-variant'}`}
              style={{ transform: `rotate(${(pullY / PULL_THRESHOLD) * 180}deg)` }}>refresh</span>
          </div>
        )}
        {showOnboarding && <Onboarding onDone={() => setShowOnboarding(false)} />}
        {showTypePicker && (
          <WorkoutTypePicker
            onSelect={(t) => {
              if (t === 'cardio') { setShowCardioPicker(true) }
              else { setExerciseTypeFilter(t); setShowExPicker(true) }
            }}
            onRoutine={() => setShowRoutinePicker(true)}
            onPlanToday={() => { setPlanTodayExercises([]); setShowPlanToday(true) }}
            onClose={() => setShowTypePicker(false)}
          />
        )}
        {showExPicker && (
          <ExercisePicker
            hints={hints} starred={starred} prs={prs} isLbs={isLbs} onToggleStar={toggleStar}
            exerciseType={exerciseTypeFilter}
            onSelect={startExercise}
            onClose={() => setShowExPicker(false)}
          />
        )}
        {showCardioPicker && (
          <CardioPicker onSelect={startCardio} onClose={() => setShowCardioPicker(false)} />
        )}

        {notesEditorPortal}

        {/* Routine Picker */}
        {showRoutinePicker && (
          <>
            <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" onClick={() => setShowRoutinePicker(false)} />
            <div className="fixed inset-x-0 bottom-0 max-w-[390px] mx-auto z-50 bg-surface-sheet rounded-t-3xl px-5 pt-5 pb-[calc(env(safe-area-inset-bottom,0px)+24px)] max-h-[80vh] overflow-y-auto animate-slide-up">
              <div className="flex items-center justify-between mb-4">
                <p className="text-[10px] font-bold font-label uppercase tracking-widest text-outline">Your routines</p>
                <button onClick={() => setShowRoutinePicker(false)}>
                  <span className="material-symbols-outlined text-outline">close</span>
                </button>
              </div>
              {routines.length === 0 ? (
                <p className="text-sm text-outline text-center py-6">No routines yet. Create one to get started.</p>
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
                        className="flex-1 p-4 bg-surface-container rounded-xl text-left active:scale-[0.98] transition-transform"
                      >
                        <p className="font-headline font-bold text-on-surface mb-1">{t.name}</p>
                        <p className="text-xs text-outline line-clamp-1">
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
                        className="w-10 h-10 flex items-center justify-center rounded-xl bg-surface-container shrink-0"
                      >
                        <span className="material-symbols-outlined text-lg text-outline">edit</span>
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
                className="w-full flex items-center justify-center gap-2 p-4 bg-primary-container rounded-xl active:scale-95 transition-transform"
              >
                <span className="material-symbols-outlined text-lg text-on-primary-container">add</span>
                <span className="font-headline font-bold text-sm text-on-primary-container">Create new routine</span>
              </button>
            </div>
          </>
        )}

        {/* Routine Editor */}
        {showRoutineEditor && editingRoutine && (
          <>
            <div className="fixed inset-0 bg-black/60 z-[60] backdrop-blur-sm" onClick={() => setShowRoutineEditor(false)} />
            <div className="fixed inset-x-0 bottom-0 max-w-[390px] mx-auto z-[60] bg-surface-sheet rounded-t-3xl px-5 pt-5 pb-[calc(env(safe-area-inset-bottom,0px)+24px)] max-h-[85vh] overflow-y-auto animate-slide-up">
              <div className="flex items-center justify-between mb-4">
                <p className="text-[10px] font-bold font-label uppercase tracking-widest text-outline">
                  {editingRoutine.id ? 'Edit routine' : 'New routine'}
                </p>
                <button onClick={() => setShowRoutineEditor(false)}>
                  <span className="material-symbols-outlined text-outline">close</span>
                </button>
              </div>
              <input
                type="text"
                placeholder="Routine name"
                value={editingRoutine.name}
                onChange={e => setEditingRoutine(prev => prev ? { ...prev, name: e.target.value } : prev)}
                className="w-full bg-surface-container rounded-xl px-4 py-3 text-on-surface font-headline font-bold placeholder-outline/50 mb-4 outline-none focus:ring-1 focus:ring-primary-container/40"
              />
              {editingRoutine.exercises.length > 0 && (
                <div className="flex flex-col gap-2 mb-4">
                  {editingRoutine.exercises.map((ex, i) => (
                    <div key={`${ex}-${i}`} className="flex items-center gap-2 bg-surface-container rounded-xl px-4 py-3">
                      <span className="text-xs font-bold text-outline w-5">{i + 1}</span>
                      <span className="flex-1 text-sm text-on-surface">{ex}</span>
                      <button
                        onClick={() => setEditingRoutine(prev => {
                          if (!prev) return prev
                          const exercises = [...prev.exercises]
                          if (i > 0) { [exercises[i - 1], exercises[i]] = [exercises[i], exercises[i - 1]] }
                          return { ...prev, exercises }
                        })}
                        className={`w-7 h-7 flex items-center justify-center rounded-lg ${i > 0 ? 'bg-surface-container-highest' : 'opacity-20'}`}
                        disabled={i === 0}
                      >
                        <span className="material-symbols-outlined text-sm text-outline">expand_less</span>
                      </button>
                      <button
                        onClick={() => setEditingRoutine(prev => {
                          if (!prev) return prev
                          const exercises = [...prev.exercises]
                          if (i < exercises.length - 1) { [exercises[i], exercises[i + 1]] = [exercises[i + 1], exercises[i]] }
                          return { ...prev, exercises }
                        })}
                        className={`w-7 h-7 flex items-center justify-center rounded-lg ${i < editingRoutine.exercises.length - 1 ? 'bg-surface-container-highest' : 'opacity-20'}`}
                        disabled={i === editingRoutine.exercises.length - 1}
                      >
                        <span className="material-symbols-outlined text-sm text-outline">expand_more</span>
                      </button>
                      <button
                        onClick={() => setEditingRoutine(prev => prev ? { ...prev, exercises: prev.exercises.filter((_, j) => j !== i) } : prev)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg bg-surface-container-highest"
                      >
                        <span className="material-symbols-outlined text-sm text-red-400">close</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <button
                onClick={() => { setShowRoutineEditor(false); setRoutineExPickerOpen(true) }}
                className="w-full flex items-center justify-center gap-2 p-3 border border-dashed border-surface-container-highest rounded-xl mb-4 active:scale-95 transition-transform"
              >
                <span className="material-symbols-outlined text-lg text-primary-container">add</span>
                <span className="text-sm font-bold text-on-surface-variant">Add exercise</span>
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
                    if (!res.ok) { toast(`Failed to save routine (${res.status})`, { tone: 'error' }); return }
                    const data = await res.json()
                    if (editingRoutine.id) {
                      setRoutines(prev => prev.map(t => t.id === editingRoutine.id ? { ...t, name: editingRoutine.name, exercises: editingRoutine.exercises } : t))
                    } else {
                      setRoutines(prev => [{ id: data.id, name: editingRoutine.name, exercises: editingRoutine.exercises }, ...prev])
                    }
                    setShowRoutineEditor(false)
                    setEditingRoutine(null)
                  }}
                  className="flex-1 py-3.5 bg-primary-container text-on-primary-container rounded-xl font-headline font-bold text-sm active:scale-95 transition-transform disabled:opacity-40"
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

        {/* Plan Today — ephemeral session planner */}
        {showPlanToday && (
          <>
            <div className="fixed inset-0 bg-black/60 z-[60] backdrop-blur-sm" onClick={() => setShowPlanToday(false)} />
            <div className="fixed inset-x-0 bottom-0 max-w-[390px] mx-auto z-[60] bg-surface-sheet rounded-t-3xl px-5 pt-5 pb-[calc(env(safe-area-inset-bottom,0px)+24px)] max-h-[85vh] overflow-y-auto animate-slide-up">
              <div className="flex items-center justify-between mb-4">
                <p className="text-[10px] font-bold font-label uppercase tracking-widest text-outline">Plan today&apos;s session</p>
                <button onClick={() => setShowPlanToday(false)}>
                  <span className="material-symbols-outlined text-outline">close</span>
                </button>
              </div>
              {planTodayExercises.length > 0 && (
                <div className="flex flex-col gap-2 mb-4">
                  {planTodayExercises.map((ex, i) => (
                    <div key={`${ex}-${i}`} className="flex items-center gap-2 bg-surface-container rounded-xl px-4 py-3">
                      <span className="text-xs font-bold text-outline w-5">{i + 1}</span>
                      <span className="flex-1 text-sm text-on-surface">{ex}</span>
                      <button
                        onClick={() => setPlanTodayExercises(prev => { const a = [...prev]; if (i > 0) { [a[i-1], a[i]] = [a[i], a[i-1]] } return a })}
                        className={`w-7 h-7 flex items-center justify-center rounded-lg ${i > 0 ? 'bg-surface-container-highest' : 'opacity-20'}`}
                        disabled={i === 0}
                      >
                        <span className="material-symbols-outlined text-sm text-outline">expand_less</span>
                      </button>
                      <button
                        onClick={() => setPlanTodayExercises(prev => { const a = [...prev]; if (i < a.length - 1) { [a[i], a[i+1]] = [a[i+1], a[i]] } return a })}
                        className={`w-7 h-7 flex items-center justify-center rounded-lg ${i < planTodayExercises.length - 1 ? 'bg-surface-container-highest' : 'opacity-20'}`}
                        disabled={i === planTodayExercises.length - 1}
                      >
                        <span className="material-symbols-outlined text-sm text-outline">expand_more</span>
                      </button>
                      <button
                        onClick={() => setPlanTodayExercises(prev => prev.filter((_, j) => j !== i))}
                        className="w-7 h-7 flex items-center justify-center rounded-lg bg-surface-container-highest"
                      >
                        <span className="material-symbols-outlined text-sm text-red-400">close</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <button
                onClick={() => { setShowPlanToday(false); setPlanTodayExPickerOpen(true) }}
                className="w-full flex items-center justify-center gap-2 p-3 border border-dashed border-surface-container-highest rounded-xl mb-4 active:scale-95 transition-transform"
              >
                <span className="material-symbols-outlined text-lg text-primary-container">add</span>
                <span className="text-sm font-bold text-on-surface-variant">Add exercise</span>
              </button>
              <button
                disabled={planTodayExercises.length === 0}
                onClick={() => {
                  setShowPlanToday(false)
                  const firstEx = planTodayExercises[0]
                  const hint = hints.find((h: ExerciseHint) => h.exercise === firstEx)
                  setActiveRoutine({ id: -1, name: "Today's session", exercises: planTodayExercises, currentIndex: 0, pending: {} })
                  startExercise(firstEx, hint)
                }}
                className="w-full py-3.5 bg-primary-container text-on-primary-container rounded-xl font-headline font-bold text-sm active:scale-95 transition-transform disabled:opacity-40"
              >
                Start session
              </button>
            </div>
          </>
        )}
        {planTodayExPickerOpen && (
          <ExercisePicker
            hints={hints} starred={starred} onToggleStar={toggleStar}
            multiSelect
            onSelect={() => {}}
            onMultiSelect={(names) => {
              setPlanTodayExercises(prev => [...prev, ...names])
              setPlanTodayExPickerOpen(false)
              setShowPlanToday(true)
            }}
            onClose={() => { setPlanTodayExPickerOpen(false); setShowPlanToday(true) }}
          />
        )}

        <header className="mb-6 flex items-start justify-between">
          <div>
            <p className="font-label text-outline text-xs uppercase tracking-widest mb-1">
              {browsedDate
                ? new Date(browsedDate + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
                : 'Today'}
            </p>
            <h1 className="font-headline text-2xl font-black text-on-surface">Log</h1>
          </div>
          <div className="flex items-center gap-2 pt-1">
            {browsedDate && (
              <button onClick={() => { setBrowsedDate(null) }} className="text-xs text-outline font-bold font-label flex items-center gap-1 px-2.5 py-1.5 bg-surface-container rounded-lg">
                <span className="material-symbols-outlined text-sm">today</span>
                Back to today
              </button>
            )}
            {!browsedDate && (
              <button onClick={repeatLastSession} disabled={repeatLoading} title="Repeat last session" className="w-9 h-9 flex items-center justify-center rounded-xl bg-surface-container disabled:opacity-50">
                {repeatLoading
                  ? <span className="w-4 h-4 border-2 border-primary-container border-t-transparent rounded-full animate-spin" />
                  : <span className="material-symbols-outlined text-outline text-[18px]">replay</span>}
              </button>
            )}
            <button onClick={toggleUnit} className="w-9 h-9 flex items-center justify-center rounded-xl bg-surface-container text-[10px] font-bold font-label text-outline">
              {isLbs ? 'lbs' : 'kg'}
            </button>
            <button onClick={() => setCalOpen(true)} className="w-9 h-9 flex items-center justify-center rounded-xl bg-surface-container">
              <span className="material-symbols-outlined text-outline">calendar_month</span>
            </button>
          </div>
        </header>

        {/* Session notes */}
        {!browsedDate && (
          <button
            onClick={() => { setNotesDraft(sessionNotes); setNotesTarget('session') }}
            className="w-full mb-4 bg-surface-container rounded-xl px-4 py-3 text-left flex items-start gap-3 hover:bg-surface-container-high transition-colors"
          >
            <span className="material-symbols-outlined text-outline text-lg shrink-0">{sessionNotes ? 'sticky_note_2' : 'add_notes'}</span>
            {sessionNotes ? (
              <p className="text-sm text-on-surface-variant italic flex-1 line-clamp-2 whitespace-pre-wrap">{sessionNotes}</p>
            ) : (
              <span className="text-sm text-outline-variant flex-1">Add a note for today…</span>
            )}
            <span className="material-symbols-outlined text-outline-variant text-base shrink-0">edit</span>
          </button>
        )}
        {browsedDate && sessionNotes && (
          <div className="mb-4 bg-surface-container rounded-xl px-4 py-3">
            <p className="text-sm text-outline italic">{sessionNotes}</p>
          </div>
        )}

        {/* Active routine progress on list view */}
        {activeRoutine && !browsedDate && (
          <div className="flex items-center gap-3 bg-surface-container rounded-2xl px-4 py-3 mb-4 border border-primary-container/20">
            <span className="material-symbols-outlined text-primary-container text-lg">assignment</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-bold font-headline text-on-surface-variant truncate">{activeRoutine.name}</span>
                <span className="text-[10px] font-bold text-outline ml-2 shrink-0">{activeRoutine.currentIndex + 1}/{activeRoutine.exercises.length}</span>
              </div>
              <div className="flex gap-1">
                {activeRoutine.exercises.map((ex, i) => (
                  <button key={i}
                    onClick={() => { if (i !== activeRoutine.currentIndex) jumpToRoutineExercise(i) }}
                    title={ex}
                    className={`flex-1 h-2.5 rounded-full transition-colors ${i !== activeRoutine.currentIndex ? 'cursor-pointer active:scale-90' : 'cursor-default'}`}
                    style={{ backgroundColor: i <= activeRoutine.currentIndex ? '#ff9066' : '#353534' }}
                  />
                ))}
              </div>
              <p className="text-xs text-outline mt-1.5 truncate">Up next: {activeRoutine.exercises[activeRoutine.currentIndex]}</p>
            </div>
            <button
              onClick={() => {
                const ex = activeRoutine.exercises[activeRoutine.currentIndex]
                const hint = hints.find(h => h.exercise === ex)
                startExercise(ex, hint)
              }}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-primary-container shrink-0 active:scale-90 transition-transform"
            >
              <span className="material-symbols-outlined text-on-primary-container text-lg">play_arrow</span>
            </button>
          </div>
        )}

        {/* Today's logged exercises */}
        {loadingToday ? (
          <div className="flex justify-center py-12">
            <div className="w-5 h-5 border-2 border-primary-container border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (loggedLifts.length === 0 && loggedCardio.length === 0 && (browsedDate || pendingSaves.length === 0)) ? (
          <div className="flex flex-col items-center justify-center py-16 text-center flex-1">
            <span className="material-symbols-outlined text-5xl text-surface-container-highest mb-4">fitness_center</span>
            <p className="font-headline font-bold text-lg text-on-surface-variant">{browsedDate ? 'Rest day' : 'Nothing logged yet'}</p>
            <p className="text-sm text-outline mt-1">{browsedDate ? 'No workout recorded for this day' : 'Add a lift or cardio below'}</p>
            {!browsedDate && (
              <button
                onClick={repeatLastSession}
                disabled={repeatLoading}
                className="mt-5 flex items-center gap-2 px-4 py-2.5 bg-surface-container rounded-xl text-sm font-bold text-on-surface-variant active:scale-95 transition-all disabled:opacity-50"
              >
                {repeatLoading
                  ? <span className="w-4 h-4 border-2 border-primary-container border-t-transparent rounded-full animate-spin" />
                  : <span className="material-symbols-outlined text-base text-primary-container">replay</span>}
                Repeat last session
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3 mb-6">
            {!browsedDate && pendingSaves.map(p => (
              <div key={p.key} className="bg-surface-container rounded-2xl px-4 py-3.5 flex items-center gap-3 border border-dashed border-surface-container-highest animate-fade-in">
                <span className={`material-symbols-outlined ${p.cardio ? 'text-tertiary' : 'text-primary-container'}`}>{p.cardio ? 'directions_run' : 'fitness_center'}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-headline font-bold text-on-surface truncate">{p.label}</p>
                  <p className="text-xs text-outline">{p.detail}</p>
                </div>
                <span className="flex items-center gap-1 text-[10px] font-bold font-label text-outline">
                  <span className="material-symbols-outlined text-sm">cloud_off</span>Waiting to sync
                </span>
              </div>
            ))}
            {loggedLifts.map(l => (
              <SwipeableCard key={l.block_id} onDelete={() => deleteBlock(l.block_id)}
                className={`bg-surface-container rounded-2xl px-4 py-3.5 ${fadingBlocks.has(l.block_id) ? 'animate-fade-out' : 'animate-fade-in'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-primary-container">fitness_center</span>
                    <div>
                      <p className="font-headline font-bold text-on-surface">{l.exercise}</p>
                      <p className="text-xs text-outline">{l.set_count} sets{(() => {
                        const ex = EXERCISES.find(e => e.name === l.exercise)
                        if (ex?.type === 'timed') { const d = l.max_duration ?? 0; return ` · best ${Math.floor(d / 60)}:${String(d % 60).padStart(2, '0')}` }
                        if (ex?.type === 'bodyweight') return l.max_weight > 0 ? ` · ${kgToDisplay(l.max_weight)} ${weightLabel}` : ' · bodyweight'
                        return ` · ${kgToDisplay(l.max_weight)} ${weightLabel} peak`
                      })()}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setEditLift({ blockId: l.block_id, exercise: l.exercise, sets: [...l.sets], notes: l.notes ?? '' })}>
                      <span className="material-symbols-outlined text-outline text-lg">edit</span>
                    </button>
                    <button onClick={() => deleteBlock(l.block_id)} className="hidden md:block">
                      <span className="material-symbols-outlined text-outline-variant text-lg">close</span>
                    </button>
                  </div>
                </div>
                {l.sets.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2.5 ml-9">
                    {l.sets.map((s, i) => (
                      <span key={s.id} className="text-[11px] bg-surface text-outline px-2 py-1 rounded-lg font-label">
                        {i + 1}. {(() => {
                          const ex = EXERCISES.find(e => e.name === l.exercise)
                          if (ex?.type === 'timed') { const ds = s.duration_secs ?? 0; return `${Math.floor(ds / 60)}:${String(ds % 60).padStart(2, '0')}` }
                          if (ex?.type === 'bodyweight') return s.weight > 0 ? `${kgToDisplay(s.weight)}${weightLabel} × ${s.reps}` : `${s.reps} reps`
                          return `${kgToDisplay(s.weight)}${weightLabel} × ${s.reps}`
                        })()}
                      </span>
                    ))}
                  </div>
                )}
                {l.notes && (
                  <p className="text-xs text-outline-variant mt-1.5 ml-9 italic">{l.notes}</p>
                )}
              </SwipeableCard>
            ))}
            {loggedCardio.map(c => (
              <SwipeableCard key={c.block_id} onDelete={() => deleteBlock(c.block_id)}
                className={`bg-surface-container rounded-2xl px-4 py-3.5 ${fadingBlocks.has(c.block_id) ? 'animate-fade-out' : 'animate-fade-in'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-tertiary">
                      {c.activity === 'Cycling' ? 'directions_bike' : c.activity === 'Walking' ? 'directions_walk' : c.activity.toLowerCase().includes('run') ? 'directions_run' : 'directions_run'}
                    </span>
                    <div>
                      <p className="font-headline font-bold text-on-surface">{c.activity}</p>
                      <p className="text-xs text-outline">
                        {c.distance ? `${c.distance} km` : ''}{c.distance && c.duration ? ' · ' : ''}{c.duration ?? ''}
                        {c.pace ? ` · ${c.pace}/km` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setEditCardio({ blockId: c.block_id, cardioId: c.cardio_id, activity: c.activity, distance: c.distance ?? '', duration: c.duration ?? '', notes: c.notes ?? '' })}>
                      <span className="material-symbols-outlined text-outline text-lg">edit</span>
                    </button>
                    <button onClick={() => deleteBlock(c.block_id)} className="hidden md:block">
                      <span className="material-symbols-outlined text-outline-variant text-lg">close</span>
                    </button>
                  </div>
                </div>
                {c.notes && (
                  <p className="text-xs text-outline-variant mt-1.5 ml-9 italic">{c.notes}</p>
                )}
              </SwipeableCard>
            ))}
          </div>
        )}

        {/* Add button — only shown for today */}
        {!browsedDate && (
          <div className="mt-auto">
            <button
              onClick={() => setShowTypePicker(true)}
              className="w-full flex items-center justify-center gap-3 p-4 bg-surface-container rounded-2xl active:scale-95 transition-all border border-dashed border-surface-container-highest hover:border-primary-container/40"
            >
              <span className="material-symbols-outlined text-primary-container">add</span>
              <span className="font-headline font-bold text-on-surface-variant">Log workout</span>
            </button>
          </div>
        )}

        {/* Edit lift sheet */}
        {editLift && (
          <>
            <div className="fixed inset-0 bg-black/60 z-[60] backdrop-blur-sm" onClick={() => setEditLift(null)} />
            <div className="fixed bottom-0 inset-x-0 max-w-[390px] mx-auto z-[60] bg-surface-sheet rounded-t-3xl px-5 pt-5 pb-[calc(env(safe-area-inset-bottom,0px)+24px)] animate-slide-up">
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-headline font-bold text-on-surface">{editLift.exercise}</h3>
                <button onClick={() => setEditLift(null)}><span className="material-symbols-outlined text-outline">close</span></button>
              </div>
              <div className="space-y-3 mb-4">
                {editLift.sets.map((s, i) => (
                  <div key={s.id} className="flex items-center gap-2">
                    <span className="text-xs text-outline w-10 shrink-0">Set {i + 1}</span>
                    <div className="flex items-center gap-1.5 flex-1">
                      <button onClick={() => adjustEditLiftSet(s.id, 'weight', -1)} className="w-8 h-8 rounded-lg bg-surface-container-highest flex items-center justify-center active:scale-90 transition-transform">
                        <span className="material-symbols-outlined text-sm">remove</span>
                      </button>
                      <input
                        {...weightInputProps(s.weight, kg => setEditLiftField(s.id, 'weight', kg))}
                        className="font-headline font-bold text-sm w-16 text-center bg-transparent outline-none border-b border-surface-container-highest focus:border-primary-container"
                      />
                      <span className="text-[10px] text-outline">{weightLabel}</span>
                      <button onClick={() => adjustEditLiftSet(s.id, 'weight', 1)} className="w-8 h-8 rounded-lg bg-surface-container-highest flex items-center justify-center active:scale-90 transition-transform">
                        <span className="material-symbols-outlined text-sm">add</span>
                      </button>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => adjustEditLiftSet(s.id, 'reps', -1)} className="w-8 h-8 rounded-lg bg-surface-container-highest flex items-center justify-center active:scale-90 transition-transform">
                        <span className="material-symbols-outlined text-sm">remove</span>
                      </button>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={s.reps}
                        onChange={e => setEditLiftField(s.id, 'reps', parseInt(e.target.value) || 0)}
                        onFocus={e => e.target.select()}
                        className="font-headline font-bold text-sm w-10 text-center bg-transparent outline-none border-b border-surface-container-highest focus:border-primary-container"
                      />
                      <button onClick={() => adjustEditLiftSet(s.id, 'reps', 1)} className="w-8 h-8 rounded-lg bg-surface-container-highest flex items-center justify-center active:scale-90 transition-transform">
                        <span className="material-symbols-outlined text-sm">add</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <textarea
                value={editLift.notes}
                onChange={e => setEditLift(prev => prev ? { ...prev, notes: e.target.value } : prev)}
                placeholder="Add a note about this workout…"
                rows={2}
                className="w-full bg-surface rounded-xl px-4 py-3 text-sm text-on-surface-variant placeholder:text-surface-container-highest resize-none outline-none mb-4"
              />
              <button onClick={saveEditLift} className="w-full py-3.5 bg-primary-container text-on-primary-container rounded-xl font-headline font-bold text-sm active:scale-95 transition-transform">
                Save changes
              </button>
            </div>
          </>
        )}

        {/* Edit cardio sheet */}
        {editCardio && (
          <>
            <div className="fixed inset-0 bg-black/60 z-[60] backdrop-blur-sm" onClick={() => setEditCardio(null)} />
            <div className="fixed bottom-0 inset-x-0 max-w-[390px] mx-auto z-[60] bg-surface-sheet rounded-t-3xl px-5 pt-5 pb-[calc(env(safe-area-inset-bottom,0px)+24px)] animate-slide-up">
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-headline font-bold text-on-surface">{editCardio.activity}</h3>
                <button onClick={() => setEditCardio(null)}><span className="material-symbols-outlined text-outline">close</span></button>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="bg-surface-container rounded-2xl p-4 text-center">
                  <input type="number" value={editCardio.distance} onChange={e => setEditCardio(prev => prev ? { ...prev, distance: e.target.value } : prev)} placeholder="0.0" className="w-full bg-transparent text-center font-headline text-3xl font-black outline-none placeholder:text-surface-container-highest" />
                  <span className="block font-label text-[10px] uppercase tracking-widest text-outline mt-1">Distance km</span>
                </div>
                <div className="bg-surface-container rounded-2xl p-4 text-center">
                  <input type="text" value={editCardio.duration} onChange={e => setEditCardio(prev => prev ? { ...prev, duration: e.target.value } : prev)} placeholder="00:00" className="w-full bg-transparent text-center font-headline text-3xl font-black outline-none placeholder:text-surface-container-highest" />
                  <span className="block font-label text-[10px] uppercase tracking-widest text-outline mt-1">Duration</span>
                </div>
              </div>
              {(() => {
                const pace = calcPace(editCardio.distance, editCardio.duration)
                return pace ? (
                  <div className="bg-surface-container rounded-xl px-4 py-2.5 flex items-center justify-between mb-3">
                    <span className="text-[10px] font-bold font-label uppercase tracking-widest text-outline">Avg Pace</span>
                    <span className="font-headline font-bold text-tertiary">{pace} /km</span>
                  </div>
                ) : null
              })()}
              <textarea
                value={editCardio.notes}
                onChange={e => setEditCardio(prev => prev ? { ...prev, notes: e.target.value } : prev)}
                placeholder="Add a note about this workout…"
                rows={2}
                className="w-full bg-surface-container rounded-xl px-4 py-3 text-sm text-on-surface-variant placeholder:text-surface-container-highest resize-none outline-none mb-3"
              />
              <button onClick={saveEditCardio} className="w-full py-3.5 bg-tertiary text-on-tertiary rounded-xl font-headline font-bold text-sm active:scale-95 transition-transform">
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
            today={localToday()}
            onSelectDate={(date) => {
              const todayStr = localToday()
              setBrowsedDate(date === todayStr ? null : date)
            }}
            onPrev={() => setCalMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
            onNext={() => setCalMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
            onClose={() => setCalOpen(false)}
          />
        )}

        <BottomNav />
        {notesEditorPortal}
      </main>
    )
  }

  // ── Jump to a routine exercise by index ──────────────────────────────────
  const jumpToRoutineExercise = (index: number) => {
    if (!activeRoutine) return
    // Save any done sets from the current exercise before switching
    const currentDone = sets.filter(s => s.done)
    let updatedPending = activeRoutine.pending
    if (currentDone.length > 0 && (view.type === 'lift' || view.type === 'bodyweight' || view.type === 'timed')) {
      const exerciseType = (view.type === 'timed' ? 'timed' : view.type === 'bodyweight' ? 'bodyweight' : 'weights') as 'weights' | 'bodyweight' | 'timed'
      updatedPending = { ...activeRoutine.pending, [activeRoutine.currentIndex]: { exercise: view.exercise, exerciseType, sets: currentDone } }
    }
    const pendingBlock = updatedPending[index]
    setActiveRoutine(prev => prev ? { ...prev, currentIndex: index, pending: updatedPending } : null)
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
          <span className="text-xs font-bold font-label text-on-surface-variant">{activeRoutine.exercises[activeRoutine.currentIndex]}</span>
          <span className="text-[10px] font-bold text-outline">{activeRoutine.currentIndex + 1}/{activeRoutine.exercises.length}</span>
        </div>
        <div className="flex gap-1">
          {activeRoutine.exercises.map((ex, i) => (
            <button
              key={i}
              onClick={() => { if (i !== activeRoutine.currentIndex) jumpToRoutineExercise(i) }}
              title={ex}
              className={`flex-1 h-2.5 rounded-full transition-colors ${i !== activeRoutine.currentIndex ? 'cursor-pointer active:scale-90' : 'cursor-default'}`}
              style={{ backgroundColor: i <= activeRoutine.currentIndex ? '#ff9066' : '#353534' }}
            />
          ))}
        </div>
      </div>
      <button
        onClick={() => finishRoutine(activeRoutine.pending)}
        className="w-7 h-7 flex items-center justify-center rounded-lg bg-surface-container-highest shrink-0"
      >
        <span className="material-symbols-outlined text-sm text-outline">close</span>
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

  // ── Shared pieces for the lift / bodyweight / timed views ──────────────────
  const exitExercise = () => {
    if (activeRoutine) { finishRoutine(activeRoutine.pending); return }
    const hasSets = sets.some(s => s.done)
    if (hasSets && !confirm('Discard this exercise?')) return
    localStorage.removeItem(DRAFT_KEY)
    stopRest()
    setSets([{ id: 1, weight: 60, reps: 8, duration_secs: 0, done: false }])
    setView({ type: 'list' })
  }

  const doneCount = sets.filter(s => s.done).length
  const shellProps = {
    onBack: exitExercise,
    routineBar: routineProgressBar,
    restValue: restDuration,
    onRestChange: setAndSaveRestDuration,
    blockNotes,
    onEditNotes: () => { setNotesDraft(blockNotes); setNotesTarget('block') },
    onSkip: activeRoutine ? skipRoutineExercise : undefined,
    onSave: saveSets,
    saveDisabled: saving || doneCount === 0,
    saveLabel: saving ? 'Saving…' : `Save — ${doneCount} set${doneCount !== 1 ? 's' : ''}`,
    after: <><BottomNav />{notesEditorPortal}{historySheetPortal}</>,
  }

  const doneTick = (setId: number) => (
    <button onClick={() => toggleSet(setId)} className="w-6 h-6 rounded-full bg-tertiary flex items-center justify-center flex-shrink-0">
      <span className="material-symbols-outlined text-on-tertiary text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>check</span>
    </button>
  )

  const stepBtn = (onClick: () => void, icon: 'add' | 'remove') => (
    <button onClick={onClick} className="w-8 h-8 rounded-lg bg-surface-container-highest flex items-center justify-center active:scale-90 transition-transform">
      <span className="material-symbols-outlined text-sm">{icon}</span>
    </button>
  )

  const logSetBtn = (setId: number) => (
    <button
      onClick={() => toggleSet(setId)}
      className="w-full py-3.5 bg-primary-container text-on-primary-container rounded-xl font-headline font-bold text-sm active:scale-95 transition-transform flex items-center justify-center gap-2"
    >
      <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
      Log set
    </button>
  )

  const prBadge = (active: boolean, icon: string, text: string) => (
    <div className={`flex items-center gap-1 text-[10px] font-bold font-label transition-colors ${active ? 'text-primary-container' : 'text-outline-variant'}`}>
      <span className="material-symbols-outlined text-[11px]" style={{ fontVariationSettings: `'FILL' ${active ? 1 : 0}` }}>{icon}</span>
      {text}
    </div>
  )
  const badgeSep = <div className="w-px h-3 bg-surface-container-highest" />

  // "Last time … → Try …" before the first set
  const suggestionCard = (exercise: string, kind: 'weights' | 'bodyweight' | 'timed', activeSet: SetRow | null) => {
    if (doneCount > 0 || !activeSet || restingId !== null) return null
    const s = suggestionFor(exercise, kind)
    if (!s) return null
    return (
      <NextSuggestion
        lastDate={relDay(s.last.date)}
        lastSets={s.last.sets}
        suggestion={s.suggestion}
        fmtWeight={kg => `${kgToDisplay(kg)}${weightLabel}`}
        fmtDur={fmtDurShort}
        applied={suggestApplied}
        onUse={() => {
          setSets(prev => prev.map(x => x.id === activeSet.id
            ? { ...x, weight: kind === 'weights' ? s.suggestion.weight : x.weight, reps: s.suggestion.reps || x.reps, duration_secs: s.suggestion.duration_secs || x.duration_secs }
            : x))
          setSuggestApplied(true)
        }}
      />
    )
  }

  // ── Lift logging view ───────────────────────────────────────────────────────
  if (view.type === 'lift') {
    const activeIdx = sets.findIndex(s => !s.done)
    const activeSet = activeIdx !== -1 ? sets[activeIdx] : null
    const pr = prs.get(view.exercise) ?? null
    const doneSets = sets.filter(s => s.done)
    const currentVol = doneSets.reduce((sum, s) => sum + s.weight * s.reps, 0)
    const isVolPR = pr != null && currentVol > 0 && currentVol > pr.pr_volume
    const isWeightPR = pr != null && doneSets.some(s =>
      s.weight > pr.pr_weight || (s.weight === pr.pr_weight && s.reps > pr.pr_reps))
    const fmtVol = (kg: number) => {
      const v = kgToDisplay(kg)
      return v >= 1000 ? `${(v / 1000).toFixed(1)}${isLbs ? 'k lbs' : 't'}` : `${Math.round(v)} ${weightLabel}`
    }

    return (
      <>
        <ExerciseShell
          {...shellProps}
          title={view.exercise}
          headerRight={historyButton(view.exercise)}
          unitLabel={weightLabel}
          onToggleUnit={toggleUnit}
          badges={pr && (pr.pr_volume > 0 || pr.pr_weight > 0 || pr.pr_e1rm) ? (
            <div className="flex items-center gap-2">
              {pr.pr_e1rm && <div className="text-[10px] font-bold font-label text-outline-variant">{kgToDisplay(pr.pr_e1rm)} {weightLabel} 1RM</div>}
              {pr.pr_e1rm && (pr.pr_volume > 0 || pr.pr_weight > 0) && badgeSep}
              {pr.pr_volume > 0 && prBadge(isVolPR, 'monitoring',
                isVolPR ? `Vol PR! ${fmtVol(currentVol)}` : currentVol > 0 ? `${fmtVol(currentVol)} / ${fmtVol(pr.pr_volume)}` : fmtVol(pr.pr_volume))}
              {pr.pr_volume > 0 && pr.pr_weight > 0 && badgeSep}
              {pr.pr_weight > 0 && prBadge(isWeightPR, 'emoji_events', isWeightPR ? 'Weight PR!' : `${kgToDisplay(pr.pr_weight)} ${weightLabel} × ${pr.pr_reps}`)}
            </div>
          ) : null}
        >
          {suggestionCard(view.exercise, 'weights', activeSet)}

          {/* Done sets */}
          {doneSets.map((set, i) => (
            <div key={set.id} className="flex items-center gap-3 opacity-40 px-1 animate-fade-in">
              <span className="w-5 font-headline text-sm font-bold text-on-surface-variant">{i + 1}</span>
              <div className="flex-1 flex gap-6">
                <span className="font-headline font-bold">{kgToDisplay(set.weight)} <span className="text-xs font-normal text-outline">{weightLabel}</span></span>
                <span className="font-headline font-bold">{set.reps} <span className="text-xs font-normal text-outline">reps</span></span>
              </div>
              {doneTick(set.id)}
            </div>
          ))}

          {/* Active set */}
          {activeSet && (
            <div key={activeSet.id} className="bg-surface-container rounded-2xl p-4 border border-primary-container/20 animate-fade-in">
              {restingId !== null ? (
                <RestButton key="rest" seconds={restRemaining} total={restDuration} onSkip={stopRest} />
              ) : (
                <div key={`controls-${doneCount}`} className="animate-fade-in">
                  <div className="flex items-center gap-1 mb-2">
                    <span className="font-headline text-lg font-black text-primary-container w-6">{doneCount + 1}</span>
                    <div className="flex-1 flex gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-1 mb-2">
                          <p className="text-[10px] text-outline uppercase tracking-widest">Weight {weightLabel}</p>
                          <button onClick={() => setPlateCalcKg(activeSet.weight)} aria-label="Plate calculator" title="Plate calculator"
                            className="ml-auto -my-1 w-6 h-6 rounded-md flex items-center justify-center text-outline hover:text-primary-container">
                            <span className="material-symbols-outlined text-base">calculate</span>
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          {stepBtn(() => updateSet(activeSet.id, 'weight', -weightStep), 'remove')}
                          <input
                            {...weightInputProps(activeSet.weight, kg => setSetField(activeSet.id, 'weight', kg))}
                            className="font-headline text-2xl font-black w-16 text-center bg-transparent outline-none border-b border-surface-container-highest focus:border-primary-container"
                          />
                          {stepBtn(() => updateSet(activeSet.id, 'weight', weightStep), 'add')}
                        </div>
                      </div>
                      <div className="flex-1">
                        <p className="text-[10px] text-outline uppercase tracking-widest mb-2">Reps</p>
                        <div className="flex items-center gap-2">
                          {stepBtn(() => updateSet(activeSet.id, 'reps', -1), 'remove')}
                          <input
                            type="number"
                            inputMode="numeric"
                            value={activeSet.reps}
                            onChange={e => setSetField(activeSet.id, 'reps', parseInt(e.target.value) || 0)}
                            onFocus={e => e.target.select()}
                            className="font-headline text-2xl font-black w-10 text-center bg-transparent outline-none border-b border-surface-container-highest focus:border-primary-container"
                          />
                          {stepBtn(() => updateSet(activeSet.id, 'reps', 1), 'add')}
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
                  {/* One warm-up set before the first working set. Tap on barbell lifts to see the plates. */}
                  {doneCount === 0 && (() => {
                    const barbell = BARBELL_EXERCISES.has(view.exercise)
                    // Based on last session (the "Try …" weight), not the weight box — so moving
                    // the box to do the warm-up doesn't change it
                    const plan = suggestionFor(view.exercise, 'weights')
                    if (!plan) return null
                    const targetKg = plan.suggestion.weight
                    const w = warmupSet(kgToDisplay(targetKg), isLbs, barbell ? loadBar(isLbs) : undefined)
                    if (!w) return null
                    const text = (
                      <>
                        <span className="material-symbols-outlined text-base text-primary-container">local_fire_department</span>
                        <span className="text-outline">Warm-up:</span>
                        <span className="font-headline font-bold text-on-surface">{w.weight} {weightLabel} × {w.reps}</span>
                        <span className="text-outline-variant truncate">· then {kgToDisplay(targetKg)} {weightLabel}</span>
                        {barbell && <span className="material-symbols-outlined text-sm text-outline ml-auto">calculate</span>}
                      </>
                    )
                    const cls = 'w-full mb-2 px-3 py-2.5 rounded-xl bg-surface-container-high/60 text-sm flex items-center gap-2'
                    return barbell
                      ? <button onClick={() => setPlateCalcKg(displayToKg(w.weight))} className={`${cls} active:scale-95 transition-transform`}>{text}</button>
                      : <div className={cls}>{text}</div>
                  })()}
                  {logSetBtn(activeSet.id)}
                </div>
              )}
            </div>
          )}
        </ExerciseShell>
        {plateCalcKg !== null && <PlateCalculator weightKg={plateCalcKg} isLbs={isLbs} onClose={() => setPlateCalcKg(null)} />}
      </>
    )
  }

  // ── Bodyweight logging view ─────────────────────────────────────────────────
  if (view.type === 'bodyweight') {
    const activeIdx = sets.findIndex(s => !s.done)
    const activeSet = activeIdx !== -1 ? sets[activeIdx] : null
    const pr = prs.get(view.exercise) ?? null
    const currentReps = sets.filter(s => s.done).reduce((sum, s) => sum + s.reps, 0)
    const isRepTotalPR = pr != null && currentReps > 0 && currentReps > pr.pr_reps_total
    const isSetPR = pr != null && sets.filter(s => s.done).some(s => s.reps > pr.pr_reps)

    return (
      <ExerciseShell
        {...shellProps}
        title={view.exercise}
        headerRight={historyButton(view.exercise)}
        badges={pr && (pr.pr_reps_total > 0 || pr.pr_reps > 0) ? (
          <div className="flex items-center gap-2">
            {pr.pr_reps_total > 0 && prBadge(isRepTotalPR, 'monitoring',
              isRepTotalPR ? `Rep PR! ${currentReps}` : currentReps > 0 ? `${currentReps} / ${pr.pr_reps_total} reps` : `${pr.pr_reps_total} reps`)}
            {pr.pr_reps_total > 0 && pr.pr_reps > 0 && badgeSep}
            {pr.pr_reps > 0 && prBadge(isSetPR, 'emoji_events', isSetPR ? 'Set PR!' : `Best ${pr.pr_reps} reps`)}
          </div>
        ) : null}
      >
        {suggestionCard(view.exercise, 'bodyweight', activeSet)}

        {/* Done sets */}
        {sets.filter(s => s.done).map((set, i) => (
          <div key={set.id} className="flex items-center gap-3 opacity-40 px-1 animate-fade-in">
            <span className="w-5 font-headline text-sm font-bold text-on-surface-variant">{i + 1}</span>
            <div className="flex-1 flex gap-6">
              <span className="font-headline font-bold">{set.reps} <span className="text-xs font-normal text-outline">reps</span></span>
              {set.weight > 0 && <span className="font-headline font-bold">{kgToDisplay(set.weight)} <span className="text-xs font-normal text-outline">{weightLabel}</span></span>}
            </div>
            {doneTick(set.id)}
          </div>
        ))}

        {/* Active set */}
        {activeSet && (
          <div key={activeSet.id} className="bg-surface-container rounded-2xl p-4 border border-primary-container/20 animate-fade-in">
            {restingId !== null ? (
              <RestButton key="rest" seconds={restRemaining} total={restDuration} onSkip={stopRest} />
            ) : (
              <div key={`controls-${doneCount}`} className="animate-fade-in">
                <div className="flex items-center gap-1 mb-2">
                  <span className="font-headline text-lg font-black text-primary-container w-6">{doneCount + 1}</span>
                  <div className="flex-1">
                    <p className="text-[10px] text-outline uppercase tracking-widest mb-2">Reps</p>
                    <div className="flex items-center gap-2 justify-center">
                      {stepBtn(() => updateSet(activeSet.id, 'reps', -1), 'remove')}
                      <input
                        type="number"
                        inputMode="numeric"
                        value={activeSet.reps}
                        onChange={e => setSetField(activeSet.id, 'reps', parseInt(e.target.value) || 0)}
                        onFocus={e => e.target.select()}
                        className="font-headline text-2xl font-black w-14 text-center bg-transparent outline-none border-b border-surface-container-highest focus:border-primary-container"
                      />
                      {stepBtn(() => updateSet(activeSet.id, 'reps', 1), 'add')}
                    </div>
                  </div>
                </div>
                {/* Add weight toggle */}
                {!addWeightMode ? (
                  <button
                    onClick={() => setAddWeightMode(true)}
                    className="flex items-center gap-1.5 text-[10px] font-bold font-label uppercase tracking-widest text-outline mb-3 px-1"
                  >
                    <span className="material-symbols-outlined text-sm">add</span>
                    Add weight
                  </button>
                ) : (
                  <div className="mb-3">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[10px] text-outline uppercase tracking-widest">Weight {weightLabel}</p>
                      <button onClick={() => { setAddWeightMode(false); setSetField(activeSet.id, 'weight', 0) }} className="text-[10px] font-bold text-outline">Remove</button>
                    </div>
                    <div className="flex items-center gap-2 justify-center">
                      {stepBtn(() => updateSet(activeSet.id, 'weight', -weightStep), 'remove')}
                      <input
                        {...weightInputProps(activeSet.weight, kg => setSetField(activeSet.id, 'weight', kg))}
                        className="font-headline text-2xl font-black w-16 text-center bg-transparent outline-none border-b border-surface-container-highest focus:border-primary-container"
                      />
                      {stepBtn(() => updateSet(activeSet.id, 'weight', weightStep), 'add')}
                    </div>
                  </div>
                )}
                {logSetBtn(activeSet.id)}
              </div>
            )}
          </div>
        )}
      </ExerciseShell>
    )
  }

  // ── Timed logging view ────────────────────────────────────────────────────
  if (view.type === 'timed') {
    const activeIdx = sets.findIndex(s => !s.done)
    const activeSet = activeIdx !== -1 ? sets[activeIdx] : null
    const pr = prs.get(view.exercise) ?? null
    const currentDur = sets.filter(s => s.done).reduce((sum, s) => sum + (s.duration_secs ?? 0), 0)
    const isDurTotalPR = pr?.pr_duration_total != null && currentDur > 0 && currentDur > pr.pr_duration_total
    const isSetDurPR = pr?.pr_duration != null && sets.filter(s => s.done).some(s => (s.duration_secs ?? 0) > pr.pr_duration!)
    const setDuration = (setId: number, f: (secs: number) => number) =>
      setSets(prev => prev.map(s => s.id === setId ? { ...s, duration_secs: Math.max(0, f(s.duration_secs)) } : s))

    return (
      <ExerciseShell
        {...shellProps}
        title={view.exercise}
        headerRight={historyButton(view.exercise)}
        badges={pr && (pr.pr_duration_total != null || pr.pr_duration != null) ? (
          <div className="flex items-center gap-2">
            {pr.pr_duration_total != null && pr.pr_duration_total > 0 && prBadge(isDurTotalPR, 'monitoring',
              isDurTotalPR ? `Total PR! ${fmtDurShort(currentDur)}` : currentDur > 0 ? `${fmtDurShort(currentDur)} / ${fmtDurShort(pr.pr_duration_total)}` : fmtDurShort(pr.pr_duration_total))}
            {pr.pr_duration_total != null && pr.pr_duration != null && badgeSep}
            {pr.pr_duration != null && pr.pr_duration > 0 && prBadge(isSetDurPR, 'emoji_events', isSetDurPR ? 'Set PR!' : `Best ${fmtDurShort(pr.pr_duration)}`)}
          </div>
        ) : null}
      >
        {suggestionCard(view.exercise, 'timed', activeSet)}

        {/* Done sets */}
        {sets.filter(s => s.done).map((set, i) => (
          <div key={set.id} className="flex items-center gap-3 opacity-40 px-1 animate-fade-in">
            <span className="w-5 font-headline text-sm font-bold text-on-surface-variant">{i + 1}</span>
            <span className="font-headline font-bold">{fmtDurShort(set.duration_secs)}</span>
            <div className="flex-1" />
            {doneTick(set.id)}
          </div>
        ))}

        {/* Active set */}
        {activeSet && (
          <div key={activeSet.id} className="bg-surface-container rounded-2xl p-4 border border-primary-container/20 animate-fade-in">
            {restingId !== null ? (
              <RestButton key="rest" seconds={restRemaining} total={restDuration} onSkip={stopRest} />
            ) : (
              <div key={`controls-${doneCount}`} className="animate-fade-in">
                <div className="flex items-center gap-1 mb-2">
                  <span className="font-headline text-lg font-black text-primary-container w-6">{doneCount + 1}</span>
                  <div className="flex-1">
                    <p className="text-[10px] text-outline uppercase tracking-widest mb-2">Duration</p>
                    <div className="flex items-center gap-2 justify-center">
                      {stepBtn(() => setDuration(activeSet.id, d => d - 15), 'remove')}
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          inputMode="numeric"
                          value={Math.floor(activeSet.duration_secs / 60)}
                          onChange={e => {
                            const mins = Math.max(0, parseInt(e.target.value) || 0)
                            setDuration(activeSet.id, d => mins * 60 + (d % 60))
                          }}
                          onFocus={e => e.target.select()}
                          className="font-headline text-2xl font-black w-10 text-center bg-transparent outline-none border-b border-surface-container-highest focus:border-primary-container"
                        />
                        <span className="font-headline text-2xl font-black text-outline">:</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          value={String(activeSet.duration_secs % 60).padStart(2, '0')}
                          onChange={e => {
                            const secs = Math.min(59, Math.max(0, parseInt(e.target.value) || 0))
                            setDuration(activeSet.id, d => Math.floor(d / 60) * 60 + secs)
                          }}
                          onFocus={e => e.target.select()}
                          className="font-headline text-2xl font-black w-10 text-center bg-transparent outline-none border-b border-surface-container-highest focus:border-primary-container"
                        />
                      </div>
                      {stepBtn(() => setDuration(activeSet.id, d => d + 15), 'add')}
                    </div>
                    <div className="flex justify-center gap-1 mt-1">
                      <span className="text-[10px] text-outline-variant w-10 text-center">min</span>
                      <span className="w-3" />
                      <span className="text-[10px] text-outline-variant w-10 text-center">sec</span>
                    </div>
                  </div>
                </div>
                <div className="mt-2">{logSetBtn(activeSet.id)}</div>
              </div>
            )}
          </div>
        )}
      </ExerciseShell>
    )
  }

  // ── Cardio logging view ─────────────────────────────────────────────────────
  return (
    <main className="max-w-[390px] md:max-w-3xl mx-auto min-h-screen pb-32 md:pb-12 flex flex-col animate-fade-in-view">
      <div className="sticky top-0 z-40 px-4 py-4 bg-surface-container-lowest/90 backdrop-blur-md border-b border-surface-container">
        <div className="flex items-center justify-between">
          <button onClick={() => {
            const hasData = cardioDistance !== '' || cardioTime !== ''
            if (hasData && !confirm('Discard this cardio entry?')) return
            localStorage.removeItem(DRAFT_KEY)
            setCardioDistance('')
            setCardioTime('')
            setView({ type: 'list' })
          }} className="flex items-center gap-1 text-outline">
            <span className="material-symbols-outlined text-lg">arrow_back</span>
            <span className="text-sm font-bold">Back</span>
          </button>
          <h2 className="font-headline font-bold text-on-surface">{view.activity}</h2>
          <div className="w-16" />
        </div>
      </div>

      <div className="flex-grow px-4 pt-6">
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="bg-surface-container rounded-2xl p-4 text-center">
            <input
              type="number"
              value={cardioDistance}
              onChange={e => setCardioDistance(e.target.value)}
              placeholder="0.0"
              className="w-full bg-transparent text-center font-headline text-3xl font-black outline-none placeholder:text-surface-container-highest"
            />
            <span className="block font-label text-[10px] uppercase tracking-widest text-outline mt-1">Distance km</span>
          </div>
          <div className="bg-surface-container rounded-2xl p-4 text-center">
            <input
              type="text"
              value={cardioTime}
              onChange={e => setCardioTime(e.target.value)}
              placeholder="00:00"
              className="w-full bg-transparent text-center font-headline text-3xl font-black outline-none placeholder:text-surface-container-highest"
            />
            <span className="block font-label text-[10px] uppercase tracking-widest text-outline mt-1">Duration</span>
          </div>
        </div>
        {cardioPace && (
          <div className="bg-surface-container rounded-xl px-4 py-2.5 flex items-center justify-between mb-3">
            <span className="text-[10px] font-bold font-label uppercase tracking-widest text-outline">Avg Pace</span>
            <span className="font-headline font-bold text-tertiary">{cardioPace} /km</span>
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
          className="w-full py-3 rounded-xl border border-outline-variant/40 flex items-center justify-center gap-2 text-on-surface-variant text-sm hover:bg-surface-container transition-colors mt-2 active:scale-95 disabled:opacity-50"
        >
          {parseLoading ? (
            <div className="w-4 h-4 border-2 border-primary-container border-t-transparent rounded-full animate-spin" />
          ) : (
            <span className="material-symbols-outlined text-base text-primary-container">photo_camera</span>
          )}
          {parseLoading ? 'Scanning…' : 'Scan run screenshot'}
        </button>
        {parseError && <p className="text-red-400 text-xs mt-2 text-center">{parseError}</p>}
        <Link href="/import" className="w-full py-3 rounded-xl border border-outline-variant/40 flex items-center justify-center gap-2 text-on-surface-variant text-sm hover:bg-surface-container transition-colors mt-2">
          <span className="material-symbols-outlined text-base">ios_share</span>
          Import from Apple Health
        </Link>
      </div>

      <div className="px-4 pb-8 pt-4">
        <button
          type="button"
          onClick={() => { setNotesDraft(blockNotes); setNotesTarget('block') }}
          className="w-full mb-3 bg-surface-container rounded-xl px-4 py-2.5 text-left flex items-start gap-3 hover:bg-surface-container-high transition-colors"
        >
          <span className="material-symbols-outlined text-outline text-base shrink-0 mt-0.5">{blockNotes ? 'sticky_note_2' : 'add_notes'}</span>
          {blockNotes ? (
            <p className="text-sm text-on-surface-variant italic flex-1 line-clamp-2 whitespace-pre-wrap">{blockNotes}</p>
          ) : (
            <span className="text-sm text-outline-variant flex-1">Notes about this workout…</span>
          )}
          <span className="material-symbols-outlined text-outline-variant text-base shrink-0 mt-0.5">edit</span>
        </button>
        <button
          onClick={saveCardio}
          disabled={saving}
          className="w-full py-4 bg-surface-container text-on-surface rounded-2xl font-headline font-bold text-base active:scale-95 transition-all disabled:opacity-30 hover:bg-surface-container-high"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      <BottomNav />
      {notesEditorPortal}
    </main>
  )
}
