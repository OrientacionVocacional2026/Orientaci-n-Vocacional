/* Registro del service worker (antes estaba escrito dentro de index.html;
   se movió a un archivo para poder usar una Content-Security-Policy sin 'unsafe-inline' en scripts). */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").then((reg) => {
      // Busca una versión nueva del sitio apenas se abre la página...
      reg.update();
      // ...y también cada vez que se vuelve a esta pestaña (por ejemplo,
      // al reabrir la app instalada desde la pantalla de inicio).
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") reg.update();
      });
    }).catch(() => { /* si falla, el sitio sigue funcionando online normalmente */ });

    // Cuando el Service Worker nuevo toma el control, recargamos una sola
    // vez para que se vean los archivos actualizados al toque.
    let refreshingPage = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshingPage) return;
      refreshingPage = true;
      window.location.reload();
    });
  });
}
