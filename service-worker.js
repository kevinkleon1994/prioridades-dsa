const CACHE = "prioridades-v1.0.2";

const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./v1.0.1.css",
  "./app.js",
  "./v1.0.1.js",
  "./v1.0.2.js",
  "./config.js",
  "./manifest.webmanifest",
  "./assets/icone_192.png",
  "./assets/icone_512.png",
  "./assets/logomarca_geometrica.png",
  "./assets/icone_prioridades.svg",
  "./assets/avatar-default.svg",
  "./assets/icone_identidade.png",
  "./assets/icone_lideranca.png",
  "./assets/icone_novasgeracoes.png",
  "./assets/icone_discipulado.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
