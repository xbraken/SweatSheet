'use client'
import { useEffect, useRef } from 'react'

// ── Swipeable card (swipe left to delete on mobile, X on desktop) ─────────────
const ACTION_W = 72

export default function SwipeableCard({ onDelete, className, children }: { onDelete: () => void; className?: string; children: React.ReactNode }) {
  const cardRef = useRef<HTMLDivElement>(null)
  const actionRef = useRef<HTMLDivElement>(null)
  const startX = useRef(0)
  const curX = useRef(0)   // current committed offset (0 or -ACTION_W when snapped open)
  const isOpen = useRef(false)
  const onDeleteRef = useRef(onDelete)
  onDeleteRef.current = onDelete

  // Direct DOM style — no React re-renders during drag
  const setX = (x: number, animated: boolean) => {
    const el = cardRef.current
    const ac = actionRef.current
    if (!el || !ac) return
    el.style.transition = animated ? 'transform 0.28s cubic-bezier(0.25,1,0.5,1)' : 'none'
    el.style.transform = `translateX(${x}px)`
    ac.style.opacity = String(Math.min(1, Math.abs(x) / ACTION_W))
  }

  useEffect(() => {
    const el = cardRef.current
    if (!el) return

    let startY = 0
    let locked: 'none' | 'h' | 'v' = 'none'

    const onStart = (e: TouchEvent) => {
      // Clear any lingering animation so inline transform takes effect
      el.style.animation = 'none'
      startX.current = e.touches[0].clientX
      startY = e.touches[0].clientY
      curX.current = isOpen.current ? -ACTION_W : 0
      locked = 'none'
      el.style.transition = 'none'
    }

    const onMove = (e: TouchEvent) => {
      const dx = e.touches[0].clientX - startX.current
      const dy = e.touches[0].clientY - startY

      // Determine gesture direction on first meaningful movement
      if (locked === 'none') {
        if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return
        locked = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v'
      }

      if (locked === 'v') return  // let the browser scroll

      // Horizontal — claim the gesture
      e.preventDefault()
      const total = dx + curX.current
      if (total >= 4) { setX(0, false); return }
      const abs = Math.abs(Math.min(0, total))
      const x = abs <= ACTION_W ? -abs : -(ACTION_W + (abs - ACTION_W) * 0.2)
      setX(x, false)
    }

    const onEnd = () => {
      if (locked !== 'h') return
      const matrix = new DOMMatrixReadOnly(cardRef.current?.style.transform || '')
      const abs = Math.abs(matrix.m41)

      if (abs >= ACTION_W + 44) {
        setX(-500, true)
        setTimeout(() => onDeleteRef.current(), 260)
      } else if (abs >= ACTION_W * 0.38) {
        isOpen.current = true
        setX(-ACTION_W, true)
      } else {
        isOpen.current = false
        setX(0, true)
      }
    }

    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })  // needs preventDefault
    el.addEventListener('touchend', onEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Split className: animation classes go on wrapper (so they don't override card transform),
  // visual classes (bg, rounded, padding) go on the card div that slides
  const animClasses = (className ?? '').split(' ').filter(c => c.startsWith('animate-'))
  const cardClasses = (className ?? '').split(' ').filter(c => !c.startsWith('animate-'))

  return (
    <div className={`relative rounded-2xl overflow-hidden ${animClasses.join(' ')}`}>
      <div ref={actionRef}
        className="absolute inset-y-0 right-0 flex items-center justify-center bg-red-500 rounded-2xl"
        style={{ width: ACTION_W, opacity: 0 }}
      >
        <button onClick={() => { setX(-500, true); setTimeout(() => onDeleteRef.current(), 260) }}
          className="w-full h-full flex items-center justify-center">
          <span className="material-symbols-outlined text-white" style={{ fontVariationSettings: "'FILL' 1" }}>delete</span>
        </button>
      </div>
      <div ref={cardRef} className={cardClasses.join(' ')} style={{ willChange: 'transform', touchAction: 'pan-y' }}>
        {children}
      </div>
    </div>
  )
}
