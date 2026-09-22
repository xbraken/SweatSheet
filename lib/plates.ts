/** Greedy per-side plate breakdown. */
export function platesPerSide(total: number, bar: number, plates: number[]): { plates: number[]; remainder: number } {
  let perSide = Math.max(0, (total - bar) / 2)
  const out: number[] = []
  for (const p of plates) {
    while (perSide + 1e-9 >= p) {
      out.push(p)
      perSide -= p
    }
  }
  return { plates: out, remainder: Math.round(perSide * 2 * 100) / 100 }
}

export const KG_PLATES = [25, 20, 15, 10, 5, 2.5, 1.25]
export const LB_PLATES = [45, 35, 25, 10, 5, 2.5]
// 0 = no bar, for plate-loaded machines (e.g. a dip or leg press machine)
export const KG_BARS = [20, 15, 10, 0]
export const LB_BARS = [45, 35, 15, 0]

const barKey = (isLbs: boolean, exercise?: string) =>
  `${isLbs ? 'ss_bar_lb' : 'ss_bar_kg'}${exercise ? `:${exercise}` : ''}`

/**
 * The bar for an exercise: remembered per exercise (so a 0 kg machine doesn't change Bench Press),
 * falling back to the last bar picked anywhere, then a standard barbell.
 */
export function loadBar(isLbs: boolean, exercise?: string): number {
  const bars = isLbs ? LB_BARS : KG_BARS
  try {
    for (const key of exercise ? [barKey(isLbs, exercise), barKey(isLbs)] : [barKey(isLbs)]) {
      const raw = localStorage.getItem(key)
      // Explicit null check — Number(null) is 0, which is now a valid bar
      if (raw !== null && bars.includes(Number(raw))) return Number(raw)
    }
  } catch { /* storage blocked */ }
  return bars[0]
}

export function saveBar(isLbs: boolean, bar: number, exercise?: string) {
  try {
    localStorage.setItem(barKey(isLbs), String(bar))
    if (exercise) localStorage.setItem(barKey(isLbs, exercise), String(bar))
  } catch { /* storage blocked */ }
}
