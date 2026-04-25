'use client'

import { useMemo, useState } from 'react'
import { EXERCISES, CATEGORIES, type ExerciseCategory, type ExerciseType } from '@/lib/exercises'

export type ExerciseHint = { exercise: string; last_weight: number; last_reps: number; last_date?: string }
export type ExercisePR = { exercise: string; pr_weight: number; pr_reps: number; pr_duration: number | null; pr_volume: number; pr_reps_total: number; pr_duration_total: number | null; pr_e1rm: number | null }

export default function ExercisePicker({
  hints, starred, prs, isLbs, onSelect, onToggleStar, onClose, exerciseType, multiSelect, onMultiSelect, restrictTo,
}: {
  hints: ExerciseHint[]
  starred: Set<string>
  prs?: Map<string, ExercisePR>
  isLbs?: boolean
  onSelect: (name: string, hint?: ExerciseHint) => void
  onToggleStar: (name: string) => void
  onClose: () => void
  exerciseType?: ExerciseType
  multiSelect?: boolean
  onMultiSelect?: (names: string[]) => void
  restrictTo?: string[]
}) {
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState<ExerciseCategory | null>(null)
  const [selected, setSelected] = useState<string[]>([])

  const restrictSet = useMemo(() => restrictTo ? new Set(restrictTo) : null, [restrictTo])

  const hintMap = useMemo(() => {
    const m = new Map<string, ExerciseHint>()
    for (const h of hints) m.set(h.exercise, h)
    return m
  }, [hints])

  const weightLabel = isLbs ? 'lbs' : 'kg'
  const toDisplay = (kg: number) => isLbs ? Math.round(kg * 2.20462 * 10) / 10 : kg

  const relTime = (dateStr?: string) => {
    if (!dateStr) return null
    const days = Math.floor((Date.now() - new Date(dateStr + 'T00:00:00').getTime()) / 86400000)
    if (days <= 0) return 'today'
    if (days === 1) return 'yesterday'
    if (days < 7) return `${days}d ago`
    if (days < 30) return `${Math.floor(days / 7)}w ago`
    if (days < 365) return `${Math.floor(days / 30)}mo ago`
    return `${Math.floor(days / 365)}y ago`
  }

  const recents = useMemo(() => {
    return [...hints]
      .filter(h => h.last_date && !starred.has(h.exercise)
        && (!restrictSet || restrictSet.has(h.exercise))
        && (!exerciseType || EXERCISES.find(e => e.name === h.exercise)?.type === exerciseType))
      .sort((a, b) => (b.last_date ?? '').localeCompare(a.last_date ?? ''))
      .slice(0, 5)
      .map(h => h.exercise)
  }, [hints, exerciseType, starred, restrictSet])

  const q = search.toLowerCase()
  const filtered = useMemo(() => {
    let list = EXERCISES
    if (restrictSet) list = list.filter(e => restrictSet.has(e.name))
    if (exerciseType) list = list.filter(e => e.type === exerciseType)
    if (filterCat) list = list.filter(e => e.category === filterCat)
    if (q) list = list.filter(e => e.name.toLowerCase().includes(q))
    return list
  }, [q, filterCat, exerciseType, restrictSet])

  const availableCategories = useMemo(() => {
    let pool = EXERCISES
    if (restrictSet) pool = pool.filter(e => restrictSet.has(e.name))
    if (exerciseType) pool = pool.filter(e => e.type === exerciseType)
    return CATEGORIES.filter(cat => pool.some(e => e.category === cat))
  }, [exerciseType, restrictSet])

  const starredList = useMemo(() => filtered.filter(e => starred.has(e.name)), [filtered, starred])
  const recentSet = useMemo(() => new Set(recents), [recents])
  const showRecents = !search && !filterCat && recents.length > 0
  const unstarredList = useMemo(
    () => filtered.filter(e => !starred.has(e.name) && !(showRecents && recentSet.has(e.name))),
    [filtered, starred, recentSet, showRecents]
  )

  const renderRow = (name: string) => {
    const hint = hintMap.get(name)
    const pr = prs?.get(name)
    const isStarred = starred.has(name)
    const isSelected = multiSelect && selected.includes(name)
    const selIdx = multiSelect ? selected.indexOf(name) : -1
    return (
      <div key={name} className="flex items-center">
        <button
          onClick={() => {
            if (multiSelect) {
              setSelected(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name])
            } else {
              onSelect(name, hint)
            }
          }}
          className={`flex-1 flex items-center justify-between py-3 px-4 hover:bg-[#2a2a2a] active:bg-[#353534] transition-colors text-left rounded-xl ${isSelected ? 'bg-[#ff9066]/10' : ''}`}
        >
          <div className="flex items-center gap-3">
            {multiSelect && (
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center text-[10px] font-bold shrink-0 transition-colors ${isSelected ? 'bg-[#ff9066] border-[#ff9066] text-[#752805]' : 'border-[#56423c]'}`}>
                {isSelected && selIdx + 1}
              </div>
            )}
            <span className="font-body text-sm text-[#e5e2e1]">{name}</span>
          </div>
          {!multiSelect && (pr || hint) && <span className="text-[10px] text-[#a48b83] text-right shrink-0">{
            (() => {
              const ex = EXERCISES.find(e => e.name === name)
              const rel = relTime(hint?.last_date)
              const sub = rel ? <span className="block text-[#56423c]">{rel}</span> : null
              if (pr && pr.pr_weight > 0) {
                let main = ''
                if (ex?.type === 'timed') { const d = pr.pr_duration ?? 0; main = `${Math.floor(d / 60)}:${String(d % 60).padStart(2, '0')} PR` }
                else if (ex?.type === 'bodyweight') main = pr.pr_weight > 0 ? `${toDisplay(pr.pr_weight)} ${weightLabel} × ${pr.pr_reps} PR` : `${pr.pr_reps} reps PR`
                else main = `${toDisplay(pr.pr_weight)} ${weightLabel} × ${pr.pr_reps} PR`
                return <>{main}{sub}</>
              }
              if (hint) {
                let main = ''
                if (ex?.type === 'timed') main = `${Math.floor(hint.last_reps / 60)}:${String(hint.last_reps % 60).padStart(2, '0')}`
                else if (ex?.type === 'bodyweight') main = hint.last_weight > 0 ? `${toDisplay(hint.last_weight)} ${weightLabel} × ${hint.last_reps}` : `${hint.last_reps} reps`
                else main = `${toDisplay(hint.last_weight)} ${weightLabel} × ${hint.last_reps}`
                return <>{main}{sub}</>
              }
            })()
          }</span>}
        </button>
        {!multiSelect && (
          <button onClick={() => onToggleStar(name)} className="p-2 shrink-0">
            <span
              className={`material-symbols-outlined text-lg ${isStarred ? 'text-[#ff9066]' : 'text-[#56423c]'}`}
              style={{ fontVariationSettings: isStarred ? "'FILL' 1" : "'FILL' 0" }}
            >star</span>
          </button>
        )}
      </div>
    )
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 top-12 md:top-0 md:left-56 z-50 bg-[#131313] rounded-t-3xl md:rounded-none flex flex-col overflow-hidden animate-slide-up">
        <div className="px-5 pt-5 pb-3 border-b border-[#201f1f]">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-headline text-lg font-bold">Choose exercise</h2>
            <button onClick={onClose}><span className="material-symbols-outlined text-[#a48b83]">close</span></button>
          </div>
          <div className="flex items-center gap-2 bg-[#201f1f] rounded-xl px-3 py-2.5">
            <span className="material-symbols-outlined text-[#a48b83] text-lg">search</span>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search exercises…"
              className="flex-1 bg-transparent outline-none text-sm text-[#e5e2e1] placeholder:text-[#56423c]"
            />
            {search && <button onClick={() => setSearch('')}><span className="material-symbols-outlined text-[#a48b83] text-sm">close</span></button>}
          </div>
          {availableCategories.length > 0 && (
            <div className="flex gap-1.5 mt-3 overflow-x-auto no-scrollbar">
              <button
                onClick={() => setFilterCat(null)}
                className={`px-3 py-1.5 rounded-full text-[10px] font-bold font-label uppercase tracking-widest whitespace-nowrap transition-colors ${!filterCat ? 'bg-[#ff9066] text-[#752805]' : 'bg-[#201f1f] text-[#a48b83]'}`}
              >All</button>
              {availableCategories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setFilterCat(filterCat === cat ? null : cat)}
                  className={`px-3 py-1.5 rounded-full text-[10px] font-bold font-label uppercase tracking-widest whitespace-nowrap transition-colors ${filterCat === cat ? 'bg-[#ff9066] text-[#752805]' : 'bg-[#201f1f] text-[#a48b83]'}`}
                >{cat}</button>
              ))}
            </div>
          )}
        </div>
        <div className={`flex-1 overflow-y-auto px-2 ${multiSelect && selected.length > 0 ? 'pb-24' : 'pb-32 md:pb-8'}`}>
          {!search && !filterCat && recents.length > 0 && (
            <>
              <p className="text-[10px] font-bold font-label uppercase tracking-widest text-[#a48b83] px-4 pt-4 pb-1">Recent</p>
              {recents.map(name => renderRow(name))}
              {(starredList.length > 0 || unstarredList.length > 0) && <div className="mx-4 my-2 border-t border-[#201f1f]" />}
            </>
          )}
          {starredList.length > 0 && (
            <>
              <p className="text-[10px] font-bold font-label uppercase tracking-widest text-[#ff9066] px-4 pt-4 pb-1">Starred</p>
              {starredList.map(e => renderRow(e.name))}
            </>
          )}
          {unstarredList.length > 0 && (
            <>
              {starredList.length > 0 && <div className="mx-4 my-2 border-t border-[#201f1f]" />}
              {!search && !filterCat
                ? CATEGORIES.filter(cat => unstarredList.some(e => e.category === cat)).map(cat => (
                    <div key={cat}>
                      <p className="text-[10px] font-bold font-label uppercase tracking-widest text-[#a48b83] px-4 pt-4 pb-1">{cat}</p>
                      {unstarredList.filter(e => e.category === cat).map(e => renderRow(e.name))}
                    </div>
                  ))
                : unstarredList.map(e => renderRow(e.name))
              }
            </>
          )}
          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <span className="material-symbols-outlined text-4xl text-[#353534] mb-3">search_off</span>
              <p className="text-sm text-[#a48b83]">No exercises match &ldquo;{search}&rdquo;</p>
            </div>
          )}
        </div>
        {multiSelect && selected.length > 0 && (
          <div className="absolute bottom-0 inset-x-0 p-4 bg-gradient-to-t from-[#131313] via-[#131313] to-transparent pt-8">
            <button
              onClick={() => { onMultiSelect?.(selected); onClose() }}
              className="w-full py-4 bg-[#ff9066] text-[#752805] rounded-2xl font-headline font-bold text-sm active:scale-95 transition-transform"
            >
              Add {selected.length} exercise{selected.length !== 1 ? 's' : ''}
            </button>
          </div>
        )}
      </div>
    </>
  )
}
