'use client'
import { useState, useEffect, useMemo } from 'react'
import BottomNav from '@/components/BottomNav'

type LiftEntry = { date: string; max_weight: number; volume: number; set_count: number }
type CardioEntry = {
  date: string
  activity: string
  distance: string | null
  duration: string | null
  pace: string | null
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
  const [tab, setTab] = useState<'lifts' | 'cardio'>('lifts')
  const [exercise, setExercise] = useState('')
  const [open, setOpen] = useState(false)
  const [exercises, setExercises] = useState<string[]>([])
  const [liftHistory, setLiftHistory] = useState<LiftEntry[]>([])
  const [cardioHistory, setCardioHistory] = useState<CardioEntry[]>([])
  const [calendarData, setCalendarData] = useState<CalendarDay[]>([])
  const [loading, setLoading] = useState(true)
  const [cardioMetric, setCardioMetric] = useState<'pace' | 'distance'>('pace')
  const [liftSort, setLiftSort] = useState<'date' | 'weight' | 'volume'>('date')
  const [cardioSort, setCardioSort] = useState<'date' | 'distance' | 'pace'>('date')

  useEffect(() => {
    fetch('/api/progress')
      .then(r => r.json())
      .then(data => {
        setExercises(data.exercises ?? [])
        setCardioHistory(data.cardioHistory ?? [])
        setCalendarData(data.calendarData ?? [])
        if (data.exercises?.length > 0) {
          setExercise(data.exercises[0])
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

  // ── Lift chart ──────────────────────────────────────────────────────────────
  const liftChartData = useMemo(() => [...liftHistory].reverse(), [liftHistory])
  const liftPts = liftChartData.map(e => Number(e.max_weight))
  const liftSvgPts = liftPts.length > 1 ? buildSvgPoints(liftPts) : null
  const peakWeight = liftHistory.length > 0 ? Math.max(...liftHistory.map(e => Number(e.max_weight))) : null
  const liftLastY = useMemo(() => {
    if (liftPts.length < 2) return 80
    const max = Math.max(...liftPts); const min = Math.min(...liftPts); const range = max - min || 1
    return 80 - ((liftPts[liftPts.length - 1] - min) / range) * 70
  }, [liftPts])

  // ── Cardio chart ────────────────────────────────────────────────────────────
  const cardioChartData = useMemo(() => [...cardioHistory].reverse(), [cardioHistory])
  const hasPaceData = cardioHistory.some(e => e.pace)

  const cardioValues = useMemo((): number[] => {
    if (cardioMetric === 'pace') {
      return cardioChartData.map(e => toSeconds(e.pace)).filter((v): v is number => v !== null)
    }
    return cardioChartData.map(e => e.distance ? parseFloat(e.distance) : null).filter((v): v is number => v !== null && !isNaN(v))
  }, [cardioChartData, cardioMetric])

  const cardioInvert = cardioMetric === 'pace'
  const cardioSvgPts = cardioValues.length > 1 ? buildSvgPoints(cardioValues, cardioInvert) : null
  const cardioTrend = useMemo(() => trendPercent(cardioValues, cardioInvert), [cardioValues, cardioInvert])
  const cardioLastY = useMemo(() => {
    if (cardioValues.length < 2) return cardioInvert ? 10 : 80
    const max = Math.max(...cardioValues); const min = Math.min(...cardioValues); const range = max - min || 1
    const norm = (cardioValues[cardioValues.length - 1] - min) / range
    return cardioInvert ? 10 + norm * 70 : 80 - norm * 70
  }, [cardioValues, cardioInvert])

  const peakCardioValue = useMemo(() => {
    if (cardioValues.length === 0) return null
    if (cardioMetric === 'pace') {
      const best = Math.min(...cardioValues)
      return `${Math.floor(best / 60)}:${String(best % 60).padStart(2, '0')}`
    }
    return Math.max(...cardioValues).toFixed(1)
  }, [cardioValues, cardioMetric])

  // ── Sorting ─────────────────────────────────────────────────────────────────
  const sortedLifts = useMemo(() => {
    const arr = [...liftHistory]
    if (liftSort === 'weight') return arr.sort((a, b) => Number(b.max_weight) - Number(a.max_weight))
    if (liftSort === 'volume') return arr.sort((a, b) => Number(b.volume) - Number(a.volume))
    return arr
  }, [liftHistory, liftSort])

  const sortedCardio = useMemo(() => {
    const arr = [...cardioHistory]
    if (cardioSort === 'distance') return arr.sort((a, b) => (parseFloat(b.distance ?? '0') || 0) - (parseFloat(a.distance ?? '0') || 0))
    if (cardioSort === 'pace') return arr.sort((a, b) => (toSeconds(a.pace) ?? Infinity) - (toSeconds(b.pace) ?? Infinity))
    return arr
  }, [cardioHistory, cardioSort])

  // ── PB / best badges ────────────────────────────────────────────────────────
  const pbDate = liftHistory.length > 0
    ? liftHistory.reduce((best, e) => Number(e.max_weight) > Number(best.max_weight) ? e : best).date
    : null

  const fastestRunEntry = useMemo(() => {
    const runs = cardioHistory.filter(e => e.pace)
    if (runs.length === 0) return null
    return runs.reduce((best, e) => (toSeconds(e.pace) ?? Infinity) < (toSeconds(best.pace) ?? Infinity) ? e : best)
  }, [cardioHistory])

  // ── Calendar heat-map ───────────────────────────────────────────────────────
  const calendarGrid = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayStr = today.toISOString().split('T')[0]
    const dayOfWeek = (today.getDay() + 6) % 7
    const startDay = new Date(today)
    startDay.setDate(today.getDate() - dayOfWeek - 28)
    return Array.from({ length: 35 }, (_, i) => {
      const d = new Date(startDay)
      d.setDate(startDay.getDate() + i)
      const str = d.toISOString().split('T')[0]
      return { date: str, isToday: str === todayStr, isFuture: d > today }
    })
  }, [])

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

  return (
    <main className="w-full max-w-[390px] mx-auto px-6 pt-2 pb-32 flex flex-col gap-8">
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
      </section>

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

      {/* Chart */}
      <section className="flex flex-col gap-3">
        <h3 className="font-headline text-sm font-bold text-on-surface-variant">
          {tab === 'lifts' ? 'Weight trend' : `${cardioMetric === 'pace' ? 'Pace' : 'Distance'} trend`}
        </h3>
        <div className="bg-surface-container rounded-xl p-6 aspect-[4/3] relative overflow-hidden flex flex-col justify-end">

          {/* Peak stat */}
          {tab === 'lifts' && peakWeight !== null && (
            <div className="absolute top-6 right-6 flex flex-col items-end">
              <span className="text-3xl font-black font-headline text-primary-container leading-none">{peakWeight}</span>
              <span className="text-[10px] font-bold font-label uppercase text-on-surface-variant">kg peak</span>
            </div>
          )}
          {tab === 'cardio' && peakCardioValue !== null && (
            <div className="absolute top-6 right-6 flex flex-col items-end">
              <span className="text-3xl font-black font-headline text-[#4bdece] leading-none">{peakCardioValue}</span>
              <span className="text-[10px] font-bold font-label uppercase text-on-surface-variant">
                {cardioMetric === 'pace' ? 'best pace' : 'km peak'}
              </span>
            </div>
          )}

          {/* Trend badge */}
          {cardioTrend !== null && tab === 'cardio' && (
            <div className={`absolute top-6 left-6 flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold font-label ${
              cardioTrend >= 0 ? 'bg-[#4bdece]/20 text-[#4bdece]' : 'bg-red-500/20 text-red-400'
            }`}>
              <span className="material-symbols-outlined text-[12px]">{cardioTrend >= 0 ? 'trending_up' : 'trending_down'}</span>
              {Math.abs(cardioTrend).toFixed(0)}% {cardioTrend >= 0 ? 'better' : 'worse'}
            </div>
          )}

          {/* Lift SVG */}
          {tab === 'lifts' && (
            liftSvgPts ? (
              <svg className="w-full h-32 drop-shadow-[0_0_8px_rgba(255,144,102,0.4)]" viewBox="0 0 300 100" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="liftGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ff9066" stopOpacity="0.2" />
                    <stop offset="100%" stopColor="#ff9066" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <polyline points={liftSvgPts} fill="none" stroke="#ff9066" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                <polygon points={`0,80 ${liftSvgPts} 300,80`} fill="url(#liftGrad)" />
                <circle cx={300} cy={liftLastY} r="5" fill="#ff9066" />
              </svg>
            ) : (
              <div className="w-full h-32 flex items-center justify-center">
                <p className="text-sm text-on-surface-variant/40">Log more sessions to see your trend</p>
              </div>
            )
          )}

          {/* Cardio SVG */}
          {tab === 'cardio' && (
            cardioSvgPts ? (
              <svg className="w-full h-32 drop-shadow-[0_0_8px_rgba(75,222,206,0.3)]" viewBox="0 0 300 100" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="cardioGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#4bdece" stopOpacity="0.2" />
                    <stop offset="100%" stopColor="#4bdece" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <polyline points={cardioSvgPts} fill="none" stroke="#4bdece" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                <polygon points={`0,${cardioInvert ? 10 : 80} ${cardioSvgPts} 300,${cardioInvert ? 10 : 80}`} fill="url(#cardioGrad)" />
                <circle cx={300} cy={cardioLastY} r="5" fill="#4bdece" />
              </svg>
            ) : (
              <div className="w-full h-32 flex items-center justify-center">
                <p className="text-sm text-on-surface-variant/40">
                  {cardioHistory.length === 0 ? 'No cardio data yet' : `No ${cardioMetric} data for these sessions`}
                </p>
              </div>
            )
          )}
        </div>
      </section>

      {/* Calendar heat-map */}
      <section className="flex flex-col gap-3">
        <h3 className="font-headline text-sm font-bold text-on-surface-variant uppercase tracking-widest">Activity map</h3>
        <div className="bg-surface-container rounded-xl p-4">
          <div className="grid grid-cols-7 gap-1 mb-1">
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
              <div key={i} className="text-center text-[10px] font-bold font-label text-on-surface-variant/40">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {calendarGrid.map(({ date, isToday, isFuture }) => {
              const data = calendarMap.get(date)
              const intensity = cellIntensity(data)
              const hasWorkout = intensity > 0
              const label = data
                ? tab === 'lifts'
                  ? `${date} · ${data.max_weight ?? '—'} kg`
                  : `${date} · ${data.total_distance ?? '—'} km`
                : date
              const hex2 = Math.round(intensity * 255).toString(16).padStart(2, '0')
              return (
                <div
                  key={date}
                  title={label}
                  className="aspect-square rounded-md transition-all"
                  style={{
                    backgroundColor: hasWorkout
                      ? `${calColor}${hex2}`
                      : isFuture ? 'transparent' : 'rgba(255,255,255,0.04)',
                    outline: isToday ? `2px solid ${calColor}` : undefined,
                    outlineOffset: isToday ? '2px' : undefined,
                  }}
                />
              )
            })}
          </div>
        </div>
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
                      {s.duration && !s.pace && <p className="font-bold text-on-surface">{s.duration}</p>}
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
