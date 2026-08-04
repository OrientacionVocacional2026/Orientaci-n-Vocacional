/* =====================================================================
   sw.js — Service Worker de Orientación Vocacional
   ---------------------------------------------------------------------
   Permite que el sitio funcione instalado (PWA) y sin conexión a
   internet, una vez que se visitó al menos una vez con datos móviles
   o wifi.

   CÓMO ACTUALIZAR EL CACHÉ CUANDO CAMBIÁS EL SITIO:
   Cambiá el número de CACHE_NAME (por ejemplo de "v1" a "v2"). Así,
   el navegador descarta el caché viejo y guarda los archivos nuevos.
   Si no cambiás este número, los usuarios que ya instalaron la app
   pueden seguir viendo la versión anterior por un tiempo.
   ===================================================================== */

const CACHE_NAME = "ov-cache-v21";

// Archivos propios del sitio que se guardan apenas se instala el Service Worker.
const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./style.css",
  "./script.js",
  "./vocational-test.js",
  "./careers-toggle.js",
  "./careers-data.js",
  "./pdfs-data.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-192-maskable.png",
  "./icons/icon-512-maskable.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  // Navegación (abrir la página): red primero, y si no hay conexión, se
  // sirve la copia guardada de index.html para que el sitio no se rompa.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  // Resto de los archivos (propios y de fuentes/CDN externos): caché
  // primero para que cargue rápido y funcione offline; si no está
  // guardado, se busca en la red y se guarda para la próxima vez.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
    })
  );
});
