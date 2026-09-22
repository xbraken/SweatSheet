// Client-side write queue for flaky gym signal.
// A save that fails with a network error is stored in localStorage and retried
// when the browser comes back online. Each item carries a client_id so the server
// can ignore a retry whose first attempt actually landed.

const KEY = 'ss_pending_saves'
export const QUEUE_EVENT = 'ss-queue-changed'
export const FLUSHED_EVENT = 'ss-queue-flushed'

type QueuedRequest = { clientId: string; url: string; method: string; body: Record<string, unknown>; createdAt: number }

function read(): QueuedRequest[] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as QueuedRequest[]) : []
  } catch {
    return []
  }
}

function write(items: QueuedRequest[]) {
  try { localStorage.setItem(KEY, JSON.stringify(items)) } catch { /* storage full/blocked */ }
  window.dispatchEvent(new CustomEvent(QUEUE_EVENT, { detail: items.length }))
}

export function pendingCount(): number {
  return typeof window === 'undefined' ? 0 : read().length
}

export function newClientId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export type SendResult =
  | { status: 'ok'; data: Record<string, unknown> }
  | { status: 'queued' }
  | { status: 'error'; error: string }

/**
 * Send a JSON write. Network failures are queued for retry; server errors are returned.
 * The body gets a client_id so retries are idempotent on the server.
 */
export async function sendOrQueue(url: string, method: string, body: Record<string, unknown>): Promise<SendResult> {
  const withId = { client_id: newClientId(), ...body }
  try {
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(withId) })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { status: 'error', error: (data as { error?: string }).error ?? `HTTP ${res.status}` }
    return { status: 'ok', data }
  } catch {
    write([...read(), { clientId: withId.client_id as string, url, method, body: withId, createdAt: Date.now() }])
    return { status: 'queued' }
  }
}

let flushing = false

/** Retry everything in the queue, oldest first. Stops at the first network failure. */
export async function flushQueue(): Promise<number> {
  if (flushing || typeof window === 'undefined') return 0
  flushing = true
  let sent = 0
  try {
    let items = read()
    while (items.length > 0) {
      const item = items[0]
      try {
        const res = await fetch(item.url, { method: item.method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(item.body) })
        // 4xx means the server rejected it — retrying won't help, so drop it
        if (res.status >= 500) break
      } catch {
        break
      }
      sent++
      items = read().filter(i => i.clientId !== item.clientId)
      write(items)
    }
  } finally {
    flushing = false
  }
  if (sent > 0) window.dispatchEvent(new CustomEvent(FLUSHED_EVENT, { detail: sent }))
  return sent
}
