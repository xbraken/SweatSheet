'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

interface SetDetail { weight: number; reps: number; logged_at: string | null }
interface LiftGroup { exercise: string; sets: SetDetail[] }
interface CardioItem {
  activity: string
  distance: number | null
  duration: string | null
  pace: string | null
  calories: number | null
  heart_rate: number | null
  started_at: string | null
}
interface SessionBlock { sessionId: number; createdAt: string; lifts: LiftGroup[]; cardio: CardioItem[] }
interface WorkoutData { username: string; date: string; sessions: SessionBlock[] }

function epley1RM(weight: number, reps: number): number {
  if (reps === 1) return weight
  return Math.round(weight * (1 + reps / 30))
}

function restTime(prev: string | null, curr: string | null): string | null {
  if (!prev || !curr) return null
  const diffSec = Math.round((new Date(curr + 'Z').getTime() - new Date(prev + 'Z').getTime()) / 1000)
  if (diffSec <= 0 || diffSec > 3600) return null
  const m = Math.floor(diffSec / 60)
  const s = diffSec % 60
  return m > 0 ? `${m}m${s > 0 ? ` ${s}s` : ''} rest` : `${s}s rest`
}

function formatTime(ts: string | null): string | null {
  if (!ts) return null
  const normalized = ts.includes('T') || ts.includes('Z') ? ts : ts.replace(' ', 'T') + 'Z'
  return new Date(normalized).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

export default function SharedWorkoutPage({ params }: { params: Promise<{ slug: string }> }) {
  const [data, setData] = useState<WorkoutData | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    params.then(p => {
      fetch(`/api/public/share/${encodeURIComponent(p.slug)}`)
        .then(r => {
          if (r.status === 404) { setNotFound(true); setLoading(false); return null }
          return r.json()
        })
        .then(d => { if (d) setData(d) })
        .finally(() => setLoading(false))
    })
  }, [params])

  const isEmpty = data && data.sessions.length === 0

  return (
    <div className="min-h-screen bg-surface-container-lowest">
      <header className="bg-surface-container-lowest/80 backdrop-blur-xl sticky top-0 z-50 flex items-center gap-4 px-6 py-4 w-full max-w-[390px] mx-auto">
        <Link href="/" className="text-primary-container font-headline font-black text-lg tracking-tight">SweatSheet</Link>
        <div className="flex-1" />
        {data && (
          <span className="text-outline text-sm font-bold">@{data.username}</span>
        )}
      </header>

      {!loading && data && !isEmpty && (
        <div className="max-w-[390px] mx-auto px-6 pt-2 pb-2">
          <h1 className="font-headline text-xl font-black text-on-surface tracking-tight">
            {formatDate(data.date)}
          </h1>
        </div>
      )}

      <main className="max-w-[390px] mx-auto px-4 pb-16 pt-4">
        {loading ? (
          <div className="flex justify-center pt-20">
            <div className="w-6 h-6 border-2 border-primary-container/30 border-t-primary-container rounded-full animate-spin" />
          </div>
        ) : notFound ? (
          <p className="text-center text-outline pt-20">This share link is invalid or has been revoked</p>
        ) : isEmpty ? (
          <p className="text-center text-outline pt-20">No workout recorded for this day</p>
        ) : (
          <div className="space-y-6 animate-fade-in">
            {data!.sessions.map((sess) => {
              const time = formatTime(sess.createdAt)
              const cardioTime = sess.cardio[0]?.started_at ? formatTime(sess.cardio[0].started_at) : null
              const displayTime = cardioTime ?? time

              return (
                <div key={sess.sessionId}>
                  {displayTime && (
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-outline text-xs font-bold font-mono">{displayTime}</span>
                      <div className="flex-1 h-px bg-surface-container" />
                    </div>
                  )}

                  <div className="space-y-3">
                    {sess.cardio.map((c, i) => {
                      const cTime = formatTime(c.started_at)
                      return (
                        <div key={i} className="rounded-2xl bg-surface border border-surface-container p-4">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <span className="bg-tertiary/20 text-tertiary text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full">Cardio</span>
                              {cTime && <span className="text-outline text-xs font-mono">{cTime}</span>}
                            </div>
                            <span className="text-on-surface font-headline font-bold text-base">{c.activity}</span>
                          </div>
                          <div className="grid grid-cols-3 gap-3">
                            {c.distance && Number(c.distance) > 0 && (
                              <div>
                                <p className="text-outline text-[10px] font-bold uppercase tracking-widest mb-1">Distance</p>
                                <p className="font-headline font-bold text-lg text-on-surface">{Number(c.distance).toFixed(1)} km</p>
                              </div>
                            )}
                            {c.pace && (
                              <div>
                                <p className="text-outline text-[10px] font-bold uppercase tracking-widest mb-1">Pace</p>
                                <p className="font-headline font-bold text-lg text-on-surface">{c.pace}/km</p>
                              </div>
                            )}
                            {c.duration && (
                              <div>
                                <p className="text-outline text-[10px] font-bold uppercase tracking-widest mb-1">Time</p>
                                <p className="font-headline font-bold text-lg text-on-surface">{c.duration}</p>
                              </div>
                            )}
                            {c.heart_rate && (
                              <div>
                                <p className="text-outline text-[10px] font-bold uppercase tracking-widest mb-1">HR Avg</p>
                                <p className="font-headline font-bold text-lg text-on-surface">{c.heart_rate} bpm</p>
                              </div>
                            )}
                            {c.calories && (
                              <div>
                                <p className="text-outline text-[10px] font-bold uppercase tracking-widest mb-1">Calories</p>
                                <p className="font-headline font-bold text-lg text-on-surface">{c.calories} kcal</p>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}

                    {sess.lifts.map((g, i) => {
                      const totalVol = g.sets.reduce((sum, s) => sum + s.weight * s.reps, 0)
                      const max1RM = Math.max(...g.sets.map(s => epley1RM(s.weight, s.reps)))
                      const exTime = formatTime(g.sets[0]?.logged_at ?? null)
                      return (
                        <div key={i} className="rounded-2xl bg-surface border border-surface-container p-4">
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="bg-primary-container/20 text-primary-container text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full">Lift</span>
                                {exTime && <span className="text-outline text-xs font-mono">{exTime}</span>}
                              </div>
                              <h3 className="font-headline font-bold text-base text-on-surface mt-1">{g.exercise}</h3>
                            </div>
                            <div className="text-right">
                              <p className="text-outline text-[10px] font-bold uppercase tracking-widest">Est. 1RM</p>
                              <p className="font-headline font-bold text-lg text-primary-container">{max1RM} kg</p>
                            </div>
                          </div>

                          <div className="space-y-2">
                            {g.sets.map((s, j) => {
                              const oneRM = epley1RM(s.weight, s.reps)
                              const rest = j > 0 ? restTime(g.sets[j - 1].logged_at, s.logged_at) : null
                              return (
                                <div key={j}>
                                  {rest && (
                                    <div className="flex items-center gap-2 py-1">
                                      <div className="flex-1 h-px bg-surface-container" />
                                      <span className="text-outline/60 text-[10px] font-mono">{rest}</span>
                                      <div className="flex-1 h-px bg-surface-container" />
                                    </div>
                                  )}
                                  <div className="flex items-center justify-between bg-surface-container-low rounded-xl px-3 py-2.5">
                                    <div className="flex items-center gap-3">
                                      <span className="text-outline text-[10px] font-bold w-5 text-center">{j + 1}</span>
                                      <span className="text-on-surface font-mono text-sm font-bold">{s.weight}kg × {s.reps}</span>
                                    </div>
                                    <span className="text-outline text-xs">~{oneRM} kg 1RM</span>
                                  </div>
                                </div>
                              )
                            })}
                          </div>

                          <div className="flex justify-between mt-3 pt-3 border-t border-surface-container/50">
                            <span className="text-outline text-xs">{g.sets.length} sets · {g.sets.reduce((n, s) => n + s.reps, 0)} reps</span>
                            <span className="text-outline text-xs font-bold">
                              {totalVol >= 1000 ? `${(totalVol / 1000).toFixed(1)}k` : Math.round(totalVol)} kg vol
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>

      <footer className="max-w-[390px] mx-auto px-6 pb-8 text-center">
        <Link href="/auth" className="text-outline text-xs hover:text-on-surface transition-colors">
          Log your own workouts on SweatSheet →
        </Link>
      </footer>
    </div>
  )
}
