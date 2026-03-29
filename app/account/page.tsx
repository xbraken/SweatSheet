'use client'
import { useState, useEffect, useMemo, useRef } from 'react'
import Link from 'next/link'
import BottomNav from '@/components/BottomNav'
import Avatar from '@/components/Avatar'

interface CardioRow { activity: string; distance: number | null; duration: string | null; pace: string | null; heart_rate: number | null }
interface SetRow { weight: number; reps: number }
interface ExerciseStat { name: string; volume: number; rows: SetRow[] }
interface SessionItem {
  sessionId: number
  date: string
  createdAt: string
  lift: { volume: number; sets: number; exercises: ExerciseStat[] } | null
  cardio: CardioRow[] | null
}
interface DayGroup {
  date: string
  sessionIds: number[]
  cardio: CardioRow[] | null
  lift: { volume: number; sets: number; exercises: ExerciseStat[] } | null
}

type Filter = 'all' | 'week' | 'month' | 'year'

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

function dayTitle(g: DayGroup): string {
  const parts: string[] = []
  if (g.cardio) parts.push(g.cardio[0]?.activity ?? 'Cardio')
  if (g.lift) {
    const ex = g.lift.exercises
    parts.push(ex.length > 0 ? ex.slice(0, 2).map(e => e.name).join(' · ') : 'Lift')
  }
  return parts.join(' + ') || 'Workout'
}

function dayKeyStat(g: DayGroup): { value: string; className: string } {
  if (g.lift) {
    const v = g.lift.volume
    return { value: v >= 1000 ? `${(v / 1000).toFixed(1)}k kg` : `${v} kg`, className: 'text-[#4bdece]' }
  }
  if (g.cardio) {
    const c = g.cardio[0]
    if (c?.distance && Number(c.distance) > 0) return { value: `${Number(c.distance).toFixed(1)} km`, className: 'text-[#ff9066]' }
    if (c?.duration) return { value: c.duration, className: 'text-[#ff9066]' }
  }
  return { value: '—', className: 'text-[#a48b83]' }
}

function buildShareText(username: string, g: DayGroup): string {
  const lines: string[] = [`💪 ${username}'s workout — ${formatDate(g.date)}`, '']
  if (g.cardio) {
    for (const c of g.cardio) {
      lines.push(`🏃 ${c.activity}`)
      const parts: string[] = []
      if (c.distance && Number(c.distance) > 0) parts.push(`${Number(c.distance).toFixed(1)} km`)
      if (c.duration) parts.push(c.duration)
      if (c.pace) parts.push(`${c.pace}/km`)
      if (c.heart_rate) parts.push(`${c.heart_rate} bpm avg`)
      if (parts.length) lines.push(`  ${parts.join(' · ')}`)
      lines.push('')
    }
  }
  if (g.lift) {
    for (const e of g.lift.exercises) {
      lines.push(`🏋️ ${e.name}`)
      lines.push(`  ${e.rows.map(r => `${r.weight}kg × ${r.reps}`).join(', ')}`)
      lines.push('')
    }
  }
  lines.push('Logged on SweatSheet')
  return lines.join('\n')
}

const FILTERS: { label: string; value: Filter }[] = [
  { label: 'Week', value: 'week' },
  { label: 'Month', value: 'month' },
  { label: 'Year', value: 'year' },
  { label: 'All', value: 'all' },
]

async function resizeAvatar(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const SIZE = 160
      const canvas = document.createElement('canvas')
      canvas.width = SIZE
      canvas.height = SIZE
      const ctx = canvas.getContext('2d')!
      const scale = Math.max(SIZE / img.width, SIZE / img.height)
      const sw = SIZE / scale
      const sh = SIZE / scale
      ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, 0, 0, SIZE, SIZE)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.85))
    }
    img.onerror = reject
    img.src = url
  })
}

export default function ProfilePage() {
  const [username, setUsername] = useState('')
  const [avatar, setAvatar] = useState<string | null>(null)
  const [totalWorkouts, setTotalWorkouts] = useState(0)
  const [sessions, setSessions] = useState<SessionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const [expandedDate, setExpandedDate] = useState<string | null>(null)
  const [expandedSets, setExpandedSets] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState<Filter>('all')
  const [copiedDate, setCopiedDate] = useState<string | null>(null)
  const [deletingSession, setDeletingSession] = useState<number | null>(null)

  async function deleteSession(sessionId: number, date: string) {
    setDeletingSession(sessionId)
    try {
      const res = await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' })
      if (res.ok) {
        setSessions(prev => prev.filter(s => s.sessionId !== sessionId))
        if (expandedDate === date) setExpandedDate(null)
      }
    } finally {
      setDeletingSession(null)
    }
  }

  async function handleAvatarFile(file: File) {
    setAvatarUploading(true)
    try {
      const dataUrl = await resizeAvatar(file)
      setAvatar(dataUrl)
      await fetch('/api/account', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ avatar: dataUrl }) })
    } finally {
      setAvatarUploading(false)
    }
  }

  useEffect(() => {
    fetch('/api/account').then(r => r.json()).then(account => {
      const name = account.username ?? ''
      setUsername(name)
      setAvatar(account.avatar ?? null)
      if (!name) { setLoading(false); return }
      fetch(`/api/social/profile/${encodeURIComponent(name)}`)
        .then(r => r.json())
        .then(d => {
          setSessions(d.sessions ?? [])
          setTotalWorkouts(d.totalWorkouts ?? 0)
          if (d.sessions?.length > 0) setExpandedDate(d.sessions[0].date)
        })
        .finally(() => setLoading(false))
    }).catch(() => setLoading(false))
  }, [])

  const allDayGroups = useMemo<DayGroup[]>(() => {
    const map = new Map<string, SessionItem[]>()
    for (const s of sessions) {
      if (!map.has(s.date)) map.set(s.date, [])
      map.get(s.date)!.push(s)
    }
    return Array.from(map.entries()).map(([date, sess]) => {
      const allCardio = sess.flatMap(s => s.cardio ?? [])
      let volume = 0, sets = 0
      const exMap = new Map<string, { volume: number; rows: SetRow[] }>()
      const hasLift = sess.some(s => s.lift !== null)
      for (const s of sess) {
        if (s.lift) {
          volume += s.lift.volume; sets += s.lift.sets
          for (const e of s.lift.exercises) {
            const cur = exMap.get(e.name) ?? { volume: 0, rows: [] }
            exMap.set(e.name, { volume: cur.volume + e.volume, rows: [...cur.rows, ...e.rows] })
          }
        }
      }
      return {
        date,
        sessionIds: sess.map(s => s.sessionId),
        cardio: allCardio.length > 0 ? allCardio : null,
        lift: hasLift ? { volume, sets, exercises: Array.from(exMap.entries()).map(([name, st]) => ({ name, volume: st.volume, rows: st.rows })) } : null,
      }
    })
  }, [sessions])

  const dayGroups = useMemo(() => {
    if (filter === 'all') return allDayGroups
    const now = new Date()
    const cutoff = new Date(now)
    if (filter === 'week') cutoff.setDate(now.getDate() - 7)
    else if (filter === 'month') cutoff.setMonth(now.getMonth() - 1)
    else if (filter === 'year') cutoff.setFullYear(now.getFullYear() - 1)
    return allDayGroups.filter(g => new Date(g.date + 'T12:00:00') >= cutoff)
  }, [allDayGroups, filter])

  async function shareDay(g: DayGroup) {
    const url = `${window.location.origin}/w/${encodeURIComponent(username)}/${g.date}`
    if (navigator.share) {
      await navigator.share({ title: dayTitle(g), url })
    } else {
      await navigator.clipboard.writeText(url)
      setCopiedDate(g.date)
      setTimeout(() => setCopiedDate(null), 2000)
    }
  }

  return (
    <>
      <header className="bg-[#0e0e0e]/80 backdrop-blur-xl sticky top-0 z-50 flex items-center justify-between px-6 py-4 w-full max-w-[390px] mx-auto">
        <h1 className="font-headline text-xl font-bold tracking-tight text-[#ffb9a0]">Profile</h1>
        <Link href="/settings" className="text-[#a48b83] hover:text-[#e5e2e1] active:scale-95 transition-all">
          <span className="material-symbols-outlined">settings</span>
        </Link>
      </header>

      <main className="max-w-[390px] mx-auto px-4 pb-32">
        {loading ? (
          <div className="flex justify-center pt-20">
            <div className="w-6 h-6 border-2 border-[#ff9066]/30 border-t-[#ff9066] rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Profile header */}
            <section className="flex flex-col items-center pt-8 pb-6 animate-fade-in">
              <div className="relative mb-3">
                <Avatar username={username} avatar={avatar} size="lg" />
                <button
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={avatarUploading}
                  className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-[#ff9066] flex items-center justify-center shadow-lg active:scale-95 transition-transform"
                >
                  {avatarUploading
                    ? <span className="w-3.5 h-3.5 border border-white/40 border-t-white rounded-full animate-spin" />
                    : <span className="material-symbols-outlined text-[#752805] text-sm">photo_camera</span>}
                </button>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleAvatarFile(f); e.target.value = '' }}
                />
              </div>
              <h2 className="font-headline text-2xl font-extrabold text-[#e5e2e1] mb-1">{username}</h2>
              <p className="text-[#a48b83] text-sm">{totalWorkouts} workouts</p>
            </section>

            {/* Date filter */}
            <div className="flex gap-2 mb-4">
              {FILTERS.map(f => (
                <button
                  key={f.value}
                  onClick={() => setFilter(f.value)}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold font-label transition-colors ${
                    filter === f.value ? 'bg-[#ff9066] text-[#752805]' : 'bg-[#201f1f] text-[#a48b83]'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Workout history */}
            {dayGroups.length === 0 ? (
              <p className="text-center text-[#a48b83] text-sm py-10">No workouts in this period</p>
            ) : (
              <div className="space-y-3">
                {dayGroups.map((g, i) => {
                  const keyStat = dayKeyStat(g)
                  const expanded = expandedDate === g.date
                  const badges: { label: string; className: string }[] = []
                  if (g.cardio) badges.push({ label: 'Cardio', className: 'bg-[#4bdece]/20 text-[#4bdece]' })
                  if (g.lift) badges.push({ label: 'Lift', className: 'bg-[#ff9066]/20 text-[#ff9066]' })

                  const isEmpty = !g.cardio && !g.lift

                  return (
                    <div key={g.date} className="rounded-2xl border overflow-hidden bg-[#131313] border-[#201f1f] animate-fade-in" style={{ animationDelay: `${Math.min(i, 7) * 40}ms` }}>
                      <div className="w-full p-4 flex items-center gap-3">
                        <button
                          className="flex flex-col flex-1 min-w-0 text-left"
                          onClick={() => !isEmpty && setExpandedDate(expanded ? null : g.date)}
                        >
                          <span className="text-[#a48b83] text-[10px] font-bold uppercase tracking-widest font-label">{formatDate(g.date)}</span>
                          <span className="text-[#e5e2e1] font-headline font-bold text-sm mt-0.5 leading-tight truncate">{isEmpty ? 'Empty session' : dayTitle(g)}</span>
                        </button>
                        <div className="flex gap-1 shrink-0 items-center">
                          {badges.map((b, j) => (
                            <span key={j} className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest ${b.className}`}>{b.label}</span>
                          ))}
                          {isEmpty && g.sessionIds.map(sid => (
                            <button
                              key={sid}
                              onClick={() => deleteSession(sid, g.date)}
                              disabled={deletingSession === sid}
                              className="p-1.5 rounded-lg text-[#a48b83] hover:text-red-400 hover:bg-red-400/10 active:scale-95 transition-all"
                              title="Delete empty session"
                            >
                              {deletingSession === sid
                                ? <span className="w-4 h-4 border border-[#a48b83]/40 border-t-[#a48b83] rounded-full animate-spin inline-block" />
                                : <span className="material-symbols-outlined text-base">delete</span>}
                            </button>
                          ))}
                        </div>
                        {!isEmpty && <span className={`font-headline font-bold text-base shrink-0 ${keyStat.className}`}>{keyStat.value}</span>}
                      </div>

                      {expanded && (
                        <div className="border-t border-[#201f1f] bg-[#1c1b1b]/50 px-4 py-4 space-y-4 animate-fade-in">

                          {/* Share button */}
                          <div className="flex justify-end">
                            <button
                              onClick={() => shareDay(g)}
                              className="flex items-center gap-1.5 text-[#a48b83] hover:text-[#e5e2e1] active:scale-95 transition-all text-xs font-bold font-label"
                            >
                              <span className="material-symbols-outlined text-base">{copiedDate === g.date ? 'check' : 'share'}</span>
                              {copiedDate === g.date ? 'Copied!' : 'Share'}
                            </button>
                          </div>

                          {g.cardio && g.cardio.map((c, j) => (
                            <div key={j}>
                              {g.cardio!.length > 1 && (
                                <p className="text-[#a48b83] text-[10px] font-bold uppercase tracking-widest font-label mb-2">{c.activity}</p>
                              )}
                              <div className="grid grid-cols-3 gap-3">
                                {c.distance && Number(c.distance) > 0 && (
                                  <div>
                                    <p className="text-[#a48b83] text-[10px] font-bold uppercase tracking-widest font-label mb-1">Dist</p>
                                    <p className="font-headline font-bold text-lg text-[#e5e2e1]">{Number(c.distance).toFixed(1)} km</p>
                                  </div>
                                )}
                                {c.pace && (
                                  <div>
                                    <p className="text-[#a48b83] text-[10px] font-bold uppercase tracking-widest font-label mb-1">Pace</p>
                                    <p className="font-headline font-bold text-lg text-[#e5e2e1]">{c.pace}/km</p>
                                  </div>
                                )}
                                {c.duration && (
                                  <div>
                                    <p className="text-[#a48b83] text-[10px] font-bold uppercase tracking-widest font-label mb-1">Time</p>
                                    <p className="font-headline font-bold text-lg text-[#e5e2e1]">{c.duration}</p>
                                  </div>
                                )}
                                {c.heart_rate && (
                                  <div>
                                    <p className="text-[#a48b83] text-[10px] font-bold uppercase tracking-widest font-label mb-1">HR Avg</p>
                                    <p className="font-headline font-bold text-lg text-[#e5e2e1]">{c.heart_rate} bpm</p>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}

                          {g.cardio && g.lift && <div className="border-t border-[#201f1f]/50" />}

                          {g.lift && (
                            <div className="space-y-3">
                              {g.lift.exercises.map((e, j) => {
                                const LIMIT = 8
                                const key = `${g.date}:${e.name}`
                                const isExpanded = expandedSets.has(key)
                                const visible = isExpanded ? e.rows : e.rows.slice(0, LIMIT)
                                const hidden = e.rows.length - LIMIT
                                return (
                                  <div key={j}>
                                    <div className="flex items-center justify-between mb-1.5">
                                      <span className="text-[#e5e2e1] text-sm font-semibold">{e.name}</span>
                                      <span className="text-[#ff9066] text-xs font-bold">
                                        {e.volume >= 1000 ? `${(e.volume / 1000).toFixed(1)}k kg` : `${e.volume} kg`}
                                      </span>
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                      {visible.map((r, k) => (
                                        <span key={k} className="bg-[#201f1f] text-[#a48b83] text-xs px-2.5 py-1 rounded-lg">
                                          {r.weight}kg <span className="text-[#e5e2e1]">× {r.reps}</span>
                                        </span>
                                      ))}
                                      {!isExpanded && hidden > 0 && (
                                        <button onClick={() => setExpandedSets(prev => new Set(prev).add(key))} className="bg-[#201f1f] text-[#a48b83] text-xs px-2.5 py-1 rounded-lg">
                                          +{hidden} more
                                        </button>
                                      )}
                                      {isExpanded && hidden > 0 && (
                                        <button onClick={() => setExpandedSets(prev => { const n = new Set(prev); n.delete(key); return n })} className="bg-[#201f1f] text-[#a48b83] text-xs px-2.5 py-1 rounded-lg">
                                          show less
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                )
                              })}
                              <div className="flex justify-between pt-2 border-t border-[#201f1f]/50">
                                <span className="text-[#a48b83] text-xs">{g.lift.sets} sets total</span>
                                <span className="text-[#a48b83] text-xs font-bold">
                                  {g.lift.volume >= 1000 ? `${(g.lift.volume / 1000).toFixed(1)}k kg` : `${g.lift.volume} kg`} total
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </main>

      <BottomNav />
    </>
  )
}
