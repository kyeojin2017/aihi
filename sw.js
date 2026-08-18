// 오프라인에서도 앱이 열리도록 앱 셸을 캐시한다.
// 파일을 고칠 때마다 CACHE 버전을 올리면 기기에서 새 버전을 받아간다.
const CACHE = "healthyai-v2";

const ASSETS = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/supabaseConfig.js",
  "./js/supabaseClient.js",
  "./js/storage.js",
  "./js/symptoms.js",
  "./js/visits.js",
  "./js/lifelogs.js",
  "./js/main.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE)
      // 하나라도 실패하면 설치 전체가 실패하므로 개별로 담는다
      .then(cache => Promise.all(ASSETS.map(url => cache.add(url).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // 다른 출처(Supabase, CDN 등)는 서비스워커가 관여하지 않는다
  if (url.origin !== self.location.origin) return;

  // 화면 이동은 네트워크 우선 — 배포한 새 버전이 바로 반영되도록
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put("./index.html", copy));
          return res;
        })
        .catch(() => caches.match("./index.html").then(hit => hit || caches.match("./")))
    );
    return;
  }

  // 정적 파일도 네트워크 우선 — 캐시 우선으로 두면 새로 배포한 CSS/JS가
  // 기기에 계속 옛 버전으로 남는다. 네트워크가 안 되면 캐시로 넘어간다.
  event.respondWith(
    fetch(req)
      .then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req))
  );
});
