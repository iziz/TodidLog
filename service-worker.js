const CACHE_NAME = "todidlog-v163";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./vendor/app.js",
  "./assets/add_list.png",
  "./assets/calendar_toggle.png",
  "./assets/fortune_details.png",
  "./assets/tag_icon.png",
  "./assets/task_title_icon.png",
  "./assets/timer_start.png",
  "./assets/timer_stop.png",
  "./manifest.webmanifest",
  "./icon.svg",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches
        .keys()
        .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))),
      self.clients.claim(),
    ]),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request)),
  );
});
