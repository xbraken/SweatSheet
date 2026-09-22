'use client'
import { useMemo, useState } from 'react'
import { KG_BARS, KG_PLATES, LB_BARS, LB_PLATES, loadBar, platesPerSide, saveBar } from '@/lib/plates'

// Competition-ish colours so the picture reads at a glance
const PLATE_STYLE: Record<number, { bg: string; h: number }> = {
  25: { bg: '#dc2626', h: 88 }, 45: { bg: '#2563eb', h: 88 },
  20: { bg: '#2563eb', h: 88 }, 35: { bg: '#eab308', h: 80 },
  15: { bg: '#eab308', h: 76 },
  10: { bg: '#16a34a', h: 64 },
  5: { bg: '#e5e2e1', h: 50 },
  2.5: { bg: '#a48b83', h: 40 },
  1.25: { bg: '#56423c', h: 34 },
}

export default function PlateCalculator({ weightKg, isLbs, onClose }: { weightKg: number; isLbs: boolean; onClose: () => void }) {
  const bars = isLbs ? LB_BARS : KG_BARS
  const [bar, setBar] = useState(() => loadBar(isLbs))
  const total = isLbs ? Math.round(weightKg * 2.20462 * 10) / 10 : weightKg
  const unit = isLbs ? 'lbs' : 'kg'
  const { plates, remainder } = useMemo(() => platesPerSide(total, bar, isLbs ? LB_PLATES : KG_PLATES), [total, bar, isLbs])

  const pickBar = (b: number) => {
    setBar(b)
    saveBar(isLbs, b)
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-[70] backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 max-w-[390px] mx-auto z-[71] bg-surface-sheet rounded-t-3xl px-5 pt-5 pb-[calc(env(safe-area-inset-bottom,0px)+24px)] animate-slide-up">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-headline text-base font-bold">{total} {unit}</h3>
            <p className="text-[10px] font-bold font-label uppercase tracking-widest text-outline-variant mt-0.5">Plates per side</p>
          </div>
          <button onClick={onClose}><span className="material-symbols-outlined text-outline">close</span></button>
        </div>

        <div className="flex items-center gap-2 mb-5">
          <span className="text-xs text-outline">Bar</span>
          {bars.map(b => (
            <button
              key={b}
              onClick={() => pickBar(b)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold font-label transition-colors ${
                bar === b ? 'bg-primary-container/20 text-primary-container' : 'bg-surface-container text-outline'
              }`}
            >{b} {unit}</button>
          ))}
        </div>

        {/* Bar picture: sleeve on the left, plates stacked outward */}
        <div className="flex items-center h-24 mb-4 bg-surface-container rounded-2xl px-4 overflow-x-auto">
          <div className="w-10 h-3 bg-outline-variant rounded-l-sm shrink-0" />
          <div className="w-2 h-8 bg-outline rounded-sm shrink-0" />
          {plates.map((p, i) => (
            <div
              key={i}
              className="w-3.5 mx-[1px] rounded-sm shrink-0 flex items-center justify-center"
              style={{ height: PLATE_STYLE[p]?.h ?? 40, backgroundColor: PLATE_STYLE[p]?.bg ?? '#a48b83' }}
              title={`${p} ${unit}`}
            />
          ))}
          <div className="flex-1 min-w-4 h-3 bg-outline-variant rounded-r-sm" />
        </div>

        {total < bar ? (
          <p className="text-sm text-outline text-center">That&apos;s lighter than the bar.</p>
        ) : plates.length === 0 ? (
          <p className="text-sm text-outline text-center">Just the bar.</p>
        ) : (
          <div className="flex flex-wrap gap-2 justify-center">
            {Object.entries(plates.reduce<Record<string, number>>((acc, p) => { acc[p] = (acc[p] ?? 0) + 1; return acc }, {}))
              .sort((a, b) => Number(b[0]) - Number(a[0]))
              .map(([p, n]) => (
                <span key={p} className="px-3 py-1.5 rounded-lg bg-surface-container-high text-sm font-headline font-bold text-on-surface">
                  {n} × {p} {unit}
                </span>
              ))}
          </div>
        )}
        {remainder > 0 && total >= bar && (
          <p className="text-xs text-primary-container text-center mt-3">{remainder} {unit} can&apos;t be made with standard plates</p>
        )}
      </div>
    </>
  )
}
