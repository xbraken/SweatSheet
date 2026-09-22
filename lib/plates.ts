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
export const KG_BARS = [20, 15, 10]
export const LB_BARS = [45, 35, 15]

/** The user's bar choice, shared by the plate calculator and warm-up sheet */
export function loadBar(isLbs: boolean): number {
  const bars = isLbs ? LB_BARS : KG_BARS
  try {
    const saved = Number(localStorage.getItem(isLbs ? 'ss_bar_lb' : 'ss_bar_kg'))
    if (bars.includes(saved)) return saved
  } catch { /* storage blocked */ }
  return bars[0]
}

export function saveBar(isLbs: boolean, bar: number) {
  try { localStorage.setItem(isLbs ? 'ss_bar_lb' : 'ss_bar_kg', String(bar)) } catch { /* storage blocked */ }
}
