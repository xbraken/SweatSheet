'use client'
import { useEffect, useState } from 'react'

type Tone = 'info' | 'success' | 'error' | 'pr'
type ToastItem = { id: number; message: string; tone: Tone; icon?: string }

const EVENT = 'ss-toast'

/** Show a toast from anywhere on the client. Replaces alert(). */
export function toast(message: string, opts: { tone?: Tone; icon?: string } = {}) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { message, tone: opts.tone ?? 'info', icon: opts.icon } }))
}

const TONE_CLASSES: Record<Tone, string> = {
  info: 'bg-surface-container-high text-on-surface',
  success: 'bg-tertiary text-on-tertiary',
  error: 'bg-error-container text-on-surface',
  pr: 'bg-primary-container text-on-primary-container',
}
const TONE_ICONS: Record<Tone, string> = { info: 'info', success: 'check_circle', error: 'error', pr: 'emoji_events' }

export default function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([])

  useEffect(() => {
    let nextId = 1
    const onToast = (e: Event) => {
      const { message, tone, icon } = (e as CustomEvent).detail as Omit<ToastItem, 'id'>
      const id = nextId++
      setItems(prev => [...prev.slice(-2), { id, message, tone, icon }])
      setTimeout(() => setItems(prev => prev.filter(t => t.id !== id)), tone === 'error' ? 6000 : 4000)
    }
    window.addEventListener(EVENT, onToast)
    return () => window.removeEventListener(EVENT, onToast)
  }, [])

  if (items.length === 0) return null
  return (
    <div className="fixed bottom-32 md:bottom-8 left-1/2 -translate-x-1/2 z-[90] flex flex-col items-center gap-2 w-[calc(100%-32px)] max-w-[358px] pointer-events-none">
      {items.map(t => (
        <div
          key={t.id}
          role="status"
          onClick={() => setItems(prev => prev.filter(x => x.id !== t.id))}
          className={`pointer-events-auto px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2 font-headline font-bold text-sm animate-slide-up ${TONE_CLASSES[t.tone]}`}
        >
          <span className="material-symbols-outlined text-lg shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>{t.icon ?? TONE_ICONS[t.tone]}</span>
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  )
}
