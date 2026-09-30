'use client'
import { useEffect } from 'react'

export default function ServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    if (process.env.NODE_ENV !== 'production') {
      // A worker left over from a local production build would keep serving stale dev
      // chunks (their URLs aren't content-hashed), so remove it and its caches in dev.
      navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(r => r.unregister())).catch(() => {})
      caches?.keys().then(keys => keys.filter(k => k.startsWith('ss-')).forEach(k => caches.delete(k))).catch(() => {})
      return
    }
    navigator.serviceWorker.register('/sw.js').catch(() => { /* unsupported / private mode */ })
  }, [])
  return null
}
