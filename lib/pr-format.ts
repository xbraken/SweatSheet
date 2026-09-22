// Client-safe: used by the feed card, recap page and recap image

/** Human-readable PR value — shared by the feed, recap page and recap image */
export function fmtPrValue(p: { kind: string; value: number; reps: number | null }, isLbs: boolean): string {
  if (p.kind === 'distance') return `${p.value.toFixed(1)} km`
  if (p.kind === 'segment' || p.kind === 'duration') {
    const h = Math.floor(p.value / 3600), m = Math.floor((p.value % 3600) / 60), s = Math.round(p.value % 60)
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
  }
  const w = isLbs ? `${Math.round(p.value * 2.20462)} lbs` : `${p.value} kg`
  return p.reps ? `${w} × ${p.reps}` : w
}
