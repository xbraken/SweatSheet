// SweatSheet service worker — lets the app open with no signal.
// Static build assets: cache-first (they're content-hashed).
// Page navigations: network-first, falling back to the last cached copy.
// API calls are never cached; offline writes are queued in the page (lib/offline-queue.ts).

const VERSION = 'v1'
const STATIC_CACHE = `ss-static-${VERSION}`
const PAGE_CACHE = `ss-pages-${VERSION}`

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.filter(k => !k.endsWith(VERSION)).map(k => caches.delete(k)))
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', event => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return

  if (url.pathname.startsWith('/_next/static/') || /\.(png|svg|ico|woff2?)$/.test(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(STATIC_CACHE)
      const hit = await cache.match(req)
      if (hit) return hit
      const res = await fetch(req)
      if (res.ok) cache.put(req, res.clone())
      return res
    })())
    return
  }

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(PAGE_CACHE)
      try {
        const res = await fetch(req)
        // Don't cache redirects (e.g. to /auth) — only real pages
        if (res.ok && !res.redirected) cache.put(req, res.clone())
        return res
      } catch {
        return (await cache.match(req)) || (await cache.match('/log')) || (await cache.match('/')) || Response.error()
      }
    })())
  }
})

// Tapping a rest-timer notification brings the app back
self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    if (all.length > 0) return all[0].focus()
    return self.clients.openWindow('/log')
  })())
})
