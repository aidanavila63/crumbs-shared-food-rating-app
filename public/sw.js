// Crumbs service worker: fast static assets + graceful offline shell.
// Never caches API, auth, or cross-origin (Supabase / Google) requests.
const VERSION = 'crumbs-v3'
const SHELL = ['/', '/manifest.webmanifest', '/icon.svg']

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(SHELL)))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
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
              caches.open(VERSION).then((cache) => cache.put(request, copy))
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
        if (response.ok && (request.mode === 'navigate' || SHELL.includes(url.pathname))) {
          const copy = response.clone()
          caches.open(VERSION).then((cache) => cache.put(request.mode === 'navigate' ? '/' : request, copy))
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
      icon: '/icon.svg',
      badge: '/icon.svg',
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      if (windows.length) return windows[0].focus()
      return self.clients.openWindow('/')
    }),
  )
})
