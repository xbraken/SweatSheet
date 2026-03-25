'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import BottomNav from '@/components/BottomNav'

type LiftEntry = { date: string; max_weight: number; volume: number; set_count: number }
type CardioEntry = {
  date: string
  activity: string
  distance: string | null
  duration: string | null
  pace: string | null
  calories: number | null
}
type CalendarDay = {
  date: string
  max_weight: number | null
  total_distance: number | null
}

function formatDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

/** Parse "M:SS" or "MM:SS" or "H:MM:SS" to total seconds */
function toSeconds(str: string | null): number | null {
  if (!str) return null
  const parts = str.split(':').map(Number)
  if (parts.some(isNaN)) return null
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  return null
}

/** Build SVG polyline string scaled to 300×80 viewBox. invert=true means lower value sits higher on screen */
function buildSvgPoints(values: number[], invert = false): string {
  const max = Math.max(...values)
  const min = Math.min(...values)
  const range = max - min || 1
  return values
    .map((v, i) => {
      const x = (i / Math.max(values.length - 1, 1)) * 300
      const norm = (v - min) / range
      const y = invert ? 10 + norm * 70 : 80 - norm * 70
      return `${x},${y}`
    })
    .join(' ')
}

/** Returns positive % = improvement, negative = decline. lowerIsBetter inverts sign. */
function trendPercent(values: number[], lowerIsBetter = false): number | null {
  if (values.length < 4) return null
  const mid = Math.floor(values.length / 2)
  const avgOlder = values.slice(0, mid).reduce((a, b) => a + b, 0) / mid
  const avgNewer = values.slice(mid).reduce((a, b) => a + b, 0) / (values.length - mid)
  if (avgOlder === 0) return null
  const pct = ((avgNewer - avgOlder) / avgOlder) * 100
  return lowerIsBetter ? -pct : pct
}

export default function ProgressPage() {
  const [tab, setTab] = useState<'lifts' | 'cardio'>(() =>
    (typeof localStorage !== 'undefined' && localStorage.getItem('ss_prog_tab') as 'lifts' | 'cardio') || 'lifts'
  )
  const [exercise, setExercise] = useState('')
  const [open, setOpen] = useState(false)
  const [cardioOpen, setCardioOpen] = useState(false)
  const [exercises, setExercises] = useState<string[]>([])
  const [liftHistory, setLiftHistory] = useState<LiftEntry[]>([])
  const [cardioHistory, setCardioHistory] = useState<CardioEntry[]>([])
  const [cardioActivity, setCardioActivity] = useState('')
  const [calendarData, setCalendarData] = useState<CalendarDay[]>([])
  const [loading, setLoading] = useState(true)
  const [cardioMetric, setCardioMetric] = useState<'pace' | 'distance'>(() =>
    (typeof localStorage !== 'undefined' && localStorage.getItem('ss_prog_cardio_metric') as 'pace' | 'distance') || 'pace'
  )
  const [liftSort, setLiftSort] = useState<'date' | 'weight' | 'volume'>(() =>
    (typeof localStorage !== 'undefined' && localStorage.getItem('ss_prog_lift_sort') as 'date' | 'weight' | 'volume') || 'date'
  )
  const [cardioSort, setCardioSort] = useState<'date' | 'distance' | 'pace'>(() =>
    (typeof localStorage !== 'undefined' && localStorage.getItem('ss_prog_cardio_sort') as 'date' | 'distance' | 'pace') || 'date'
  )
  const [calMonthOffset, setCalMonthOffset] = useState(0)
  const [selectedCalDate, setSelectedCalDate] = useState<string | null>(null)
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
  const [chartRange, setChartRange] = useState<'week' | 'month' | 'year' | 'all'>(() =>
    (typeof localStorage !== 'undefined' && localStorage.getItem('ss_prog_range') as 'week' | 'month' | 'year' | 'all') || 'all'
  )
  const [liftMetric, setLiftMetric] = useState<'weight' | 'volume'>(() =>
    (typeof localStorage !== 'undefined' && localStorage.getItem('ss_prog_lift_metric') as 'weight' | 'volume') || 'weight'
  )
  const [bodyWeightLog, setBodyWeightLog] = useState<{ date: string; weight_kg: number }[]>([])
  const [bwInput, setBwInput] = useState('')
  const [bwSaving, setBwSaving] = useState(false)
  const [bwHoveredIdx, setBwHoveredIdx] = useState<number | null>(null)

  // Persist UI preferences to localStorage
  useEffect(() => { localStorage.setItem('ss_prog_tab', tab) }, [tab])
  useEffect(() => { localStorage.setItem('ss_prog_cardio_metric', cardioMetric) }, [cardioMetric])
  useEffect(() => { localStorage.setItem('ss_prog_lift_sort', liftSort) }, [liftSort])
  useEffect(() => { localStorage.setItem('ss_prog_cardio_sort', cardioSort) }, [cardioSort])
  useEffect(() => { localStorage.setItem('ss_prog_range', chartRange) }, [chartRange])
  useEffect(() => { localStorage.setItem('ss_prog_lift_metric', liftMetric) }, [liftMetric])
  useEffect(() => { if (exercise) localStorage.setItem('ss_prog_exercise', exercise) }, [exercise])
  useEffect(() => { if (cardioActivity) localStorage.setItem('ss_prog_cardio_activity', cardioActivity) }, [cardioActivity])

  useEffect(() => {
    fetch('/api/bodyweight').then(r => r.json()).then(data => {
      if (Array.isArray(data)) setBodyWeightLog([...data].reverse())
    }).catch(() => {})
  }, [])

  useEffect(() => {
    fetch('/api/progress')
      .then(r => r.json())
      .then(data => {
        setExercises(data.exercises ?? [])
        const ch = data.cardioHistory ?? []
        setCardioHistory(ch)
        setCalendarData(data.calendarData ?? [])

        // Restore saved cardio activity if still valid, else pick default
        const activities = [...new Set((ch as CardioEntry[]).map(e => e.activity))]
        const savedActivity = localStorage.getItem('ss_prog_cardio_activity')
        const restoredActivity = savedActivity && activities.includes(savedActivity)
          ? savedActivity
          : (activities.find(a => a === 'Outdoor run') ?? activities[0] ?? '')
        setCardioActivity(restoredActivity)

        // Restore saved exercise if still valid, else pick first
        const savedExercise = localStorage.getItem('ss_prog_exercise')
        const restoredExercise = savedExercise && (data.exercises ?? []).includes(savedExercise)
          ? savedExercise
          : data.exercises?.[0] ?? ''
        if (restoredExercise) {
          setExercise(restoredExercise)
        } else {
          setLoading(false)
        }
      })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!exercise) return
    setLoading(true)
    fetch(`/api/progress?exercise=${encodeURIComponent(exercise)}`)
      .then(r => r.json())
      .then(data => {
        setLiftHistory(data.liftHistory ?? [])
        setCardioHistory(data.cardioHistory ?? [])
        setCalendarData(data.calendarData ?? [])
      })
      .finally(() => setLoading(false))
  }, [exercise])

  // ── Chart range cutoff ───────────────────────────────────────────────────────
  const rangeCutoff = useMemo(() => {
    const d = new Date()
    if (chartRange === 'week') { d.setDate(d.getDate() - 7); return d.toISOString().split('T')[0] }
    if (chartRange === 'month') { d.setMonth(d.getMonth() - 1); return d.toISOString().split('T')[0] }
    if (chartRange === 'year') { d.setFullYear(d.getFullYear() - 1); return d.toISOString().split('T')[0] }
    return null
  }, [chartRange])

  // ── Lift chart ──────────────────────────────────────────────────────────────
  const liftChartData = useMemo(() => {
    const arr = [...liftHistory].reverse()
    return rangeCutoff ? arr.filter(e => e.date >= rangeCutoff) : arr
  }, [liftHistory, rangeCutoff])
  const liftChartPts = useMemo(() =>
    liftChartData.map(e => ({
      date: e.date,
      value: liftMetric === 'weight' ? Number(e.max_weight) : Number(e.volume),
    })),
    [liftChartData, liftMetric]
  )
  const liftPts = liftChartPts.map(p => p.value)
  const liftSvgPts = liftPts.length > 1 ? buildSvgPoints(liftPts) : null
  const peakWeight = liftHistory.length > 0 ? Math.max(...liftHistory.map(e => Number(e.max_weight))) : null

  // ── Cardio activity filter ───────────────────────────────────────────────────
  const cardioActivities = useMemo(() => [...new Set(cardioHistory.map(e => e.activity))], [cardioHistory])
  const filteredCardioHistory = useMemo(
    () => cardioActivity ? cardioHistory.filter(e => e.activity === cardioActivity) : cardioHistory,
    [cardioHistory, cardioActivity]
  )

  // ── Cardio chart ────────────────────────────────────────────────────────────
  const cardioChartData = useMemo(() => {
    const arr = [...filteredCardioHistory].reverse()
    return rangeCutoff ? arr.filter(e => e.date >= rangeCutoff) : arr
  }, [filteredCardioHistory, rangeCutoff])
  const hasPaceData = filteredCardioHistory.some(e => e.pace)

  const cardioChartPts = useMemo(() => {
    const pts: Array<{ date: string; value: number; raw: CardioEntry }> = []
    for (const e of cardioChartData) {
      const v = cardioMetric === 'pace' ? toSeconds(e.pace) : (e.distance ? parseFloat(e.distance) : null)
      if (v !== null && !isNaN(v)) pts.push({ date: e.date, value: v, raw: e })
    }
    return pts
  }, [cardioChartData, cardioMetric])
  const cardioValues = useMemo(() => cardioChartPts.map(p => p.value), [cardioChartPts])

  const cardioInvert = cardioMetric === 'pace'
  const cardioSvgPts = cardioValues.length > 1 ? buildSvgPoints(cardioValues, cardioInvert) : null
  const cardioTrend = useMemo(() => trendPercent(cardioValues, cardioInvert), [cardioValues, cardioInvert])
  const liftTrend = useMemo(() => trendPercent(liftPts), [liftPts])

  const peakCardioValue = useMemo(() => {
    if (cardioValues.length === 0) return null
    if (cardioMetric === 'pace') {
      const best = Math.min(...cardioValues)
      return `${Math.floor(best / 60)}:${String(best % 60).padStart(2, '0')}`
    }
    return Math.max(...cardioValues).toFixed(1)
  }, [cardioValues, cardioMetric])

  /** Compute SVG y coordinate (viewBox 0–100) for a value in a dataset */
  function ptY(values: number[], value: number, invert: boolean): number {
    const max = Math.max(...values), min = Math.min(...values), range = max - min || 1
    const norm = (value - min) / range
    return invert ? 10 + norm * 70 : 80 - norm * 70
  }

  const handleChartPointer = useCallback((e: React.PointerEvent<SVGSVGElement>, n: number) => {
    if (n < 2) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    setHoveredIdx(Math.max(0, Math.min(n - 1, Math.round(x * (n - 1)))))
  }, [])

  // ── Sorting ─────────────────────────────────────────────────────────────────
  const sortedLifts = useMemo(() => {
    const arr = [...liftHistory]
    if (liftSort === 'weight') return arr.sort((a, b) => Number(b.max_weight) - Number(a.max_weight))
    if (liftSort === 'volume') return arr.sort((a, b) => Number(b.volume) - Number(a.volume))
    return arr
  }, [liftHistory, liftSort])

  const sortedCardio = useMemo(() => {
    const arr = [...filteredCardioHistory]
    if (cardioSort === 'distance') return arr.sort((a, b) => (parseFloat(b.distance ?? '0') || 0) - (parseFloat(a.distance ?? '0') || 0))
    if (cardioSort === 'pace') return arr.sort((a, b) => (toSeconds(a.pace) ?? Infinity) - (toSeconds(b.pace) ?? Infinity))
    return arr
  }, [filteredCardioHistory, cardioSort])

  // ── PB / best badges ────────────────────────────────────────────────────────
  const pbDate = liftHistory.length > 0
    ? liftHistory.reduce((best, e) => Number(e.max_weight) > Number(best.max_weight) ? e : best).date
    : null

  const fastestRunEntry = useMemo(() => {
    const runs = filteredCardioHistory.filter(e => e.pace)
    if (runs.length === 0) return null
    return runs.reduce((best, e) => (toSeconds(e.pace) ?? Infinity) < (toSeconds(best.pace) ?? Infinity) ? e : best)
  }, [filteredCardioHistory])

  // ── Calendar heat-map ───────────────────────────────────────────────────────
  const calMonthDate = useMemo(() => {
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() + calMonthOffset)
    return d
  }, [calMonthOffset])

  const calendarGrid = useMemo(() => {
    const year = calMonthDate.getFullYear()
    const month = calMonthDate.getMonth()
    const firstDow = (new Date(year, month, 1).getDay() + 6) % 7 // Mon=0
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const todayStr = today.toISOString().split('T')[0]
    const cells: Array<{ date: string | null; isToday: boolean; isFuture: boolean }> = []
    for (let i = 0; i < firstDow; i++) cells.push({ date: null, isToday: false, isFuture: false })
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(year, month, d)
      const str = dt.toISOString().split('T')[0]
      cells.push({ date: str, isToday: str === todayStr, isFuture: dt > today })
    }
    while (cells.length % 7 !== 0) cells.push({ date: null, isToday: false, isFuture: false })
    return cells
  }, [calMonthDate])

  const calendarMap = useMemo(() => {
    const m = new Map<string, CalendarDay>()
    calendarData.forEach(d => m.set(d.date, d))
    return m
  }, [calendarData])

  const maxCalWeight = useMemo(() => Math.max(1, ...calendarData.map(d => Number(d.max_weight) || 0)), [calendarData])
  const maxCalDist = useMemo(() => Math.max(1, ...calendarData.map(d => Number(d.total_distance) || 0)), [calendarData])

  function cellIntensity(day: CalendarDay | undefined): number {
    if (!day) return 0
    if (tab === 'lifts') {
      if (!day.max_weight) return 0
      return Math.max(0.2, Number(day.max_weight) / maxCalWeight)
    }
    if (!day.total_distance) return 0
    return Math.max(0.2, Number(day.total_distance) / maxCalDist)
  }

  const calColor = tab === 'lifts' ? '#ff9066' : '#4bdece'

  const selectedDayWorkouts = useMemo(() => {
    if (!selectedCalDate) return []
    return filteredCardioHistory.filter(e => e.date === selectedCalDate)
  }, [selectedCalDate, filteredCardioHistory])

  const selectedDayLift = useMemo(() => {
    if (!selectedCalDate) return null
    return calendarMap.get(selectedCalDate) ?? null
  }, [selectedCalDate, calendarMap])

  return (
    <main className="w-full max-w-[390px] md:max-w-3xl mx-auto px-6 pt-2 pb-32 md:pb-12 flex flex-col gap-8">
      {/* Header */}
      <header className="flex justify-between items-center py-4">
        <h1 className="text-2xl font-black text-primary tracking-tighter font-headline">SweatSheet</h1>
        <span className="material-symbols-outlined text-primary text-2xl">account_circle</span>
      </header>

      {/* Tabs */}
      <section className="flex flex-col gap-6">
        <div className="flex gap-8 items-end">
          <button
            onClick={() => setTab('lifts')}
            className={`font-headline text-3xl font-bold tracking-tight transition-colors ${tab === 'lifts' ? 'text-primary-container' : 'text-on-surface/30'}`}
          >
            LIFTS
          </button>
          <button
            onClick={() => setTab('cardio')}
            className={`font-headline text-xl font-bold tracking-tight transition-colors ${tab === 'cardio' ? 'text-[#4bdece]' : 'text-on-surface/30'}`}
          >
            CARDIO
          </button>
        </div>

        {tab === 'lifts' && exercises.length > 0 && (
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
                {exercises.map(ex => (
                  <button
                    key={ex}
                    onClick={() => { setExercise(ex); setOpen(false) }}
                    className="w-full px-4 py-3 text-left font-body hover:bg-surface-container-highest transition-colors"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'lifts' && !loading && exercises.length === 0 && (
          <p className="text-sm text-on-surface-variant text-center py-4">
            No lift data yet. Log a session to see progress.
          </p>
        )}

        {tab === 'cardio' && cardioActivities.length > 1 && (
          <div className="relative">
            <div
              onClick={() => setCardioOpen(o => !o)}
              className="bg-surface-container-low p-4 flex justify-between items-center rounded-xl cursor-pointer hover:bg-surface-container-high transition-colors"
            >
              <div>
                <p className="text-[10px] font-bold font-label uppercase tracking-widest text-[#4bdece] mb-1">Activity</p>
                <h2 className="font-headline text-xl font-bold">{cardioActivity}</h2>
              </div>
              <span className="material-symbols-outlined text-[#4bdece]">expand_more</span>
            </div>
            {cardioOpen && (
              <div className="absolute top-full left-0 right-0 bg-surface-container-high rounded-xl mt-1 z-10 border border-outline-variant/20 overflow-hidden">
                {cardioActivities.map(a => (
                  <button
                    key={a}
                    onClick={() => { setCardioActivity(a); setCardioOpen(false) }}
                    className="w-full px-4 py-3 text-left font-body hover:bg-surface-container-highest transition-colors"
                  >
                    {a}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'cardio' && !loading && cardioHistory.length === 0 && (
          <p className="text-sm text-on-surface-variant text-center py-4">
            No cardio data yet. Import or log a session to see progress.
          </p>
        )}
      </section>

      {/* Lift metric toggle */}
      {tab === 'lifts' && liftHistory.length > 0 && (
        <div className="flex gap-2">
          {(['weight', 'volume'] as const).map(m => (
            <button
              key={m}
              onClick={() => { setLiftMetric(m); setHoveredIdx(null) }}
              className={`px-3 py-1.5 rounded-full text-[11px] font-bold font-label uppercase tracking-widest transition-colors ${
                liftMetric === m ? 'bg-primary-container text-[#752805]' : 'bg-surface-container text-on-surface-variant'
              }`}
            >
              {m === 'weight' ? 'Max weight' : 'Volume'}
            </button>
          ))}
        </div>
      )}

      {/* Cardio metric toggle */}
      {tab === 'cardio' && hasPaceData && (
        <div className="flex gap-2">
          {(['pace', 'distance'] as const).map(m => (
            <button
              key={m}
              onClick={() => setCardioMetric(m)}
              className={`px-3 py-1.5 rounded-full text-[11px] font-bold font-label uppercase tracking-widest transition-colors ${
                cardioMetric === m ? 'bg-[#4bdece] text-[#003732]' : 'bg-surface-container text-on-surface-variant'
              }`}
            >
              {m === 'pace' ? 'Pace' : 'Distance'}
            </button>
          ))}
        </div>
      )}

      {/* Desktop: chart + history side by side */}
      <div className="md:grid md:grid-cols-2 md:gap-8">

      {/* Chart */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="font-headline text-sm font-bold text-on-surface-variant">
            {tab === 'lifts'
              ? liftMetric === 'weight' ? 'Max weight trend' : 'Volume trend'
              : `${cardioMetric === 'pace' ? 'Pace' : 'Distance'} trend`}
          </h3>
          <div className="flex gap-1">
            {(['week', 'month', 'year', 'all'] as const).map(r => (
              <button
                key={r}
                onClick={() => { setChartRange(r); setHoveredIdx(null) }}
                className={`px-2 py-1 rounded-full text-[10px] font-bold font-label uppercase tracking-widest transition-colors ${
                  chartRange === r
                    ? tab === 'lifts' ? 'bg-primary-container/30 text-primary-container' : 'bg-[#4bdece]/20 text-[#4bdece]'
                    : 'text-on-surface-variant/40'
                }`}
              >
                {r === 'week' ? '7D' : r === 'month' ? '1M' : r === 'year' ? '1Y' : 'All'}
              </button>
            ))}
          </div>
        </div>
        <div className="bg-surface-container rounded-xl p-6 aspect-[4/3] md:aspect-[3/2] relative overflow-hidden flex flex-col justify-end">

          {/* Peak stat / hovered value */}
          {tab === 'lifts' && liftPts.length > 0 && (() => {
            const idx = hoveredIdx ?? liftPts.length - 1
            const pt = liftChartPts[idx]
            return (
              <div className="absolute top-6 right-6 flex flex-col items-end">
                <span className="text-3xl font-black font-headline text-primary-container leading-none">
                  {liftMetric === 'volume' ? Math.round(pt?.value ?? 0).toLocaleString() : pt?.value}
                </span>
                <span className="text-[10px] font-bold font-label uppercase text-on-surface-variant">
                  {hoveredIdx !== null ? formatDate(pt.date) : liftMetric === 'weight' ? 'kg peak' : 'kg vol peak'}
                </span>
              </div>
            )
          })()}
          {tab === 'cardio' && cardioChartPts.length > 0 && (() => {
            const idx = hoveredIdx ?? cardioChartPts.length - 1
            const pt = cardioChartPts[idx]
            const display = cardioMetric === 'pace'
              ? `${Math.floor(pt.value / 60)}:${String(Math.round(pt.value % 60)).padStart(2, '0')}`
              : pt.value.toFixed(1)
            return (
              <div className="absolute top-6 right-6 flex flex-col items-end">
                <span className="text-3xl font-black font-headline text-[#4bdece] leading-none">{display}</span>
                <span className="text-[10px] font-bold font-label uppercase text-on-surface-variant">
                  {hoveredIdx !== null ? formatDate(pt.date) : cardioMetric === 'pace' ? 'best pace' : 'km peak'}
                </span>
              </div>
            )
          })()}

          {/* Trend badge */}
          {tab === 'lifts' && liftTrend !== null && (
            <div className={`absolute top-6 left-6 flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold font-label ${
              liftTrend >= 0 ? 'bg-primary-container/20 text-primary-container' : 'bg-red-500/20 text-red-400'
            }`}>
              <span className="material-symbols-outlined text-[12px]">{liftTrend >= 0 ? 'trending_up' : 'trending_down'}</span>
              {Math.abs(liftTrend).toFixed(0)}% {liftTrend >= 0 ? 'stronger' : 'weaker'}
            </div>
          )}
          {tab === 'cardio' && cardioTrend !== null && (
            <div className={`absolute top-6 left-6 flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold font-label ${
              cardioTrend >= 0 ? 'bg-[#4bdece]/20 text-[#4bdece]' : 'bg-red-500/20 text-red-400'
            }`}>
              <span className="material-symbols-outlined text-[12px]">{cardioTrend >= 0 ? 'trending_up' : 'trending_down'}</span>
              {Math.abs(cardioTrend).toFixed(0)}% {cardioTrend >= 0 ? 'better' : 'worse'}
            </div>
          )}

          {/* Lift SVG */}
          {tab === 'lifts' && (
            liftSvgPts ? (() => {
              const hIdx = hoveredIdx ?? liftPts.length - 1
              const hX = (hIdx / Math.max(liftPts.length - 1, 1)) * 300
              const hY = ptY(liftPts, liftPts[hIdx], false)
              return (
                <svg
                  className="w-full h-32 drop-shadow-[0_0_8px_rgba(255,144,102,0.4)]"
                  viewBox="0 0 300 100" preserveAspectRatio="none"
                  style={{ touchAction: 'none' }}
                  onPointerMove={e => handleChartPointer(e, liftPts.length)}
                  onPointerLeave={() => setHoveredIdx(null)}
                >
                  <defs>
                    <linearGradient id="liftGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ff9066" stopOpacity="0.2" />
                      <stop offset="100%" stopColor="#ff9066" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <polyline points={liftSvgPts} fill="none" stroke="#ff9066" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  <polygon points={`0,80 ${liftSvgPts} 300,80`} fill="url(#liftGrad)" />
                  <line x1={hX} y1={0} x2={hX} y2={100} stroke="#ff9066" strokeWidth="1" strokeOpacity="0.4" strokeDasharray="3,3" />
                  <circle cx={hX} cy={hY} r="5" fill="#ff9066" />
                </svg>
              )
            })() : (
              <div className="w-full h-32 flex items-center justify-center">
                <p className="text-sm text-on-surface-variant/40">Log more sessions to see your trend</p>
              </div>
            )
          )}

          {/* Cardio SVG */}
          {tab === 'cardio' && (
            cardioSvgPts ? (() => {
              const hIdx = hoveredIdx ?? cardioChartPts.length - 1
              const hX = (hIdx / Math.max(cardioChartPts.length - 1, 1)) * 300
              const hY = ptY(cardioValues, cardioValues[hIdx], cardioInvert)
              return (
              <svg
                className="w-full h-32 drop-shadow-[0_0_8px_rgba(75,222,206,0.3)]"
                viewBox="0 0 300 100" preserveAspectRatio="none"
                style={{ touchAction: 'none' }}
                onPointerMove={e => handleChartPointer(e, cardioChartPts.length)}
                onPointerLeave={() => setHoveredIdx(null)}
              >
                <defs>
                  <linearGradient id="cardioGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#4bdece" stopOpacity="0.2" />
                    <stop offset="100%" stopColor="#4bdece" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <polyline points={cardioSvgPts} fill="none" stroke="#4bdece" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                <polygon points={`0,${cardioInvert ? 10 : 80} ${cardioSvgPts} 300,${cardioInvert ? 10 : 80}`} fill="url(#cardioGrad)" />
                <line x1={hX} y1={0} x2={hX} y2={100} stroke="#4bdece" strokeWidth="1" strokeOpacity="0.4" strokeDasharray="3,3" />
                <circle cx={hX} cy={hY} r="5" fill="#4bdece" />
              </svg>
              )
            })() : (
              <div className="w-full h-32 flex items-center justify-center">
                <p className="text-sm text-on-surface-variant/40">
                  {filteredCardioHistory.length === 0 ? 'No cardio data yet' : `No ${cardioMetric} data for these sessions`}
                </p>
              </div>
            )
          )}
        </div>
      </section>

      {/* Calendar heat-map */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="font-headline text-sm font-bold text-on-surface-variant uppercase tracking-widest">Activity map</h3>
          <div className="flex items-center gap-2">
            <button onClick={() => { setCalMonthOffset(o => o - 1); setSelectedCalDate(null) }} className="material-symbols-outlined text-on-surface-variant text-xl">chevron_left</button>
            <span className="text-xs font-bold font-label text-on-surface-variant w-24 text-center">
              {calMonthDate.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
            </span>
            <button onClick={() => { setCalMonthOffset(o => Math.min(o + 1, 0)); setSelectedCalDate(null) }} className={`material-symbols-outlined text-xl ${calMonthOffset >= 0 ? 'text-on-surface-variant/20' : 'text-on-surface-variant'}`} disabled={calMonthOffset >= 0}>chevron_right</button>
          </div>
        </div>
        <div className="bg-surface-container rounded-xl p-4">
          <div className="grid grid-cols-7 gap-1 mb-1">
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
              <div key={i} className="text-center text-[10px] font-bold font-label text-on-surface-variant/40">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {calendarGrid.map(({ date, isToday, isFuture }, i) => {
              if (!date) return <div key={i} />
              const data = calendarMap.get(date)
              const intensity = cellIntensity(data)
              const hasWorkout = intensity > 0
              const isSelected = date === selectedCalDate
              const hex2 = Math.round(intensity * 255).toString(16).padStart(2, '0')
              return (
                <button
                  key={date}
                  onClick={() => setSelectedCalDate(d => d === date ? null : date)}
                  className="aspect-square rounded-md transition-all flex items-center justify-center"
                  style={{
                    backgroundColor: hasWorkout
                      ? `${calColor}${hex2}`
                      : isFuture ? 'transparent' : 'rgba(255,255,255,0.04)',
                    outline: isSelected ? `2px solid ${calColor}` : isToday ? `1px solid ${calColor}66` : undefined,
                    outlineOffset: '2px',
                  }}
                >
                  <span className="text-[9px] font-bold" style={{ color: hasWorkout ? calColor : 'rgba(255,255,255,0.2)' }}>
                    {new Date(date + 'T00:00:00').getDate()}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Selected day detail */}
        {selectedCalDate && (
          <div className="bg-surface-container rounded-xl p-4 flex flex-col gap-2">
            <p className="text-[10px] font-bold font-label uppercase tracking-widest text-on-surface-variant">
              {new Date(selectedCalDate + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
            {tab === 'cardio' && selectedDayWorkouts.length > 0 ? (
              selectedDayWorkouts.map((w, i) => (
                <div key={i} className="flex justify-between items-center">
                  <div>
                    <p className="font-headline font-bold text-on-surface">{w.distance ? `${w.distance} km` : w.activity}</p>
                    <p className="text-xs text-on-surface-variant">{w.activity}</p>
                  </div>
                  <div className="text-right">
                    {w.pace && <p className="text-sm font-bold text-on-surface">{w.pace} /km</p>}
                    {w.duration && <p className="text-xs text-on-surface-variant">{w.duration}</p>}
                    {w.calories && <p className="text-xs text-on-surface-variant">{w.calories} kcal</p>}
                  </div>
                </div>
              ))
            ) : tab === 'lifts' && selectedDayLift?.max_weight ? (
              <div className="flex justify-between items-center">
                <p className="font-headline font-bold text-on-surface">{exercise}</p>
                <p className="text-sm font-bold text-primary-container">{Number(selectedDayLift.max_weight)} kg peak</p>
              </div>
            ) : (
              <p className="text-sm text-on-surface-variant">No workout recorded</p>
            )}
          </div>
        )}
      </section>

      {/* Session history */}
      <section className="flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <h3 className="font-headline text-sm font-bold text-on-surface-variant uppercase tracking-widest">History</h3>
          <div className="flex gap-1">
            {tab === 'lifts'
              ? (['date', 'weight', 'volume'] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => setLiftSort(s)}
                    className={`px-2 py-1 rounded-lg text-[10px] font-bold font-label uppercase tracking-wide transition-colors ${
                      liftSort === s ? 'bg-primary-container/20 text-primary-container' : 'text-on-surface-variant/40'
                    }`}
                  >
                    {s === 'date' ? 'Date' : s === 'weight' ? 'Wt' : 'Vol'}
                  </button>
                ))
              : (['date', 'distance', 'pace'] as const)
                  .filter(s => s !== 'pace' || hasPaceData)
                  .map(s => (
                    <button
                      key={s}
                      onClick={() => setCardioSort(s)}
                      className={`px-2 py-1 rounded-lg text-[10px] font-bold font-label uppercase tracking-wide transition-colors ${
                        cardioSort === s ? 'bg-[#4bdece]/20 text-[#4bdece]' : 'text-on-surface-variant/40'
                      }`}
                    >
                      {s === 'date' ? 'Date' : s === 'distance' ? 'Dist' : 'Pace'}
                    </button>
                  ))
            }
          </div>
        </div>

        <div className="flex flex-col gap-[0.35rem]">
          {tab === 'lifts' ? (
            sortedLifts.length > 0 ? (
              sortedLifts.map((s, i) => {
                const isPb = s.date === pbDate
                return (
                  <div key={i} className={`bg-surface-container p-5 flex justify-between items-center hover:bg-surface-container-high transition-all cursor-pointer rounded-lg ${isPb ? 'border border-primary-container/30' : ''}`}>
                    <div className="flex flex-col gap-1">
                      <p className="text-[10px] font-bold font-label text-on-surface-variant uppercase">{formatDate(s.date)}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-2xl font-black font-headline text-on-surface">
                          {Number(s.max_weight)}{' '}
                          <span className="text-xs font-normal text-on-surface-variant">kg</span>
                        </span>
                        {isPb && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-black font-label bg-primary-container text-[#752805] uppercase tracking-wide">PB</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-bold font-label text-on-surface-variant uppercase mb-1">Volume</p>
                      <p className="font-bold text-on-surface">{Number(s.volume).toFixed(0)} kg</p>
                    </div>
                  </div>
                )
              })
            ) : (
              !loading && <p className="text-sm text-on-surface-variant text-center py-4">No lift history yet for this exercise</p>
            )
          ) : (
            sortedCardio.length > 0 ? (
              sortedCardio.map((s, i) => {
                const isFastest = !!(fastestRunEntry && s.date === fastestRunEntry.date && s.pace === fastestRunEntry.pace)
                return (
                  <div key={i} className={`bg-surface-container p-5 flex justify-between items-start hover:bg-surface-container-high transition-all cursor-pointer rounded-lg ${isFastest ? 'border border-[#4bdece]/30' : ''}`}>
                    <div className="flex flex-col gap-1 flex-1 min-w-0">
                      <p className="text-[10px] font-bold font-label text-on-surface-variant uppercase">{formatDate(s.date)}</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-2xl font-black font-headline text-on-surface">
                          {s.distance ? `${s.distance} km` : s.duration ?? s.activity}
                        </span>
                        {isFastest && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-black font-label bg-[#4bdece] text-[#003732] uppercase tracking-wide">Fastest</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right flex flex-col gap-0.5 ml-3 shrink-0">
                      <p className="text-[10px] font-bold font-label text-on-surface-variant uppercase">{s.activity}</p>
                      {s.pace && <p className="font-bold text-on-surface text-sm">{s.pace} /km</p>}
                      {s.duration && <p className="text-xs text-on-surface-variant">{s.duration}</p>}
                      {s.calories && <p className="text-xs text-on-surface-variant">{s.calories} kcal</p>}
                    </div>
                  </div>
                )
              })
            ) : (
              !loading && <p className="text-sm text-on-surface-variant text-center py-4">No cardio history yet</p>
            )
          )}
          {loading && (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-2 border-primary-container border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>
      </section>

      </div>{/* end desktop two-column */}

      {/* Body weight section */}
      <section className="flex flex-col gap-3">
        <h3 className="font-headline text-sm font-bold text-on-surface-variant uppercase tracking-widest">Body weight</h3>
        {/* Log today */}
        <div className="bg-surface-container rounded-xl p-4 flex items-center gap-3">
          <input
            type="number"
            step="0.1"
            value={bwInput}
            onChange={e => setBwInput(e.target.value)}
            placeholder="e.g. 75.5"
            className="flex-1 bg-transparent font-headline text-xl font-bold outline-none placeholder:text-on-surface-variant/30"
          />
          <span className="text-sm text-on-surface-variant font-bold">kg</span>
          <button
            disabled={!bwInput || bwSaving}
            onClick={async () => {
              setBwSaving(true)
              const today = new Date().toISOString().split('T')[0]
              await fetch('/api/bodyweight', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date: today, weight_kg: parseFloat(bwInput) }),
              })
              const res = await fetch('/api/bodyweight')
              const data = await res.json()
              if (Array.isArray(data)) setBodyWeightLog([...data].reverse())
              setBwInput('')
              setBwSaving(false)
            }}
            className="px-4 py-2 bg-primary-container/20 text-primary-container rounded-xl text-sm font-bold font-label disabled:opacity-30 transition-colors"
          >
            {bwSaving ? '…' : 'Log'}
          </button>
        </div>

        {/* Chart */}
        {bodyWeightLog.length > 1 && (() => {
          const vals = bodyWeightLog.map(e => e.weight_kg)
          const svgPts = buildSvgPoints(vals)
          const hIdx = bwHoveredIdx ?? vals.length - 1
          const hX = (hIdx / Math.max(vals.length - 1, 1)) * 300
          const hY = ptY(vals, vals[hIdx], false)
          return (
            <div className="bg-surface-container rounded-xl p-4 relative">
              <div className="absolute top-4 right-4 flex flex-col items-end">
                <span className="text-2xl font-black font-headline text-primary-container leading-none">{vals[hIdx].toFixed(1)}</span>
                <span className="text-[10px] font-bold font-label uppercase text-on-surface-variant">
                  {bwHoveredIdx !== null ? formatDate(bodyWeightLog[hIdx].date) : 'kg latest'}
                </span>
              </div>
              <svg
                className="w-full h-28"
                viewBox="0 0 300 100" preserveAspectRatio="none"
                style={{ touchAction: 'none' }}
                onPointerMove={e => {
                  const rect = e.currentTarget.getBoundingClientRect()
                  const x = (e.clientX - rect.left) / rect.width
                  setBwHoveredIdx(Math.max(0, Math.min(vals.length - 1, Math.round(x * (vals.length - 1)))))
                }}
                onPointerLeave={() => setBwHoveredIdx(null)}
              >
                <defs>
                  <linearGradient id="bwGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ff9066" stopOpacity="0.15" />
                    <stop offset="100%" stopColor="#ff9066" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <polyline points={svgPts} fill="none" stroke="#ff9066" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                <polygon points={`0,80 ${svgPts} 300,80`} fill="url(#bwGrad)" />
                <line x1={hX} y1={0} x2={hX} y2={100} stroke="#ff9066" strokeWidth="1" strokeOpacity="0.4" strokeDasharray="3,3" />
                <circle cx={hX} cy={hY} r="4" fill="#ff9066" />
              </svg>
            </div>
          )
        })()}

        {/* Log list */}
        {bodyWeightLog.length > 0 && (
          <div className="flex flex-col gap-1">
            {[...bodyWeightLog].reverse().slice(0, 10).map((entry, i) => (
              <div key={i} className="bg-surface-container rounded-lg px-4 py-3 flex justify-between items-center">
                <span className="text-[10px] font-bold font-label uppercase text-on-surface-variant">{formatDate(entry.date)}</span>
                <div className="flex items-center gap-3">
                  <span className="font-headline font-bold">{entry.weight_kg.toFixed(1)} <span className="text-xs font-normal text-on-surface-variant">kg</span></span>
                  <button onClick={async () => {
                    await fetch('/api/bodyweight', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date: entry.date }) })
                    setBodyWeightLog(prev => prev.filter(e => e.date !== entry.date))
                  }} className="text-on-surface-variant/40 hover:text-red-400 transition-colors">
                    <span className="material-symbols-outlined text-base">close</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {bodyWeightLog.length === 0 && (
          <p className="text-sm text-on-surface-variant/40 text-center py-2">Log your weight above to start tracking</p>
        )}
      </section>

      {/* Motivational strip */}
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
