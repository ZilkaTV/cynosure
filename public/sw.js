// This site no longer ships a functional service worker - PWA
// installability wasn't worth what it turned out to cost: confirmed
// directly, this SW's own fetch() proxying failed outright for a real
// visitor ("Failed to fetch" thrown from inside the fetch handler, Opera
// GX), breaking every single page load for them until the SW was manually
// unregistered. Unlike an ordinary caching bug, no HTTP Cache-Control
// header can override or even see an already-registered service worker -
// it intercepts requests before the browser's normal cache handling is
// ever reached, which is exactly why public/_headers' Cache-Control:
// no-store on index.html didn't fix this for them.
//
// This file's only remaining job is to remove itself from any browser that
// still has the old version registered: browsers periodically re-fetch a
// controlling SW's own script on navigation and install it as an update if
// the bytes differ - shipping THIS version is what actually reaches those
// browsers. Once unregistered, no SW controls this origin at all going
// forward, so ordinary browser HTTP caching (see public/_headers) takes
// over cleanly instead. src/main.tsx no longer registers a service worker
// for new visitors, so this file exists purely for that cleanup - it can
// be deleted entirely once confirmed no returning visitor still needs it.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => {
  event.waitUntil(
    self.registration
      .unregister()
      .then(() => self.clients.matchAll())
      .then((clients) => {
        for (const client of clients) client.navigate(client.url)
      }),
  )
})
