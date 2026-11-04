/* =====================================================================
   sw.js — Service Worker de Orientación Vocacional
   ---------------------------------------------------------------------
   Permite que el sitio funcione instalado (PWA) y sin conexión a
   internet, una vez que se visitó al menos una vez con datos móviles
   o wifi.

   CÓMO ACTUALIZAR EL CACHÉ CUANDO CAMBIÁS EL SITIO:
   Ejecutá  node tools/sw-version.js  antes de publicar. Calcula un hash
   del contenido de todos los archivos de PRECACHE_URLS y lo escribe en
   CACHE_NAME, así la versión cambia sola cuando cambia cualquier archivo.
   Si te olvidás, `npm test` falla y avisa. Si agregás un archivo nuevo
   que index.html carga, agregalo también a PRECACHE_URLS (un test lo
   verifica).
   ===================================================================== */

const CACHE_NAME = "ov-cache-21325612f0"; // lo mantiene tools/sw-version.js

// Archivos propios del sitio que se guardan apenas se instala el Service Worker.
const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./style.css",
  "./script.js",
  "./reveal.js",
  "./vocational-test.js",
  "./careers-toggle.js",
  "./careers-data.js",
  "./pdfs-index.js",
  "./ov-tools.css",
  "./ov-core.js",
  "./ov-ui.js",
  "./assistant.js",
  "./plan.js",
  "./suggest.js",
  "./header-nav.js",
  "./sw-register.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-192-maskable.png",
  "./icons/icon-512-maskable.png",
  "./icons/apple-touch-icon.png"
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
        names.filter((name) => name.startsWith("ov-cache-") && name !== CACHE_NAME).map((name) => caches.delete(name))
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
