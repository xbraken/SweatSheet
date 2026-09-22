'use client'
import type { ProgressionSet, Suggestion } from '@/lib/progression'

/** "Last time … → Try …" card above the first set of an exercise */
export default function NextSuggestion({ lastDate, lastSets, suggestion, fmtWeight, fmtDur, onUse, applied }: {
  lastDate: string
  lastSets: ProgressionSet[]
  suggestion: Suggestion
  fmtWeight: (kg: number) => string
  fmtDur: (secs: number) => string
  onUse: () => void
  applied: boolean
}) {
  const work = lastSets.filter(s => !s.is_warmup)
  const setLabel = (s: ProgressionSet) =>
    s.duration_secs ? fmtDur(s.duration_secs) : s.weight > 0 ? `${fmtWeight(s.weight)}×${s.reps}` : `${s.reps}`
  const target = suggestion.kind === 'longer'
    ? fmtDur(suggestion.duration_secs)
    : suggestion.weight > 0 ? `${fmtWeight(suggestion.weight)} × ${suggestion.reps}` : `${suggestion.reps} reps`
  const icon = suggestion.kind === 'increase' ? 'trending_up' : suggestion.kind === 'repeat' ? 'replay' : 'add'

  return (
    <div className="bg-surface-container rounded-2xl p-3.5 flex items-center gap-3 animate-fade-in">
      <div className="w-9 h-9 rounded-xl bg-tertiary/10 flex items-center justify-center shrink-0">
        <span className="material-symbols-outlined text-tertiary text-lg">{icon}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-bold font-label uppercase tracking-widest text-outline-variant truncate">
          {lastDate} · {work.map(setLabel).join(', ')}
        </p>
        <p className="text-sm text-on-surface mt-0.5">
          Try <span className="font-headline font-bold text-tertiary">{target}</span>
        </p>
        <p className="text-[11px] text-outline truncate">{suggestion.reason}</p>
      </div>
      <button
        onClick={onUse}
        disabled={applied}
        className="shrink-0 px-3 py-2 rounded-lg bg-tertiary/15 text-tertiary text-xs font-bold font-label disabled:opacity-40 active:scale-95 transition-transform"
      >{applied ? 'Set' : 'Use'}</button>
    </div>
  )
}
