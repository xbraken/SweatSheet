'use client'
import { useEffect, useState, useTransition } from 'react'
import { usePathname } from 'next/navigation'

export default function NavigationProgress() {
  const pathname = usePathname()
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    setLoading(false)
    setProgress(0)
  }, [pathname])

  useEffect(() => {
    // Intercept link clicks to show progress bar
    const handleClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest('a')
      if (!anchor) return
      const href = anchor.getAttribute('href')
      if (!href || href.startsWith('http') || href.startsWith('#') || href === pathname) return
      setLoading(true)
      setProgress(20)
    }

    document.addEventListener('click', handleClick, true)
    return () => document.removeEventListener('click', handleClick, true)
  }, [pathname])

  useEffect(() => {
    if (!loading) return
    const t1 = setTimeout(() => setProgress(50), 150)
    const t2 = setTimeout(() => setProgress(75), 400)
    const t3 = setTimeout(() => setProgress(90), 800)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [loading])

  if (!loading) return null

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] h-[3px]">
      <div
        className="h-full bg-gradient-to-r from-[#ff9066] to-[#ffb899] transition-all duration-300 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  )
}
