// Deliberately minimal - this site is a live stats dashboard, so caching
// responses would show stale data. The only job here is to satisfy browsers'
// installability requirement (a registered service worker with a fetch
// handler); every request still just goes straight to the network.
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request))
})
