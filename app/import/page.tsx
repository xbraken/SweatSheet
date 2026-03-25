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
}

type WorkoutRow = ParsedWorkout & {
  selected: boolean
  alreadyImported: boolean
}

function parseAppleHealthXml(xmlText: string): ParsedWorkout[] {
  const doc = new DOMParser().parseFromString(xmlText, 'text/xml')
  if (doc.querySelector('parsererror')) return []

  const supportedTypes: Record<string, string> = {
    HKWorkoutActivityTypeRunning: 'Outdoor run',
    HKWorkoutActivityTypeCycling: 'Cycling',
    HKWorkoutActivityTypeWalking: 'Walking',
  }

  return Array.from(doc.querySelectorAll('Workout'))
    .filter(w => (w.getAttribute('workoutActivityType') ?? '') in supportedTypes)
    .map(w => {
      const type = w.getAttribute('workoutActivityType')!
      const startDate = (w.getAttribute('startDate') ?? '').split(' ')[0]
      const durationMin = parseFloat(w.getAttribute('duration') ?? '0')
      const rawDist = parseFloat(w.getAttribute('totalDistance') ?? '0')
      const distUnit = w.getAttribute('totalDistanceUnit') ?? 'km'
      const distKm = distUnit === 'mi' ? rawDist * 1.60934 : rawDist
      const calories = Math.round(parseFloat(w.getAttribute('totalEnergyBurned') ?? '0')) || null

      const hrStat = w.querySelector('WorkoutStatistics[type="HKQuantityTypeIdentifierHeartRate"]')
      const avgHr = hrStat ? Math.round(parseFloat(hrStat.getAttribute('average') ?? '0')) || null : null

      const totalSec = Math.round(durationMin * 60)
      const hh = Math.floor(totalSec / 3600)
      const mm = Math.floor((totalSec % 3600) / 60)
      const ss = totalSec % 60
      const durationStr = hh > 0
        ? `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
        : `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`

      const paceSecPerKm = distKm > 0.1 ? totalSec / distKm : null
      const paceStr = paceSecPerKm
        ? `${Math.floor(paceSecPerKm / 60)}:${String(Math.round(paceSecPerKm % 60)).padStart(2, '0')}`
        : null

      return {
        date: startDate,
        activity: supportedTypes[type],
        distance: distKm.toFixed(2),
        duration: durationStr,
        pace: paceStr,
        calories,
        heartRate: avgHr,
      }
    })
    .filter(w => w.date)
    .sort((a, b) => b.date.localeCompare(a.date)) // newest first
}

function formatDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

type Phase = 'upload' | 'preview' | 'importing' | 'done'

export default function ImportPage() {
  const [phase, setPhase] = useState<Phase>('upload')
  const [dragging, setDragging] = useState(false)
  const [workouts, setWorkouts] = useState<WorkoutRow[]>([])
  const [imported, setImported] = useState(0)
  const [total, setTotal] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const processFile = useCallback(async (file: File) => {
    setError(null)
    if (!file.name.endsWith('.xml')) {
      setError('Please upload an XML file. Unzip your export.zip first and find Export.xml inside.')
      return
    }

    const text = await file.text()
    const parsed = parseAppleHealthXml(text)

    if (parsed.length === 0) {
      setError('No supported workouts found. Make sure this is your Apple Health Export.xml.')
      return
    }

    // Fetch existing session dates to detect duplicates
    let existingDates: Set<string> = new Set()
    try {
      const res = await fetch('/api/sessions')
      const sessions = await res.json()
      existingDates = new Set((sessions as { date: string }[]).map(s => s.date))
    } catch { /* silent — proceed without duplicate check */ }

    setWorkouts(parsed.map(w => ({
      ...w,
      selected: !existingDates.has(w.date),
      alreadyImported: existingDates.has(w.date),
    })))
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

  const toggleAll = () => {
    const selectable = workouts.filter(w => !w.alreadyImported)
    const allSelected = selectable.every(w => w.selected)
    setWorkouts(prev => prev.map(w => w.alreadyImported ? w : { ...w, selected: !allSelected }))
  }

  const toggleOne = (i: number) => {
    setWorkouts(prev => prev.map((w, idx) => idx === i && !w.alreadyImported ? { ...w, selected: !w.selected } : w))
  }

  const confirmImport = async () => {
    const toImport = workouts.filter(w => w.selected)
    if (toImport.length === 0) return

    setTotal(toImport.length)
    setImported(0)
    setPhase('importing')

    let count = 0
    for (const w of toImport) {
      try {
        await fetch('/api/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date: w.date,
            blocks: [{
              type: 'cardio',
              activity: w.activity,
              distance: w.distance,
              time: w.duration,
              pace: w.pace,
              calories: w.calories,
              heartRate: w.heartRate,
              importedFrom: 'apple_health',
            }],
          }),
        })
        count++
        setImported(count)
      } catch { /* continue even if one fails */ }
    }

    setPhase('done')
  }

  const selectedCount = workouts.filter(w => w.selected).length

  return (
    <main className="w-full max-w-[390px] mx-auto px-6 pt-2 pb-32 flex flex-col gap-6 min-h-screen">
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
          {/* How-to steps */}
          <section className="bg-surface-container rounded-xl p-5 flex flex-col gap-4">
            <p className="text-[10px] font-bold font-label uppercase tracking-widest text-primary-container">How to export</p>
            {[
              { icon: 'favorite', text: 'Open the Health app on your iPhone' },
              { icon: 'account_circle', text: 'Tap your profile picture → Export All Health Data' },
              { icon: 'folder_zip', text: 'Unzip the file, then find and upload Export.xml here' },
            ].map(({ icon, text }, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-primary-container/10 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="material-symbols-outlined text-primary-container text-base">{icon}</span>
                </div>
                <p className="text-sm text-on-surface-variant leading-snug">{text}</p>
              </div>
            ))}
          </section>

          {/* Drop zone */}
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
            <p className="font-headline font-bold text-base text-on-surface">Upload Export.xml</p>
            <p className="text-xs text-on-surface-variant">Drag and drop, or tap to browse</p>
            <input ref={fileRef} type="file" accept=".xml" className="hidden" onChange={onFileChange} />
          </div>

          {error && (
            <div className="bg-red-900/30 border border-red-500/30 rounded-xl px-4 py-3 text-red-300 text-sm">
              {error}
            </div>
          )}
        </>
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
              {workouts.filter(w => !w.alreadyImported).every(w => w.selected) ? 'Deselect all' : 'Select all'}
            </button>
          </div>

          <div className="flex flex-col gap-2">
            {workouts.map((w, i) => (
              <button
                key={i}
                onClick={() => toggleOne(i)}
                disabled={w.alreadyImported}
                className={`w-full text-left p-4 rounded-xl flex items-center gap-4 transition-all ${
                  w.alreadyImported
                    ? 'bg-surface-container/50 opacity-40 cursor-default'
                    : w.selected
                      ? 'bg-surface-container border border-primary-container/30'
                      : 'bg-surface-container/60'
                }`}
              >
                {/* Checkbox */}
                <div className={`w-5 h-5 rounded-md shrink-0 flex items-center justify-center border transition-all ${
                  w.alreadyImported
                    ? 'border-on-surface/20 bg-transparent'
                    : w.selected
                      ? 'bg-primary-container border-primary-container'
                      : 'border-on-surface/30'
                }`}>
                  {w.selected && !w.alreadyImported && (
                    <span className="material-symbols-outlined text-[#752805] text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>check</span>
                  )}
                </div>

                {/* Activity icon */}
                <div className="w-8 h-8 rounded-full bg-[#4bdece]/10 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[#4bdece] text-base">
                    {w.activity === 'Cycling' ? 'directions_bike' : w.activity === 'Walking' ? 'directions_walk' : 'directions_run'}
                  </span>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold font-label text-on-surface-variant uppercase tracking-wide">
                    {w.alreadyImported ? 'Already imported · ' : ''}{formatDate(w.date)}
                  </p>
                  <p className="font-headline font-bold text-on-surface">
                    {parseFloat(w.distance) > 0 ? `${w.distance} km` : w.activity}
                  </p>
                </div>

                {/* Stats */}
                <div className="text-right shrink-0">
                  {w.pace && <p className="text-sm font-bold text-on-surface">{w.pace} /km</p>}
                  {w.heartRate && <p className="text-xs text-[#4bdece] font-bold">{w.heartRate} bpm</p>}
                  {!w.pace && <p className="text-sm text-on-surface-variant">{w.duration}</p>}
                </div>
              </button>
            ))}
          </div>

          {/* Sticky confirm button */}
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
            <p className="text-sm text-on-surface-variant mt-1">Importing workouts…</p>
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
