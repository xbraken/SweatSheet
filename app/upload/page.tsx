'use client'
import { useState, useRef } from 'react'
import BottomNav from '@/components/BottomNav'

type ParsedWorkout = {
  date: string
  type: string
  distance?: string
  pace?: string
  duration: string
}

export default function UploadPage() {
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [parsed, setParsed] = useState<ParsedWorkout | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('image', file)
      const res = await fetch('/api/parse-workout', { method: 'POST', body: formData })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setParsed(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to parse workout')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="pb-24 px-4 pt-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <span className="font-headline font-black text-primary text-xl tracking-tight">SWEATSHEET</span>
        <button className="material-symbols-outlined text-[#adaaaa]">account_circle</button>
      </div>

      <h1 className="font-headline font-black text-4xl mb-1">IMPORT</h1>
      <h1 className="font-headline font-black text-4xl text-primary mb-4">MOMENTUM</h1>
      <p className="text-sm text-[#adaaaa] mb-8">
        Upload an Apple Fitness or Strava screenshot — we&apos;ll extract your workout automatically.
      </p>

      {/* Upload area */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-12 flex flex-col items-center justify-center cursor-pointer transition-colors mb-8 ${dragging ? 'border-primary bg-primary/10' : 'border-[#484847]'}`}
      >
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
        {loading ? (
          <>
            <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-sm text-[#adaaaa]">Parsing workout...</p>
          </>
        ) : (
          <>
            <div className="w-12 h-12 bg-[#262626] rounded-xl flex items-center justify-center mb-4">
              <span className="material-symbols-outlined text-primary text-2xl">add_photo_alternate</span>
            </div>
            <p className="font-bold text-sm mb-1">TAP TO UPLOAD</p>
            <p className="text-xs text-[#adaaaa]">MAXIMUM FILE SIZE: 10MB</p>
          </>
        )}
      </div>

      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

      {/* Recently parsed */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-bold text-[#adaaaa] tracking-widest">RECENTLY PARSED</p>
        <button className="text-xs text-primary">HISTORY</button>
      </div>

      {parsed ? (
        <div className="bg-[#1a1919] rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="font-headline font-bold text-lg">{parsed.date}</p>
            <span className="w-6 h-6 bg-primary rounded-full flex items-center justify-center">
              <span className="material-symbols-outlined text-black text-sm">check</span>
            </span>
          </div>
          <p className="text-xs text-[#adaaaa] mb-3">⏱ {parsed.duration} DURATION</p>
          <div className="grid grid-cols-2 gap-4">
            {parsed.distance && (
              <div>
                <p className="text-xs text-[#adaaaa] mb-1">DISTANCE</p>
                <p className="font-headline font-black text-2xl">{parsed.distance}</p>
              </div>
            )}
            {parsed.pace && (
              <div>
                <p className="text-xs text-[#adaaaa] mb-1">AVG PACE</p>
                <p className="font-headline font-black text-2xl">{parsed.pace}</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-[#1a1919] rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="font-headline font-bold text-lg">OCT 15 RUN</p>
            <span className="w-6 h-6 bg-primary rounded-full flex items-center justify-center">
              <span className="material-symbols-outlined text-black text-sm">check</span>
            </span>
          </div>
          <p className="text-xs text-[#adaaaa] mb-3">⏱ 28:34 DURATION</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-[#adaaaa] mb-1">DISTANCE</p>
              <p className="font-headline font-black text-2xl">5.2 <span className="text-sm font-normal font-body text-[#adaaaa]">KM</span></p>
            </div>
            <div>
              <p className="text-xs text-[#adaaaa] mb-1">AVG PACE</p>
              <p className="font-headline font-black text-2xl">5:30 <span className="text-sm font-normal font-body text-[#adaaaa]">M/K</span></p>
            </div>
          </div>
        </div>
      )}

      <BottomNav />
    </main>
  )
}
