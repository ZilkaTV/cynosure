// Deliberately minimal - this site is a live stats dashboard, so caching
// responses would show stale data. The only job here is to satisfy browsers'
// installability requirement (a registered service worker with a fetch
// handler); every request still just goes straight to the network.
//
// Only touches same-origin requests, and even then does nothing but let them
// through untouched - calling respondWith(fetch(...)) on cross-origin
// requests (e.g. the Twemoji SVGs from jsdelivr) re-issues them through the
// service worker's fetch, which behaves differently for opaque/no-cors
// responses than a page's own <img> request and can make them fail to load.
self.addEventListener('fetch', (event) => {
  if (new URL(event.request.url).origin === self.location.origin) {
    event.respondWith(fetch(event.request))
  }
})

// Take over immediately instead of waiting for every open tab to close -
// makes this fix (and any future one) apply on the visitor's next reload
// rather than only on their next fresh visit.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
