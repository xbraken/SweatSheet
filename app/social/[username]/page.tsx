'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import BottomNav from '@/components/BottomNav'

interface CardioRow { activity: string; distance: number | null; duration: string | null; pace: string | null; heart_rate: number | null }
interface SessionItem {
  sessionId: number
  date: string
  createdAt: string
  lift: { volume: number; sets: number; exercises: string[] } | null
  cardio: CardioRow[] | null
}
interface ProfileData {
  username: string
  totalWorkouts: number
  isFollowing: boolean
  isOwnProfile: boolean
  sessions: SessionItem[]
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()] + ' ' + d.getDate()
}

function sessionTitle(s: SessionItem): string {
  if (s.cardio && s.lift) return (s.cardio[0]?.activity ?? 'Cardio') + ' + Lift'
  if (s.cardio) return s.cardio[0]?.activity ?? 'Cardio'
  if (s.lift) {
    const ex = s.lift.exercises
    if (ex.length === 0) return 'Lift Session'
    return ex.slice(0, 2).join(' · ')
  }
  return 'Workout'
}

function sessionBadge(s: SessionItem): { label: string; className: string } {
  if (s.cardio) {
    const act = s.cardio[0]?.activity ?? ''
    if (act.toLowerCase().includes('run') || act.toLowerCase().includes('interval')) return { label: 'Run', className: 'bg-[#ff9066]/20 text-[#ff9066]' }
    if (act.toLowerCase().includes('cycl') || act.toLowerCase().includes('bike')) return { label: 'Cycle', className: 'bg-[#f7b8a2]/20 text-[#f7b8a2]' }
    return { label: act || 'Cardio', className: 'bg-[#ff9066]/20 text-[#ff9066]' }
  }
  return { label: 'Lift', className: 'bg-[#4bdece]/20 text-[#4bdece]' }
}

function sessionKeyStat(s: SessionItem): string {
  if (s.cardio) {
    const c = s.cardio[0]
    if (c?.distance && Number(c.distance) > 0) return `${Number(c.distance).toFixed(1)} km`
    if (c?.duration) return c.duration
    return '—'
  }
  if (s.lift) {
    const v = s.lift.volume
    return v >= 1000 ? `${(v / 1000).toFixed(1)}k kg` : `${v} kg`
  }
  return '—'
}

function sessionStats(s: SessionItem): Array<{ label: string; value: string }> {
  if (s.cardio) {
    const c = s.cardio[0]
    const stats = []
    if (c?.pace) stats.push({ label: 'Pace', value: `${c.pace} /km` })
    if (c?.duration) stats.push({ label: 'Time', value: c.duration })
    if (c?.heart_rate) stats.push({ label: 'HR Avg', value: `${c.heart_rate} bpm` })
    while (stats.length < 3) stats.push({ label: '', value: '—' })
    return stats.slice(0, 3)
  }
  if (s.lift) {
    return [
      { label: 'Volume', value: s.lift.volume >= 1000 ? `${(s.lift.volume / 1000).toFixed(1)}k kg` : `${s.lift.volume} kg` },
      { label: 'Sets', value: String(s.lift.sets) },
      { label: 'Exercises', value: String(s.lift.exercises.length) },
    ]
  }
  return []
}

export default function FriendProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [following, setFollowing] = useState(false)
  const [followLoading, setFollowLoading] = useState(false)

  useEffect(() => {
    params.then(p => {
      setUsername(p.username)
      fetch(`/api/social/profile/${encodeURIComponent(p.username)}`)
        .then(r => r.json())
        .then(d => {
          setProfile(d)
          setFollowing(d.isFollowing)
          if (d.sessions?.length > 0) setExpandedId(d.sessions[0].sessionId)
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
            {/* Profile header */}
            <section className="flex flex-col items-center pt-8 pb-8">
              <div className="w-24 h-24 rounded-full bg-[#2a2a2a] flex items-center justify-center border-2 border-[#ff9066]/20 mb-4">
                <span className="font-headline text-3xl font-black text-[#ffb9a0]">
                  {profile.username.slice(0, 2).toUpperCase()}
                </span>
              </div>
              <h2 className="font-headline text-2xl font-extrabold text-[#e5e2e1] mb-1">{profile.username}</h2>
              <p className="text-[#a48b83] text-sm font-medium">{profile.totalWorkouts} Workouts</p>
            </section>

            {/* Workouts */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-headline text-base font-bold text-[#e5e2e1]">Recent Workouts</h3>
            </div>

            {profile.sessions.length === 0 ? (
              <p className="text-center text-[#a48b83] text-sm py-10">No workouts yet</p>
            ) : (
              <div className="space-y-3">
                {profile.sessions.map(s => {
                  const badge = sessionBadge(s)
                  const expanded = expandedId === s.sessionId
                  const stats = sessionStats(s)
                  return (
                    <div
                      key={s.sessionId}
                      className={`rounded-2xl border overflow-hidden transition-all duration-200 ${
                        expanded ? 'bg-[#131313] border-[#201f1f] shadow-xl' : 'bg-[#131313] border-[#201f1f]/60'
                      }`}
                    >
                      <button
                        className="w-full p-4 flex items-center justify-between gap-3 text-left"
                        onClick={() => setExpandedId(expanded ? null : s.sessionId)}
                      >
                        <div className="flex flex-col min-w-[52px]">
                          <span className="text-[#a48b83] text-[10px] font-bold uppercase tracking-widest font-label">{formatDate(s.date)}</span>
                          <span className="text-[#e5e2e1] font-headline font-bold text-sm mt-0.5">{sessionTitle(s)}</span>
                        </div>
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest shrink-0 ${badge.className}`}>
                          {badge.label}
                        </span>
                        <span className={`font-headline font-bold text-base ml-auto shrink-0 ${
                          s.lift && !s.cardio ? 'text-[#4bdece]' : 'text-[#ff9066]'
                        }`}>
                          {sessionKeyStat(s)}
                        </span>
                      </button>

                      {expanded && stats.length > 0 && (
                        <div className="border-t border-[#201f1f] bg-[#1c1b1b]/50 px-4 py-4 grid grid-cols-3 gap-3">
                          {stats.map((st, i) => (
                            <div key={i}>
                              <p className="text-[#a48b83] text-[10px] font-bold uppercase tracking-widest font-label mb-1">{st.label}</p>
                              <p className="font-headline font-bold text-lg text-[#e5e2e1]">{st.value}</p>
                            </div>
                          ))}
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
