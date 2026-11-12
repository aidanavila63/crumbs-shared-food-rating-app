// Crumbs service worker: fast static assets + graceful offline shell.
// Never caches API, auth, or cross-origin (Supabase / Google) requests.
const VERSION = 'crumbs-v5'
// Build files (/_next/static, names change every deploy) live in their own cache so the ones a new
// build no longer uses can be cleared out (Round 74: they used to pile up on the phone forever).
const STATIC = 'crumbs-static-v1'
const STATIC_MAX = 120
const SHELL = ['/', '/manifest.webmanifest', '/icon.svg', '/icon-192.png']

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(SHELL)))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== VERSION && key !== STATIC).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return

  // Hashed build assets never change: cache first.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone()
              caches.open(STATIC).then(async (cache) => {
                await cache.put(request, copy)
                // Oldest first: drop what earlier builds left behind once there are too many.
                const keys = await cache.keys()
                if (keys.length > STATIC_MAX)
                  await Promise.all(keys.slice(0, keys.length - STATIC_MAX).map((key) => cache.delete(key)))
              })
            }
            return response
          }),
      ),
    )
    return
  }

  // Pages and everything else: network first, cached copy when offline.
  event.respondWith(
    fetch(request)
      .then((response) => {
        // Only the app itself is kept for offline. (Round 74: an invite or public restaurant page used
        // to be saved in its place, so Crumbs could open to that page with no signal.)
        if (response.ok && SHELL.includes(url.pathname)) {
          const copy = response.clone()
          caches.open(VERSION).then((cache) => cache.put(url.pathname === '/' ? '/' : request, copy))
        }
        return response
      })
      .catch(() => caches.match(request).then((hit) => hit || caches.match('/'))),
  )
})

// Push notifications ("Maya rated Naan Kabob 5★")
self.addEventListener('push', (event) => {
  let data = { title: 'Crumbs', body: 'Something new on your list' }
  try {
    data = { ...data, ...event.data.json() }
  } catch {}
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.tag,
      data: { tag: data.tag },
      icon: '/icon-192.png',
      badge: '/icon.svg',
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  // A notification about a place ("Maya rated Naan Kabob 5★", tag crumbs-<place id>) opens that place.
  const tag = (event.notification.data && event.notification.data.tag) || event.notification.tag || ''
  const place = /^crumbs-([0-9a-f]{8}-[0-9a-f-]{27})$/i.exec(tag)
  const target = place ? `/?place=${place[1]}` : '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      if (windows.length) {
        const open = windows[0]
        if (place && 'navigate' in open)
          return open.navigate(target).then((moved) => (moved || open).focus(), () => open.focus())
        return open.focus()
      }
      return self.clients.openWindow(target)
    }),
  )
})
