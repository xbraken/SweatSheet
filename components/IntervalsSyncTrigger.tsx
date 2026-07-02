'use client'
import { useEffect } from 'react'

const THROTTLE_MS = 5 * 60 * 1000 // avoid hammering Intervals.icu on rapid nav between Today/Log
const STORAGE_KEY = 'intervals_last_sync_trigger'

// Fires a background sync on mount so opening Today/Log picks up recent
// Intervals.icu activities without waiting on the cron. Fire-and-forget —
// failures are silent since the cron is still the fallback.
export function useIntervalsSyncTrigger() {
  useEffect(() => {
    const last = Number(localStorage.getItem(STORAGE_KEY) || 0)
    if (Date.now() - last < THROTTLE_MS) return
    localStorage.setItem(STORAGE_KEY, String(Date.now()))

    fetch('/api/intervals/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lookbackDays: 3 }),
    }).catch(() => {})
  }, [])
}

// Convenience wrapper for server-component pages (e.g. Today) that can't call hooks directly
export default function IntervalsSyncTrigger() {
  useIntervalsSyncTrigger()
  return null
}
