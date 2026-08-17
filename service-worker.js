const CACHE_NAME = "morning-pages-v2";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/style.css",
  "./js/app.js",
  "./js/db.js",
  "./js/crypto.js",
  "./js/wordlist.js",
  "./js/storage.js",
  "./js/theme.js",
  "./js/util.js",
  "./js/sheet.js",
  "./js/share.js",
  "./js/editor.js",
  "./js/entryCard.js",
  "./js/entryDetail.js",
  "./js/dayCard.js",
  "./js/dayDetail.js",
  "./js/settingsMenu.js",
  "./js/dataManagement.js",
  "./js/onboarding.js",
  "./js/unlock.js",
  "./js/whatsNew.js",
  "./js/version.js",
  "./js/views/home.js",
  "./js/views/log.js",
  "./js/views/calendar.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  // Network-first: always try to get the latest app shell when online, only
  // falling back to the cache when offline. Cache-first would serve a stale
  // version right after a deploy until a second reload.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
