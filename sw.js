const STATIC_CACHE = "airo-static-v33";
const APP_SHELL = [
  "./",
  "./index.html?v=33",
  "./styles.css?v=33",
  "./app.mjs?v=33",
  "./manifest.webmanifest?v=33",
  "./icons/airo-mark.svg?v=33",
  "./icons/airo-touch-icon-180.png?v=33",
  "./icons/airo-icon-512.png?v=33",
  "./js/config.mjs",
  "./js/models.mjs",
  "./js/utils.mjs",
  "./js/zbet-engine.mjs",
  "./data/ui/leagues.json",
  "./data/ui/matches.json",
  "./data/ui/history_stats.json",
  "./data/ui/backtest_summary.json",
  "./data/ui/admin_watchdog_status.json"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(APP_SHELL))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== STATIC_CACHE).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

function isDataRequest(requestUrl) {
  return requestUrl.pathname.endsWith("/data/ui/leagues.json")
    || requestUrl.pathname.endsWith("/data/ui/matches.json")
    || requestUrl.pathname.endsWith("/data/ui/history_stats.json")
    || requestUrl.pathname.endsWith("/data/ui/backtest_summary.json")
    || requestUrl.pathname.endsWith("/data/ui/admin_watchdog_status.json");
}

self.addEventListener("fetch", (event) => {
  const requestUrl = new URL(event.request.url);
  if (event.request.method !== "GET") return;

  if (event.request.mode === "navigate" || isDataRequest(requestUrl)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match("./index.html?v=33")))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        const copy = response.clone();
        caches.open(STATIC_CACHE).then((cache) => cache.put(event.request, copy));
        return response;
      });
    })
  );
});
