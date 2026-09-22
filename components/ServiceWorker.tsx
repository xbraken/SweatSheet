'use client'
import { useEffect } from 'react'

export default function ServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    if (process.env.NODE_ENV !== 'production') return
    navigator.serviceWorker.register('/sw.js').catch(() => { /* unsupported / private mode */ })
  }, [])
  return null
}
