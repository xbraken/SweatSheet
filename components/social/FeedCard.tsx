'use client'
import Link from 'next/link'
import { useState } from 'react'
import Avatar from '@/components/Avatar'
import { toast } from '@/components/Toast'
import { fmtPrValue } from '@/lib/pr-format'
import { cardioSummary } from '@/lib/cardio-trends'
import { cardioIcon } from '@/lib/cardio-activity'
import { exerciseSummary, setsDetail, type FeedSet } from '@/lib/feed-format'

export const REACTIONS = ['🔥', '💪', '👏'] as const

export interface FeedItem {
  userId: number
  username: string
  avatar?: string | null
  isMine: boolean
  sessionId: number
  date: string
  createdAt: string
  notes: string | null
  lift: { volume: number; sets: number; exercises: Array<{ name: string; volume: number; sets: number; setList: FeedSet[] }> } | null
  cardio: Array<{ activity: string; distance: number | null; duration: string | null; pace: string | null; avg_watts?: number | null }> | null
  prs: Array<{ exercise: string; kind: string; value: number; reps: number | null }>
  reactions: { counts: Record<string, number>; mine: string[]; names: string[] }
}

export function timeAgo(utcStr: string): string {
  const normalized = utcStr.includes('T') || utcStr.includes('Z') ? utcStr : utcStr.replace(' ', 'T') + 'Z'
  const diff = Date.now() - new Date(normalized).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  if (hrs < 48) return 'Yesterday'
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(normalized).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export default function FeedCard({ item, isLbs }: { item: FeedItem; isLbs: boolean }) {
  const [reactions, setReactions] = useState(item.reactions)
  const [pending, setPending] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const vol = (kg: number) => {
    const v = isLbs ? kg * 2.20462 : kg
    return v >= 1000 ? `${(v / 1000).toFixed(1)}${isLbs ? 'k lbs' : 't'}` : `${Math.round(v)} ${isLbs ? 'lbs' : 'kg'}`
  }

  const wFmt = { num: (kg: number) => isLbs ? Math.round(kg * 2.20462) : Math.round(kg * 10) / 10, unit: isLbs ? 'lbs' : 'kg' }

  const react = async (emoji: string) => {
    if (pending) return
    // Optimistic toggle
    const had = reactions.mine.includes(emoji)
    const prev = reactions
    setReactions({
      ...reactions,
      counts: { ...reactions.counts, [emoji]: Math.max(0, (reactions.counts[emoji] ?? 0) + (had ? -1 : 1)) },
      mine: had ? reactions.mine.filter(e => e !== emoji) : [...reactions.mine, emoji],
    })
    setPending(true)
    try {
      const res = await fetch('/api/social/react', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: item.sessionId, emoji }),
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setReactions(data.reactions)
    } catch {
      setReactions(prev)
      toast('Could not react — check your connection', { tone: 'error' })
    } finally {
      setPending(false)
    }
  }

  const totalReactions = Object.values(reactions.counts).reduce((a, b) => a + b, 0)
  const exercises = item.lift?.exercises ?? []

  return (
    <article className="bg-surface-container rounded-2xl p-4 animate-fade-in">
      <Link href={`/social/${item.username}`} className="flex items-center gap-3 mb-3">
        <Avatar username={item.username} avatar={item.avatar} size="sm" />
        <div className="flex-1 min-w-0">
          <p className="font-headline font-bold text-on-surface text-sm truncate">{item.isMine ? 'You' : item.username}</p>
          <p className="text-[11px] text-outline">{timeAgo(item.createdAt)}</p>
        </div>
      </Link>

      {/* PRs first — they're the headline */}
      {item.prs.length > 0 && (
        <div className="flex flex-col gap-1.5 mb-3">
          {item.prs.map((p, i) => (
            <div key={i} className="flex items-center gap-2 bg-primary-container/10 border border-primary-container/20 rounded-xl px-3 py-2">
              <span className="material-symbols-outlined text-primary-container text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>emoji_events</span>
              <p className="text-sm text-on-surface">
                <span className="font-bold">New PR</span> · {p.exercise}{' '}
                <span className={`font-headline font-bold ${p.kind === 'distance' || p.kind === 'segment' ? 'text-tertiary' : 'text-primary-container'}`}>
                  {fmtPrValue(p, isLbs)}
                </span>
              </p>
            </div>
          ))}
        </div>
      )}

      {item.cardio?.map((c, i) => (
        <div key={`c${i}`} className="flex items-center gap-3 py-1.5">
          <span className="material-symbols-outlined text-tertiary text-xl">{cardioIcon(c.activity)}</span>
          <p className="font-headline font-bold text-on-surface flex-1 truncate">{c.activity}</p>
          <p className="text-sm text-outline shrink-0">{cardioSummary(c)}</p>
        </div>
      ))}

      {exercises.length > 0 && (
        <div className="py-1.5">
          <div className="flex items-center gap-3 mb-1.5">
            <span className="material-symbols-outlined text-primary-container text-xl">fitness_center</span>
            <p className="font-headline font-bold text-on-surface flex-1">{exercises.length} exercise{exercises.length === 1 ? '' : 's'}</p>
            <p className="text-sm text-outline shrink-0">{item.lift!.sets} sets{item.lift!.volume > 0 ? ` · ${vol(item.lift!.volume)}` : ''}</p>
          </div>
          {/* Top set per exercise; tap to see every set */}
          <button
            onClick={() => setExpanded(x => !x)}
            aria-expanded={expanded}
            className="w-full text-left"
          >
            <ul className={`ml-8 ${expanded ? 'space-y-2' : 'space-y-0.5'}`}>
              {(expanded ? exercises : exercises.slice(0, 4)).map(e => (
                <li key={e.name} className="text-xs text-on-surface-variant">
                  <div className="flex justify-between gap-2">
                    <span className="truncate">{e.name}</span>
                    <span className="text-outline shrink-0">{exerciseSummary(e.setList, wFmt)}</span>
                  </div>
                  {expanded && <p className="text-[11px] text-outline mt-0.5">{setsDetail(e.setList, wFmt)}</p>}
                </li>
              ))}
              <li className="text-[11px] text-outline flex items-center gap-0.5">
                {!expanded && exercises.length > 4 ? `+${exercises.length - 4} more · ` : ''}
                {expanded ? 'Hide sets' : 'Show sets'}
                <span className="material-symbols-outlined text-sm">{expanded ? 'expand_less' : 'expand_more'}</span>
              </li>
            </ul>
          </button>
        </div>
      )}

      {item.notes && <p className="text-xs text-outline italic mt-2 line-clamp-3 whitespace-pre-wrap">&ldquo;{item.notes}&rdquo;</p>}

      <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-surface-container-highest/60">
        {REACTIONS.map(emoji => {
          const mine = reactions.mine.includes(emoji)
          const n = reactions.counts[emoji] ?? 0
          return (
            <button
              key={emoji}
              onClick={() => react(emoji)}
              aria-pressed={mine}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-sm transition-all active:scale-90 ${
                mine ? 'bg-primary-container/20 ring-1 ring-primary-container/50' : 'bg-surface-container-high'
              }`}
            >
              <span>{emoji}</span>
              {n > 0 && <span className={`text-xs font-bold ${mine ? 'text-primary-container' : 'text-outline'}`}>{n}</span>}
            </button>
          )
        })}
        {totalReactions > 0 && (
          <p className="text-[11px] text-outline ml-auto truncate max-w-[45%]" title={reactions.names.join(', ')}>
            {reactions.names.slice(0, 2).join(', ')}{reactions.names.length > 2 ? ` +${reactions.names.length - 2}` : ''}
          </p>
        )}
      </div>
    </article>
  )
}
