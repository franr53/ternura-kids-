// Service Worker — Ternura Kids
const CACHE_NAME = 'ternura-kids-v1'

// Assets estáticos a pre-cachear
const STATIC_ASSETS = [
  '/',
  '/dashboard',
  '/pos',
  '/inventario',
  '/icons/icon.svg',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Solo interceptar misma origen
  if (url.origin !== location.origin) return

  // Supabase API: siempre network first, sin cachear
  if (url.hostname.includes('supabase')) return

  // Para navegación (páginas): network first, fallback a caché
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const clone = res.clone()
          caches.open(CACHE_NAME).then((c) => c.put(request, clone))
          return res
        })
        .catch(() => caches.match(request).then((r) => r || caches.match('/dashboard')))
    )
    return
  }

  // Assets estáticos (_next/static): cache first
  if (url.pathname.startsWith('/_next/static')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached
        return fetch(request).then((res) => {
          caches.open(CACHE_NAME).then((c) => c.put(request, res.clone()))
          return res
        })
      })
    )
  }
})
