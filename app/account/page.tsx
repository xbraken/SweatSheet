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
  const [invalidExercises, setInvalidExercises] = useState<{ exercise: string; set_count: number }[]>([])
  const [cleaning, setCleaning] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [keyCopied, setKeyCopied] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

  useEffect(() => {
    fetch('/api/account').then(r => r.json()).then(data => {
      setUsername(data.username ?? '')
      setUnitPref(data.unit_pref === 'imperial' ? 'imperial' : 'metric')
      setApiKey(data.api_key ?? '')
      setLoading(false)
    }).catch(() => setLoading(false))

    fetch('/api/exercises/cleanup').then(r => r.json()).then(data => {
      if (data.invalid) setInvalidExercises(data.invalid)
    }).catch(() => {})
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
    <main className="max-w-[390px] md:max-w-xl mx-auto min-h-screen pb-32 md:pb-12 px-6 pt-12">
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

      {/* Data cleanup */}
      {invalidExercises.length > 0 && (
        <section className="flex flex-col gap-3 mb-8">
          <h3 className="font-headline text-sm font-bold text-[#a48b83] uppercase tracking-widest">Data cleanup</h3>
          <div className="bg-[#201f1f] rounded-2xl p-5">
            <p className="text-sm text-[#a48b83] mb-3">
              {invalidExercises.length} exercise{invalidExercises.length > 1 ? 's' : ''} in your history don&apos;t match the exercise list:
            </p>
            <div className="flex flex-col gap-1.5 mb-4">
              {invalidExercises.map(e => (
                <div key={e.exercise} className="flex justify-between items-center px-3 py-2 bg-[#2a2a2a] rounded-lg text-sm">
                  <span className="text-[#e5e2e1]">{e.exercise || '(empty name)'}</span>
                  <span className="text-[#a48b83] text-xs">{e.set_count} sets</span>
                </div>
              ))}
            </div>
            <button
              onClick={async () => {
                if (!confirm(`Remove ${invalidExercises.length} exercise(s) and their sets? This can't be undone.`)) return
                setCleaning(true)
                await fetch('/api/exercises/cleanup', { method: 'DELETE' })
                setInvalidExercises([])
                setCleaning(false)
              }}
              disabled={cleaning}
              className="w-full py-3 bg-[#ff9066]/20 text-[#ff9066] rounded-xl font-headline font-bold text-sm transition-colors disabled:opacity-50"
            >
              {cleaning ? 'Cleaning…' : 'Remove invalid exercises'}
            </button>
          </div>
        </section>
      )}

      {/* Shortcut sync */}
      <section className="flex flex-col gap-4 mb-8">
        <h3 className="font-headline text-sm font-bold text-[#a48b83] uppercase tracking-widest">Shortcut Sync</h3>
        <div className="bg-[#201f1f] rounded-2xl p-5 flex flex-col gap-4">
          <p className="text-sm text-[#a48b83] leading-snug">Use this key in the SweatSheet iPhone Shortcut to sync workouts directly — no file downloads needed.</p>
          <div className="flex flex-col gap-2">
            <p className="text-[10px] font-bold font-label uppercase tracking-widest text-[#a48b83]">Your API Key</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-[#2a2a2a] rounded-xl px-4 py-3 font-mono text-xs text-[#e5e2e1] truncate select-all">
                {apiKey || '—'}
              </div>
              <button
                onClick={async () => {
                  await navigator.clipboard.writeText(apiKey)
                  setKeyCopied(true)
                  setTimeout(() => setKeyCopied(false), 2000)
                }}
                className="shrink-0 px-4 py-3 bg-[#4bdece]/20 text-[#4bdece] rounded-xl text-sm font-bold font-label transition-colors"
              >
                {keyCopied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
          </div>
          <button
            onClick={async () => {
              if (!confirm('Regenerate your API key? Your Shortcut will need to be updated with the new key.')) return
              setRegenerating(true)
              const data = await fetch('/api/account', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'regenerate_api_key' }),
              }).then(r => r.json())
              setApiKey(data.api_key ?? '')
              setRegenerating(false)
            }}
            disabled={regenerating}
            className="text-xs text-[#a48b83] underline underline-offset-2 self-start disabled:opacity-50"
          >
            {regenerating ? 'Regenerating…' : 'Regenerate key'}
          </button>
          <a
            href="/SweatSheet Sync.shortcut" download
            className="w-full py-3 rounded-xl bg-[#4bdece]/20 text-[#4bdece] text-sm font-bold font-label text-center flex items-center justify-center gap-2 hover:bg-[#4bdece]/30 transition-colors"
          >
            <span className="material-symbols-outlined text-base">download</span>
            Download SweatSheet Shortcut
          </a>
          <p className="text-[11px] text-[#a48b83] leading-snug">
            Opens in iPhone Shortcuts — you&apos;ll be asked for your API key on install (copy it above). Requires <strong className="text-[#e5e2e1]">Allow Untrusted Shortcuts</strong> in iOS Settings → Privacy &amp; Security → Shortcuts.
          </p>
        </div>
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
