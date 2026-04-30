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
    <div className="min-h-screen bg-[#0e0e0e]">
      <header className="bg-[#0e0e0e]/80 backdrop-blur-xl sticky top-0 z-50 flex items-center gap-4 px-6 py-4 w-full max-w-[390px] mx-auto">
        <Link href="/" className="text-[#ff9066] font-headline font-black text-lg tracking-tight">SweatSheet</Link>
        <div className="flex-1" />
        {data && (
          <span className="text-[#a48b83] text-sm font-bold">@{data.username}</span>
        )}
      </header>

      {!loading && data && !isEmpty && (
        <div className="max-w-[390px] mx-auto px-6 pt-2 pb-2">
          <h1 className="font-headline text-xl font-black text-[#e5e2e1] tracking-tight">
            {formatDate(data.date)}
          </h1>
        </div>
      )}

      <main className="max-w-[390px] mx-auto px-4 pb-16 pt-4">
        {loading ? (
          <div className="flex justify-center pt-20">
            <div className="w-6 h-6 border-2 border-[#ff9066]/30 border-t-[#ff9066] rounded-full animate-spin" />
          </div>
        ) : notFound ? (
          <p className="text-center text-[#a48b83] pt-20">This share link is invalid or has been revoked</p>
        ) : isEmpty ? (
          <p className="text-center text-[#a48b83] pt-20">No workout recorded for this day</p>
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
                      <span className="text-[#a48b83] text-xs font-bold font-mono">{displayTime}</span>
                      <div className="flex-1 h-px bg-[#201f1f]" />
                    </div>
                  )}

                  <div className="space-y-3">
                    {sess.cardio.map((c, i) => {
                      const cTime = formatTime(c.started_at)
                      return (
                        <div key={i} className="rounded-2xl bg-[#131313] border border-[#201f1f] p-4">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <span className="bg-[#4bdece]/20 text-[#4bdece] text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full">Cardio</span>
                              {cTime && <span className="text-[#a48b83] text-xs font-mono">{cTime}</span>}
                            </div>
                            <span className="text-[#e5e2e1] font-headline font-bold text-base">{c.activity}</span>
                          </div>
                          <div className="grid grid-cols-3 gap-3">
                            {c.distance && Number(c.distance) > 0 && (
                              <div>
                                <p className="text-[#a48b83] text-[10px] font-bold uppercase tracking-widest mb-1">Distance</p>
                                <p className="font-headline font-bold text-lg text-[#e5e2e1]">{Number(c.distance).toFixed(1)} km</p>
                              </div>
                            )}
                            {c.pace && (
                              <div>
                                <p className="text-[#a48b83] text-[10px] font-bold uppercase tracking-widest mb-1">Pace</p>
                                <p className="font-headline font-bold text-lg text-[#e5e2e1]">{c.pace}/km</p>
                              </div>
                            )}
                            {c.duration && (
                              <div>
                                <p className="text-[#a48b83] text-[10px] font-bold uppercase tracking-widest mb-1">Time</p>
                                <p className="font-headline font-bold text-lg text-[#e5e2e1]">{c.duration}</p>
                              </div>
                            )}
                            {c.heart_rate && (
                              <div>
                                <p className="text-[#a48b83] text-[10px] font-bold uppercase tracking-widest mb-1">HR Avg</p>
                                <p className="font-headline font-bold text-lg text-[#e5e2e1]">{c.heart_rate} bpm</p>
                              </div>
                            )}
                            {c.calories && (
                              <div>
                                <p className="text-[#a48b83] text-[10px] font-bold uppercase tracking-widest mb-1">Calories</p>
                                <p className="font-headline font-bold text-lg text-[#e5e2e1]">{c.calories} kcal</p>
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
                        <div key={i} className="rounded-2xl bg-[#131313] border border-[#201f1f] p-4">
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="bg-[#ff9066]/20 text-[#ff9066] text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full">Lift</span>
                                {exTime && <span className="text-[#a48b83] text-xs font-mono">{exTime}</span>}
                              </div>
                              <h3 className="font-headline font-bold text-base text-[#e5e2e1] mt-1">{g.exercise}</h3>
                            </div>
                            <div className="text-right">
                              <p className="text-[#a48b83] text-[10px] font-bold uppercase tracking-widest">Est. 1RM</p>
                              <p className="font-headline font-bold text-lg text-[#ff9066]">{max1RM} kg</p>
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
                                      <div className="flex-1 h-px bg-[#201f1f]" />
                                      <span className="text-[#a48b83]/60 text-[10px] font-mono">{rest}</span>
                                      <div className="flex-1 h-px bg-[#201f1f]" />
                                    </div>
                                  )}
                                  <div className="flex items-center justify-between bg-[#1c1b1b] rounded-xl px-3 py-2.5">
                                    <div className="flex items-center gap-3">
                                      <span className="text-[#a48b83] text-[10px] font-bold w-5 text-center">{j + 1}</span>
                                      <span className="text-[#e5e2e1] font-mono text-sm font-bold">{s.weight}kg × {s.reps}</span>
                                    </div>
                                    <span className="text-[#a48b83] text-xs">~{oneRM} kg 1RM</span>
                                  </div>
                                </div>
                              )
                            })}
                          </div>

                          <div className="flex justify-between mt-3 pt-3 border-t border-[#201f1f]/50">
                            <span className="text-[#a48b83] text-xs">{g.sets.length} sets · {g.sets.reduce((n, s) => n + s.reps, 0)} reps</span>
                            <span className="text-[#a48b83] text-xs font-bold">
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
        <Link href="/auth" className="text-[#a48b83] text-xs hover:text-[#e5e2e1] transition-colors">
          Log your own workouts on SweatSheet →
        </Link>
      </footer>
    </div>
  )
}
