'use client'
import { useState } from 'react'

const ONBOARDING_KEY = 'ss_onboarded'

const steps = [
  {
    icon: 'edit_note',
    color: '#ff9066',
    title: 'Log your workouts',
    body: 'Tap the + button to log lifts, bodyweight exercises, timed sets, or cardio. Your history builds up automatically.',
  },
  {
    icon: 'assignment',
    color: '#ff9066',
    title: 'Build routines',
    body: 'Create routines and the app will walk you through each exercise in order — no more forgetting what comes next.',
  },
  {
    icon: 'replay',
    color: '#4bdece',
    title: 'Repeat last session',
    body: 'Hit the replay icon on the log screen to instantly pick up from where you left off in your previous workout.',
  },
  {
    icon: 'self_improvement',
    color: '#4bdece',
    title: 'Connect Strava',
    body: 'Link your Strava account in Settings and runs, rides, and walks will sync automatically after every activity.',
  },
  {
    icon: 'group',
    color: '#ff9066',
    title: 'Follow friends',
    body: 'Check the Friends tab to see what your mates have been up to. Find them by username and follow to see their feed.',
  },
]

export function shouldShowOnboarding() {
  if (typeof window === 'undefined') return false
  return !localStorage.getItem(ONBOARDING_KEY)
}

export function markOnboarded() {
  localStorage.setItem(ONBOARDING_KEY, '1')
}

export default function Onboarding({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0)
  const current = steps[step]
  const isLast = step === steps.length - 1

  const finish = () => {
    markOnboarded()
    onDone()
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100]" />
      <div className="fixed inset-x-0 bottom-0 max-w-[390px] mx-auto z-[101] bg-[#181818] rounded-t-3xl px-6 pt-8 pb-[calc(env(safe-area-inset-bottom,0px)+32px)] animate-slide-up">
        {/* Step dots */}
        <div className="flex justify-center gap-1.5 mb-8">
          {steps.map((_, i) => (
            <div key={i} className="h-1 rounded-full transition-all"
              style={{ width: i === step ? 24 : 8, backgroundColor: i === step ? current.color : '#353534' }} />
          ))}
        </div>

        {/* Icon */}
        <div className="flex justify-center mb-6">
          <div className="w-20 h-20 rounded-3xl flex items-center justify-center"
            style={{ backgroundColor: `${current.color}18` }}>
            <span className="material-symbols-outlined text-4xl" style={{ color: current.color, fontVariationSettings: "'FILL' 1" }}>
              {current.icon}
            </span>
          </div>
        </div>

        {/* Text */}
        <h2 className="font-headline text-2xl font-black text-[#e5e2e1] text-center mb-3">{current.title}</h2>
        <p className="text-[#a48b83] text-sm text-center leading-relaxed mb-10">{current.body}</p>

        {/* Actions */}
        <button
          onClick={isLast ? finish : () => setStep(s => s + 1)}
          className="w-full py-4 rounded-2xl font-headline font-bold text-sm active:scale-95 transition-transform"
          style={{ backgroundColor: current.color, color: current.color === '#ff9066' ? '#752805' : '#003732' }}
        >
          {isLast ? "Let's go!" : 'Next'}
        </button>
        {!isLast && (
          <button onClick={finish} className="w-full py-3 text-[#56423c] text-sm font-bold text-center mt-1">
            Skip
          </button>
        )}
      </div>
    </>
  )
}
