'use client'
import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import BottomNav from '@/components/BottomNav'

export default function SettingsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [username, setUsername] = useState('')
  const [stravaConnected, setStravaConnected] = useState(false)
  const [stravaLoading, setStravaLoading] = useState(false)
  const [stravaSyncing, setStravaSyncing] = useState(false)
  const [stravaSyncResult, setStravaSyncResult] = useState<{ imported: number; skipped: number } | null>(null)
  const [webhookActive, setWebhookActive] = useState<boolean | null>(null)
  const [webhookRegistering, setWebhookRegistering] = useState(false)
  const stravaStatus = searchParams.get('strava')
  const [unitPref, setUnitPref] = useState<'metric' | 'imperial'>('metric')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const [invalidExercises, setInvalidExercises] = useState<{ exercise: string; set_count: number }[]>([])
  const [cleaning, setCleaning] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [keyCopied, setKeyCopied] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwSaving, setPwSaving] = useState(false)
  const [pwError, setPwError] = useState('')
  const [pwSaved, setPwSaved] = useState(false)

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

    fetch('/api/strava/status').then(r => r.json()).then(data => {
      setStravaConnected(data.connected ?? false)
    }).catch(() => {})

    fetch('/api/strava/webhook-status').then(r => r.json()).then(data => {
      setWebhookActive(Array.isArray(data.subscriptions) && data.subscriptions.length > 0)
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
    <main className="max-w-[390px] md:max-w-xl mx-auto min-h-screen pb-32 md:pb-12 px-6 pt-12 animate-fade-in-view">
      <header className="mb-10 flex items-center gap-4">
        <button onClick={() => router.back()} className="text-[#a48b83] active:scale-95 transition-all">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <div>
          <h1 className="font-headline text-3xl font-black tracking-tight text-[#e5e2e1]">Settings</h1>
          <p className="text-sm text-[#a48b83] mt-0.5">@{username}</p>
        </div>
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
                  unitPref === u ? 'bg-[#ff9066] text-[#752805]' : 'bg-[#2a2a2a] text-[#a48b83]'
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
        <section className="flex flex-col gap-3 mb-8 animate-fade-in">
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

      {/* Strava */}
      <section className="flex flex-col gap-4 mb-8">
        <h3 className="font-headline text-sm font-bold text-[#a48b83] uppercase tracking-widest">Connected Apps</h3>
        <div className="bg-[#201f1f] rounded-2xl p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-[#fc4c02]/20 rounded-xl flex items-center justify-center">
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-[#fc4c02]"><path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169"/></svg>
              </div>
              <div>
                <p className="text-sm font-bold text-[#e5e2e1]">Strava</p>
                <p className="text-xs text-[#a48b83]">
                  {stravaConnected ? 'Auto-imports runs and rides' : 'Connect to auto-import cardio'}
                </p>
              </div>
            </div>
            {stravaConnected ? (
              <button
                onClick={async () => {
                  if (!confirm('Disconnect Strava? New activities won\'t be imported automatically.')) return
                  setStravaLoading(true)
                  await fetch('/api/strava/disconnect', { method: 'POST' })
                  setStravaConnected(false)
                  setStravaLoading(false)
                }}
                disabled={stravaLoading}
                className="px-4 py-2 rounded-xl bg-[#2a2a2a] text-[#a48b83] text-xs font-bold font-label transition-colors disabled:opacity-50"
              >
                Disconnect
              </button>
            ) : (
              <a
                href="/api/strava/connect"
                className="px-4 py-2 rounded-xl bg-[#fc4c02]/20 text-[#fc4c02] text-xs font-bold font-label transition-colors"
              >
                Connect
              </a>
            )}
          </div>
          {stravaConnected && (
            <div className="flex flex-col gap-2">
              <button
                onClick={async () => {
                  setStravaSyncing(true)
                  setStravaSyncResult(null)
                  const res = await fetch('/api/strava/sync', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ pages: 2 }),
                  }).then(r => r.json())
                  setStravaSyncing(false)
                  setStravaSyncResult({ imported: res.imported ?? 0, skipped: res.skipped ?? 0 })
                  setTimeout(() => setStravaSyncResult(null), 4000)
                }}
                disabled={stravaSyncing}
                className="w-full py-3 bg-[#fc4c02]/10 text-[#fc4c02] rounded-xl text-sm font-bold font-label flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
              >
                {stravaSyncing
                  ? <><div className="w-4 h-4 border-2 border-[#fc4c02]/30 border-t-[#fc4c02] rounded-full animate-spin" /> Syncing…</>
                  : <><span className="material-symbols-outlined text-base">sync</span> Sync recent activities</>
                }
              </button>
              {stravaSyncResult && (
                <p className="text-xs text-center text-[#a48b83]">
                  {stravaSyncResult.imported > 0
                    ? `✓ ${stravaSyncResult.imported} imported, ${stravaSyncResult.skipped} already up to date`
                    : `All ${stravaSyncResult.skipped} activities already up to date`
                  }
                </p>
              )}
              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${webhookActive === null ? 'bg-[#a48b83]' : webhookActive ? 'bg-green-400' : 'bg-red-400'}`} />
                  <span className="text-xs text-[#a48b83]">
                    {webhookActive === null ? 'Checking auto-import…' : webhookActive ? 'Auto-import active' : 'Auto-import inactive'}
                  </span>
                </div>
                {webhookActive === false && (
                  <button
                    onClick={async () => {
                      setWebhookRegistering(true)
                      const callbackUrl = `${window.location.origin}/api/strava/webhook`
                      const res = await fetch('/api/strava/webhook-status', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ callbackUrl }),
                      }).then(r => r.json())
                      setWebhookActive(res.ok)
                      setWebhookRegistering(false)
                    }}
                    disabled={webhookRegistering}
                    className="text-xs font-bold text-[#fc4c02] disabled:opacity-50"
                  >
                    {webhookRegistering ? 'Fixing…' : 'Fix it'}
                  </button>
                )}
              </div>
            </div>
          )}
          {stravaStatus === 'connected' && (
            <p className="text-xs text-[#4bdece] bg-[#4bdece]/10 rounded-xl px-3 py-2">Strava connected — new workouts will import automatically.</p>
          )}
          {stravaStatus === 'denied' && (
            <p className="text-xs text-[#a48b83] bg-[#2a2a2a] rounded-xl px-3 py-2">Strava connection cancelled.</p>
          )}
          {stravaStatus === 'error' && (
            <p className="text-xs text-red-400 bg-red-950/30 rounded-xl px-3 py-2">Something went wrong connecting to Strava. Try again.</p>
          )}
        </div>
      </section>

      {/* Shortcut sync */}
      <section className="flex flex-col gap-4 mb-8">
        <h3 className="font-headline text-sm font-bold text-[#a48b83] uppercase tracking-widest">Shortcut Sync</h3>
        <div className="bg-[#201f1f] rounded-2xl p-5 flex flex-col gap-4">
          <p className="text-sm text-[#a48b83] leading-snug">Use this key in the SweatSheet iPhone Shortcut to sync workouts directly.</p>
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
        </div>
      </section>

      {/* Security */}
      <section className="flex flex-col gap-4 mb-8">
        <h3 className="font-headline text-sm font-bold text-[#a48b83] uppercase tracking-widest">Security</h3>
        <div className="bg-[#201f1f] rounded-2xl p-5 flex flex-col gap-3">
          {[
            { label: 'Current password', value: currentPassword, set: setCurrentPassword },
            { label: 'New password', value: newPassword, set: setNewPassword },
            { label: 'Confirm new password', value: confirmPassword, set: setConfirmPassword },
          ].map(({ label, value, set }) => (
            <div key={label}>
              <p className="text-[10px] font-bold font-label uppercase tracking-widest text-[#a48b83] mb-1.5">{label}</p>
              <input
                type="password"
                value={value}
                onChange={e => { set(e.target.value); setPwError(''); setPwSaved(false) }}
                className="w-full bg-[#2a2a2a] rounded-xl px-4 py-3 text-sm text-[#e5e2e1] outline-none focus:ring-1 focus:ring-[#ff9066]/50"
              />
            </div>
          ))}
          {pwError && <p className="text-xs text-red-400">{pwError}</p>}
          <button
            onClick={async () => {
              if (newPassword !== confirmPassword) { setPwError('Passwords don\'t match'); return }
              if (newPassword.length < 6) { setPwError('Password must be at least 6 characters'); return }
              setPwSaving(true); setPwError('')
              const res = await fetch('/api/account', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'change_password', currentPassword, newPassword }),
              }).then(r => r.json())
              setPwSaving(false)
              if (res.error) { setPwError(res.error); return }
              setPwSaved(true)
              setCurrentPassword(''); setNewPassword(''); setConfirmPassword('')
              setTimeout(() => setPwSaved(false), 2000)
            }}
            disabled={pwSaving || !currentPassword || !newPassword || !confirmPassword}
            className="w-full py-3 bg-[#ff9066]/20 text-[#ff9066] rounded-xl font-headline font-bold text-sm transition-colors disabled:opacity-50"
          >
            {pwSaved ? '✓ Password updated' : pwSaving ? 'Saving…' : 'Change password'}
          </button>
        </div>
      </section>

      {/* Account actions */}
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
