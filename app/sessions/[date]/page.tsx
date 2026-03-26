'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import BottomNav from '@/components/BottomNav'

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
interface SessionData { date: string; sessions: SessionBlock[] }

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
  // Ensure UTC parsing — append Z if no timezone info present
  const normalized = ts.includes('T') || ts.includes('Z') ? ts : ts.replace(' ', 'T') + 'Z'
  return new Date(normalized).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

export default function SessionDetailPage({ params }: { params: Promise<{ date: string }> }) {
  const router = useRouter()
  const [date, setDate] = useState('')
  const [data, setData] = useState<SessionData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    params.then(p => {
      setDate(p.date)
      fetch(`/api/sessions/by-date/${p.date}`)
        .then(r => r.json())
        .then(setData)
        .finally(() => setLoading(false))
    })
  }, [params])

  const isEmpty = data && data.sessions.length === 0

  return (
    <>
      <header className="bg-[#0e0e0e]/80 backdrop-blur-xl sticky top-0 z-50 flex items-center gap-4 px-6 py-4 w-full max-w-[390px] mx-auto">
        <button onClick={() => router.back()} className="text-[#ffb9a0] hover:opacity-80 active:scale-95 transition-all">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h1 className="font-headline text-lg font-bold tracking-tight text-[#ffb9a0] truncate">
          {date ? formatDate(date) : '—'}
        </h1>
      </header>

      <main className="max-w-[390px] mx-auto px-4 pb-32 pt-4">
        {loading ? (
          <div className="flex justify-center pt-20">
            <div className="w-6 h-6 border-2 border-[#ff9066]/30 border-t-[#ff9066] rounded-full animate-spin" />
          </div>
        ) : isEmpty ? (
          <p className="text-center text-[#a48b83] pt-20">No workout recorded for this day</p>
        ) : (
          <div className="space-y-6">
            {data!.sessions.map((sess, si) => {
              const time = formatTime(sess.createdAt)
              // For cardio, prefer started_at if available for the time label
              const cardioTime = sess.cardio[0]?.started_at
                ? formatTime(sess.cardio[0].started_at)
                : null
              const displayTime = cardioTime ?? time

              return (
                <div key={sess.sessionId}>
                  {/* Session time header */}
                  {displayTime && (
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-[#a48b83] text-xs font-bold font-mono">{displayTime}</span>
                      <div className="flex-1 h-px bg-[#201f1f]" />
                    </div>
                  )}

                  <div className="space-y-3">
                    {/* Cardio blocks */}
                    {sess.cardio.map((c, i) => {
                      const cTime = formatTime(c.started_at)
                      // Show individual time only if multiple cardio in same session and they differ
                      const showCardioTime = sess.cardio.length > 1 && cTime && cTime !== displayTime
                      return (
                        <div key={i} className="rounded-2xl bg-[#131313] border border-[#201f1f] p-4">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <span className="bg-[#4bdece]/20 text-[#4bdece] text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full">Cardio</span>
                              <span className="text-[#e5e2e1] font-headline font-bold text-base">{c.activity}</span>
                            </div>
                            {showCardioTime && (
                              <span className="text-[#a48b83] text-xs font-mono">{cTime}</span>
                            )}
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

                    {/* Lift blocks */}
                    {sess.lifts.map((g, i) => {
                      const totalVol = g.sets.reduce((sum, s) => sum + s.weight * s.reps, 0)
                      const max1RM = Math.max(...g.sets.map(s => epley1RM(s.weight, s.reps)))
                      return (
                        <div key={i} className="rounded-2xl bg-[#131313] border border-[#201f1f] p-4">
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <span className="bg-[#ff9066]/20 text-[#ff9066] text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full">Lift</span>
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

      <BottomNav />
    </>
  )
}
