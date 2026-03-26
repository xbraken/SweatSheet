'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import BottomNav from '@/components/BottomNav'

function ActivityLabel({ activity, className }: { activity: string; className?: string }) {
  const base = activity.toLowerCase()
  const isInterval = base === 'interval run'
  const isIndoor = base === 'indoor run'
  const label = base.includes('run') ? 'Run' : activity
  return (
    <span className={`inline-flex items-center gap-1 ${className ?? ''}`}>
      {label}
      {isInterval && <span className="px-1 py-0.5 rounded text-[8px] font-black font-label bg-[#4bdece]/20 text-[#4bdece] uppercase tracking-wide leading-none">INTV</span>}
      {isIndoor && <span className="px-1 py-0.5 rounded text-[8px] font-black font-label bg-[#a48b83]/20 text-[#a48b83] uppercase tracking-wide leading-none">INDOOR</span>}
    </span>
  )
}

type LiftEntry = { date: string; max_weight: number; volume: number; set_count: number }
type CardioEntry = {
  cardio_id: number
  date: string
  activity: string
  distance: string | null
  duration: string | null
  pace: string | null
  calories: number | null
  heart_rate: number | null
}

type HrSample = { time_offset_sec: number; hr_bpm: number }
type DistanceSample = { time_offset_sec: number; distance_km: number }

type RunDetail = {
  cardio_id: number
  activity: string
  date: string
  distance: string | null
  duration: string | null
  pace: string | null
  calories: number | null
  heart_rate: number | null
  hr_min: number | null
  hr_max: number | null
  hrSamples: HrSample[]
  distanceSamples: DistanceSample[]
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

// ── Run Detail Sheet ──────────────────────────────────────────────────────────
function RunDetailSheet({
  runId,
  allCardio,
  onClose,
  onDeleted,
}: {
  runId: number
  allCardio: CardioEntry[]
  onClose: () => void
  onDeleted?: (id: number) => void
}) {
  const [detail, setDetail] = useState<RunDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [compareId, setCompareId] = useState<number | null>(null)
  const [compareDetail, setCompareDetail] = useState<RunDetail | null>(null)
  const [showComparePicker, setShowComparePicker] = useState(false)
  const [compareSearch, setCompareSearch] = useState('')
  const [chartHoveredIdx, setChartHoveredIdx] = useState<number | null>(null)
  const [paceHoveredIdx, setPaceHoveredIdx] = useState<number | null>(null)
  const [togglingInterval, setTogglingInterval] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/run/${runId}`).then(r => r.json()).then(d => { setDetail(d); setLoading(false) })
  }, [runId])

  useEffect(() => {
    if (!compareId) { setCompareDetail(null); return }
    fetch(`/api/run/${compareId}`).then(r => r.json()).then(setCompareDetail)
  }, [compareId])

  /** Find fastest contiguous segment covering targetKm using a sliding window (O(n)) */
  function findBestSegment(samples: DistanceSample[], targetKm: number): number | null {
    if (samples.length < 2) return null
    const maxDist = samples[samples.length - 1].distance_km
    if (maxDist < targetKm) return null
    let bestSec = Infinity
    let j = 0
    for (let i = 0; i < samples.length; i++) {
      if (j <= i) j = i + 1
      while (j < samples.length && samples[j].distance_km - samples[i].distance_km < targetKm) j++
      if (j >= samples.length) break
      // Interpolate exact time when cumulative distance reaches samples[i].distance_km + targetKm
      const d0 = j > 0 ? samples[j - 1].distance_km - samples[i].distance_km : 0
      const d1 = samples[j].distance_km - samples[i].distance_km
      const frac = d1 > d0 ? (targetKm - d0) / (d1 - d0) : 0
      const endTime = samples[j - 1].time_offset_sec + frac * (samples[j].time_offset_sec - samples[j - 1].time_offset_sec)
      const segTime = endTime - samples[i].time_offset_sec
      if (segTime < bestSec) bestSec = segTime
    }
    return isFinite(bestSec) ? Math.round(bestSec) : null
  }

  /** Derive N evenly-spaced instantaneous pace values (sec/km) from cumulative distance samples */
  function normalizePaceSamples(samples: DistanceSample[], n = 120): number[] {
    if (samples.length < 2) return []
    const maxT = samples[samples.length - 1].time_offset_sec
    const raw = Array.from({ length: n }, (_, i) => {
      const target = (i / (n - 1)) * maxT
      let j = samples.findIndex(s => s.time_offset_sec >= target)
      if (j <= 0) j = 1
      if (j >= samples.length) j = samples.length - 1
      const dt = samples[j].time_offset_sec - samples[j - 1].time_offset_sec
      const dd = samples[j].distance_km - samples[j - 1].distance_km
      return dd > 0 && dt > 0 ? dt / dd : 0
    })
    // Smooth with a 7-point moving average to reduce GPS noise
    return raw.map((_, i) => {
      const s = Math.max(0, i - 3), e = Math.min(raw.length, i + 4)
      const slice = raw.slice(s, e).filter(v => v > 0)
      return slice.length > 0 ? slice.reduce((a, b) => a + b, 0) / slice.length : 0
    })
  }

  /** Interpolate cumulative distance (km) at a given normalized index */
  function distanceAtIdx(samples: DistanceSample[], idx: number, n: number): number {
    if (samples.length < 2) return 0
    const maxT = samples[samples.length - 1].time_offset_sec
    const target = (idx / (n - 1)) * maxT
    let j = samples.findIndex(s => s.time_offset_sec >= target)
    if (j < 0) return samples[samples.length - 1].distance_km
    if (j === 0) return samples[0].distance_km
    const a = samples[j - 1], b = samples[j]
    const t = (target - a.time_offset_sec) / (b.time_offset_sec - a.time_offset_sec)
    return a.distance_km + t * (b.distance_km - a.distance_km)
  }

  // Normalize HR curve to N evenly-spaced points by % completion
  function normalizeSamples(samples: HrSample[], n = 120): number[] {
    if (samples.length < 2) return samples.map(s => s.hr_bpm)
    const maxT = samples[samples.length - 1].time_offset_sec
    return Array.from({ length: n }, (_, i) => {
      const target = (i / (n - 1)) * maxT
      let j = samples.findIndex(s => s.time_offset_sec >= target)
      if (j < 0) return samples[samples.length - 1].hr_bpm
      if (j === 0) return samples[0].hr_bpm
      const a = samples[j - 1], b = samples[j]
      const t = (target - a.time_offset_sec) / (b.time_offset_sec - a.time_offset_sec)
      return Math.round(a.hr_bpm + t * (b.hr_bpm - a.hr_bpm))
    })
  }

  function buildPts(values: number[], yMin: number, yMax: number): string {
    const range = yMax - yMin || 1
    return values.map((v, i) => {
      const x = ((i / Math.max(values.length - 1, 1)) * 300).toFixed(1)
      const y = (80 - ((v - yMin) / range) * 68).toFixed(1)
      return `${x},${y}`
    }).join(' ')
  }

  const handlePointer = useCallback((e: React.PointerEvent<SVGSVGElement>, n: number) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setChartHoveredIdx(Math.max(0, Math.min(n - 1, Math.round(((e.clientX - rect.left) / rect.width) * (n - 1)))))
  }, [])

  if (loading) {
    return (
      <>
        <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />
        <div className="fixed inset-x-0 bottom-0 top-16 md:top-0 md:left-56 z-50 bg-[#0e0e0e] rounded-t-3xl md:rounded-none flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-[#4bdece] border-t-transparent rounded-full animate-spin" />
        </div>
      </>
    )
  }

  if (!detail) return null

  const hasHr = detail.hrSamples.length > 1
  const hasCompareHr = compareDetail && compareDetail.hrSamples.length > 1

  // ── HR chart data ──────────────────────────────────────────────────────────
  const mainValues = hasHr ? normalizeSamples(detail.hrSamples) : []
  const compareValues = hasCompareHr ? normalizeSamples(compareDetail!.hrSamples) : []

  const allValues = [...mainValues, ...compareValues]
  const yMin = allValues.length > 0 ? Math.max(40, Math.min(...allValues) - 8) : 60
  const yMax = allValues.length > 0 ? Math.min(220, Math.max(...allValues) + 8) : 200

  const mainPts = mainValues.length > 1 ? buildPts(mainValues, yMin, yMax) : null
  const comparePts = compareValues.length > 1 ? buildPts(compareValues, yMin, yMax) : null

  const mainAvg = hasHr ? Math.round(mainValues.reduce((a, b) => a + b, 0) / mainValues.length) : (detail.heart_rate ?? null)
  const compareAvg = compareValues.length > 0 ? Math.round(compareValues.reduce((a, b) => a + b, 0) / compareValues.length) : (compareDetail?.heart_rate ?? null)

  const hIdx = chartHoveredIdx ?? Math.floor((mainValues.length - 1) / 2)
  const hVal = mainValues[hIdx]
  const hCompareVal = compareValues.length > 0 ? compareValues[Math.round((hIdx / (mainValues.length - 1)) * (compareValues.length - 1))] : null
  const hX = mainValues.length > 1 ? (hIdx / (mainValues.length - 1)) * 300 : 150
  const hY = hVal !== undefined ? 80 - ((hVal - yMin) / (yMax - yMin || 1)) * 68 : 40

  // ── Pace chart data ────────────────────────────────────────────────────────
  const distSamples = detail.distanceSamples ?? []
  const hasPace = distSamples.length > 3
  // Use actual workout duration as x-axis end (GPS stops recording a few seconds before workout ends)
  const durationSec = toSeconds(detail.duration) ?? (hasPace ? distSamples[distSamples.length - 1].time_offset_sec : 0)
  const paceMaxT = hasPace ? Math.max(distSamples[distSamples.length - 1].time_offset_sec, durationSec) : durationSec
  const PACE_N = 120
  const paceValuesAll = hasPace ? normalizePaceSamples(distSamples, PACE_N) : []
  const validPaceValues = paceValuesAll.filter(v => v > 0)
  const paceAvgSec = detail.pace ? (toSeconds(detail.pace) ?? null) : null
  const paceMinSec = validPaceValues.length > 0 ? Math.min(...validPaceValues) : null  // fastest (main run)
  const paceMaxSec = validPaceValues.length > 0 ? Math.max(...validPaceValues) : null  // slowest (main run, for display)

  // Compare pace data
  const compareDist: DistanceSample[] = compareDetail?.distanceSamples ?? []
  const hasComparePace = compareDist.length > 3
  const comparePaceValuesAll = hasComparePace ? normalizePaceSamples(compareDist, PACE_N) : []
  const compareValidPaceValues = comparePaceValuesAll.filter(v => v > 0)
  const comparePaceAvgSec = compareDetail?.pace ? (toSeconds(compareDetail.pace) ?? null) : null

  // Combined y-axis bounds (95th percentile to handle outliers from either run)
  const allValidPaceForAxis = compareDetail && hasComparePace
    ? [...validPaceValues, ...compareValidPaceValues]
    : validPaceValues
  const allPaceSorted = [...allValidPaceForAxis].sort((a, b) => a - b)
  const pYMin = allPaceSorted.length > 0 ? Math.max(30, allPaceSorted[0] - 15) : 200
  const pYMax = allPaceSorted.length > 0
    ? Math.min(900, allPaceSorted[Math.floor(allPaceSorted.length * 0.95)] + 30)
    : 600

  const buildPacePts = (values: number[]) => values.length > 1
    ? values.map((v, i) => {
        const x = ((i / Math.max(values.length - 1, 1)) * 300).toFixed(1)
        const pv = Math.min(pYMax, Math.max(pYMin, v > 0 ? v : pYMax))
        const y = (10 + ((pv - pYMin) / (pYMax - pYMin || 1)) * 68).toFixed(1)  // inverted: fast=high
        return `${x},${y}`
      }).join(' ')
    : null

  const pacePts = buildPacePts(paceValuesAll)
  const comparePacePts = buildPacePts(comparePaceValuesAll)

  const pHovIdx = paceHoveredIdx ?? Math.floor((PACE_N - 1) / 2)
  const pHovPace = paceValuesAll[pHovIdx] ?? 0
  const pHovX = (pHovIdx / (PACE_N - 1)) * 300
  const pHovY = pHovPace > 0 ? 10 + ((pHovPace - pYMin) / (pYMax - pYMin || 1)) * 68 : 78
  const pHovDist = hasPace ? distanceAtIdx(distSamples, pHovIdx, PACE_N) : 0
  const pHovTimeSec = hasPace
    ? Math.round((pHovIdx / (PACE_N - 1)) * paceMaxT)
    : null
  const pHovComparePace = comparePaceValuesAll.length > 0 ? (comparePaceValuesAll[pHovIdx] ?? 0) : 0

  // ── Best segments ──────────────────────────────────────────────────────────
  const best5KSec = hasPace ? findBestSegment(distSamples, 5.0) : null
  const best10KSec = hasPace ? findBestSegment(distSamples, 10.0) : null

  function fmtSegTime(sec: number): string {
    const h = Math.floor(sec / 3600)
    const m = Math.floor((sec % 3600) / 60)
    const s = sec % 60
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    return `${m}:${String(s).padStart(2, '0')}`
  }

  function fmtPaceSec(sec: number): string {
    return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`
  }


  const durationLabel = detail.duration ?? ''
  const distLabel = detail.distance ? `${parseFloat(detail.distance).toFixed(2)} km` : ''

  return (
    <>
      <div className="fixed inset-0 bg-black/70 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 top-16 md:top-0 md:left-56 z-50 bg-[#0e0e0e] rounded-t-3xl md:rounded-none flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-[#201f1f] flex items-start justify-between shrink-0">
          <div>
            <p className="font-label text-[10px] uppercase tracking-widest text-[#4bdece] mb-1"><ActivityLabel activity={detail.activity} /></p>
            <h2 className="font-headline text-xl font-black text-[#e5e2e1]">{formatDate(detail.date)}</h2>
            <div className="flex gap-3 mt-2 flex-wrap">
              {distLabel && <span className="text-sm font-bold text-[#e5e2e1]">{distLabel}</span>}
              {durationLabel && <span className="text-sm text-[#a48b83]">{durationLabel}</span>}
              {detail.pace && <span className="text-sm text-[#a48b83]">{detail.pace} /km</span>}
              {detail.calories && <span className="text-sm text-[#a48b83]">{detail.calories} kcal</span>}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <button onClick={onClose} className="p-1">
              <span className="material-symbols-outlined text-[#a48b83]">close</span>
            </button>
            {detail && ['Run', 'Indoor run', 'Interval run'].includes(detail.activity) && (
              <button
                disabled={togglingInterval}
                onClick={async () => {
                  if (!detail) return
                  const newActivity = detail.activity === 'Interval run' ? 'Run' : 'Interval run'
                  setTogglingInterval(true)
                  await fetch(`/api/run/${runId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ activity: newActivity }),
                  })
                  setDetail({ ...detail, activity: newActivity })
                  setTogglingInterval(false)
                }}
                className="text-[10px] font-bold font-label uppercase tracking-widest px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 bg-[#4bdece]/10 text-[#4bdece]"
              >
                {detail.activity === 'Interval run' ? 'Unmark interval' : 'Mark as interval'}
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-32 md:pb-8 md:max-w-3xl md:mx-auto md:w-full">
          {/* HR badges */}
          {(detail.heart_rate || detail.hr_min || detail.hr_max) && (
            <div className="flex gap-2 mt-4 flex-wrap">
              {mainAvg && (
                <div className="bg-[#201f1f] rounded-xl px-3 py-2 flex flex-col items-center min-w-[60px]">
                  <span className="text-xl font-black font-headline text-[#ff9066]">{mainAvg}</span>
                  <span className="text-[9px] font-bold font-label uppercase tracking-wider text-[#a48b83]">avg bpm</span>
                </div>
              )}
              {detail.hr_min && (
                <div className="bg-[#201f1f] rounded-xl px-3 py-2 flex flex-col items-center min-w-[60px]">
                  <span className="text-xl font-black font-headline text-[#e5e2e1]">{detail.hr_min}</span>
                  <span className="text-[9px] font-bold font-label uppercase tracking-wider text-[#a48b83]">min bpm</span>
                </div>
              )}
              {detail.hr_max && (
                <div className="bg-[#201f1f] rounded-xl px-3 py-2 flex flex-col items-center min-w-[60px]">
                  <span className="text-xl font-black font-headline text-[#e5e2e1]">{detail.hr_max}</span>
                  <span className="text-[9px] font-bold font-label uppercase tracking-wider text-[#a48b83]">max bpm</span>
                </div>
              )}
            </div>
          )}

          {/* Pace Chart */}
          {hasPace && (
            <div className="mt-5 bg-[#131313] rounded-2xl p-4">
              {(() => {
                const maxT = paceMaxT
                const interval = maxT > 1800 ? 600 : 300
                const ticks: number[] = []
                for (let t = interval; t < maxT - interval * 0.4; t += interval) ticks.push(t)

                const pHovPaceLabel = pHovPace > 0 ? fmtPaceSec(pHovPace) : null
                const inCompare = compareDetail && hasComparePace
                const mainColor = '#4bdece'
                const cmpColor = '#c084fc'

                return (
                  <>
                    {/* Header row */}
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="text-[10px] font-bold font-label uppercase tracking-widest text-[#a48b83] mb-0.5">
                          {inCompare ? 'Pace comparison (% completion)' : 'Pace over time'}
                        </p>
                        {paceAvgSec && (
                          <span className="text-lg font-black font-headline" style={{ color: mainColor }}>
                            {fmtPaceSec(paceAvgSec)} <span className="text-xs font-normal text-[#a48b83]">/km avg</span>
                          </span>
                        )}
                      </div>
                      <div className="text-right">
                        {inCompare ? (
                          comparePaceAvgSec && (
                            <>
                              <p className="text-[10px] font-bold font-label uppercase tracking-widest text-[#a48b83] mb-0.5">{formatDate(compareDetail!.date)}</p>
                              <span className="text-lg font-black font-headline text-[#c084fc]">
                                {fmtPaceSec(comparePaceAvgSec)} <span className="text-xs font-normal text-[#a48b83]">/km avg</span>
                              </span>
                            </>
                          )
                        ) : (
                          paceMinSec && paceMaxSec && (
                            <>
                              <p className="text-[10px] font-bold font-label uppercase tracking-widest text-[#a48b83] mb-0.5">Range</p>
                              <p className="text-xs text-[#4bdece]">
                                <span className="font-black">{fmtPaceSec(paceMinSec)}</span>
                                <span className="text-[#a48b83] mx-1">→</span>
                                <span className="font-black">{fmtPaceSec(paceMaxSec)}</span>
                                <span className="text-[#a48b83] ml-1">/km</span>
                              </p>
                            </>
                          )
                        )}
                      </div>
                    </div>

                    {/* Hover readout */}
                    <div className="flex items-center justify-end gap-3 mb-2 h-5">
                      {paceHoveredIdx !== null && pHovPaceLabel && (
                        <>
                          {!inCompare && pHovTimeSec !== null && (
                            <span className="text-[10px] text-[#a48b83]">
                              {pHovTimeSec >= 3600
                                ? `${Math.floor(pHovTimeSec / 3600)}:${String(Math.floor((pHovTimeSec % 3600) / 60)).padStart(2, '0')}:${String(pHovTimeSec % 60).padStart(2, '0')}`
                                : `${Math.floor(pHovTimeSec / 60)}:${String(pHovTimeSec % 60).padStart(2, '0')}`}
                              {pHovDist > 0 && <span className="ml-1">{pHovDist.toFixed(2)} km</span>}
                            </span>
                          )}
                          <span className="text-sm font-black font-headline whitespace-nowrap" style={{ color: mainColor }}>{pHovPaceLabel} /km</span>
                          {inCompare && pHovComparePace > 0 && (
                            <span className="text-sm font-black font-headline text-[#c084fc] whitespace-nowrap">{fmtPaceSec(pHovComparePace)} /km</span>
                          )}
                        </>
                      )}
                    </div>
                    <div className="relative">
                    <svg
                      className="w-full h-40"
                      viewBox="0 0 300 102"
                      preserveAspectRatio="none"
                      style={{ touchAction: 'none' }}
                      onPointerMove={e => {
                        const rect = e.currentTarget.getBoundingClientRect()
                        const idx = Math.max(0, Math.min(PACE_N - 1, Math.round(((e.clientX - rect.left) / rect.width) * (PACE_N - 1))))
                        setPaceHoveredIdx(idx)
                        setChartHoveredIdx(Math.round((idx / (PACE_N - 1)) * (mainValues.length - 1)))
                      }}
                      onPointerLeave={() => { setPaceHoveredIdx(null); setChartHoveredIdx(null) }}
                    >
                      <defs>
                        <linearGradient id="paceGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={mainColor} stopOpacity="0.22" />
                          <stop offset="100%" stopColor={mainColor} stopOpacity="0" />
                        </linearGradient>
                        <linearGradient id="paceGradCmp" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={cmpColor} stopOpacity="0.15" />
                          <stop offset="100%" stopColor={cmpColor} stopOpacity="0" />
                        </linearGradient>
                      </defs>

                      {/* Avg pace dashed line */}
                      {paceAvgSec && (() => {
                        const avgY = 10 + ((paceAvgSec - pYMin) / (pYMax - pYMin || 1)) * 68
                        return <line x1={0} y1={avgY} x2={300} y2={avgY} stroke={mainColor} strokeWidth="0.5" strokeDasharray="4,4" strokeOpacity="0.35" />
                      })()}

                      {/* Compare pace fill + line */}
                      {inCompare && comparePacePts && (
                        <>
                          <polygon points={`0,78 ${comparePacePts} 300,78`} fill="url(#paceGradCmp)" />
                          <polyline points={comparePacePts} fill="none" stroke={cmpColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.7" />
                        </>
                      )}

                      {/* Main pace fill + line */}
                      {pacePts && (
                        <>
                          <polygon points={`0,78 ${pacePts} 300,78`} fill="url(#paceGrad)" />
                          <polyline points={pacePts} fill="none" stroke={mainColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                        </>
                      )}

                      {/* Hover scrubber — only when actively hovering */}
                      {pacePts && paceHoveredIdx !== null && (
                        <>
                          <line x1={pHovX} y1={0} x2={pHovX} y2={82} stroke={mainColor} strokeWidth="1" strokeOpacity="0.3" strokeDasharray="3,3" />
                          <circle cx={pHovX} cy={pHovY} r="4" fill={mainColor} />
                          {inCompare && pHovComparePace > 0 && (() => {
                            const cY = 10 + ((Math.min(pYMax, Math.max(pYMin, pHovComparePace)) - pYMin) / (pYMax - pYMin || 1)) * 68
                            return <circle cx={pHovX} cy={cY} r="4" fill={cmpColor} />
                          })()}
                        </>
                      )}

                      {/* Y axis labels (pace): top = fastest, bottom = slowest */}
                      <text x={3} y={14} fill="#a48b83" fontSize="7" fontFamily="sans-serif">{fmtPaceSec(pYMin)}</text>
                      <text x={3} y={79} fill="#a48b83" fontSize="7" fontFamily="sans-serif">{fmtPaceSec(pYMax)}</text>

                      {/* X axis baseline */}
                      <line x1={0} y1={82} x2={300} y2={82} stroke="#2a2a2a" strokeWidth="0.5" />

                      {/* X axis labels */}
                      {inCompare ? (
                        [0, 50, 100].map(pct => {
                          const x = pct === 0 ? 2 : pct === 100 ? 298 : 150
                          const anchor = pct === 0 ? 'start' : pct === 100 ? 'end' : 'middle'
                          return <text key={pct} x={x} y={96} fill="#5a5a5a" fontSize="6.5" fontFamily="sans-serif" textAnchor={anchor}>{pct}%</text>
                        })
                      ) : (
                        <>
                          <text x={2} y={96} fill="#5a5a5a" fontSize="6.5" fontFamily="sans-serif" textAnchor="start">0:00</text>
                          {ticks.map(t => {
                            const x = (t / maxT) * 300
                            const h = Math.floor(t / 3600)
                            const m = Math.floor((t % 3600) / 60)
                            const s = t % 60
                            const label = h > 0 ? `${h}:${String(m).padStart(2,'0')}` : s === 0 ? `${m}m` : `${m}:${String(s).padStart(2,'0')}`
                            return <text key={t} x={x} y={96} fill="#5a5a5a" fontSize="6.5" fontFamily="sans-serif" textAnchor="middle">{label}</text>
                          })}
                          {maxT > 0 && (() => {
                            const h = Math.floor(maxT / 3600)
                            const m = Math.floor((maxT % 3600) / 60)
                            const s = maxT % 60
                            const endLabel = h > 0 ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}` : `${m}:${String(s).padStart(2,'0')}`
                            return <text x={298} y={96} fill="#5a5a5a" fontSize="6.5" fontFamily="sans-serif" textAnchor="end">{endLabel}</text>
                          })()}
                        </>
                      )}
                    </svg>

                    </div>

                    {/* Pace legend when comparing */}
                    {inCompare && (
                      <div className="flex items-center justify-between mt-3">
                        <div className="flex gap-4">
                          <div className="flex items-center gap-1.5">
                            <div className="w-3 h-0.5 rounded" style={{ backgroundColor: mainColor }} />
                            <span className="text-[10px] text-[#a48b83]">{formatDate(detail.date)}</span>
                            {paceAvgSec && <span className="text-[10px] font-bold" style={{ color: mainColor }}>{fmtPaceSec(paceAvgSec)} /km</span>}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <div className="w-3 h-0.5 bg-[#c084fc] rounded" />
                            <span className="text-[10px] text-[#a48b83]">{formatDate(compareDetail!.date)}</span>
                            {comparePaceAvgSec && <span className="text-[10px] font-bold text-[#c084fc]">{fmtPaceSec(comparePaceAvgSec)} /km</span>}
                          </div>
                        </div>
                        {paceAvgSec && comparePaceAvgSec && (() => {
                          const delta = paceAvgSec - comparePaceAvgSec
                          const isFaster = delta < 0  // main has lower sec/km = faster
                          return (
                            <div className={`px-2 py-0.5 rounded-full text-[10px] font-black font-label ${isFaster ? 'bg-[#4bdece]/20 text-[#4bdece]' : 'bg-[#c084fc]/20 text-[#c084fc]'}`}>
                              {isFaster ? `${fmtPaceSec(Math.abs(delta))} faster` : `${fmtPaceSec(Math.abs(delta))} slower`}
                            </div>
                          )
                        })()}
                      </div>
                    )}
                  </>
                )
              })()}
            </div>
          )}

          {/* Best Segments */}
          {(best5KSec !== null || best10KSec !== null) && (
            <div className="mt-4 flex gap-2">
              {best5KSec !== null && (
                <div className="flex-1 bg-[#131313] rounded-2xl px-4 py-3 flex flex-col items-center">
                  <span className="text-[9px] font-bold font-label uppercase tracking-widest text-[#a48b83] mb-1">Best 5K</span>
                  <span className="text-xl font-black font-headline text-[#4bdece]">{fmtSegTime(best5KSec)}</span>
                </div>
              )}
              {best10KSec !== null && (
                <div className="flex-1 bg-[#131313] rounded-2xl px-4 py-3 flex flex-col items-center">
                  <span className="text-[9px] font-bold font-label uppercase tracking-widest text-[#a48b83] mb-1">Best 10K</span>
                  <span className="text-xl font-black font-headline text-[#4bdece]">{fmtSegTime(best10KSec)}</span>
                </div>
              )}
            </div>
          )}

          {/* HR Chart */}
          {hasHr ? (
            <div className="mt-5 bg-[#131313] rounded-2xl p-4">
              {(() => {
                const maxT = hasHr ? detail.hrSamples[detail.hrSamples.length - 1].time_offset_sec : 0
                const interval = maxT > 1800 ? 600 : 300
                const ticks: number[] = []
                for (let t = interval; t < maxT - interval * 0.4; t += interval) ticks.push(t)
                const hTimeSec = mainValues.length > 1 && maxT > 0
                  ? Math.round((hIdx / (mainValues.length - 1)) * maxT)
                  : null
                const hTimeLabel = hTimeSec !== null
                  ? hTimeSec >= 3600
                    ? `${Math.floor(hTimeSec / 3600)}:${String(Math.floor((hTimeSec % 3600) / 60)).padStart(2, '0')}:${String(hTimeSec % 60).padStart(2, '0')}`
                    : `${Math.floor(hTimeSec / 60)}:${String(hTimeSec % 60).padStart(2, '0')}`
                  : null
                return (
                  <>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[10px] font-bold font-label uppercase tracking-widest text-[#a48b83]">
                        {compareDetail ? 'HR comparison (% completion)' : 'Heart rate over time'}
                      </p>
                    </div>
                    {/* Hover readout */}
                    <div className="flex items-center justify-end gap-3 mb-2 h-5">
                      {chartHoveredIdx !== null && hVal !== undefined && (
                        <>
                          {!compareDetail && hTimeLabel && (
                            <span className="text-[10px] text-[#a48b83]">{hTimeLabel}</span>
                          )}
                          <span className="text-sm font-black font-headline text-[#ff9066]">{hVal} bpm</span>
                          {hCompareVal !== null && compareValues.length > 0 && (
                            <span className="text-sm font-black font-headline text-[#c084fc]">{hCompareVal} bpm</span>
                          )}
                        </>
                      )}
                    </div>

                    <div className="relative">
                    <svg
                      className="w-full h-40"
                      viewBox="0 0 300 102"
                      preserveAspectRatio="none"
                      style={{ touchAction: 'none' }}
                      onPointerMove={e => {
                        const rect = e.currentTarget.getBoundingClientRect()
                        const idx = Math.max(0, Math.min(mainValues.length - 1, Math.round(((e.clientX - rect.left) / rect.width) * (mainValues.length - 1))))
                        setChartHoveredIdx(idx)
                        if (hasPace) setPaceHoveredIdx(Math.round((idx / (mainValues.length - 1)) * (PACE_N - 1)))
                      }}
                      onPointerLeave={() => { setChartHoveredIdx(null); setPaceHoveredIdx(null) }}
                    >
                      <defs>
                        <linearGradient id="hrGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#ff9066" stopOpacity="0.25" />
                          <stop offset="100%" stopColor="#ff9066" stopOpacity="0" />
                        </linearGradient>
                        <linearGradient id="hrGradCmp" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#c084fc" stopOpacity="0.15" />
                          <stop offset="100%" stopColor="#c084fc" stopOpacity="0" />
                        </linearGradient>
                      </defs>

                      {/* Avg HR dashed line for main run */}
                      {mainAvg && (() => {
                        const avgY = 80 - ((mainAvg - yMin) / (yMax - yMin || 1)) * 68
                        return <line x1={0} y1={avgY} x2={300} y2={avgY} stroke="#ff9066" strokeWidth="0.5" strokeDasharray="4,4" strokeOpacity="0.4" />
                      })()}

                      {/* Compare run fill + line */}
                      {comparePts && (
                        <>
                          <polygon points={`0,80 ${comparePts} 300,80`} fill="url(#hrGradCmp)" />
                          <polyline points={comparePts} fill="none" stroke="#c084fc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.7" />
                        </>
                      )}

                      {/* Main run fill + line */}
                      {mainPts && (
                        <>
                          <polygon points={`0,80 ${mainPts} 300,80`} fill="url(#hrGrad)" />
                          <polyline points={mainPts} fill="none" stroke="#ff9066" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                        </>
                      )}

                      {/* Hover scrubber — only when actively hovering */}
                      {mainPts && chartHoveredIdx !== null && (
                        <>
                          <line x1={hX} y1={0} x2={hX} y2={82} stroke="#ff9066" strokeWidth="1" strokeOpacity="0.3" strokeDasharray="3,3" />
                          <circle cx={hX} cy={hY} r="4" fill="#ff9066" />
                          {hCompareVal !== null && compareValues.length > 0 && (() => {
                            const cY = 80 - ((hCompareVal - yMin) / (yMax - yMin || 1)) * 68
                            return <circle cx={hX} cy={cY} r="4" fill="#c084fc" />
                          })()}
                        </>
                      )}

                      {/* Y axis labels */}
                      <text x={3} y={14} fill="#a48b83" fontSize="7" fontFamily="sans-serif">{yMax}</text>
                      <text x={3} y={79} fill="#a48b83" fontSize="7" fontFamily="sans-serif">{yMin}</text>

                      {/* X axis baseline */}
                      <line x1={0} y1={82} x2={300} y2={82} stroke="#2a2a2a" strokeWidth="0.5" />

                      {/* X axis time labels */}
                      {compareDetail ? (
                        // Comparison mode: show % labels
                        [0, 50, 100].map(pct => {
                          const x = pct === 0 ? 2 : pct === 100 ? 298 : 150
                          const anchor = pct === 0 ? 'start' : pct === 100 ? 'end' : 'middle'
                          return (
                            <text key={pct} x={x} y={96} fill="#5a5a5a" fontSize="6.5" fontFamily="sans-serif" textAnchor={anchor}>{pct}%</text>
                          )
                        })
                      ) : (
                        // Real-time labels
                        <>
                          <text x={2} y={96} fill="#5a5a5a" fontSize="6.5" fontFamily="sans-serif" textAnchor="start">0:00</text>
                          {ticks.map(t => {
                            const x = (t / maxT) * 300
                            const mins = Math.floor(t / 60)
                            const secs = t % 60
                            const label = secs === 0 ? `${mins}m` : `${mins}:${String(secs).padStart(2, '0')}`
                            return (
                              <text key={t} x={x} y={96} fill="#5a5a5a" fontSize="6.5" fontFamily="sans-serif" textAnchor="middle">{label}</text>
                            )
                          })}
                          {maxT > 0 && (() => {
                            const totalMins = Math.floor(maxT / 60)
                            const totalSecs = maxT % 60
                            const endLabel = totalSecs === 0 ? `${totalMins}m` : `${totalMins}:${String(totalSecs).padStart(2, '0')}`
                            return <text x={298} y={96} fill="#5a5a5a" fontSize="6.5" fontFamily="sans-serif" textAnchor="end">{endLabel}</text>
                          })()}
                        </>
                      )}
                    </svg>

                    </div>
                  </>
                )
              })()}

              {/* Legend when comparing */}
              {compareDetail && (
                <div className="flex items-center justify-between mt-3">
                  <div className="flex gap-4">
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-0.5 bg-[#ff9066] rounded" />
                      <span className="text-[10px] text-[#a48b83]">{formatDate(detail.date)}</span>
                      {mainAvg && <span className="text-[10px] font-bold text-[#ff9066]">{mainAvg} bpm</span>}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-0.5 bg-[#c084fc] rounded" />
                      <span className="text-[10px] text-[#a48b83]">{formatDate(compareDetail.date)}</span>
                      {compareAvg && <span className="text-[10px] font-bold text-[#c084fc]">{compareAvg} bpm</span>}
                    </div>
                  </div>
                  {mainAvg && compareAvg && (() => {
                    const delta = compareAvg - mainAvg
                    const better = delta > 0 // compare is higher = current is lower = better
                    return (
                      <div className={`px-2 py-0.5 rounded-full text-[10px] font-black font-label ${better ? 'bg-[#4bdece]/20 text-[#4bdece]' : 'bg-[#c084fc]/20 text-[#c084fc]'}`}>
                        {better ? `${delta} bpm lower` : `${Math.abs(delta)} bpm higher`}
                      </div>
                    )
                  })()}
                </div>
              )}
            </div>
          ) : (
            <div className="mt-4 bg-[#131313] rounded-2xl p-5 text-center">
              <span className="material-symbols-outlined text-3xl text-[#353534]">monitor_heart</span>
              <p className="text-sm text-[#a48b83] mt-2">No HR data — re-import from Apple Health to get your full heart rate curve</p>
            </div>
          )}

          {/* Compare button */}
          <div className="mt-4">
            {!showComparePicker && !compareDetail && (
              <button
                onClick={() => setShowComparePicker(true)}
                className="w-full py-3 rounded-xl border border-[#353534] flex items-center justify-center gap-2 text-[#dcc1b8] text-sm hover:bg-[#201f1f] transition-colors active:scale-95"
              >
                <span className="material-symbols-outlined text-base text-[#4bdece]">compare_arrows</span>
                Compare with another run
              </button>
            )}

            {compareDetail && (
              <button
                onClick={() => { setCompareId(null); setCompareDetail(null) }}
                className="w-full py-3 rounded-xl border border-[#353534] flex items-center justify-center gap-2 text-[#a48b83] text-sm hover:bg-[#201f1f] transition-colors"
              >
                <span className="material-symbols-outlined text-base">close</span>
                Remove comparison
              </button>
            )}

            {showComparePicker && !compareDetail && (
              <div className="bg-[#131313] rounded-2xl border border-[#201f1f] overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-[#201f1f]">
                  <p className="text-[10px] font-bold font-label uppercase tracking-widest text-[#a48b83]">Compare with</p>
                  <button onClick={() => { setShowComparePicker(false); setCompareSearch('') }}>
                    <span className="material-symbols-outlined text-[#a48b83] text-sm">close</span>
                  </button>
                </div>
                <div className="px-4 py-2 border-b border-[#201f1f]">
                  <input
                    type="text"
                    placeholder="Search by date or activity…"
                    value={compareSearch}
                    onChange={e => setCompareSearch(e.target.value)}
                    className="w-full bg-transparent text-sm text-[#e5e2e1] placeholder-[#a48b83] outline-none"
                    autoFocus
                  />
                </div>
                {allCardio
                  .filter(r => {
                    if (!r.cardio_id || r.cardio_id === runId) return false
                    if (!r.activity.toLowerCase().includes('run')) return false
                    if (!compareSearch) return true
                    const q = compareSearch.toLowerCase()
                    return r.date.includes(q) || r.activity.toLowerCase().includes(q)
                  })
                  .slice(0, 30)
                  .map(r => (
                    <button
                      key={r.cardio_id}
                      onClick={() => { setCompareId(r.cardio_id); setShowComparePicker(false); setCompareSearch('') }}
                      className="w-full px-4 py-3 flex items-center justify-between hover:bg-[#201f1f] transition-colors text-left border-b border-[#201f1f]/50 last:border-0"
                    >
                      <div>
                        <p className="text-[10px] text-[#a48b83] font-label uppercase">{formatDate(r.date)}</p>
                        <p className="font-headline font-bold text-sm text-[#e5e2e1]">{r.distance ? `${r.distance} km` : r.activity}</p>
                        <p className="text-[10px] text-[#a48b83]"><ActivityLabel activity={r.activity} /></p>
                      </div>
                      <div className="text-right">
                        {r.pace && <p className="text-sm font-bold text-[#4bdece]">{r.pace} /km</p>}
                        {r.heart_rate && <p className="text-xs text-[#a48b83]">avg {r.heart_rate} bpm</p>}
                      </div>
                    </button>
                  ))}
              </div>
            )}
          </div>

          {/* Delete */}
          <button
            disabled={deleting}
            onClick={async () => {
              if (!confirm('Delete this workout? This can\'t be undone.')) return
              setDeleting(true)
              await fetch(`/api/run/${runId}`, { method: 'DELETE' })
              onDeleted?.(runId)
              onClose()
            }}
            className="mt-6 w-full py-3 rounded-xl border border-red-900/40 text-red-400 text-sm font-bold font-label flex items-center justify-center gap-2 hover:bg-red-950/30 transition-colors disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-base">delete</span>
            {deleting ? 'Deleting…' : 'Delete workout'}
          </button>
        </div>
      </div>
    </>
  )
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
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)

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
          : (activities.find(a => a === 'Run') ?? activities.find(a => a === 'Outdoor run') ?? activities[0] ?? '')
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

  // Default dot position = peak value in the visible range, not the last point
  const liftPeakIdx = useMemo(() =>
    liftPts.length === 0 ? 0 : liftPts.indexOf(Math.max(...liftPts)),
    [liftPts]
  )
  const cardioPeakIdx = useMemo(() => {
    if (cardioValues.length === 0) return 0
    return cardioMetric === 'pace'
      ? cardioValues.indexOf(Math.min(...cardioValues))  // lowest seconds = fastest
      : cardioValues.indexOf(Math.max(...cardioValues))
  }, [cardioValues, cardioMetric])

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

  // Personal records: fastest run in each distance bracket (uses all history, not range-filtered)
  const raceRecords = useMemo(() => {
    const BRACKETS = [
      { label: '5K',       target: 5.0,     tol: 0.4 },
      { label: '10K',      target: 10.0,    tol: 0.8 },
      { label: 'Half',     target: 21.0975, tol: 1.5 },
      { label: 'Marathon', target: 42.195,  tol: 2.0 },
    ]
    const runs = cardioHistory.filter(e =>
      e.activity.toLowerCase().includes('run') && e.distance && e.duration
    )
    return BRACKETS.flatMap(b => {
      const matching = runs.filter(e => {
        const d = parseFloat(e.distance ?? '')
        return !isNaN(d) && Math.abs(d - b.target) <= b.tol
      })
      if (matching.length === 0) return []
      const fastest = matching.reduce((best, e) =>
        (toSeconds(e.duration) ?? Infinity) < (toSeconds(best.duration) ?? Infinity) ? e : best
      )
      return [{ label: b.label, entry: fastest, count: matching.length }]
    })
  }, [cardioHistory])

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
                <h2 className="font-headline text-xl font-bold"><ActivityLabel activity={cardioActivity} /></h2>
              </div>
              <span className="material-symbols-outlined text-[#4bdece]">expand_more</span>
            </div>
            {cardioOpen && (
              <div className="absolute top-full left-0 right-0 bg-surface-container-high rounded-xl mt-1 z-10 border border-outline-variant/20 overflow-hidden">
                {cardioActivities.map(a => (
                  <button
                    key={a}
                    onClick={() => { setCardioActivity(a); setCardioOpen(false) }}
                    className="w-full px-4 py-3 text-left font-body hover:bg-surface-container-highest transition-colors flex items-center gap-2"
                  >
                    <ActivityLabel activity={a} />
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

      {/* Personal records row */}
      {tab === 'cardio' && raceRecords.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 no-scrollbar">
          {raceRecords.map(({ label, entry, count }) => (
            <button
              key={label}
              onClick={() => entry.cardio_id && setSelectedRunId(entry.cardio_id)}
              className="bg-[#131313] rounded-xl px-4 py-3 flex flex-col gap-0.5 shrink-0 active:scale-[0.97] transition-transform text-left min-w-[80px]"
            >
              <span className="text-[9px] font-bold font-label uppercase tracking-widest text-[#4bdece]">{label}</span>
              <span className="text-lg font-black font-headline text-[#e5e2e1] leading-tight">{entry.duration}</span>
              <span className="text-[9px] text-[#a48b83]">{formatDate(entry.date)}</span>
              {count > 1 && <span className="text-[8px] text-[#5a5a5a]">{count} runs</span>}
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
            const idx = hoveredIdx ?? liftPeakIdx
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
            const idx = hoveredIdx ?? cardioPeakIdx
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
              const hIdx = hoveredIdx ?? liftPeakIdx
              const hX = (hIdx / Math.max(liftPts.length - 1, 1)) * 300
              const hY = ptY(liftPts, liftPts[hIdx], false)
              return (
                <svg
                  className="w-full h-32 drop-shadow-[0_0_8px_rgba(255,144,102,0.4)]"
                  viewBox="0 0 300 100" preserveAspectRatio="none"
                  style={{ touchAction: 'none' }}
                  onPointerMove={e => handleChartPointer(e, liftPts.length)}
                  onPointerLeave={() => setHoveredIdx(null)}
                  onPointerCancel={() => setHoveredIdx(null)}
                >
                  <defs>
                    <linearGradient id="liftGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ff9066" stopOpacity="0.2" />
                      <stop offset="100%" stopColor="#ff9066" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <polyline points={liftSvgPts} fill="none" stroke="#ff9066" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  <polygon points={`0,80 ${liftSvgPts} 300,80`} fill="url(#liftGrad)" />
                  {hoveredIdx !== null && <>
                    <line x1={hX} y1={0} x2={hX} y2={100} stroke="#ff9066" strokeWidth="1" strokeOpacity="0.4" strokeDasharray="3,3" />
                    <circle cx={hX} cy={hY} r="5" fill="#ff9066" />
                  </>}
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
              const hIdx = hoveredIdx ?? cardioPeakIdx
              const hX = (hIdx / Math.max(cardioChartPts.length - 1, 1)) * 300
              const hY = ptY(cardioValues, cardioValues[hIdx], cardioInvert)
              return (
              <svg
                className="w-full h-32 drop-shadow-[0_0_8px_rgba(75,222,206,0.3)]"
                viewBox="0 0 300 100" preserveAspectRatio="none"
                style={{ touchAction: 'none' }}
                onPointerMove={e => handleChartPointer(e, cardioChartPts.length)}
                onPointerLeave={() => setHoveredIdx(null)}
                onPointerCancel={() => setHoveredIdx(null)}
              >
                <defs>
                  <linearGradient id="cardioGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#4bdece" stopOpacity="0.2" />
                    <stop offset="100%" stopColor="#4bdece" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <polyline points={cardioSvgPts} fill="none" stroke="#4bdece" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                <polygon points={`0,${cardioInvert ? 10 : 80} ${cardioSvgPts} 300,${cardioInvert ? 10 : 80}`} fill="url(#cardioGrad)" />
                {hoveredIdx !== null && <>
                  <line x1={hX} y1={0} x2={hX} y2={100} stroke="#4bdece" strokeWidth="1" strokeOpacity="0.4" strokeDasharray="3,3" />
                  <circle cx={hX} cy={hY} r="5" fill="#4bdece" />
                </>}
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
                    <p className="text-xs text-on-surface-variant"><ActivityLabel activity={w.activity} /></p>
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
          {tab === 'cardio' && (
            <button
              onClick={() => { setSelectMode(m => !m); setSelectedIds(new Set()) }}
              className={`px-2 py-1 rounded-lg text-[10px] font-bold font-label uppercase tracking-wide transition-colors ${selectMode ? 'bg-red-900/30 text-red-400' : 'text-on-surface-variant/40 hover:text-on-surface-variant'}`}
            >
              {selectMode ? 'Cancel' : 'Select'}
            </button>
          )}
        </div>

        {/* Bulk delete bar */}
        {selectMode && selectedIds.size > 0 && (
          <button
            disabled={bulkDeleting}
            onClick={async () => {
              if (!confirm(`Delete ${selectedIds.size} workout${selectedIds.size > 1 ? 's' : ''}? This can't be undone.`)) return
              setBulkDeleting(true)
              await fetch('/api/run/bulk-delete', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: [...selectedIds] }),
              })
              setCardioHistory(prev => prev.filter(e => !selectedIds.has(e.cardio_id!)))
              setSelectedIds(new Set())
              setSelectMode(false)
              setBulkDeleting(false)
            }}
            className="w-full py-3 rounded-xl bg-red-950/40 border border-red-900/40 text-red-400 text-sm font-bold font-label flex items-center justify-center gap-2 disabled:opacity-50 transition-colors hover:bg-red-950/60"
          >
            <span className="material-symbols-outlined text-base">delete</span>
            {bulkDeleting ? 'Deleting…' : `Delete ${selectedIds.size} workout${selectedIds.size > 1 ? 's' : ''}`}
          </button>
        )}


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
                const isSelected = s.cardio_id ? selectedIds.has(s.cardio_id) : false
                return (
                  <button
                    key={i}
                    onClick={() => {
                      if (selectMode && s.cardio_id) {
                        setSelectedIds(prev => {
                          const next = new Set(prev)
                          next.has(s.cardio_id!) ? next.delete(s.cardio_id!) : next.add(s.cardio_id!)
                          return next
                        })
                      } else {
                        s.cardio_id && setSelectedRunId(s.cardio_id)
                      }
                    }}
                    className={`w-full p-5 flex justify-between items-start transition-all rounded-lg text-left ${
                      isSelected ? 'bg-red-950/30 border border-red-900/40' : `bg-surface-container hover:bg-surface-container-high active:scale-[0.99] ${isFastest ? 'border border-[#4bdece]/30' : ''}`
                    }`}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {selectMode && (
                        <div className={`w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${isSelected ? 'bg-red-500 border-red-500' : 'border-[#a48b83]'}`}>
                          {isSelected && <span className="material-symbols-outlined text-white text-xs">check</span>}
                        </div>
                      )}
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
                    </div>
                    <div className="text-right flex flex-col gap-0.5 ml-3 shrink-0">
                      <p className="text-[10px] font-bold font-label text-on-surface-variant uppercase"><ActivityLabel activity={s.activity} /></p>
                      {s.pace && <p className="font-bold text-on-surface text-sm">{s.pace} /km</p>}
                      {s.duration && <p className="text-xs text-on-surface-variant">{s.duration}</p>}
                      {s.heart_rate && <p className="text-xs text-[#ff9066]">♥ {s.heart_rate} avg</p>}
                    </div>
                  </button>
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

      {selectedRunId !== null && (
        <RunDetailSheet
          runId={selectedRunId}
          allCardio={cardioHistory as CardioEntry[]}
          onClose={() => setSelectedRunId(null)}
          onDeleted={(id) => {
            setCardioHistory(prev => (prev as CardioEntry[]).filter(e => e.cardio_id !== id))
            setSelectedRunId(null)
          }}
        />
      )}
    </main>
  )
}
