'use client'
import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import BottomNav from '@/components/BottomNav'
import Avatar from '@/components/Avatar'

interface FeedItem {
  userId: number
  username: string
  sessionId: number
  date: string
  createdAt: string
  lift: { volume: number; sets: number; exercises: Array<{ name: string; volume: number; sets: number }> } | null
  cardio: Array<{ activity: string }> | null
}

interface SearchUser { id: number; username: string; is_following: number; avatar?: string | null }

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

function feedSubtitle(item: FeedItem): string {
  if (item.cardio) return `${item.cardio[0]?.activity ?? 'Cardio'} · ${timeAgo(item.createdAt)}`
  if (item.lift) {
    const label = item.lift.exercises.slice(0, 2).map(e => e.name).join(', ') || 'Lift'
    return `${label} · ${timeAgo(item.createdAt)}`
  }
  return `Workout · ${timeAgo(item.createdAt)}`
}

export default function SocialPage() {
  const router = useRouter()
  const [feed, setFeed] = useState<FeedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchUser[]>([])
  const [searching, setSearching] = useState(false)
  const [justFollowed, setJustFollowed] = useState<Set<string>>(new Set())
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
    setJustFollowed(s => new Set(s).add(username))
    await fetch('/api/social/follow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username }),
    })
    fetch('/api/social/feed').then(r => r.json()).then(d => setFeed(d.feed ?? []))
  }

  return (
    <>
      <header className="sticky top-0 z-50 bg-[#0e0e0e]/80 backdrop-blur-xl">
        <div className="flex items-center justify-between px-6 py-4 max-w-[390px] mx-auto">
          <h1 className="font-headline font-bold text-xl tracking-tight text-[#ffb9a0]">Friends</h1>
          <button onClick={() => setShowSearch(true)} className="text-[#ffb9a0] hover:opacity-80 active:scale-95 transition-all">
            <span className="material-symbols-outlined">person_add</span>
          </button>
        </div>
      </header>

      <main className="max-w-[390px] mx-auto px-6 pb-32 mt-4">
        {loading ? (
          <div className="flex justify-center pt-20">
            <div className="w-6 h-6 border-2 border-[#ff9066]/30 border-t-[#ff9066] rounded-full animate-spin" />
          </div>
        ) : feed.length === 0 ? (
          <div className="flex flex-col items-center pt-24 gap-4 text-center animate-fade-in">
            <span className="material-symbols-outlined text-5xl text-[#a48b83]/30">group</span>
            <p className="font-headline font-bold text-lg text-[#e5e2e1]">No friends yet</p>
            <p className="text-[#a48b83] text-sm">Add friends to see their latest workouts</p>
            <button
              onClick={() => setShowSearch(true)}
              className="mt-2 flex items-center gap-2 bg-gradient-to-br from-[#ffb9a0] to-[#ff9066] text-[#0e0e0e] font-headline font-bold text-sm px-6 py-3 rounded-full shadow-lg"
            >
              <span className="material-symbols-outlined text-[18px]">search</span>
              Find Friends
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-0 animate-fade-in">
              {feed.map(item => (
                <button
                  key={item.userId}
                  onClick={() => router.push(`/social/${item.username}`)}
                  className="w-full flex items-center justify-between py-4 hover:bg-[#201f1f] active:bg-[#201f1f] transition-colors rounded-xl px-2 -mx-2 group"
                >
                  <div className="flex items-center gap-4">
                    <Avatar username={item.username} size="md" />
                    <div className="text-left">
                      <p className="font-headline font-semibold text-[#e5e2e1] text-base">{item.username}</p>
                      <p className="text-[#a48b83]/70 text-xs mt-0.5 font-medium">{feedSubtitle(item)}</p>
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-[#a48b83]/30 group-hover:text-[#ffb9a0] transition-colors">chevron_right</span>
                </button>
              ))}
            </div>

            <div className="mt-10 flex justify-center">
              <button
                onClick={() => setShowSearch(true)}
                className="flex items-center gap-2 bg-gradient-to-br from-[#ffb9a0] to-[#ff9066] text-[#0e0e0e] font-headline font-bold text-sm px-6 py-3 rounded-full shadow-lg active:scale-95 transition-all"
              >
                <span className="material-symbols-outlined text-[18px]">search</span>
                Find Friends
              </button>
            </div>
          </>
        )}
      </main>

      {/* Search Modal — full page so keyboard doesn't push input off screen */}
      {showSearch && (
        <div className="fixed inset-0 z-50 bg-[#0e0e0e] flex flex-col max-w-[390px] mx-auto animate-slide-up">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-[#201f1f]">
            <button className="text-[#a48b83]" onClick={() => setShowSearch(false)}>
              <span className="material-symbols-outlined">arrow_back</span>
            </button>
            <div className="flex-1 flex items-center gap-2 bg-[#1c1b1b] rounded-xl px-3 py-2">
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
              <p className="text-center text-[#a48b83] text-sm py-8 animate-fade-in">No users found</p>
            )}
            {!searchQuery.trim() && (
              <p className="text-center text-[#a48b83]/50 text-sm py-12 animate-fade-in">Type a username to search</p>
            )}
            {searchResults.map(user => {
              const isFollowing = !!user.is_following || justFollowed.has(user.username)
              return (
                <div key={user.id} className="flex items-center justify-between px-5 py-3 border-b border-[#201f1f]/50">
                  <div className="flex items-center gap-3">
                    <Avatar username={user.username} avatar={user.avatar} size="sm" />
                    <span className="text-[#e5e2e1] text-sm font-medium">{user.username}</span>
                  </div>
                  <button
                    disabled={isFollowing}
                    onClick={() => follow(user.username)}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold font-label transition-colors ${
                      isFollowing ? 'bg-[#201f1f] text-[#a48b83]' : 'bg-[#ff9066] text-[#0e0e0e] hover:bg-[#ffb9a0]'
                    }`}
                  >
                    {isFollowing ? 'Following' : 'Follow'}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <BottomNav />
    </>
  )
}
