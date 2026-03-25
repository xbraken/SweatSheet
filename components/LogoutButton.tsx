'use client'
import { useRouter } from 'next/navigation'

export default function LogoutButton() {
  const router = useRouter()

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/auth')
    router.refresh()
  }

  return (
    <button
      onClick={logout}
      className="material-symbols-outlined text-[#a48b83] text-2xl active:scale-90 transition-transform"
      title="Log out"
    >
      logout
    </button>
  )
}
