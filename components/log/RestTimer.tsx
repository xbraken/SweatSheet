'use client'

export const REST_OPTIONS = [
  { label: 'Off', value: 0 },
  { label: '30s', value: 30 },
  { label: '1m', value: 60 },
  { label: '90s', value: 90 },
  { label: '2m', value: 120 },
  { label: '3m', value: 180 },
]

/** Countdown shown in place of the set controls while resting. Tap to skip. */
export function RestButton({ seconds, total, onSkip }: { seconds: number; total: number; onSkip: () => void }) {
  const elapsed = total > 0 ? ((total - seconds) / total) * 100 : 100
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return (
    <button
      onClick={onSkip}
      className="relative w-full py-3.5 rounded-xl font-headline font-bold text-sm overflow-hidden flex items-center justify-center gap-2 text-outline border border-surface-container-highest animate-fade-in"
    >
      <span
        className="absolute inset-0 bg-primary-container/20"
        style={{ transform: `scaleX(${elapsed / 100})`, transformOrigin: 'left', transition: 'transform 0.5s linear' }}
      />
      <span className="material-symbols-outlined text-base text-primary-container relative">timer</span>
      <span className="relative">Resting {m}:{String(s).padStart(2, '0')} — tap to skip</span>
    </button>
  )
}

/** Rest length picker (+ optional kg/lbs toggle) shown under every exercise header */
export function RestSettingsBar({ value, onChange, unitLabel, onToggleUnit }: {
  value: number
  onChange: (v: number) => void
  unitLabel?: string
  onToggleUnit?: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-outline text-base">timer</span>
        <div className="flex gap-1">
          {REST_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => onChange(opt.value)}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold font-label transition-colors ${
                value === opt.value ? 'bg-primary-container/20 text-primary-container' : 'text-outline/60 hover:text-outline'
              }`}
            >{opt.label}</button>
          ))}
        </div>
      </div>
      {onToggleUnit && (
        <button onClick={onToggleUnit} className="px-3 py-1 rounded-lg bg-surface-container text-[10px] font-bold font-label text-outline">
          {unitLabel}
        </button>
      )}
    </div>
  )
}

// A short two-tone chime when rest ends. The AudioContext has to be created during a
// user gesture on iOS, so call unlockChime() from the "Log set" tap.
let audioCtx: AudioContext | null = null

export function unlockChime() {
  try {
    if (!audioCtx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctx) return
      audioCtx = new Ctx()
    }
    if (audioCtx.state === 'suspended') audioCtx.resume()
  } catch { /* audio unavailable */ }
}

export function playChime() {
  const ctx = audioCtx
  if (!ctx || ctx.state !== 'running') return
  const now = ctx.currentTime
  ;[880, 1320].forEach((freq, i) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    const t = now + i * 0.18
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35)
    osc.connect(gain).connect(ctx.destination)
    osc.start(t)
    osc.stop(t + 0.4)
  })
}
