'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import Avatar from '@/components/Avatar'

type Row = { userId: number; username: string; avatar: string | null; isMe: boolean; sessions: number; volume: number; distance: number }
type Metric = 'sessions' | 'volume' | 'distance'

const METRICS: { key: Metric; label: string }[] = [
  { key: 'sessions', label: 'Sessions' },
  { key: 'volume', label: 'Volume' },
  { key: 'distance', label: 'Distance' },
]

/** This week's standings among you + friends */
export default function Leaderboard({ isLbs }: { isLbs: boolean }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [metric, setMetric] = useState<Metric>('sessions')

  useEffect(() => {
    try {
      const saved = localStorage.getItem('ss_lb_metric')
      if (saved === 'sessions' || saved === 'volume' || saved === 'distance') setMetric(saved)
    } catch { /* storage blocked */ }
    fetch('/api/social/leaderboard').then(r => r.json()).then(d => setRows(d.rows ?? [])).catch(() => setRows([]))
  }, [])

  const pick = (m: Metric) => {
    setMetric(m)
    try { localStorage.setItem('ss_lb_metric', m) } catch { /* storage blocked */ }
  }

  // Only worth showing with at least one friend
  if (!rows || rows.length < 2) return null

  const sorted = [...rows].sort((a, b) => b[metric] - a[metric] || a.username.localeCompare(b.username))
  const max = Math.max(1, ...sorted.map(r => r[metric]))
  const fmt = (r: Row) => {
    if (metric === 'sessions') return String(r.sessions)
    if (metric === 'distance') return `${r.distance.toFixed(1)} km`
    const v = isLbs ? r.volume * 2.20462 : r.volume
    return v >= 1000 ? `${(v / 1000).toFixed(1)}${isLbs ? 'k lbs' : 't'}` : `${Math.round(v)} ${isLbs ? 'lbs' : 'kg'}`
  }
  const barColor = metric === 'distance' ? 'bg-tertiary' : 'bg-primary-container'

  return (
    <section className="bg-surface-container rounded-2xl p-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-headline text-sm font-bold text-outline uppercase tracking-widest">This week</h2>
        <div className="flex gap-1">
          {METRICS.map(m => (
            <button
              key={m.key}
              onClick={() => pick(m.key)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold font-label transition-colors ${
                metric === m.key ? 'bg-primary-container/20 text-primary-container' : 'text-outline hover:text-on-surface'
              }`}
            >{m.label}</button>
          ))}
        </div>
      </div>
      <ol className="space-y-2.5">
        {sorted.map((r, i) => (
          <li key={r.userId}>
            <Link href={`/social/${r.username}`} className="flex items-center gap-3">
              <span className={`w-4 text-xs font-black font-headline ${i === 0 && r[metric] > 0 ? 'text-primary-container' : 'text-outline-variant'}`}>{i + 1}</span>
              <Avatar username={r.username} avatar={r.avatar} size="xs" />
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline gap-2">
                  <span className={`text-sm truncate ${r.isMe ? 'font-bold text-on-surface' : 'text-on-surface-variant'}`}>{r.isMe ? 'You' : r.username}</span>
                  <span className="text-xs font-bold font-headline text-on-surface shrink-0">{fmt(r)}</span>
                </div>
                <div className="h-1 rounded-full bg-surface-container-highest mt-1 overflow-hidden">
                  <div className={`h-full rounded-full ${barColor}`} style={{ width: `${(r[metric] / max) * 100}%`, transition: 'width 0.5s ease-out' }} />
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  )
}
