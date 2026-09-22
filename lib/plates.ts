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
