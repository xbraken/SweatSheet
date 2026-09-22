'use client'
import { useEffect, useRef } from 'react'

// ── Workout Type Picker Sheet ────────────────────────────────────────────────
export default function WorkoutTypePicker({ onSelect, onRoutine, onPlanToday, onClose }: {
  onSelect: (type: 'weights' | 'bodyweight' | 'timed' | 'cardio') => void
  onRoutine: () => void
  onPlanToday: () => void
  onClose: () => void
}) {
  const options: { label: string; value: 'weights' | 'bodyweight' | 'timed' | 'cardio'; icon: string; color: string; bgColor: string }[] = [
    { label: 'Weights', value: 'weights', icon: 'fitness_center', color: '#ff9066', bgColor: 'rgba(255,144,102,0.1)' },
    { label: 'Bodyweight', value: 'bodyweight', icon: 'accessibility_new', color: '#ff9066', bgColor: 'rgba(255,144,102,0.1)' },
    { label: 'Timed', value: 'timed', icon: 'timer', color: '#ff9066', bgColor: 'rgba(255,144,102,0.1)' },
    { label: 'Cardio', value: 'cardio', icon: 'directions_run', color: '#4bdece', bgColor: 'rgba(75,222,206,0.1)' },
  ]
  const dragY = useRef(0)
  const dragDelta = useRef(0)
  const sheetRef = useRef<HTMLDivElement>(null)
  const handleRef = useRef<HTMLDivElement>(null)

  function setSheetY(y: number, animated: boolean) {
    const el = sheetRef.current
    if (!el) return
    el.style.animation = 'none'
    el.style.transition = animated ? 'transform 0.3s ease' : 'none'
    el.style.transform = `translateY(${y}px)`
  }

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  useEffect(() => {
    const handle = handleRef.current
    if (!handle) return
    const onTouchStart = (e: TouchEvent) => { dragY.current = e.touches[0].clientY; dragDelta.current = 0 }
    const onTouchMove = (e: TouchEvent) => {
      const delta = e.touches[0].clientY - dragY.current
      if (delta > 0) { e.preventDefault(); dragDelta.current = delta; setSheetY(delta, false) }
    }
    const onTouchEnd = () => {
      if (dragDelta.current > 80) { setSheetY(window.innerHeight, true); setTimeout(onClose, 300) }
      else { setSheetY(0, true) }
      dragDelta.current = 0
    }
    handle.addEventListener('touchstart', onTouchStart)
    handle.addEventListener('touchmove', onTouchMove, { passive: false })
    handle.addEventListener('touchend', onTouchEnd)
    return () => { handle.removeEventListener('touchstart', onTouchStart); handle.removeEventListener('touchmove', onTouchMove); handle.removeEventListener('touchend', onTouchEnd) }
  }, [onClose])

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={sheetRef}
        className="fixed inset-x-0 bottom-0 max-w-[390px] mx-auto z-50 bg-surface-sheet rounded-t-3xl px-5 pt-5 pb-[calc(env(safe-area-inset-bottom,0px)+24px)] shadow-2xl animate-slide-up"
      >
        <div ref={handleRef} className="w-full flex justify-center py-5 mb-2 cursor-grab active:cursor-grabbing" style={{ touchAction: 'none' }}>
          <div className="w-10 h-1 bg-surface-container-highest rounded-full" />
        </div>
        <p className="text-[10px] font-bold font-label uppercase tracking-widest text-outline mb-4">What are you logging?</p>
        <div className="grid grid-cols-2 gap-3">
          {options.map(o => (
            <button
              key={o.value}
              onClick={() => { onSelect(o.value); onClose() }}
              className="flex flex-col items-center gap-3 p-5 bg-surface-container rounded-2xl active:scale-95 transition-all"
            >
              <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: o.bgColor }}>
                <span className="material-symbols-outlined text-2xl" style={{ color: o.color }}>{o.icon}</span>
              </div>
              <span className="font-headline font-bold text-sm text-on-surface">{o.label}</span>
            </button>
          ))}
        </div>
        <button
          onClick={() => { onRoutine(); onClose() }}
          className="mt-3 w-full flex items-center justify-center gap-2 p-4 bg-surface-container rounded-2xl active:scale-95 transition-all border border-dashed border-surface-container-highest"
        >
          <span className="material-symbols-outlined text-xl text-primary-container">assignment</span>
          <span className="font-headline font-bold text-sm text-on-surface-variant">Use a routine</span>
        </button>
        <button
          onClick={() => { onPlanToday(); onClose() }}
          className="mt-2 w-full flex items-center justify-center gap-2 p-4 bg-surface-container rounded-2xl active:scale-95 transition-all border border-dashed border-surface-container-highest"
        >
          <span className="material-symbols-outlined text-xl text-primary-container">edit_note</span>
          <span className="font-headline font-bold text-sm text-on-surface-variant">Plan today&apos;s session</span>
        </button>
      </div>
    </>
  )
}
