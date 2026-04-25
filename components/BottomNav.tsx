'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

const tabs = [
  { href: '/',         icon: 'calendar_today', label: 'Today' },
  { href: '/log',      icon: 'edit_note',      label: 'Log' },
  { href: '/social',   icon: 'group',          label: 'Friends' },
  { href: '/progress', icon: 'insights',       label: 'Progress' },
  { href: '/account',  icon: 'person',         label: 'Profile' },
] as const

export default function BottomNav() {
  const path = usePathname()
  const [avatar, setAvatar] = useState<string | null>(null)

  useEffect(() => {
    const cached = localStorage.getItem('ss_avatar')
    if (cached) setAvatar(cached)
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const a = d?.avatar ?? null
        setAvatar(a)
        if (a) localStorage.setItem('ss_avatar', a)
        else localStorage.removeItem('ss_avatar')
      })
      .catch(() => {})
  }, [])

  const renderIcon = (tab: typeof tabs[number], active: boolean, sizePx: number) => {
    if (tab.href === '/account' && avatar) {
      return (
        <img
          src={avatar}
          alt="Profile"
          className={`rounded-full object-cover shrink-0 transition-all ${active ? 'ring-2 ring-[#ff9066]' : 'opacity-60'}`}
          style={{ width: sizePx, height: sizePx }}
        />
      )
    }
    return (
      <span
        className="material-symbols-outlined"
        style={{ fontSize: sizePx, fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0" }}
      >
        {tab.icon}
      </span>
    )
  }
  return (
    <>
      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[390px] z-30 bg-[#131313]/60 backdrop-blur-xl shadow-[0_-4px_24px_rgba(0,0,0,0.4)]">
        <div className="flex justify-around items-center px-2 pb-8 pt-4">
          {tabs.map(tab => {
            const active = path === tab.href || (tab.href !== '/' && path.startsWith(tab.href))
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex flex-col items-center justify-center transition-all active:scale-90 ${active ? 'text-[#ff9066] scale-110' : 'text-[#e5e2e1]/40'}`}
              >
                <div className="mb-1">{renderIcon(tab, active, 22)}</div>
                <span className="text-[9px] font-bold font-label uppercase tracking-widest">{tab.label}</span>
              </Link>
            )
          })}
        </div>
      </nav>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex fixed left-0 top-0 h-screen w-56 bg-[#131313] border-r border-[#201f1f] flex-col pt-8 pb-6 px-4 z-30">
        <div className="mb-10 px-3">
          <h1 className="font-headline text-xl font-black text-[#ff9066] tracking-tight">SweatSheet</h1>
        </div>
        <nav className="flex flex-col gap-1 flex-1">
          {tabs.map(tab => {
            const active = path === tab.href || (tab.href !== '/' && path.startsWith(tab.href))
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex items-center gap-3 px-3 py-3 rounded-xl transition-all ${
                  active
                    ? 'bg-[#ff9066]/10 text-[#ff9066]'
                    : 'text-[#e5e2e1]/50 hover:text-[#e5e2e1]/80 hover:bg-[#201f1f]'
                }`}
              >
                {renderIcon(tab, active, 22)}
                <span className="text-sm font-bold font-label">{tab.label}</span>
              </Link>
            )
          })}
        </nav>
        <Link
          href="/settings"
          className={`flex items-center gap-3 px-3 py-3 rounded-xl transition-all ${
            path === '/settings' ? 'bg-[#ff9066]/10 text-[#ff9066]' : 'text-[#e5e2e1]/50 hover:text-[#e5e2e1]/80 hover:bg-[#201f1f]'
          }`}
        >
          <span className="material-symbols-outlined text-[22px]" style={{ fontVariationSettings: path === '/settings' ? "'FILL' 1" : "'FILL' 0" }}>settings</span>
          <span className="text-sm font-bold font-label">Settings</span>
        </Link>
      </aside>
    </>
  )
}
