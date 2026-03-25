'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import BottomNav from '@/components/BottomNav'

export default function AccountPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [unitPref, setUnitPref] = useState<'metric' | 'imperial'>('metric')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/account').then(r => r.json()).then(data => {
      setUsername(data.username ?? '')
      setUnitPref(data.unit_pref === 'imperial' ? 'imperial' : 'metric')
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  async function savePrefs() {
    setSaving(true)
    await fetch('/api/account', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ unit_pref: unitPref }),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/auth')
    router.refresh()
  }

  if (loading) return (
    <main className="max-w-[390px] mx-auto min-h-screen flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-[#ff9066] border-t-transparent rounded-full animate-spin" />
    </main>
  )

  return (
    <main className="max-w-[390px] mx-auto min-h-screen pb-32 px-6 pt-12">
      <header className="mb-10">
        <h1 className="font-headline text-3xl font-black tracking-tight text-[#e5e2e1]">Account</h1>
        <p className="text-sm text-[#a48b83] mt-1">@{username}</p>
      </header>

      {/* Preferences */}
      <section className="flex flex-col gap-4 mb-8">
        <h3 className="font-headline text-sm font-bold text-[#a48b83] uppercase tracking-widest">Preferences</h3>

        <div className="bg-[#201f1f] rounded-2xl p-5">
          <p className="text-[10px] font-bold font-label uppercase tracking-widest text-[#a48b83] mb-3">Units</p>
          <div className="flex gap-2">
            {(['metric', 'imperial'] as const).map(u => (
              <button
                key={u}
                onClick={() => setUnitPref(u)}
                className={`flex-1 py-3 rounded-xl text-sm font-bold font-label transition-colors ${
                  unitPref === u
                    ? 'bg-[#ff9066] text-[#752805]'
                    : 'bg-[#2a2a2a] text-[#a48b83]'
                }`}
              >
                {u === 'metric' ? 'Metric (kg / km)' : 'Imperial (lbs / mi)'}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={savePrefs}
          disabled={saving}
          className="w-full py-4 bg-[#ff9066]/20 text-[#ff9066] rounded-2xl font-headline font-bold transition-colors disabled:opacity-50"
        >
          {saved ? '✓ Saved' : saving ? 'Saving…' : 'Save preferences'}
        </button>
      </section>

      {/* Danger zone */}
      <section className="flex flex-col gap-3">
        <h3 className="font-headline text-sm font-bold text-[#a48b83] uppercase tracking-widest">Account</h3>

        <button
          onClick={logout}
          className="w-full bg-[#201f1f] py-4 rounded-2xl flex items-center justify-center gap-2 font-headline font-bold text-[#e5e2e1] hover:bg-[#2a2a2a] transition-colors"
        >
          <span className="material-symbols-outlined text-lg text-[#a48b83]">logout</span>
          Log out
        </button>

        <button
          onClick={async () => {
            if (!confirm('This will permanently delete all your workout data. Are you sure?')) return
            await fetch('/api/reset', { method: 'POST' })
            router.push('/')
          }}
          className="w-full bg-red-950/40 border border-red-900/40 py-4 rounded-2xl flex items-center justify-center gap-2 font-headline font-bold text-red-400 hover:bg-red-950/60 transition-colors"
        >
          <span className="material-symbols-outlined text-lg">delete_forever</span>
          Delete all my data
        </button>
      </section>

      <BottomNav />
    </main>
  )
}
