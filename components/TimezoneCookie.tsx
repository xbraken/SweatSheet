'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { TZ_COOKIE } from '@/lib/dates'

/** Stores the browser's timezone in a cookie so server components can compute "today" correctly */
export default function TimezoneCookie() {
  const router = useRouter()
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (!tz) return
    const current = document.cookie.split('; ').find(c => c.startsWith(`${TZ_COOKIE}=`))?.split('=')[1]
    if (current && decodeURIComponent(current) === tz) return
    document.cookie = `${TZ_COOKIE}=${encodeURIComponent(tz)}; path=/; max-age=31536000; samesite=lax`
    // First visit (or the user travelled) — re-render server components with the right day
    router.refresh()
  }, [router])
  return null
}
