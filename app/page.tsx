import BottomNav from '@/components/BottomNav'
import Link from 'next/link'

export default function TodayPage() {
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' }).toUpperCase()

  return (
    <main className="pb-24 px-4 pt-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <span className="font-headline font-black text-primary text-xl tracking-tight">SWEATSHEET</span>
        <div className="flex gap-3">
          <button className="material-symbols-outlined text-[#adaaaa]">search</button>
          <button className="material-symbols-outlined text-[#adaaaa]">account_circle</button>
        </div>
      </div>

      {/* Greeting */}
      <p className="text-xs text-[#adaaaa] mb-1">{today}</p>
      <h1 className="font-headline font-black text-4xl leading-tight mb-6">KEEP MOVING,<br />ALEX.</h1>

      {/* Start Workout CTA */}
      <Link
        href="/log"
        className="flex items-center justify-between w-full bg-primary text-black font-headline font-bold text-lg px-6 py-4 rounded-xl mb-6"
      >
        START WORKOUT
        <span className="material-symbols-outlined">arrow_forward</span>
      </Link>

      {/* Last Session */}
      <div className="bg-[#1a1919] rounded-xl p-4 mb-6">
        <div className="flex justify-between items-center mb-3">
          <span className="text-xs font-bold text-[#adaaaa] tracking-widest">LAST SESSION</span>
          <span className="text-xs text-[#adaaaa]">OCT 24</span>
        </div>
        <p className="font-headline font-bold text-xl text-primary mb-3">LEG DAY</p>
        <div className="flex gap-6">
          <div>
            <p className="text-2xl font-headline font-black">45<span className="text-sm font-body font-normal text-[#adaaaa]"> kg</span></p>
            <p className="text-xs text-[#adaaaa]">OLM AFTER</p>
          </div>
          <div>
            <p className="text-2xl font-headline font-black">12,000<span className="text-sm font-body font-normal text-[#adaaaa]"> kg</span></p>
            <p className="text-xs text-[#adaaaa]">TOTAL VOLUME</p>
          </div>
        </div>
      </div>

      {/* Muscle Volume */}
      <div className="mb-6">
        <p className="text-xs font-bold text-[#adaaaa] tracking-widest mb-3">MUSCLE VOLUME</p>
        {[
          { label: 'CHEST', pct: 80 },
          { label: 'BACK', pct: 60 },
          { label: 'LEGS', pct: 86 },
          { label: 'SHOULDERS', pct: 48 },
        ].map(({ label, pct }) => (
          <div key={label} className="flex items-center gap-3 mb-2">
            <span className="text-xs text-[#adaaaa] w-20">{label}</span>
            <div className="flex-1 h-1.5 bg-[#262626] rounded-full">
              <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs text-[#adaaaa] w-8 text-right">{pct}%</span>
          </div>
        ))}
      </div>

      {/* Recent PRs */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-3">
          <p className="text-xs font-bold text-[#adaaaa] tracking-widest">RECENT PRS</p>
          <button className="text-xs text-primary">VIEW ALL</button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[
            { exercise: 'BENCH PRESS', value: '100', unit: 'kg' },
            { exercise: 'BICEP', value: '150', unit: 'kg' },
          ].map(pr => (
            <div key={pr.exercise} className="bg-[#1a1919] rounded-xl p-4">
              <p className="text-[10px] text-[#adaaaa] mb-2">{pr.exercise}</p>
              <p className="font-headline font-black text-2xl">{pr.value}<span className="text-sm font-normal font-body text-[#adaaaa]"> {pr.unit}</span></p>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Adjust Weight */}
      <div className="mb-6">
        <p className="text-xs font-bold text-[#adaaaa] tracking-widest mb-3">QUICK ADJUST WEIGHT</p>
        <div className="bg-[#1a1919] rounded-xl p-4 flex items-center justify-between">
          <button className="w-10 h-10 bg-[#262626] rounded-full flex items-center justify-center text-xl font-bold">−</button>
          <div className="text-center">
            <p className="font-headline font-black text-4xl">80</p>
            <p className="text-xs text-[#adaaaa]">KILOGRAMS</p>
          </div>
          <button className="w-10 h-10 bg-primary rounded-full flex items-center justify-center text-black text-xl font-bold">+</button>
        </div>
      </div>

      <BottomNav />
    </main>
  )
}
