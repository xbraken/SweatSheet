'use client'
import { useEffect, useState, useRef } from 'react'
import BottomNav from '@/components/BottomNav'

interface CardioBlock {
  activity: string
  distance: number | null
  duration: string | null
  pace: string | null
  heart_rate: number | null
}

interface FeedItem {
  userId: number
  username: string
  sessionId: number
  date: string
  createdAt: string
  lift: { volume: number; sets: number; exercises: string[] } | null
  cardio: CardioBlock[] | null
}

interface SearchUser {
  id: number
  username: string
  is_following: number
}

function timeAgo(utcStr: string): string {
  const diff = Date.now() - new Date(utcStr + (utcStr.includes('Z') ? '' : 'Z')).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  if (hrs < 48) return 'Yesterday'
  return `${Math.floor(hrs / 24)}d ago`
}

function initials(username: string): string {
  return username.slice(0, 2).toUpperCase()
}

function workoutTitle(item: FeedItem): string {
  if (item.cardio && item.lift) return (item.cardio[0]?.activity ?? 'Cardio') + ' + Lift'
  if (item.cardio) return item.cardio[0]?.activity ?? 'Cardio'
  if (item.lift) {
    const ex = item.lift.exercises
    if (ex.length === 0) return 'Lift Session'
    if (ex.length <= 2) return ex.join(' · ')
    return ex.slice(0, 2).join(' · ') + ` +${ex.length - 2}`
  }
  return 'Workout'
}

function workoutStats(item: FeedItem): Array<{ label: string; value: string }> {
  if (item.cardio && item.cardio.length > 0) {
    const c = item.cardio[0]
    const stats: Array<{ label: string; value: string }> = []
    if (c.distance && c.distance > 0) stats.push({ label: 'Distance', value: `${Number(c.distance).toFixed(1)} km` })
    if (c.pace) stats.push({ label: 'Pace', value: `${c.pace} /km` })
    if (c.duration) stats.push({ label: 'Time', value: c.duration })
    if (stats.length < 3 && c.heart_rate) stats.push({ label: 'Avg HR', value: `${c.heart_rate} bpm` })
    while (stats.length < 3) stats.push({ label: '', value: '—' })
    return stats.slice(0, 3)
  }
  if (item.lift) {
    return [
      { label: 'Volume', value: item.lift.volume >= 1000 ? `${(item.lift.volume / 1000).toFixed(1)}k kg` : `${item.lift.volume} kg` },
      { label: 'Sets', value: String(item.lift.sets) },
      { label: 'Exercises', value: String(item.lift.exercises.length) },
    ]
  }
  return []
}

function FeedCard({ item, onUnfollow }: { item: FeedItem; onUnfollow: (username: string) => void }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const stats = workoutStats(item)

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    if (menuOpen) document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [menuOpen])

  return (
    <article className="bg-[#131313] border border-[#201f1f] rounded-[16px] overflow-hidden p-5 transition-transform hover:scale-[1.01]">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#2a2a2a] flex items-center justify-center border border-[#56423c]/30">
            <span className="text-[#ffb9a0] font-headline font-bold text-sm">{initials(item.username)}</span>
          </div>
          <div>
            <h3 className="text-[#e5e2e1] font-semibold text-sm">{item.username}</h3>
            <p className="text-[#a48b83]/60 text-xs font-medium">{timeAgo(item.createdAt)}</p>
          </div>
        </div>
        <div className="relative" ref={menuRef}>
          <button
            className="text-[#a48b83]/40 hover:text-[#a48b83] transition-colors"
            onClick={() => setMenuOpen(v => !v)}
          >
            <span className="material-symbols-outlined">more_horiz</span>
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-8 bg-[#201f1f] border border-[#2a2a2a] rounded-xl shadow-xl z-20 overflow-hidden min-w-[130px]">
              <button
                className="w-full px-4 py-3 text-left text-sm text-[#ff9066] hover:bg-[#2a2a2a] transition-colors font-medium"
                onClick={() => { setMenuOpen(false); onUnfollow(item.username) }}
              >
                Unfollow
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="mb-6">
        <h2 className="font-headline font-extrabold text-3xl text-[#e5e2e1] tracking-tight">{workoutTitle(item)}</h2>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {stats.map((s, i) => (
          <div key={i} className="space-y-1">
            <span className="text-[#ff9066]/60 text-[10px] font-bold uppercase tracking-widest font-label">{s.label}</span>
            <p className="text-[#e5e2e1] font-headline font-bold text-lg">{s.value}</p>
          </div>
        ))}
      </div>
    </article>
  )
}

export default function SocialPage() {
  const [feed, setFeed] = useState<FeedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchUser[]>([])
  const [searching, setSearching] = useState(false)
  const [following, setFollowing] = useState<Set<string>>(new Set())
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/social/feed')
      .then(r => r.json())
      .then(d => setFeed(d.feed ?? []))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!showSearch) { setSearchQuery(''); setSearchResults([]) }
    else setTimeout(() => searchInputRef.current?.focus(), 50)
  }, [showSearch])

  useEffect(() => {
    const q = searchQuery.trim()
    if (!q) { setSearchResults([]); return }
    setSearching(true)
    const t = setTimeout(() => {
      fetch(`/api/social/search?q=${encodeURIComponent(q)}`)
        .then(r => r.json())
        .then(d => setSearchResults(d.users ?? []))
        .finally(() => setSearching(false))
    }, 300)
    return () => clearTimeout(t)
  }, [searchQuery])

  async function follow(username: string) {
    setFollowing(s => new Set(s).add(username))
    await fetch('/api/social/follow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username }),
    })
    // Refresh feed
    fetch('/api/social/feed').then(r => r.json()).then(d => setFeed(d.feed ?? []))
  }

  async function unfollow(username: string) {
    await fetch(`/api/social/follow?username=${encodeURIComponent(username)}`, { method: 'DELETE' })
    setFeed(f => f.filter(item => item.username !== username))
    setFollowing(s => { const n = new Set(s); n.delete(username); return n })
  }

  return (
    <>
      <header className="fixed top-0 w-full z-50 bg-[#131313]/60 backdrop-blur-xl">
        <div className="flex justify-between items-center px-6 py-4 w-full max-w-[390px] mx-auto">
          <h1 className="font-headline font-bold text-2xl tracking-tight text-[#ffb9a0]">Friends</h1>
          <div className="flex gap-4">
            <button
              className="hover:opacity-80 transition-opacity active:scale-95 duration-100 text-[#ffb9a0]"
              onClick={() => setShowSearch(true)}
            >
              <span className="material-symbols-outlined">person_add</span>
            </button>
          </div>
        </div>
      </header>

      <main className="pt-20 pb-32 max-w-[390px] mx-auto px-4 space-y-4">
        {loading ? (
          <div className="flex justify-center pt-20">
            <div className="w-6 h-6 border-2 border-[#ff9066]/30 border-t-[#ff9066] rounded-full animate-spin" />
          </div>
        ) : feed.length === 0 ? (
          <div className="flex flex-col items-center justify-center pt-24 gap-4 text-center px-6">
            <span className="material-symbols-outlined text-5xl text-[#a48b83]/40">group</span>
            <p className="text-[#e5e2e1] font-headline font-bold text-xl">No friends yet</p>
            <p className="text-[#a48b83] text-sm">Add friends to see their latest workouts</p>
            <button
              onClick={() => setShowSearch(true)}
              className="mt-2 px-6 py-3 bg-[#ff9066] text-[#0e0e0e] rounded-xl font-bold font-label text-sm"
            >
              Find Friends
            </button>
          </div>
        ) : (
          feed.map(item => (
            <FeedCard key={item.sessionId} item={item} onUnfollow={unfollow} />
          ))
        )}
      </main>

      {/* Search / Add Friend Sheet */}
      {showSearch && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowSearch(false)} />
          <div className="relative bg-[#131313] rounded-t-[24px] border-t border-[#201f1f] max-w-[390px] mx-auto w-full pb-10 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#201f1f]">
              <h2 className="font-headline font-bold text-lg text-[#e5e2e1]">Add Friends</h2>
              <button className="text-[#a48b83]" onClick={() => setShowSearch(false)}>
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="px-5 py-3 border-b border-[#201f1f]">
              <div className="flex items-center gap-2 bg-[#1c1b1b] rounded-xl px-3 py-2">
                <span className="material-symbols-outlined text-[#a48b83] text-xl">search</span>
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search by username…"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="flex-1 bg-transparent text-[#e5e2e1] placeholder-[#a48b83]/50 text-sm outline-none"
                />
                {searching && <div className="w-4 h-4 border border-[#ff9066]/30 border-t-[#ff9066] rounded-full animate-spin" />}
              </div>
            </div>
            <div className="overflow-y-auto flex-1">
              {searchResults.length === 0 && searchQuery.trim() && !searching && (
                <p className="text-center text-[#a48b83] text-sm py-8">No users found</p>
              )}
              {searchResults.map(user => {
                const isFollowing = !!user.is_following || following.has(user.username)
                return (
                  <div key={user.id} className="flex items-center justify-between px-5 py-3 border-b border-[#201f1f]/50">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-[#2a2a2a] flex items-center justify-center">
                        <span className="text-[#ffb9a0] font-headline font-bold text-xs">{initials(user.username)}</span>
                      </div>
                      <span className="text-[#e5e2e1] text-sm font-medium">{user.username}</span>
                    </div>
                    <button
                      disabled={isFollowing}
                      onClick={() => follow(user.username)}
                      className={`px-4 py-1.5 rounded-lg text-xs font-bold font-label transition-colors ${
                        isFollowing
                          ? 'bg-[#201f1f] text-[#a48b83]'
                          : 'bg-[#ff9066] text-[#0e0e0e] hover:bg-[#ffb9a0]'
                      }`}
                    >
                      {isFollowing ? 'Following' : 'Follow'}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      <BottomNav />
    </>
  )
}
