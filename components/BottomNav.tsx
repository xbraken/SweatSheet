'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const tabs = [
  { href: '/',         icon: 'calendar_today',  label: 'Today' },
  { href: '/log',      icon: 'edit_note',       label: 'Log' },
  { href: '/progress', icon: 'insights',        label: 'Progress' },
  { href: '/upload',   icon: 'cloud_upload',    label: 'Upload' },
]

export default function BottomNav() {
  const path = usePathname()
  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[390px] z-50 flex justify-around items-center px-4 pb-8 pt-4 bg-[#131313]/60 backdrop-blur-xl shadow-[0_-4px_24px_rgba(0,0,0,0.4)]">
      {tabs.map(tab => {
        const active = path === tab.href
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex flex-col items-center justify-center transition-all ${active ? 'text-[#ff9066] scale-110' : 'text-[#e5e2e1]/40'}`}
          >
            <span
              className="material-symbols-outlined mb-1"
              style={{ fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0" }}
            >
              {tab.icon}
            </span>
            <span className="text-[10px] font-bold font-label uppercase tracking-widest">{tab.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
