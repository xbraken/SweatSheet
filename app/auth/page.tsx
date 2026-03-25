'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function AuthPage() {
  const router = useRouter()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong')
      } else {
        router.push('/')
        router.refresh()
      }
    } catch {
      setError('Network error, please try again')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen max-w-[390px] mx-auto px-6 flex flex-col justify-center pb-16">
      {/* Logo */}
      <div className="mb-12 text-center">
        <h1 className="font-headline text-4xl font-black text-primary tracking-tighter">SweatSheet</h1>
        <p className="text-sm text-on-surface-variant mt-2">Your personal fitness tracker</p>
      </div>

      {/* Toggle */}
      <div className="flex bg-surface-container rounded-xl p-1 mb-8">
        {(['login', 'signup'] as const).map(m => (
          <button
            key={m}
            onClick={() => { setMode(m); setError('') }}
            className={`flex-1 py-2.5 rounded-lg text-sm font-bold font-label transition-colors ${
              mode === m ? 'bg-surface-container-high text-on-surface' : 'text-on-surface-variant'
            }`}
          >
            {m === 'login' ? 'Log in' : 'Sign up'}
          </button>
        ))}
      </div>

      {/* Form */}
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-bold font-label uppercase tracking-widest text-on-surface-variant">
            Username
          </label>
          <input
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="e.g. edmond"
            autoCapitalize="none"
            autoCorrect="off"
            className="bg-surface-container rounded-xl px-4 py-3.5 text-on-surface placeholder:text-on-surface-variant/40 outline-none focus:ring-2 focus:ring-primary/40 font-body"
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-bold font-label uppercase tracking-widest text-on-surface-variant">
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder={mode === 'signup' ? 'Min. 6 characters' : '••••••••'}
            className="bg-surface-container rounded-xl px-4 py-3.5 text-on-surface placeholder:text-on-surface-variant/40 outline-none focus:ring-2 focus:ring-primary/40 font-body"
            required
          />
        </div>

        {error && (
          <p className="text-sm text-red-400 bg-red-500/10 rounded-xl px-4 py-3">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="mt-2 bg-gradient-to-br from-[#ffb9a0] to-[#ff9066] text-[#752805] py-4 rounded-2xl font-headline font-bold text-base shadow-xl active:scale-95 transition-transform disabled:opacity-60"
        >
          {loading ? '...' : mode === 'login' ? 'Log in' : 'Create account'}
        </button>
      </form>
    </main>
  )
}
