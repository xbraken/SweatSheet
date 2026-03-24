'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const tabs = [
  { href: '/',          icon: 'today',        label: 'Today' },
  { href: '/log',       icon: 'fitness_center', label: 'Log' },
  { href: '/progress',  icon: 'trending_up',  label: 'Progress' },
  { href: '/upload',    icon: 'upload',       label: 'Upload' },
]

export default function BottomNav() {
  const path = usePathname()

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[390px] bg-[#131313] border-t border-[#262626] flex z-50">
      {tabs.map(tab => {
        const active = path === tab.href
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className="flex-1 flex flex-col items-center justify-center py-3 gap-1"
          >
            <span
              className={`material-symbols-outlined text-2xl transition-colors ${active ? 'text-primary' : 'text-[#adaaaa]'}`}
              style={{ fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0" }}
            >
              {tab.icon}
            </span>
            <span className={`text-[10px] font-medium transition-colors ${active ? 'text-primary' : 'text-[#adaaaa]'}`}>
              {tab.label}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
