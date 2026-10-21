'use client'
import { useEffect, useState, useRef } from 'react'
import BottomNav from '@/components/BottomNav'
import Avatar from '@/components/Avatar'
import FeedCard, { type FeedItem } from '@/components/social/FeedCard'
import Leaderboard from '@/components/social/Leaderboard'
import PenguinGame from '@/components/social/PenguinGame'
import { toast } from '@/components/Toast'

interface SearchUser { id: number; username: string; follow_status: 'pending' | 'accepted' | null; avatar?: string | null }
interface FollowRequest { username: string; avatar: string | null }

export default function SocialPage() {
  const [feed, setFeed] = useState<FeedItem[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [followingCount, setFollowingCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [isLbs, setIsLbs] = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchUser[]>([])
  const [searching, setSearching] = useState(false)
  const [justFollowed, setJustFollowed] = useState<Set<string>>(new Set())
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [showGame, setShowGame] = useState(false)
  const [requests, setRequests] = useState<FollowRequest[]>([])
  const [followers, setFollowers] = useState<FollowRequest[]>([])
  const [showFollowers, setShowFollowers] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)

  const loadFeed = () =>
    fetch('/api/social/feed')
      .then(r => r.json())
      .then(d => { setFeed(d.feed ?? []); setNextCursor(d.nextCursor ?? null); setFollowingCount(d.followingCount ?? 0) })

  useEffect(() => {
    loadFeed().finally(() => setLoading(false))
    fetch('/api/auth/me').then(r => r.json()).then(d => setIsLbs(d.unit_pref === 'imperial')).catch(() => {})
    fetch('/api/social/requests').then(r => r.json()).then(d => { setRequests(d.requests ?? []); setFollowers(d.followers ?? []) }).catch(() => {})
  }, [])

  // Someone asked to see your workouts — nothing is shared until you accept
  async function answerRequest(username: string, action: 'accept' | 'decline') {
    const prev = requests
    setRequests(rs => rs.filter(r => r.username !== username))
    const res = await fetch('/api/social/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, action }),
    }).catch(() => null)
    if (!res?.ok) { setRequests(prev); toast('Could not update request', { tone: 'error' }); return }
    if (action === 'accept') {
      const r = prev.find(x => x.username === username)
      if (r) setFollowers(fs => [...fs, r].sort((a, b) => a.username.localeCompare(b.username)))
      toast(`${username} can now see your workouts`, { tone: 'success' })
    }
  }

  // Two taps: first arms the button, second removes. They'd have to send a new request.
  async function removeFollower(username: string) {
    if (confirmRemove !== username) { setConfirmRemove(username); return }
    setConfirmRemove(null)
    const prev = followers
    setFollowers(fs => fs.filter(f => f.username !== username))
    const res = await fetch('/api/social/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, action: 'remove' }),
    }).catch(() => null)
    if (!res?.ok) { setFollowers(prev); toast('Could not remove follower', { tone: 'error' }); return }
    toast(`${username} can no longer see your workouts`)
  }

  // Infinite scroll — load the next page when the sentinel scrolls into view
  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !nextCursor) return
    const io = new IntersectionObserver(entries => {
      if (!entries[0].isIntersecting || loadingMore) return
      setLoadingMore(true)
      fetch(`/api/social/feed?before=${encodeURIComponent(nextCursor)}`)
        .then(r => r.json())
        .then(d => { setFeed(prev => [...prev, ...(d.feed ?? [])]); setNextCursor(d.nextCursor ?? null) })
        .finally(() => setLoadingMore(false))
    }, { rootMargin: '400px' })
    io.observe(el)
    return () => io.disconnect()
  }, [nextCursor, loadingMore])

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

  // Sends a request; their workouts appear in your feed once they accept
  async function follow(username: string) {
    setJustFollowed(s => new Set(s).add(username))
    await fetch('/api/social/follow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username }),
    })
  }

  return (
    <>
      <header className="sticky top-0 z-50 bg-surface-container-lowest/80 backdrop-blur-xl">
        <div className="flex items-center justify-between px-6 py-4 max-w-[390px] mx-auto">
          <h1 className="font-headline font-bold text-xl tracking-tight text-primary">Friends</h1>
          <div className="flex items-center gap-4">
            {/* Easter egg — a little game for rest periods */}
            <button onClick={() => setShowGame(true)} aria-label="Play penguin slide" className="text-xl leading-none hover:opacity-80 active:scale-90 transition-all">
              🐧
            </button>
            <button onClick={() => setShowSearch(true)} className="text-primary hover:opacity-80 active:scale-95 transition-all">
              <span className="material-symbols-outlined">person_add</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[390px] mx-auto px-6 pb-32 mt-4">
        {requests.length > 0 && (
          <section className="bg-surface-container rounded-2xl p-4 mb-4 animate-fade-in">
            <p className="text-[10px] font-bold font-label uppercase tracking-widest text-primary-container mb-1">
              Friend request{requests.length === 1 ? '' : 's'}
            </p>
            <p className="text-xs text-outline mb-3">Accepting lets them see your workouts.</p>
            <ul className="space-y-2.5">
              {requests.map(r => (
                <li key={r.username} className="flex items-center gap-3">
                  <Avatar username={r.username} avatar={r.avatar} size="sm" />
                  <span className="flex-1 min-w-0 truncate text-sm font-medium text-on-surface">{r.username}</span>
                  <button
                    onClick={() => answerRequest(r.username, 'decline')}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold font-label bg-surface-container-high text-outline active:scale-95 transition-transform"
                  >
                    Decline
                  </button>
                  <button
                    onClick={() => answerRequest(r.username, 'accept')}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold font-label bg-primary-container text-surface-container-lowest active:scale-95 transition-transform"
                  >
                    Accept
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        {followers.length > 0 && (
          <button
            onClick={() => setShowFollowers(true)}
            className="w-full flex items-center gap-2 bg-surface-container-low rounded-xl px-4 py-3 mb-4 text-left active:scale-[0.99] transition-transform"
          >
            <span className="material-symbols-outlined text-outline text-lg">visibility</span>
            <span className="flex-1 text-sm text-on-surface">Who can see your workouts</span>
            <span className="text-xs text-outline">{followers.length} {followers.length === 1 ? 'person' : 'people'}</span>
            <span className="material-symbols-outlined text-outline text-lg">chevron_right</span>
          </button>
        )}
        {loading ? (
          <div className="flex justify-center pt-20">
            <div className="w-6 h-6 border-2 border-primary-container/30 border-t-primary-container rounded-full animate-spin" />
          </div>
        ) : followingCount === 0 && feed.every(f => f.isMine) ? (
          <div className="flex flex-col items-center pt-24 gap-4 text-center animate-fade-in">
            <span className="material-symbols-outlined text-5xl text-outline/30">group</span>
            <p className="font-headline font-bold text-lg text-on-surface">No friends yet</p>
            <p className="text-outline text-sm">Follow friends to see their workouts, PRs and react to them. They'll need to accept your request first.</p>
            <button
              onClick={() => setShowSearch(true)}
              className="mt-2 flex items-center gap-2 bg-gradient-to-br from-primary to-primary-container text-surface-container-lowest font-headline font-bold text-sm px-6 py-3 rounded-full shadow-lg"
            >
              <span className="material-symbols-outlined text-[18px]">search</span>
              Find Friends
            </button>
          </div>
        ) : (
          <>
            <Leaderboard isLbs={isLbs} />
            {feed.length === 0 ? (
              <p className="text-center text-sm text-outline py-12">No workouts yet — once you or your friends log one, it shows up here.</p>
            ) : (
              <div className="space-y-3">
                {feed.map(item => <FeedCard key={item.sessionId} item={item} isLbs={isLbs} />)}
              </div>
            )}
            <div ref={sentinelRef} className="h-10 flex items-center justify-center">
              {loadingMore && <div className="w-5 h-5 border-2 border-primary-container/30 border-t-primary-container rounded-full animate-spin" />}
            </div>
          </>
        )}
      </main>

      {showGame && <PenguinGame onClose={() => setShowGame(false)} />}

      {/* Followers sheet — everyone who can currently see your workouts */}
      {showFollowers && (
        <>
          <div className="fixed inset-0 z-50 bg-black/60" onClick={() => { setShowFollowers(false); setConfirmRemove(null) }} />
          <div className="fixed inset-x-0 bottom-0 z-50 max-w-[390px] mx-auto bg-surface-sheet rounded-t-3xl px-5 pt-5 pb-10 max-h-[75vh] flex flex-col animate-slide-up">
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-headline font-bold text-lg text-on-surface">Who can see your workouts</h2>
              <button onClick={() => { setShowFollowers(false); setConfirmRemove(null) }} aria-label="Close" className="text-outline">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <p className="text-xs text-outline mb-4">Removing someone hides your workouts from them. They won&apos;t be told, but they could send a new request.</p>
            <ul className="overflow-y-auto space-y-2.5">
              {followers.length === 0 && <li className="text-sm text-outline text-center py-6">Nobody yet</li>}
              {followers.map(f => (
                <li key={f.username} className="flex items-center gap-3">
                  <Avatar username={f.username} avatar={f.avatar} size="sm" />
                  <span className="flex-1 min-w-0 truncate text-sm font-medium text-on-surface">{f.username}</span>
                  <button
                    onClick={() => removeFollower(f.username)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold font-label transition-colors active:scale-95 ${
                      confirmRemove === f.username ? 'bg-red-500/20 text-red-400' : 'bg-surface-container-high text-outline'
                    }`}
                  >
                    {confirmRemove === f.username ? 'Tap to confirm' : 'Remove'}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      {/* Search Modal — full page so keyboard doesn't push input off screen */}
      {showSearch && (
        <div className="fixed inset-0 z-50 bg-surface-container-lowest flex flex-col max-w-[390px] mx-auto animate-slide-up">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-surface-container">
            <button className="text-outline" onClick={() => setShowSearch(false)}>
              <span className="material-symbols-outlined">arrow_back</span>
            </button>
            <div className="flex-1 flex items-center gap-2 bg-surface-container-low rounded-xl px-3 py-2">
              <span className="material-symbols-outlined text-outline text-xl">search</span>
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search by username…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="flex-1 bg-transparent text-on-surface placeholder-outline/50 text-sm outline-none"
              />
              {searching && <div className="w-4 h-4 border border-primary-container/30 border-t-primary-container rounded-full animate-spin" />}
            </div>
          </div>
          <div className="overflow-y-auto flex-1">
            {searchResults.length === 0 && searchQuery.trim() && !searching && (
              <p className="text-center text-outline text-sm py-8 animate-fade-in">No users found</p>
            )}
            {!searchQuery.trim() && (
              <p className="text-center text-outline/50 text-sm py-12 animate-fade-in">Type a username to search</p>
            )}
            {searchResults.map(user => {
              const status = user.follow_status ?? (justFollowed.has(user.username) ? 'pending' : null)
              return (
                <div key={user.id} className="flex items-center justify-between px-5 py-3 border-b border-surface-container/50">
                  <div className="flex items-center gap-3">
                    <Avatar username={user.username} avatar={user.avatar} size="sm" />
                    <span className="text-on-surface text-sm font-medium">{user.username}</span>
                  </div>
                  <button
                    disabled={status != null}
                    onClick={() => follow(user.username)}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold font-label transition-colors ${
                      status ? 'bg-surface-container text-outline' : 'bg-primary-container text-surface-container-lowest hover:bg-primary'
                    }`}
                  >
                    {status === 'accepted' ? 'Following' : status === 'pending' ? 'Requested' : 'Follow'}
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
