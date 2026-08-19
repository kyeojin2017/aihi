const CACHE_NAME = "health-diary-v1";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/storage.js",
  "./js/symptoms.js",
  "./js/visits.js",
  "./js/main.js",
  "./js/auth.js",
  "./js/supabaseConfig.js",
  "./js/supabaseClient.js",
  "./manifest.json"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return; // let CDN/Supabase requests pass through

  event.respondWith(
    fetch(event.request)
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
