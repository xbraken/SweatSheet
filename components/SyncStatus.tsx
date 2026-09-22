'use client'
import { useEffect, useState } from 'react'
import { FLUSHED_EVENT, QUEUE_EVENT, flushQueue, pendingCount } from '@/lib/offline-queue'
import { toast } from '@/components/Toast'

/** Floating pill showing saves waiting for signal; retries them when back online */
export default function SyncStatus() {
  const [count, setCount] = useState(0)
  const [online, setOnline] = useState(true)

  useEffect(() => {
    setCount(pendingCount())
    setOnline(navigator.onLine)
    const onQueue = (e: Event) => setCount((e as CustomEvent<number>).detail)
    const onFlushed = (e: Event) => {
      const n = (e as CustomEvent<number>).detail
      toast(`Synced ${n} saved workout${n === 1 ? '' : 's'}`, { tone: 'success', icon: 'cloud_done' })
    }
    const onOnline = () => { setOnline(true); flushQueue() }
    const onOffline = () => setOnline(false)
    const onVisible = () => { if (document.visibilityState === 'visible') flushQueue() }

    window.addEventListener(QUEUE_EVENT, onQueue)
    window.addEventListener(FLUSHED_EVENT, onFlushed)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    document.addEventListener('visibilitychange', onVisible)
    flushQueue()
    // Safety net: navigator.onLine is unreliable on iOS, so retry periodically too
    const t = setInterval(() => { if (pendingCount() > 0) flushQueue() }, 30000)
    return () => {
      window.removeEventListener(QUEUE_EVENT, onQueue)
      window.removeEventListener(FLUSHED_EVENT, onFlushed)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(t)
    }
  }, [])

  if (count === 0 && online) return null
  return (
    <button
      onClick={() => flushQueue()}
      className="fixed top-[calc(env(safe-area-inset-top,0px)+8px)] left-1/2 -translate-x-1/2 z-[80] px-3 py-1.5 rounded-full bg-surface-container-high border border-surface-container-highest shadow-lg flex items-center gap-1.5 text-[11px] font-bold font-label text-on-surface-variant animate-fade-in"
    >
      <span className="material-symbols-outlined text-sm text-primary-container">{online ? 'cloud_sync' : 'cloud_off'}</span>
      {count > 0
        ? `${count} save${count === 1 ? '' : 's'} waiting for signal`
        : 'Offline'}
    </button>
  )
}
