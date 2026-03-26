'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import BottomNav from '@/components/BottomNav'

type ParsedWorkout = {
  date: string; type: string; duration?: string
  distance?: string; pace?: string; calories?: string; heartRate?: string
}

export default function UploadPage() {
  const router = useRouter()
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [parsed, setParsed] = useState<ParsedWorkout | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) { setError('Please upload an image file'); return }
    setLoading(true); setError(null); setSaved(false)
    try {
      const formData = new FormData()
      formData.append('image', file)
      const res = await fetch('/api/parse-workout', { method: 'POST', body: formData })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setParsed(data)

      // Auto-save immediately after parsing
      setSaving(true)
      const activity = /cycl/i.test(data.type) ? 'Cycling' : 'Outdoor run'
      const distanceStr = data.distance ? data.distance.replace(/[^\d.]/g, '') : ''
      const block = { id: Date.now(), type: 'cardio', activity, distance: distanceStr, time: data.duration || '' }
      const saveRes = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocks: [block] }),
      })
      if (!saveRes.ok) {
        const saveData = await saveRes.json().catch(() => ({}))
        throw new Error(saveData.error || 'Failed to save')
      }
      setSaved(true)
      setTimeout(() => router.push('/'), 1500)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to parse or save workout')
    } finally {
      setLoading(false)
      setSaving(false)
    }
  }

  return (
    <main className="max-w-[390px] mx-auto min-h-screen pb-32">
      {/* Header */}
      <header className="flex justify-between items-center px-6 py-4">
        <h1 className="text-2xl font-black text-primary tracking-tighter font-headline">SweatSheet</h1>
        <span className="material-symbols-outlined text-primary text-2xl">account_circle</span>
      </header>

      <div className="px-6 pt-4 space-y-10">
        {/* Title */}
        <section className="space-y-2">
          <h2 className="font-headline text-3xl font-bold tracking-tight text-on-surface">Upload</h2>
          <p className="font-body text-base font-medium text-on-surface-variant leading-relaxed">
            Upload an Apple Fitness or Strava screenshot — we&apos;ll extract your workout automatically
          </p>
        </section>

        {/* Drop zone */}
        <section>
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-br from-primary/20 to-transparent rounded-xl blur opacity-30 group-hover:opacity-60 transition duration-500" />
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
              onClick={() => inputRef.current?.click()}
              className={`relative flex flex-col items-center justify-center w-full aspect-square bg-surface-container rounded-xl cursor-pointer transition-colors duration-300 overflow-hidden border ${dragging ? 'border-primary-container bg-surface-container-high' : 'border-outline-variant/10 hover:bg-surface-container-high'}`}
            >
              <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
              {loading ? (
                <div className="flex flex-col items-center space-y-4">
                  <div className="w-10 h-10 border-2 border-primary-container border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm text-on-surface-variant">Parsing workout...</p>
                </div>
              ) : (
                <div className="flex flex-col items-center text-center p-8 space-y-4">
                  <div className="w-16 h-16 rounded-full bg-primary-container/10 flex items-center justify-center mb-2">
                    <span className="material-symbols-outlined text-primary text-4xl">cloud_upload</span>
                  </div>
                  <div className="space-y-1">
                    <span className="font-headline text-xl font-bold text-on-surface">Drop screenshot</span>
                    <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant/60">or tap to browse files</p>
                  </div>
                </div>
              )}
              <div className="absolute bottom-4 left-4 right-4 flex justify-between opacity-20">
                <div className="h-px w-8 bg-primary" /><div className="h-px w-8 bg-primary" />
              </div>
              <div className="absolute top-4 left-4 right-4 flex justify-between opacity-20">
                <div className="h-px w-8 bg-primary" /><div className="h-px w-8 bg-primary" />
              </div>
            </div>
          </div>
          {error && <p className="text-red-400 text-sm mt-3">{error}</p>}
        </section>

        {/* Recently parsed */}
        <section className="space-y-6">
          <div className="flex justify-between items-end">
            <h3 className="font-headline text-lg font-bold tracking-tight text-on-surface">Recently parsed</h3>
            <span className="font-label text-[10px] uppercase tracking-widest text-tertiary">{parsed ? 'Success' : ''}</span>
          </div>

          <div className="bg-surface-container rounded-xl overflow-hidden p-1 space-y-1">
            {parsed ? (
              <div className="bg-surface-container-high rounded-lg p-5 space-y-6 animate-fade-in">
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant">{parsed.type}</p>
                    <h4 className="font-headline text-xl font-bold text-on-surface">{parsed.date}</h4>
                  </div>
                  <span className="material-symbols-outlined text-on-surface-variant/40">more_vert</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {parsed.distance && <div className="space-y-1">
                    <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant">Distance</p>
                    <p className="font-headline text-3xl font-black text-primary-container">{parsed.distance}</p>
                  </div>}
                  {parsed.pace && <div className="space-y-1 text-right">
                    <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant">Pace</p>
                    <p className="font-headline text-3xl font-black text-on-surface">{parsed.pace}</p>
                  </div>}
                  {parsed.duration && <div className="space-y-1">
                    <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant">Duration</p>
                    <p className="font-headline text-3xl font-black text-on-surface">{parsed.duration}</p>
                  </div>}
                  {parsed.calories && <div className="space-y-1 text-right">
                    <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant">Calories</p>
                    <p className="font-headline text-3xl font-black text-on-surface">{parsed.calories}</p>
                  </div>}
                </div>
                <div className="w-full py-4 rounded-lg flex justify-center items-center gap-2">
                  <span className="font-label text-xs font-bold uppercase tracking-widest text-primary-container">
                    {saved ? 'Saved!' : saving ? 'Saving...' : ''}
                  </span>
                  {saved && <span className="material-symbols-outlined text-sm text-primary-container">check</span>}
                </div>
              </div>
            ) : (
              <div className="bg-surface-container-high rounded-lg p-5 space-y-6">
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant">Morning run</p>
                    <h4 className="font-headline text-xl font-bold text-on-surface">October 24, 2023</h4>
                  </div>
                  <span className="material-symbols-outlined text-on-surface-variant/40">more_vert</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant">Distance</p>
                    <div className="flex items-baseline gap-1">
                      <span className="font-headline text-3xl font-black text-primary-container">8.42</span>
                      <span className="font-body text-xs text-on-surface-variant">km</span>
                    </div>
                  </div>
                  <div className="space-y-1 text-right">
                    <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant">Pace</p>
                    <div className="flex items-baseline justify-end gap-1">
                      <span className="font-headline text-3xl font-black text-on-surface">5:12</span>
                      <span className="font-body text-xs text-on-surface-variant">/km</span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant">Duration</p>
                    <span className="font-headline text-3xl font-black text-on-surface">43:21</span>
                  </div>
                  <div className="space-y-1 text-right">
                    <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant">Elev gain</p>
                    <div className="flex items-baseline justify-end gap-1">
                      <span className="font-headline text-3xl font-black text-on-surface">112</span>
                      <span className="font-body text-xs text-on-surface-variant">m</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-surface-container-low rounded-xl p-5 flex justify-between items-center opacity-60">
              <div className="flex flex-col">
                <span className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant">Leg day</span>
                <span className="font-headline text-sm font-bold">October 22, 2023</span>
              </div>
              <div className="text-right">
                <span className="font-headline text-lg font-bold">12,450 kg</span>
                <p className="font-body text-[10px] text-on-surface-variant">Total volume</p>
              </div>
            </div>
          </div>
        </section>
      </div>

      <BottomNav />
    </main>
  )
}
