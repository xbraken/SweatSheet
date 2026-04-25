'use client'

import { useEffect, useMemo, useState } from 'react'

type CategoryStat = { category: string; sets: number; lastDate: string }
type Range = 'week' | 'month'

const REGIONS = ['Chest', 'Back', 'Shoulders', 'Legs', 'Arms', 'Core'] as const
type Region = typeof REGIONS[number]

function intensityColor(sets: number, max: number) {
  if (sets === 0 || max === 0) return '#2a2a2a'
  const t = Math.min(1, sets / max)
  const lerp = (a: number, b: number) => Math.round(a + (b - a) * t)
  const r = lerp(74, 255)
  const g = lerp(66, 144)
  const b = lerp(60, 102)
  return `rgb(${r}, ${g}, ${b})`
}

function relTime(dateStr: string) {
  if (!dateStr) return 'never'
  const days = Math.floor((Date.now() - new Date(dateStr + 'T00:00:00').getTime()) / 86400000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return `${Math.floor(days / 30)}mo ago`
}

export default function BodyHeatmap() {
  const [range, setRange] = useState<Range>('week')
  const [stats, setStats] = useState<CategoryStat[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const days = range === 'week' ? 7 : 30
    const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
    setLoading(true)
    fetch(`/api/progress/body?since=${since}`)
      .then(r => r.json())
      .then(d => setStats(d.categories ?? []))
      .finally(() => setLoading(false))
  }, [range])

  const statMap = useMemo(() => {
    const m = new Map<string, CategoryStat>()
    for (const s of stats) m.set(s.category, s)
    return m
  }, [stats])

  const maxSets = useMemo(() => Math.max(0, ...stats.map(s => s.sets)), [stats])

  const colorFor = (region: Region) => intensityColor(statMap.get(region)?.sets ?? 0, maxSets)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-1 self-end">
        {(['week', 'month'] as const).map(r => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`px-3 py-1 rounded-full text-[10px] font-bold font-label uppercase tracking-widest transition-colors ${
              range === r ? 'bg-primary-container/30 text-primary-container' : 'text-on-surface-variant/40'
            }`}
          >
            {r === 'week' ? '7D' : '1M'}
          </button>
        ))}
      </div>

      <div className="bg-surface-container rounded-xl p-6 flex justify-center">
        <svg viewBox="0 0 200 380" className="w-48 h-auto" xmlns="http://www.w3.org/2000/svg">
          {/* Head */}
          <circle cx="100" cy="30" r="20" fill="#353534" />
          {/* Neck */}
          <rect x="92" y="48" width="16" height="12" fill="#353534" />
          {/* Shoulders */}
          <path d="M 60 65 Q 70 58 100 60 Q 130 58 140 65 L 145 85 Q 122 78 100 80 Q 78 78 55 85 Z"
                fill={colorFor('Shoulders')} />
          {/* Chest */}
          <path d="M 65 85 Q 100 80 135 85 L 138 130 Q 100 138 62 130 Z"
                fill={colorFor('Chest')} />
          {/* Arms (combined upper + forearm) */}
          <path d="M 55 85 L 50 145 Q 48 175 45 200 L 38 200 Q 42 165 45 130 Q 48 105 55 85 Z"
                fill={colorFor('Arms')} />
          <path d="M 145 85 L 150 145 Q 152 175 155 200 L 162 200 Q 158 165 155 130 Q 152 105 145 85 Z"
                fill={colorFor('Arms')} />
          {/* Core */}
          <path d="M 68 132 Q 100 140 132 132 L 130 195 Q 100 202 70 195 Z"
                fill={colorFor('Core')} />
          {/* Hips/transition */}
          <path d="M 70 195 Q 100 202 130 195 L 132 215 Q 100 220 68 215 Z"
                fill="#353534" />
          {/* Legs */}
          <path d="M 70 215 Q 88 220 96 215 L 92 320 Q 88 350 80 360 L 70 360 Q 65 340 65 310 Z"
                fill={colorFor('Legs')} />
          <path d="M 130 215 Q 112 220 104 215 L 108 320 Q 112 350 120 360 L 130 360 Q 135 340 135 310 Z"
                fill={colorFor('Legs')} />

          {/* Back hint label */}
          <text x="100" y="375" textAnchor="middle" fill="#56423c" fontSize="8" fontFamily="system-ui">
            front view
          </text>
        </svg>
      </div>

      <div className="flex flex-col gap-2">
        {REGIONS.map(region => {
          const s = statMap.get(region)
          const sets = s?.sets ?? 0
          const last = s?.lastDate ?? ''
          const pct = maxSets > 0 ? (sets / maxSets) * 100 : 0
          return (
            <div key={region} className="bg-surface-container rounded-xl p-4 flex items-center gap-4">
              <div className="w-3 h-3 rounded-full shrink-0" style={{ background: colorFor(region) }} />
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline gap-2">
                  <span className="font-headline text-sm font-bold text-on-surface">{region}</span>
                  <span className="text-[11px] text-on-surface-variant">
                    {sets > 0 ? `${sets} set${sets === 1 ? '' : 's'}` : 'untrained'}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 bg-[#201f1f] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${pct}%`, background: colorFor(region) }}
                  />
                </div>
                <div className="text-[10px] text-[#56423c] mt-1">last: {relTime(last)}</div>
              </div>
            </div>
          )
        })}
      </div>

      {loading && stats.length === 0 && (
        <div className="text-center text-sm text-on-surface-variant py-4">Loading…</div>
      )}
      {!loading && stats.length === 0 && (
        <div className="text-center text-sm text-on-surface-variant py-4">
          No workouts logged in the past {range === 'week' ? '7 days' : '30 days'}.
        </div>
      )}
    </div>
  )
}
