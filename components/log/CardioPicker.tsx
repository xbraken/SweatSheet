'use client'
import { useEffect, useRef, useState } from 'react'

// ── Cardio type picker sheet ──────────────────────────────────────────────────
export default function CardioPicker({ onSelect, onClose }: {
  onSelect: (activity: string) => void
  onClose: () => void
}) {
  const options = [
    { label: 'Run', icon: 'directions_run' },
    { label: 'Walking', icon: 'directions_walk' },
    { label: 'Cycling', icon: 'directions_bike' },
    { label: 'Interval run', icon: 'directions_run' },
  ]
  const [customMode, setCustomMode] = useState(false)
  const [customName, setCustomName] = useState('')
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

    const onTouchStart = (e: TouchEvent) => {
      dragY.current = e.touches[0].clientY
      dragDelta.current = 0
    }
    const onTouchMove = (e: TouchEvent) => {
      const delta = e.touches[0].clientY - dragY.current
      if (delta > 0) {
        e.preventDefault()
        dragDelta.current = delta
        setSheetY(delta, false)
      }
    }
    const onTouchEnd = () => {
      if (dragDelta.current > 80) {
        setSheetY(window.innerHeight, true)
        setTimeout(onClose, 300)
      } else {
        setSheetY(0, true)
      }
      dragDelta.current = 0
    }

    handle.addEventListener('touchstart', onTouchStart)
    handle.addEventListener('touchmove', onTouchMove, { passive: false })
    handle.addEventListener('touchend', onTouchEnd)
    return () => {
      handle.removeEventListener('touchstart', onTouchStart)
      handle.removeEventListener('touchmove', onTouchMove)
      handle.removeEventListener('touchend', onTouchEnd)
    }
  }, [onClose])

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={sheetRef}
        className="fixed inset-x-0 bottom-0 max-w-[390px] mx-auto z-50 bg-surface-sheet rounded-t-3xl px-5 pt-5 pb-[calc(env(safe-area-inset-bottom,0px)+24px)] shadow-2xl overflow-y-auto max-h-[85vh] animate-slide-up"
      >
        <div ref={handleRef} className="w-full flex justify-center py-5 mb-2 cursor-grab active:cursor-grabbing" style={{ touchAction: 'none' }}>
          <div className="w-10 h-1 bg-surface-container-highest rounded-full" />
        </div>
        <p className="text-[10px] font-bold font-label uppercase tracking-widest text-outline mb-4">Select activity</p>
        <div className="flex flex-col gap-3">
          {options.map(o => (
            <button
              key={o.label}
              onClick={() => { onSelect(o.label); onClose() }}
              className="flex items-center gap-4 p-4 bg-surface-container rounded-2xl active:scale-95 transition-all text-left"
            >
              <div className="w-10 h-10 rounded-xl bg-tertiary/10 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-tertiary">{o.icon}</span>
              </div>
              <span className="font-headline font-bold text-on-surface">{o.label}</span>
            </button>
          ))}
          {customMode ? (
            <div className="flex items-center gap-2 p-4 bg-surface-container rounded-2xl">
              <div className="w-10 h-10 rounded-xl bg-tertiary/10 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-tertiary">sports</span>
              </div>
              <input
                autoFocus
                type="text"
                placeholder="e.g. SkiErg, Rowing…"
                value={customName}
                onChange={e => setCustomName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && customName.trim()) { onSelect(customName.trim()); onClose() } }}
                className="flex-1 bg-transparent font-headline font-bold text-on-surface outline-none placeholder:text-outline-variant"
              />
              {customName.trim() && (
                <button
                  onClick={() => { onSelect(customName.trim()); onClose() }}
                  className="text-tertiary active:opacity-60"
                >
                  <span className="material-symbols-outlined">arrow_forward</span>
                </button>
              )}
            </div>
          ) : (
            <button
              onClick={() => setCustomMode(true)}
              className="flex items-center gap-4 p-4 bg-surface-container rounded-2xl active:scale-95 transition-all text-left"
            >
              <div className="w-10 h-10 rounded-xl bg-tertiary/10 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-tertiary">add</span>
              </div>
              <span className="font-headline font-bold text-on-surface">Custom</span>
            </button>
          )}
        </div>
      </div>
    </>
  )
}
