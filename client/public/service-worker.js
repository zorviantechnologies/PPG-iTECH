self.addEventListener("install", (event) => {
  console.log("Service Worker installed");
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  console.log("Service Worker activated");
  event.waitUntil(clients.claim());
});

// Fetch handler: Let all requests pass through to the network
self.addEventListener("fetch", (event) => {
  // For API requests, always go to network
  if (event.request.url.includes('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        // If network fails, let it fail (don't cache API responses)
        return new Response('Network error', { status: 503 });
      })
    );
  } else {
    // For other resources, try cache first, then network
    event.respondWith(
      caches.match(event.request).then((response) => {
        return response || fetch(event.request);
      })
    );
  }
});
