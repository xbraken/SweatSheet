'use client'
import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import BottomNav from '@/components/BottomNav'
import Avatar from '@/components/Avatar'
import { toast } from '@/components/Toast'

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
interface ProfileData {
  username: string
  totalWorkouts: number
  isFollowing: boolean
  isOwnProfile: boolean
  sessions: SessionItem[]
  avatar?: string | null
  routines?: { id: number; name: string; exercises: string[] }[]
}
interface DayGroup {
  date: string
  startTime: string | null
  cardio: CardioRow[] | null
  lift: { volume: number; sets: number; exercises: ExerciseStat[] } | null
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

function formatTime(ts: string | null): string | null {
  if (!ts) return null
  const normalized = ts.includes('T') || ts.includes('Z') ? ts : ts.replace(' ', 'T') + 'Z'
  return new Date(normalized).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
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

function dayTitle(g: DayGroup): string {
  const parts: string[] = []
  if (g.cardio) parts.push(g.cardio[0]?.activity ?? 'Cardio')
  if (g.lift) {
    const ex = g.lift.exercises
    parts.push(ex.length > 0 ? ex.slice(0, 2).map(e => e.name).join(' · ') : 'Lift')
  }
  return parts.join(' + ') || 'Workout'
}

function dayBadges(g: DayGroup): Array<{ label: string; className: string }> {
  const badges: Array<{ label: string; className: string }> = []
  if (g.cardio) badges.push({ label: 'Cardio', className: 'bg-tertiary/20 text-tertiary' })
  if (g.lift) badges.push({ label: 'Lift', className: 'bg-primary-container/20 text-primary-container' })
  return badges
}

function dayKeyStat(g: DayGroup): { value: string; className: string } {
  if (g.lift) {
    const v = g.lift.volume
    return { value: v >= 1000 ? `${(v / 1000).toFixed(1)}t` : `${v} kg`, className: 'text-tertiary' }
  }
  if (g.cardio) {
    const totalDist = g.cardio.reduce((sum, c) => sum + (Number(c.distance) || 0), 0)
    if (totalDist > 0) return { value: `${totalDist.toFixed(1)} km`, className: 'text-primary-container' }
    const c = g.cardio[0]
    if (c?.duration) return { value: c.duration, className: 'text-primary-container' }
  }
  return { value: '—', className: 'text-outline' }
}

export default function FriendProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedDate, setExpandedDate] = useState<string | null>(null)
  const [expandedSets, setExpandedSets] = useState<Set<string>>(new Set())
  const [following, setFollowing] = useState(false)
  const [copiedDate, setCopiedDate] = useState<string | null>(null)
  const [copiedRoutines, setCopiedRoutines] = useState<Set<number>>(new Set())

  async function copyRoutine(id: number) {
    const res = await fetch('/api/routines/copy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ routineId: id }),
    }).catch(() => null)
    if (!res?.ok) { toast('Could not copy routine', { tone: 'error' }); return }
    const data = await res.json()
    setCopiedRoutines(prev => new Set(prev).add(id))
    toast(`Added "${data.name}" to your routines`, { tone: 'success' })
  }

  async function shareDay(g: DayGroup) {
    if (!profile) return
    const url = `${window.location.origin}/social/${encodeURIComponent(profile.username)}`
    const isMobile = navigator.maxTouchPoints > 0 && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)
    if (isMobile && navigator.share) {
      await navigator.share({ title: `${profile.username} on SweatSheet`, url })
    } else {
      await navigator.clipboard.writeText(url)
      setCopiedDate(g.date)
      setTimeout(() => setCopiedDate(null), 2000)
    }
  }

  const dayGroups = useMemo<DayGroup[]>(() => {
    if (!profile) return []
    const map = new Map<string, SessionItem[]>()
    for (const s of profile.sessions) {
      if (!map.has(s.date)) map.set(s.date, [])
      map.get(s.date)!.push(s)
    }
    return Array.from(map.entries()).map(([date, sessions]) => {
      const allCardio = sessions.flatMap(s => s.cardio ?? [])
      let volume = 0, sets = 0
      const exMap = new Map<string, { volume: number; rows: SetRow[] }>()
      const hasLift = sessions.some(s => s.lift !== null)
      for (const s of sessions) {
        if (s.lift) {
          volume += s.lift.volume
          sets += s.lift.sets
          for (const e of s.lift.exercises) {
            const cur = exMap.get(e.name) ?? { volume: 0, rows: [] }
            exMap.set(e.name, { volume: cur.volume + e.volume, rows: [...cur.rows, ...e.rows] })
          }
        }
      }
      const exercises: ExerciseStat[] = Array.from(exMap.entries()).map(([name, st]) => ({ name, volume: st.volume, rows: st.rows }))
      const earliestCreatedAt = sessions.map(s => s.createdAt).filter(Boolean).sort()[0] ?? null
      return {
        date,
        startTime: formatTime(earliestCreatedAt),
        cardio: allCardio.length > 0 ? allCardio : null,
        lift: hasLift ? { volume, sets, exercises } : null,
      }
    })
  }, [profile])

  useEffect(() => {
    params.then(p => {
      setUsername(p.username)
      fetch(`/api/social/profile/${encodeURIComponent(p.username)}`)
        .then(r => r.json())
        .then(d => {
          setProfile(d)
          setFollowing(d.isFollowing)
          if (d.sessions?.length > 0) setExpandedDate(d.sessions[0].date)
        })
        .finally(() => setLoading(false))
    })
  }, [params])

  function toggleFollow() {
    if (!profile) return
    const next = !following
    setFollowing(next)
    if (!next) {
      fetch(`/api/social/follow?username=${encodeURIComponent(username)}`, { method: 'DELETE' })
    } else {
      fetch('/api/social/follow', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username }) })
    }
  }

  return (
    <>
      <header className="bg-surface-container-lowest/80 backdrop-blur-xl sticky top-0 z-50 flex items-center justify-between px-6 py-4 w-full max-w-[390px] mx-auto">
        <div className="flex items-center gap-4">
          <button onClick={() => router.back()} className="text-primary hover:opacity-80 active:scale-95 transition-all">
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <h1 className="font-headline text-xl font-bold tracking-tight text-primary">{username}</h1>
        </div>
        {profile && !profile.isOwnProfile && (
          <button
            onClick={toggleFollow}
            disabled={!profile}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold font-label transition-colors ${
              following ? 'bg-surface-container text-outline' : 'bg-primary-container text-surface-container-lowest'
            }`}
          >
            <span className="material-symbols-outlined text-base">{following ? 'person_check' : 'person_add'}</span>
            {following ? 'Following' : 'Follow'}
          </button>
        )}
      </header>

      <main className="max-w-[390px] mx-auto px-4 pb-32">
        {loading ? (
          <div key="loading" className="flex justify-center pt-20">
            <div className="w-6 h-6 border-2 border-primary-container/30 border-t-primary-container rounded-full animate-spin" />
          </div>
        ) : !profile ? (
          <p key="not-found" className="text-center text-outline pt-20 animate-fade-in">User not found</p>
        ) : (
          <>
            <section className="flex flex-col items-center pt-8 pb-8 animate-fade-in" style={{ animationDelay: '0ms' }}>
              <Avatar username={profile.username} avatar={profile.avatar} size="lg" className="mb-4" />
              <h2 className="font-headline text-2xl font-extrabold text-on-surface mb-1">{profile.username}</h2>
              <p className="text-outline text-sm font-medium">{profile.totalWorkouts} Workouts</p>
            </section>

            {!profile.isOwnProfile && (profile.routines?.length ?? 0) > 0 && (
              <section className="mb-8 animate-fade-in" style={{ animationDelay: '40ms' }}>
                <h3 className="font-headline text-base font-bold text-on-surface mb-3">Routines</h3>
                <div className="space-y-2">
                  {profile.routines!.map(r => (
                    <div key={r.id} className="flex items-center gap-3 bg-surface-container rounded-xl px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-headline font-bold text-sm text-on-surface truncate">{r.name}</p>
                        <p className="text-xs text-outline line-clamp-1">{r.exercises.join(', ')}</p>
                      </div>
                      <button
                        disabled={copiedRoutines.has(r.id)}
                        onClick={() => copyRoutine(r.id)}
                        className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary-container/15 text-primary-container text-xs font-bold font-label disabled:bg-surface-container-high disabled:text-outline active:scale-95 transition-transform"
                      >
                        <span className="material-symbols-outlined text-sm">{copiedRoutines.has(r.id) ? 'check' : 'content_copy'}</span>
                        {copiedRoutines.has(r.id) ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <h3 className="font-headline text-base font-bold text-on-surface mb-4 animate-fade-in" style={{ animationDelay: '60ms' }}>Recent Workouts</h3>

            {dayGroups.length === 0 ? (
              <p className="text-center text-outline text-sm py-10 animate-fade-in" style={{ animationDelay: '100ms' }}>No workouts yet</p>
            ) : (
              <div className="space-y-3">
                {dayGroups.map((g, i) => {
                  const badges = dayBadges(g)
                  const keyStat = dayKeyStat(g)
                  const expanded = expandedDate === g.date
                  return (
                    <div key={g.date} className="rounded-2xl border overflow-hidden bg-surface border-surface-container animate-fade-in" style={{ animationDelay: `${Math.min(i, 7) * 55 + 80}ms` }}>
                      <button
                        className="w-full p-4 flex items-center gap-3 text-left"
                        onClick={() => setExpandedDate(expanded ? null : g.date)}
                      >
                        <div className="flex flex-col flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-outline text-[10px] font-bold uppercase tracking-widest font-label">{formatDate(g.date)}</span>
                            {g.startTime && <span className="text-outline text-[10px] font-mono">{g.startTime}</span>}
                          </div>
                          <span className="text-on-surface font-headline font-bold text-sm mt-0.5 leading-tight truncate">{dayTitle(g)}</span>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          {badges.map((b, i) => (
                            <span key={i} className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest ${b.className}`}>{b.label}</span>
                          ))}
                        </div>
                        <span className={`font-headline font-bold text-base shrink-0 ${keyStat.className}`}>
                          {keyStat.value}
                        </span>
                      </button>

                      {expanded && (
                        <div className="border-t border-surface-container bg-surface-container-low/50 px-4 py-4 space-y-4 animate-fade-in">
                          {g.cardio && g.cardio.map((c, i) => (
                            <div key={i}>
                              {g.cardio!.length > 1 && (
                                <p className="text-outline text-[10px] font-bold uppercase tracking-widest font-label mb-2">{c.activity}</p>
                              )}
                              <div className="grid grid-cols-3 gap-3">
                                {c.distance && Number(c.distance) > 0 && (
                                  <div>
                                    <p className="text-outline text-[10px] font-bold uppercase tracking-widest font-label mb-1">Dist</p>
                                    <p className="font-headline font-bold text-lg text-on-surface">{Number(c.distance).toFixed(1)} km</p>
                                  </div>
                                )}
                                {c.pace && (
                                  <div>
                                    <p className="text-outline text-[10px] font-bold uppercase tracking-widest font-label mb-1">Pace</p>
                                    <p className="font-headline font-bold text-lg text-on-surface">{c.pace}/km</p>
                                  </div>
                                )}
                                {c.duration && (
                                  <div>
                                    <p className="text-outline text-[10px] font-bold uppercase tracking-widest font-label mb-1">Time</p>
                                    <p className="font-headline font-bold text-lg text-on-surface">{c.duration}</p>
                                  </div>
                                )}
                                {c.heart_rate && (
                                  <div>
                                    <p className="text-outline text-[10px] font-bold uppercase tracking-widest font-label mb-1">HR Avg</p>
                                    <p className="font-headline font-bold text-lg text-on-surface">{c.heart_rate} bpm</p>
                                  </div>
                                )}
                                {!c.pace && !c.duration && !c.distance && !c.heart_rate && (
                                  <p className="col-span-3 text-outline text-sm">No stats recorded</p>
                                )}
                              </div>
                            </div>
                          ))}

                          <div className="flex justify-end">
                            <button
                              onClick={() => shareDay(g)}
                              className="flex items-center gap-1.5 text-outline hover:text-on-surface active:scale-95 transition-all text-xs font-bold font-label"
                            >
                              <span className="material-symbols-outlined text-base">{copiedDate === g.date ? 'check' : 'share'}</span>
                              {copiedDate === g.date ? 'Copied!' : 'Share'}
                            </button>
                          </div>

                          {g.cardio && g.lift && <div className="border-t border-surface-container/50" />}

                          {g.lift && (
                            <div className="space-y-3">
                              {g.lift.exercises.length > 0 ? g.lift.exercises.map((e, i) => (
                                <div key={i}>
                                  <div className="flex items-center justify-between mb-1.5">
                                    <span className="text-on-surface text-sm font-semibold">{e.name}</span>
                                    <span className="text-primary-container text-xs font-bold">
                                      {e.volume >= 1000 ? `${(e.volume / 1000).toFixed(1)}t` : `${e.volume} kg`}
                                    </span>
                                  </div>
                                  {(() => {
                                    const LIMIT = 8
                                    const key = `${g.date}:${e.name}`
                                    const isExpanded = expandedSets.has(key)
                                    const visible = isExpanded ? e.rows : e.rows.slice(0, LIMIT)
                                    const hidden = e.rows.length - LIMIT
                                    return (
                                      <div className="flex flex-wrap gap-1.5">
                                        {visible.map((r, j) => (
                                          <span key={j} className="bg-surface-container text-outline text-xs px-2.5 py-1 rounded-lg">
                                            {r.weight}kg <span className="text-on-surface">× {r.reps}</span>
                                          </span>
                                        ))}
                                        {!isExpanded && hidden > 0 && (
                                          <button
                                            onClick={() => setExpandedSets(prev => new Set(prev).add(key))}
                                            className="bg-surface-container text-outline text-xs px-2.5 py-1 rounded-lg hover:text-on-surface transition-colors"
                                          >
                                            +{hidden} more
                                          </button>
                                        )}
                                        {isExpanded && hidden > 0 && (
                                          <button
                                            onClick={() => setExpandedSets(prev => { const n = new Set(prev); n.delete(key); return n })}
                                            className="bg-surface-container text-outline text-xs px-2.5 py-1 rounded-lg hover:text-on-surface transition-colors"
                                          >
                                            show less
                                          </button>
                                        )}
                                      </div>
                                    )
                                  })()}
                                </div>
                              )) : (
                                <p className="text-outline text-sm">No exercises recorded</p>
                              )}
                              <div className="flex justify-between pt-2 border-t border-surface-container/50">
                                <span className="text-outline text-xs">{g.lift.sets} sets total</span>
                                <span className="text-outline text-xs font-bold">
                                  {g.lift.volume >= 1000 ? `${(g.lift.volume / 1000).toFixed(1)}t` : `${g.lift.volume} kg`} total
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
