'use client'
import { useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import BottomNav from '@/components/BottomNav'

type ParsedWorkout = {
  date: string
  activity: string
  distance: string
  duration: string
  pace: string | null
  calories: number | null
  heartRate: number | null
  hrMin: number | null
  hrMax: number | null
  startedAt: string
  endedAt: string
  sourceName: string
  hrSamples: Array<{ offsetSec: number; bpm: number }>
  distanceSamples: Array<{ offsetSec: number; distKm: number }>
}

type WorkoutRow = ParsedWorkout & {
  selected: boolean
  alreadyImported: boolean
}

const SUPPORTED: Record<string, string> = {
  HKWorkoutActivityTypeRunning: 'Outdoor run',
  HKWorkoutActivityTypeCycling: 'Cycling',
  HKWorkoutActivityTypeWalking: 'Walking',
}

function attr(xml: string, name: string): string {
  const m = xml.match(new RegExp(`${name}="([^"]*)"`) )
  return m?.[1] ?? ''
}

/** Extract a numeric value from a WorkoutStatistics child element by HK type */
function statValue(xml: string, statType: string, valueAttr = 'sum'): number | null {
  const m = xml.match(new RegExp(`<WorkoutStatistics[^>]*type="${statType}"[^>]*/>`))
  if (!m) return null
  const v = parseFloat(attr(m[0], valueAttr))
  return isNaN(v) || v === 0 ? null : v
}

function statUnit(xml: string, statType: string): string {
  const m = xml.match(new RegExp(`<WorkoutStatistics[^>]*type="${statType}"[^>]*/>`))
  return m ? attr(m[0], 'unit') : ''
}

function toSeconds(str: string | null): number | null {
  if (!str) return null
  const parts = str.split(':').map(Number)
  if (parts.some(isNaN)) return null
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  return null
}

function processWorkoutBlock(xml: string): ParsedWorkout | null {
  const type = attr(xml, 'workoutActivityType')
  if (!(type in SUPPORTED)) return null

  const startedAt = attr(xml, 'startDate') // full timestamp e.g. "2024-01-15 08:30:00 +0000"
  const endedAt = attr(xml, 'endDate')
  const startDate = startedAt.split(' ')[0]
  if (!startDate) return null

  // Detect indoor runs via metadata
  const isIndoor = type === 'HKWorkoutActivityTypeRunning' &&
    /MetadataEntry[^>]*key="HKMetadataKeyIndoorWorkout"[^>]*value="1"/.test(xml)
  const activity = isIndoor ? 'Indoor run' : SUPPORTED[type]

  const durationMin = parseFloat(attr(xml, 'duration')) || 0

  // Distance: top-level attribute first, fall back to WorkoutStatistics
  let rawDist = parseFloat(attr(xml, 'totalDistance')) || 0
  let distUnit = attr(xml, 'totalDistanceUnit')
  if (rawDist === 0) {
    const distStatType = type === 'HKWorkoutActivityTypeCycling'
      ? 'HKQuantityTypeIdentifierDistanceCycling'
      : 'HKQuantityTypeIdentifierDistanceWalkingRunning'
    rawDist = statValue(xml, distStatType) ?? 0
    if (rawDist > 0) distUnit = statUnit(xml, distStatType)
  }
  const distKm = distUnit === 'mi' ? rawDist * 1.60934 : rawDist

  // Calories
  let caloriesRaw = parseFloat(attr(xml, 'totalEnergyBurned')) || 0
  if (caloriesRaw === 0) caloriesRaw = statValue(xml, 'HKQuantityTypeIdentifierActiveEnergyBurned') ?? 0
  const calories = caloriesRaw > 0 ? Math.round(caloriesRaw) : null

  // HR: avg, min, max from WorkoutStatistics
  const hrMatch = xml.match(/WorkoutStatistics[^>]*type="HKQuantityTypeIdentifierHeartRate"[^>]*average="([^"]*)"/)
  const avgHr = hrMatch ? Math.round(parseFloat(hrMatch[1])) || null : null
  const hrMinRaw = statValue(xml, 'HKQuantityTypeIdentifierHeartRate', 'minimum')
  const hrMaxRaw = statValue(xml, 'HKQuantityTypeIdentifierHeartRate', 'maximum')
  const hrMin = hrMinRaw ? Math.round(hrMinRaw) : null
  const hrMax = hrMaxRaw ? Math.round(hrMaxRaw) : null

  const sourceName = attr(xml, 'sourceName') || 'Unknown'

  const totalSec = Math.round(durationMin * 60)
  const hh = Math.floor(totalSec / 3600)
  const mm = Math.floor((totalSec % 3600) / 60)
  const ss = totalSec % 60
  const duration = hh > 0
    ? `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
    : `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`

  const paceSecPerKm = distKm > 0.1 ? totalSec / distKm : null
  const pace = paceSecPerKm
    ? `${Math.floor(paceSecPerKm / 60)}:${String(Math.round(paceSecPerKm % 60)).padStart(2, '0')}`
    : null

  return {
    date: startDate,
    activity,
    distance: distKm.toFixed(2),
    duration,
    pace,
    calories,
    heartRate: avgHr,
    hrMin,
    hrMax,
    startedAt,
    endedAt,
    sourceName,
    hrSamples: [], // populated in streamParseAppleHealth after matching HR records
    distanceSamples: [],
  }
}

/**
 * Parse Apple Health date string to Unix ms.
 * Format: "2024-01-15 08:30:00 +0000" — the space before TZ offset breaks
 * Safari's Date constructor, so we normalise to ISO 8601 first.
 */
function parseAppleDate(s: string): number {
  if (!s) return NaN
  // "2024-01-15 08:30:00 +0000" → "2024-01-15T08:30:00+00:00"
  const m = s.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-])(\d{2})(\d{2})/)
  if (m) return new Date(`${m[1]}T${m[2]}${m[3]}${m[4]}:${m[5]}`).getTime()
  return new Date(s).getTime() // fallback for any other format
}

/** Parse a single HKQuantityTypeIdentifierHeartRate Record element */
function parseHrRecord(xml: string): { ts: number; bpm: number } | null {
  // Only Apple Watch HR (filters out iPhone passive sensing)
  const source = attr(xml, 'sourceName').toLowerCase()
  if (!source.includes('watch')) return null
  const dateStr = attr(xml, 'startDate')
  const value = parseFloat(attr(xml, 'value'))
  if (!dateStr || isNaN(value) || value <= 0) return null
  const ts = parseAppleDate(dateStr)
  if (isNaN(ts)) return null
  return { ts, bpm: Math.round(value) }
}

/** Parse a single DistanceWalkingRunning Record element */
function parseDistRecord(xml: string): { ts: number; dist: number } | null {
  const source = attr(xml, 'sourceName').toLowerCase()
  if (!source.includes('watch')) return null
  const dateStr = attr(xml, 'startDate')
  const value = parseFloat(attr(xml, 'value'))
  const unit = attr(xml, 'unit')
  if (!dateStr || isNaN(value) || value <= 0) return null
  const ts = parseAppleDate(dateStr)
  if (isNaN(ts)) return null
  const distKm = unit === 'mi' ? value * 1.60934 : value
  return { ts, dist: distKm }
}

/** Pass 1: collect workouts — original logic, completely unchanged */
async function collectWorkouts(
  file: File,
  onProgress: (pct: number) => void,
): Promise<ParsedWorkout[]> {
  const workouts: ParsedWorkout[] = []
  const decoder = new TextDecoder('utf-8')
  const reader = file.stream().getReader()
  let buffer = ''
  let bytesRead = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      bytesRead += value.byteLength
      onProgress(bytesRead / file.size)
      buffer += decoder.decode(value, { stream: true })
      let searchFrom = 0
      while (true) {
        const start = buffer.indexOf('<Workout ', searchFrom)
        if (start === -1) break
        const end = buffer.indexOf('</Workout>', start)
        if (end === -1) { buffer = buffer.slice(start); searchFrom = 0; break }
        const block = buffer.slice(start, end + '</Workout>'.length)
        const workout = processWorkoutBlock(block)
        if (workout) workouts.push(workout)
        searchFrom = end + '</Workout>'.length
      }
      if (searchFrom > 0) buffer = buffer.slice(searchFrom)
      if (!buffer.includes('<Workout ') && buffer.length > 2000) buffer = buffer.slice(-500)
    }
  } finally { reader.releaseLock() }
  return workouts
}

/** Pass 2: stream through the file collecting HR and distance samples for each workout window */
async function collectSamples(
  file: File,
  windows: Array<{ startTs: number; endTs: number; workout: ParsedWorkout }>,
  onProgress: (pct: number) => void,
): Promise<void> {
  const decoder = new TextDecoder('utf-8')
  const reader = file.stream().getReader()
  let buffer = ''
  let bytesRead = 0
  // Maps from startTs → samples (windows are sorted by startTs)
  const hrMap = new Map<number, Array<{ offsetSec: number; bpm: number }>>()
  const distRawMap = new Map<number, Array<{ ts: number; dist: number }>>()
  for (const w of windows) {
    hrMap.set(w.startTs, [])
    distRawMap.set(w.startTs, [])
  }

  const NEEDLE = '<Record type="HKQuantityTypeIdentifier'

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      bytesRead += value.byteLength
      onProgress(bytesRead / file.size)
      buffer += decoder.decode(value, { stream: true })

      let searchFrom = 0
      while (true) {
        const idx = buffer.indexOf(NEEDLE, searchFrom)
        if (idx === -1) break
        const gtPos = buffer.indexOf('>', idx)
        if (gtPos === -1) { buffer = buffer.slice(idx); searchFrom = 0; break }
        let end: number
        if (buffer[gtPos - 1] === '/') {
          end = gtPos + 1
        } else {
          const closeTag = buffer.indexOf('</Record>', gtPos)
          if (closeTag === -1) { buffer = buffer.slice(idx); searchFrom = 0; break }
          end = closeTag + 9
        }
        const recordXml = buffer.slice(idx, end)
        const recordType = attr(recordXml, 'type')

        if (recordType === 'HKQuantityTypeIdentifierHeartRate') {
          const hr = parseHrRecord(recordXml)
          if (hr) {
            for (const w of windows) {
              if (hr.ts < w.startTs) break
              if (hr.ts <= w.endTs) {
                hrMap.get(w.startTs)!.push({
                  offsetSec: Math.round((hr.ts - w.startTs) / 1000),
                  bpm: hr.bpm,
                })
              }
            }
          }
        } else if (recordType === 'HKQuantityTypeIdentifierDistanceWalkingRunning') {
          const d = parseDistRecord(recordXml)
          if (d) {
            for (const w of windows) {
              if (d.ts < w.startTs) break
              if (d.ts <= w.endTs) {
                distRawMap.get(w.startTs)!.push({ ts: d.ts, dist: d.dist })
              }
            }
          }
        }

        searchFrom = end
      }
      if (searchFrom > 0) buffer = buffer.slice(searchFrom)
      if (!buffer.includes(NEEDLE) && buffer.length > 2000) buffer = buffer.slice(-500)
    }
  } finally { reader.releaseLock() }

  for (const w of windows) {
    const hrSamples = hrMap.get(w.startTs) ?? []
    w.workout.hrSamples = hrSamples
    if (hrSamples.length > 0) {
      if (!w.workout.hrMin) w.workout.hrMin = Math.min(...hrSamples.map(s => s.bpm))
      if (!w.workout.hrMax) w.workout.hrMax = Math.max(...hrSamples.map(s => s.bpm))
    }

    // Accumulate raw distance deltas into cumulative distance samples
    const rawDist = distRawMap.get(w.startTs) ?? []
    rawDist.sort((a, b) => a.ts - b.ts)
    let cumKm = 0
    w.workout.distanceSamples = rawDist.map(d => {
      cumKm += d.dist
      return { offsetSec: Math.round((d.ts - w.startTs) / 1000), distKm: cumKm }
    })
  }
}

/** Stream-parse the XML in two passes — workouts first, then HR samples */
async function streamParseAppleHealth(
  file: File,
  onProgress: (pct: number) => void,
): Promise<ParsedWorkout[]> {
  // Pass 1: collect workouts (progress 0–60%)
  const workouts = await collectWorkouts(file, pct => onProgress(pct * 0.6))

  // Pass 2: collect HR samples for each workout (progress 60–100%)
  const windows = workouts
    .map(w => ({ startTs: parseAppleDate(w.startedAt), endTs: parseAppleDate(w.endedAt), workout: w }))
    .filter(w => !isNaN(w.startTs) && !isNaN(w.endTs) && w.endTs > w.startTs)
    .sort((a, b) => a.startTs - b.startTs)

  if (windows.length > 0) {
    await collectSamples(file, windows, pct => onProgress(0.6 + pct * 0.4))
  }

  return workouts.sort((a, b) => b.date.localeCompare(a.date))
}

// ── Shortcut JSON import ──────────────────────────────────────────────────────
// Accepts JSON produced by an Apple Shortcut querying HealthKit directly.
// This avoids re-downloading the full 1.6 GB Apple Health export.
//
// Expected JSON shape (all HR-sample fields are optional):
// {
//   "workouts": [
//     { "type": "Running", "startDate": "2025-03-20T07:30:00+00:00",
//       "endDate": "2025-03-20T08:15:00+00:00", "durationSec": 2700,
//       "distanceKm": 8.5, "calories": 520,
//       "avgHR": 152, "minHR": 130, "maxHR": 178, "isIndoor": false }
//   ],
//   "hrSamples": [
//     { "date": "2025-03-20T07:30:15+00:00", "bpm": 135 }
//   ]
// }

const SHORTCUT_ACTIVITY: Record<string, string> = {
  running: 'Outdoor run',
  'outdoor run': 'Outdoor run',
  'indoor run': 'Indoor run',
  cycling: 'Cycling',
  'outdoor cycling': 'Cycling',
  'indoor cycling': 'Cycling',
  walking: 'Walking',
  hkworkoutactivitytyperunning: 'Outdoor run',
  hkworkoutactivitytypecycling: 'Cycling',
  hkworkoutactivitytypewalking: 'Walking',
}

// Accept many possible field-name spellings so the Shortcut is flexible
function scField(w: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) if (w[k] !== undefined) return w[k]
  return undefined
}

function parseShortcutJSON(raw: unknown): ParsedWorkout[] {
  if (!raw || typeof raw !== 'object') throw new Error('Not an object')
  const data = raw as Record<string, unknown>
  const wArr = data.workouts
  if (!Array.isArray(wArr)) throw new Error('Missing workouts array')

  // Flatten HR samples with timestamps, sorted ascending
  const hrArr = Array.isArray(data.hrSamples) ? data.hrSamples : []
  const hrFlat = (hrArr as Record<string, unknown>[])
    .map(s => {
      const dateStr = String(scField(s, 'date', 'startDate', 'timestamp') ?? '')
      const bpm = Number(scField(s, 'bpm', 'value', 'heartRate') ?? NaN)
      if (!dateStr || isNaN(bpm) || bpm <= 0) return null
      const ts = new Date(dateStr).getTime()
      return isNaN(ts) ? null : { ts, bpm: Math.round(bpm) }
    })
    .filter(Boolean) as Array<{ ts: number; bpm: number }>
  hrFlat.sort((a, b) => a.ts - b.ts)

  const results: ParsedWorkout[] = []
  for (const raw of wArr) {
    const w = raw as Record<string, unknown>

    const typeStr = String(scField(w, 'type', 'workoutType', 'activity') ?? '').toLowerCase().trim()
    let activity = SHORTCUT_ACTIVITY[typeStr]
    if (!activity) continue

    const startStr = String(scField(w, 'startDate', 'start', 'startedAt') ?? '')
    const endStr = String(scField(w, 'endDate', 'end', 'endedAt') ?? '')
    const startTs = new Date(startStr).getTime()
    const endTs = new Date(endStr).getTime()
    if (isNaN(startTs) || isNaN(endTs) || endTs <= startTs) continue

    if (w.isIndoor && activity === 'Outdoor run') activity = 'Indoor run'

    const date = startStr.split('T')[0]

    // Duration
    const durSec = scField(w, 'durationSec', 'duration')
    const durMin = scField(w, 'durationMin')
    let totalSec: number
    if (durSec !== undefined && !isNaN(Number(durSec))) totalSec = Math.round(Number(durSec))
    else if (durMin !== undefined && !isNaN(Number(durMin))) totalSec = Math.round(Number(durMin) * 60)
    else totalSec = Math.round((endTs - startTs) / 1000)

    const hh = Math.floor(totalSec / 3600)
    const mm = Math.floor((totalSec % 3600) / 60)
    const ss = totalSec % 60
    const duration = hh > 0
      ? `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
      : `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`

    // Distance — prefer explicit unit fields, then distanceUnit, then guess from magnitude
    let distKm = 0
    const distKmField = scField(w, 'distanceKm')
    const distMiField = scField(w, 'distanceMi')
    const distMField = scField(w, 'distanceM')
    const distField = scField(w, 'distance')
    const distUnit = String(scField(w, 'distanceUnit', 'unit') ?? '').toLowerCase()
    if (distKmField !== undefined) distKm = Number(distKmField)
    else if (distMiField !== undefined) distKm = Number(distMiField) * 1.60934
    else if (distMField !== undefined) distKm = Number(distMField) / 1000
    else if (distField !== undefined) {
      const raw = Number(distField)
      if (distUnit === 'mi') distKm = raw * 1.60934
      else if (distUnit === 'm') distKm = raw / 1000
      else if (distUnit === 'km') distKm = raw
      else distKm = raw > 500 ? raw / 1000 : raw // heuristic: >500 is likely metres
    }
    if (isNaN(distKm)) distKm = 0

    // Pace
    const paceSecPerKm = distKm > 0.1 ? totalSec / distKm : null
    const pace = paceSecPerKm
      ? `${Math.floor(paceSecPerKm / 60)}:${String(Math.round(paceSecPerKm % 60)).padStart(2, '0')}`
      : null

    // HR stats
    const avgHR = Number(scField(w, 'avgHR', 'averageHeartRate', 'heartRate') ?? NaN)
    const minHR = Number(scField(w, 'minHR', 'minimumHeartRate') ?? NaN)
    const maxHR = Number(scField(w, 'maxHR', 'maximumHeartRate') ?? NaN)
    const cals = Number(scField(w, 'calories', 'activeEnergyKcal', 'totalEnergyBurned') ?? NaN)

    // Match flat HR samples to this workout window
    const samples: Array<{ offsetSec: number; bpm: number }> = []
    for (const s of hrFlat) {
      if (s.ts < startTs) continue
      if (s.ts > endTs) break
      samples.push({ offsetSec: Math.round((s.ts - startTs) / 1000), bpm: s.bpm })
    }

    results.push({
      date,
      activity,
      distance: distKm.toFixed(2),
      duration,
      pace,
      calories: isNaN(cals) || cals <= 0 ? null : Math.round(cals),
      heartRate: isNaN(avgHR) || avgHR <= 0 ? null : Math.round(avgHR),
      hrMin: isNaN(minHR) || minHR <= 0 ? null : Math.round(minHR),
      hrMax: isNaN(maxHR) || maxHR <= 0 ? null : Math.round(maxHR),
      startedAt: startStr,
      endedAt: endStr,
      sourceName: 'Shortcuts',
      hrSamples: samples,
      distanceSamples: [],
    })
  }

  return results.sort((a, b) => b.date.localeCompare(a.date))
}

function formatDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

type Phase = 'upload' | 'parsing' | 'preview' | 'importing' | 'done'

export default function ImportPage() {
  const [phase, setPhase] = useState<Phase>('upload')
  const [dragging, setDragging] = useState(false)
  const [parseProgress, setParseProgress] = useState(0)
  const [workouts, setWorkouts] = useState<WorkoutRow[]>([])
  const [activeSources, setActiveSources] = useState<Set<string>>(new Set())
  const [imported, setImported] = useState(0)
  const [total, setTotal] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const processFile = useCallback(async (file: File) => {
    setError(null)
    const isJson = file.name.endsWith('.json')
    const isXml = file.name.endsWith('.xml')
    if (!isJson && !isXml) {
      setError('Please upload Export.xml (Apple Health) or a SweatSheet Shortcut JSON file.')
      return
    }

    setParseProgress(0)
    setPhase('parsing')

    let parsed: ParsedWorkout[]
    try {
      if (isJson) {
        const text = await file.text()
        const json = JSON.parse(text)
        parsed = parseShortcutJSON(json)
        setParseProgress(100)
      } else {
        parsed = await streamParseAppleHealth(file, pct => setParseProgress(Math.round(pct * 100)))
      }
    } catch {
      setError(isJson
        ? 'Could not read the JSON file. Make sure it was exported from the SweatSheet Shortcut.'
        : 'Failed to read the file. Make sure it is a valid Apple Health Export.xml.')
      setPhase('upload')
      return
    }

    if (parsed.length === 0) {
      setError(isJson
        ? 'No supported workouts found in the JSON. Check your Shortcut exported Running, Cycling, or Walking.'
        : 'No supported workouts found. Make sure this is your Apple Health Export.xml.')
      setPhase('upload')
      return
    }

    // Fetch all existing cardio to detect duplicates by activity + duration/distance
    let existingCardio: Array<{ date: string; activity: string; duration: string | null; distance: string | null }> = []
    try {
      const res = await fetch('/api/progress')
      const data = await res.json()
      existingCardio = data.cardioHistory ?? []
    } catch { /* proceed without duplicate check */ }

    const isDuplicate = (w: ParsedWorkout) =>
      existingCardio.some(ex => {
        if (ex.date !== w.date || ex.activity !== w.activity) return false
        const exSec = toSeconds(ex.duration)
        const wSec = toSeconds(w.duration)
        if (exSec && wSec && Math.abs(exSec - wSec) <= 300) return true
        const exDist = parseFloat(ex.distance ?? '')
        const wDist = parseFloat(w.distance)
        if (!isNaN(exDist) && !isNaN(wDist) && exDist > 0) {
          if (Math.abs(exDist - wDist) / exDist <= 0.1) return true
        }
        return false
      })

    const rows = parsed.map(w => ({
      ...w,
      selected: !isDuplicate(w),
      alreadyImported: isDuplicate(w),
    }))
    setWorkouts(rows)
    setActiveSources(new Set(rows.map(w => w.sourceName)))
    setPhase('preview')
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }, [processFile])

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }, [processFile])

  const sources = [...new Set(workouts.map(w => w.sourceName))]
  const toggleSource = (src: string) =>
    setActiveSources(prev => {
      const next = new Set(prev)
      next.has(src) ? next.delete(src) : next.add(src)
      return next
    })

  const visibleWorkouts = workouts.filter(w => activeSources.has(w.sourceName))

  const toggleAll = () => {
    const allSelected = visibleWorkouts.filter(w => !w.alreadyImported).every(w => w.selected)
    setWorkouts(prev => prev.map(w =>
      activeSources.has(w.sourceName) && !w.alreadyImported ? { ...w, selected: !allSelected } : w
    ))
  }

  const toggleOne = (i: number) => {
    setWorkouts(prev => prev.map((w, idx) => idx === i && !w.alreadyImported ? { ...w, selected: !w.selected } : w))
  }

  const confirmImport = async () => {
    const toImport = workouts.filter(w => w.selected && activeSources.has(w.sourceName))
    if (toImport.length === 0) return

    setTotal(toImport.length)
    setImported(0)
    setPhase('importing')

    const CHUNK = 25
    let done = 0
    const chunks: typeof toImport[] = []
    for (let i = 0; i < toImport.length; i += CHUNK) chunks.push(toImport.slice(i, i + CHUNK))

    await Promise.all(chunks.map(async chunk => {
      try {
        const res = await fetch('/api/sessions/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workouts: chunk }),
        })
        const data = await res.json()
        done += data.imported ?? chunk.length
      } catch {
        done += chunk.length
      }
      setImported(done)
    }))

    setPhase('done')
  }

  const selectedCount = workouts.filter(w => w.selected && activeSources.has(w.sourceName)).length

  return (
    <main className="w-full max-w-[390px] md:max-w-3xl mx-auto px-6 pt-2 pb-32 md:pb-12 flex flex-col gap-6 min-h-screen">
      {/* Header */}
      <header className="flex justify-between items-center py-4">
        <div>
          <h1 className="text-2xl font-black text-primary tracking-tighter font-headline">Import</h1>
          <p className="text-[10px] font-bold font-label uppercase tracking-widest text-on-surface-variant">Apple Health</p>
        </div>
        <Link href="/log" className="material-symbols-outlined text-on-surface-variant text-2xl">close</Link>
      </header>

      {/* ── Phase: Upload ──────────────────────────────────────────── */}
      {phase === 'upload' && (
        <>
          {/* Option A — Shortcut (recommended for ongoing syncs) */}
          <section className="bg-surface-container rounded-xl p-5 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold font-label uppercase tracking-widest text-[#4bdece]">Recommended · Quick Sync</span>
              <span className="text-[9px] bg-[#4bdece]/10 text-[#4bdece] px-2 py-0.5 rounded-full font-bold font-label uppercase tracking-wide">~1 MB</span>
            </div>
            <p className="text-sm text-on-surface-variant leading-snug">Use the <span className="text-on-surface font-semibold">SweatSheet Shortcut</span> on your iPhone to export only recent workouts — no giant downloads needed for day-to-day syncing.</p>
            <div className="mt-1 flex flex-col gap-2">
              {[
                { icon: 'download', text: 'Install the SweatSheet Shortcut on your iPhone (link in Settings)' },
                { icon: 'play_circle', text: 'Run it — choose how many days back to export' },
                { icon: 'upload', text: 'Share the .json file here and import instantly' },
              ].map(({ icon, text }, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-[#4bdece]/10 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="material-symbols-outlined text-[#4bdece] text-sm">{icon}</span>
                  </div>
                  <p className="text-xs text-on-surface-variant leading-snug">{text}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Option B — Full XML (first-time or if Shortcut isn't set up) */}
          <section className="bg-surface-container rounded-xl p-5 flex flex-col gap-3">
            <span className="text-[10px] font-bold font-label uppercase tracking-widest text-on-surface-variant/60">Full Export · First-time import</span>
            {[
              { icon: 'favorite', text: 'Open the Health app on your iPhone' },
              { icon: 'account_circle', text: 'Tap your profile picture → Export All Health Data' },
              { icon: 'folder_zip', text: 'Unzip the file, then find and upload Export.xml here' },
            ].map(({ icon, text }, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-primary-container/10 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="material-symbols-outlined text-primary-container text-sm">{icon}</span>
                </div>
                <p className="text-xs text-on-surface-variant leading-snug">{text}</p>
              </div>
            ))}
          </section>

          <div
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
            className={`relative border-2 border-dashed rounded-2xl flex flex-col items-center justify-center gap-3 py-14 cursor-pointer transition-all ${
              dragging ? 'border-primary-container bg-primary-container/5' : 'border-on-surface/10 hover:border-primary-container/40'
            }`}
          >
            <span className="material-symbols-outlined text-5xl text-on-surface/20">upload_file</span>
            <p className="font-headline font-bold text-base text-on-surface">Upload Export.xml or .json</p>
            <p className="text-xs text-on-surface-variant">Drag and drop, or tap to browse</p>
            <input ref={fileRef} type="file" accept=".xml,.json" className="hidden" onChange={onFileChange} />
          </div>

          {error && (
            <div className="bg-red-900/30 border border-red-500/30 rounded-xl px-4 py-3 text-red-300 text-sm">
              {error}
            </div>
          )}
        </>
      )}

      {/* ── Phase: Parsing ─────────────────────────────────────────── */}
      {phase === 'parsing' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 py-20 text-center">
          <div className="w-16 h-16 rounded-full border-4 border-primary-container border-t-transparent animate-spin" />
          <div>
            <p className="font-headline font-bold text-xl">Scanning file…</p>
            <p className="text-sm text-on-surface-variant mt-1">Large files take a few seconds</p>
          </div>
          <div className="w-full">
            <div className="w-full bg-surface-container rounded-full h-2">
              <div
                className="bg-primary-container h-2 rounded-full transition-all duration-150"
                style={{ width: `${parseProgress}%` }}
              />
            </div>
            <p className="text-xs text-on-surface-variant mt-2">{parseProgress}%</p>
          </div>
        </div>
      )}

      {/* ── Phase: Preview ─────────────────────────────────────────── */}
      {phase === 'preview' && (
        <>
          <div className="flex justify-between items-center">
            <div>
              <h2 className="font-headline font-bold text-lg">{workouts.length} workouts found</h2>
              <p className="text-xs text-on-surface-variant">{workouts.filter(w => w.alreadyImported).length} already in SweatSheet</p>
            </div>
            <button
              onClick={toggleAll}
              className="text-[11px] font-bold font-label uppercase tracking-widest text-primary-container"
            >
              {visibleWorkouts.filter(w => !w.alreadyImported).every(w => w.selected) ? 'Deselect all' : 'Select all'}
            </button>
          </div>

          {sources.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {sources.map(src => (
                <button
                  key={src}
                  onClick={() => toggleSource(src)}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-bold font-label tracking-wide transition-colors ${
                    activeSources.has(src)
                      ? 'bg-[#4bdece] text-[#003732]'
                      : 'bg-surface-container text-on-surface-variant/50 line-through'
                  }`}
                >
                  {src}
                </button>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-2">
            {visibleWorkouts.map((w) => {
              const origIdx = workouts.indexOf(w)
              return (
              <button
                key={origIdx}
                onClick={() => toggleOne(origIdx)}
                disabled={w.alreadyImported}
                className={`w-full text-left p-4 rounded-xl flex items-center gap-4 transition-all ${
                  w.alreadyImported
                    ? 'bg-surface-container/50 opacity-40 cursor-default'
                    : w.selected
                      ? 'bg-surface-container border border-primary-container/30'
                      : 'bg-surface-container/60'
                }`}
              >
                <div className={`w-5 h-5 rounded-md shrink-0 flex items-center justify-center border transition-all ${
                  w.alreadyImported ? 'border-on-surface/20' : w.selected ? 'bg-primary-container border-primary-container' : 'border-on-surface/30'
                }`}>
                  {w.selected && !w.alreadyImported && (
                    <span className="material-symbols-outlined text-[#752805] text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>check</span>
                  )}
                </div>

                <div className="w-8 h-8 rounded-full bg-[#4bdece]/10 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[#4bdece] text-base">
                    {w.activity === 'Cycling' ? 'directions_bike' : w.activity === 'Walking' ? 'directions_walk' : 'directions_run'}
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold font-label text-on-surface-variant uppercase tracking-wide">
                    {w.alreadyImported ? 'Already imported · ' : ''}{formatDate(w.date)}
                  </p>
                  <p className="font-headline font-bold text-on-surface">
                    {parseFloat(w.distance) > 0 ? `${w.distance} km` : w.activity}
                  </p>
                  <p className="text-[10px] text-on-surface-variant/60 mt-0.5">{w.sourceName}</p>
                </div>

                <div className="text-right shrink-0">
                  {w.pace && <p className="text-sm font-bold text-on-surface">{w.pace} /km</p>}
                  {!w.pace && <p className="text-sm text-on-surface-variant">{w.duration}</p>}
                </div>
              </button>
              )
            })}
          </div>

          <div className="sticky bottom-24 pt-4">
            <button
              onClick={confirmImport}
              disabled={selectedCount === 0}
              className="w-full py-4 rounded-2xl font-headline font-bold text-base bg-gradient-to-br from-primary to-primary-container text-[#752805] shadow-xl active:scale-95 transition-all disabled:opacity-30"
            >
              Import {selectedCount > 0 ? `${selectedCount} workout${selectedCount > 1 ? 's' : ''}` : 'workouts'}
            </button>
          </div>
        </>
      )}

      {/* ── Phase: Importing ───────────────────────────────────────── */}
      {phase === 'importing' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 py-20">
          <div className="w-16 h-16 rounded-full border-4 border-primary-container border-t-transparent animate-spin" />
          <div className="text-center">
            <p className="font-headline font-bold text-xl">{imported} / {total}</p>
            <p className="text-sm text-on-surface-variant mt-1">Saving to SweatSheet…</p>
          </div>
          <div className="w-full bg-surface-container rounded-full h-2">
            <div
              className="bg-primary-container h-2 rounded-full transition-all duration-300"
              style={{ width: total > 0 ? `${(imported / total) * 100}%` : '0%' }}
            />
          </div>
        </div>
      )}

      {/* ── Phase: Done ────────────────────────────────────────────── */}
      {phase === 'done' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 py-20 text-center">
          <div className="w-16 h-16 rounded-full bg-primary-container/20 flex items-center justify-center">
            <span className="material-symbols-outlined text-primary-container text-4xl" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
          </div>
          <div>
            <p className="font-headline font-black text-3xl text-primary-container">{imported}</p>
            <p className="font-headline font-bold text-xl mt-1">workout{imported !== 1 ? 's' : ''} imported</p>
            <p className="text-sm text-on-surface-variant mt-2">from Apple Health</p>
          </div>
          <div className="flex flex-col gap-3 w-full mt-4">
            <Link
              href="/progress"
              className="w-full py-4 rounded-2xl font-headline font-bold text-base bg-gradient-to-br from-primary to-primary-container text-[#752805] text-center shadow-xl"
            >
              View in Progress
            </Link>
            <button
              onClick={() => { setPhase('upload'); setWorkouts([]); setError(null) }}
              className="w-full py-3 rounded-2xl font-headline font-bold text-sm text-on-surface-variant bg-surface-container"
            >
              Import another file
            </button>
          </div>
        </div>
      )}

      <BottomNav />
    </main>
  )
}
