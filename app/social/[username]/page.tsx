'use client'
import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import BottomNav from '@/components/BottomNav'

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
}
interface DayGroup {
  date: string
  startTime: string | null
  cardio: CardioRow[] | null
  lift: { volume: number; sets: number; exercises: ExerciseStat[] } | null
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()] + ' ' + d.getDate()
}

function formatTime(ts: string | null): string | null {
  if (!ts) return null
  const normalized = ts.includes('T') || ts.includes('Z') ? ts : ts.replace(' ', 'T') + 'Z'
  return new Date(normalized).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
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
  if (g.cardio) badges.push({ label: 'Cardio', className: 'bg-[#4bdece]/20 text-[#4bdece]' })
  if (g.lift) badges.push({ label: 'Lift', className: 'bg-[#ff9066]/20 text-[#ff9066]' })
  return badges
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

export default function FriendProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedDate, setExpandedDate] = useState<string | null>(null)
  const [expandedSets, setExpandedSets] = useState<Set<string>>(new Set())
  const [following, setFollowing] = useState(false)
  const [followLoading, setFollowLoading] = useState(false)

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

  async function toggleFollow() {
    if (!profile) return
    setFollowLoading(true)
    if (following) {
      await fetch(`/api/social/follow?username=${encodeURIComponent(username)}`, { method: 'DELETE' })
      setFollowing(false)
    } else {
      await fetch('/api/social/follow', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username }) })
      setFollowing(true)
    }
    setFollowLoading(false)
  }

  return (
    <>
      <header className="bg-[#0e0e0e]/80 backdrop-blur-xl sticky top-0 z-50 flex items-center justify-between px-6 py-4 w-full max-w-[390px] mx-auto">
        <div className="flex items-center gap-4">
          <button onClick={() => router.back()} className="text-[#ffb9a0] hover:opacity-80 active:scale-95 transition-all">
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <h1 className="font-headline text-xl font-bold tracking-tight text-[#ffb9a0]">{username}</h1>
        </div>
        {profile && !profile.isOwnProfile && (
          <button
            onClick={toggleFollow}
            disabled={followLoading}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold font-label transition-colors ${
              following ? 'bg-[#201f1f] text-[#a48b83]' : 'bg-[#ff9066] text-[#0e0e0e]'
            }`}
          >
            <span className="material-symbols-outlined text-base">{following ? 'person_check' : 'person_add'}</span>
            {following ? 'Following' : 'Follow'}
          </button>
        )}
      </header>

      <main className="max-w-[390px] mx-auto px-4 pb-32">
        {loading ? (
          <div className="flex justify-center pt-20">
            <div className="w-6 h-6 border-2 border-[#ff9066]/30 border-t-[#ff9066] rounded-full animate-spin" />
          </div>
        ) : !profile ? (
          <p className="text-center text-[#a48b83] pt-20">User not found</p>
        ) : (
          <>
            <section className="flex flex-col items-center pt-8 pb-8">
              <div className="w-24 h-24 rounded-full bg-[#2a2a2a] flex items-center justify-center border-2 border-[#ff9066]/20 mb-4">
                <span className="font-headline text-3xl font-black text-[#ffb9a0]">
                  {profile.username.slice(0, 2).toUpperCase()}
                </span>
              </div>
              <h2 className="font-headline text-2xl font-extrabold text-[#e5e2e1] mb-1">{profile.username}</h2>
              <p className="text-[#a48b83] text-sm font-medium">{profile.totalWorkouts} Workouts</p>
            </section>

            <h3 className="font-headline text-base font-bold text-[#e5e2e1] mb-4">Recent Workouts</h3>

            {dayGroups.length === 0 ? (
              <p className="text-center text-[#a48b83] text-sm py-10">No workouts yet</p>
            ) : (
              <div className="space-y-3">
                {dayGroups.map(g => {
                  const badges = dayBadges(g)
                  const keyStat = dayKeyStat(g)
                  const expanded = expandedDate === g.date
                  return (
                    <div key={g.date} className="rounded-2xl border overflow-hidden bg-[#131313] border-[#201f1f]">
                      <button
                        className="w-full p-4 flex items-center gap-3 text-left"
                        onClick={() => setExpandedDate(expanded ? null : g.date)}
                      >
                        <div className="flex flex-col flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[#a48b83] text-[10px] font-bold uppercase tracking-widest font-label">{formatDate(g.date)}</span>
                            {g.startTime && <span className="text-[#a48b83] text-[10px] font-mono">{g.startTime}</span>}
                          </div>
                          <span className="text-[#e5e2e1] font-headline font-bold text-sm mt-0.5 leading-tight truncate">{dayTitle(g)}</span>
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
                        <div className="border-t border-[#201f1f] bg-[#1c1b1b]/50 px-4 py-4 space-y-4">
                          {g.cardio && g.cardio.map((c, i) => (
                            <div key={i}>
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
                                {!c.pace && !c.duration && !c.distance && !c.heart_rate && (
                                  <p className="col-span-3 text-[#a48b83] text-sm">No stats recorded</p>
                                )}
                              </div>
                            </div>
                          ))}

                          {g.cardio && g.lift && <div className="border-t border-[#201f1f]/50" />}

                          {g.lift && (
                            <div className="space-y-3">
                              {g.lift.exercises.length > 0 ? g.lift.exercises.map((e, i) => (
                                <div key={i}>
                                  <div className="flex items-center justify-between mb-1.5">
                                    <span className="text-[#e5e2e1] text-sm font-semibold">{e.name}</span>
                                    <span className="text-[#ff9066] text-xs font-bold">
                                      {e.volume >= 1000 ? `${(e.volume / 1000).toFixed(1)}k kg` : `${e.volume} kg`}
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
                                          <span key={j} className="bg-[#201f1f] text-[#a48b83] text-xs px-2.5 py-1 rounded-lg">
                                            {r.weight}kg <span className="text-[#e5e2e1]">× {r.reps}</span>
                                          </span>
                                        ))}
                                        {!isExpanded && hidden > 0 && (
                                          <button
                                            onClick={() => setExpandedSets(prev => new Set(prev).add(key))}
                                            className="bg-[#201f1f] text-[#a48b83] text-xs px-2.5 py-1 rounded-lg hover:text-[#e5e2e1] transition-colors"
                                          >
                                            +{hidden} more
                                          </button>
                                        )}
                                        {isExpanded && hidden > 0 && (
                                          <button
                                            onClick={() => setExpandedSets(prev => { const n = new Set(prev); n.delete(key); return n })}
                                            className="bg-[#201f1f] text-[#a48b83] text-xs px-2.5 py-1 rounded-lg hover:text-[#e5e2e1] transition-colors"
                                          >
                                            show less
                                          </button>
                                        )}
                                      </div>
                                    )
                                  })()}
                                </div>
                              )) : (
                                <p className="text-[#a48b83] text-sm">No exercises recorded</p>
                              )}
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
