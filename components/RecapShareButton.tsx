'use client'
import { useState } from 'react'
import { toast } from '@/components/Toast'

/** Shares the recap card PNG via the native share sheet, or downloads it where that isn't supported */
export default function RecapShareButton({ month, label }: { month: string; label: string }) {
  const [busy, setBusy] = useState(false)

  const share = async () => {
    setBusy(true)
    try {
      const res = await fetch(`/api/recap/image?month=${month}`)
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      const file = new File([blob], `sweatsheet-${month}.png`, { type: 'image/png' })
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `My ${label} on SweatSheet` })
      } else {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = file.name
        a.click()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      }
    } catch (e) {
      // User closing the share sheet isn't an error
      if (!(e instanceof DOMException && e.name === 'AbortError')) toast('Could not create the recap image', { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      onClick={share}
      disabled={busy}
      className="w-full py-4 rounded-2xl bg-gradient-to-br from-primary to-primary-container text-on-primary-container font-headline font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-60"
    >
      {busy
        ? <span className="w-4 h-4 border-2 border-on-primary-container border-t-transparent rounded-full animate-spin" />
        : <span className="material-symbols-outlined text-lg">ios_share</span>}
      Share recap
    </button>
  )
}
