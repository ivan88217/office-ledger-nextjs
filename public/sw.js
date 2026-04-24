const CACHE_NAME = 'office-ledger-shell-v1'
const APP_SHELL = ['/offline', '/manifest.webmanifest', '/logo192.png', '/logo512.png', '/office-ledger-logo.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  const isSameOrigin = url.origin === self.location.origin

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cachedPage = await caches.match(request)
        return cachedPage || caches.match('/offline')
      }),
    )
    return
  }

  const isStaticAsset =
    isSameOrigin &&
    (url.pathname.startsWith('/_next/static/') ||
      ['style', 'script', 'image', 'font'].includes(request.destination))

  if (!isStaticAsset) return

  event.respondWith(
    caches.match(request).then(async (cachedResponse) => {
      if (cachedResponse) return cachedResponse
      const networkResponse = await fetch(request)
      if (networkResponse && networkResponse.ok) {
        const cache = await caches.open(CACHE_NAME)
        cache.put(request, networkResponse.clone())
      }
      return networkResponse
    }),
  )
})
