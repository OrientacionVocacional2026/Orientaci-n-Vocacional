/* reveal.js — animaciones suaves al hacer scroll (v12.9.5, ampliado en 12.9.7)
   Las tarjetas de la guía, instituciones, becas y preguntas frecuentes, y los
   títulos de cada sección, aparecen con un fundido suave cuando entran en pantalla.
   - Si el navegador no soporta IntersectionObserver, o la persona pidió
     "reducir movimiento", no se hace nada y todo se ve normal.
   - Las tarjetas de carreras ya tienen su propia animación de entrada. */
(function () {
  "use strict";
  if (!("IntersectionObserver" in window)) return;
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  document.documentElement.classList.add("reveal-on");

  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      io.unobserve(el);
      el.classList.add("is-visible");
      // Al terminar, se saca la clase para que los efectos hover propios de la tarjeta vuelvan a funcionar.
      const done = () => { el.classList.remove("reveal", "is-visible"); el.style.removeProperty("--reveal-delay"); };
      el.addEventListener("transitionend", function onEnd(e) {
        if (e.propertyName !== "opacity") return;
        el.removeEventListener("transitionend", onEnd);
        done();
      });
      setTimeout(done, 1400); // respaldo
    });
  }, { threshold: 0.1, rootMargin: "0px 0px -5% 0px" });

  function watch(el, index) {
    if (el.classList.contains("reveal")) return;
    el.classList.add("reveal");
    el.style.setProperty("--reveal-delay", ((index % 6) * 60) + "ms");
    io.observe(el);
  }

  // Encabezados de cada sección (menos el hero, que ya tiene su propia animación).
  document.querySelectorAll(
    "section:not(.hero) > .container > :is(.section-eyebrow, h2, .university-intro, .becas-intro)"
  ).forEach((el, i) => watch(el, 0));

  // Bloques fijos de las demás secciones (guía, preguntas frecuentes, becas).
  ["section > .container > .guide-intro", ".permanencia-callout"].forEach((sel) => {
    document.querySelectorAll(sel).forEach((el) => watch(el, 0));
  });
  [".guide-steps-grid", ".faq-list"].forEach((sel) => {
    document.querySelectorAll(sel).forEach((grid) => {
      Array.prototype.forEach.call(grid.children, (child, i) => watch(child, i));
    });
  });

  // Grillas que se vuelven a dibujar (filtros, búsqueda): se observan los hijos nuevos.
  ["institucionesGrid", "becasGrid"].forEach((id) => {
    const grid = document.getElementById(id);
    if (!grid) return;
    const scan = () => Array.prototype.forEach.call(grid.children, (child, i) => watch(child, i));
    new MutationObserver(scan).observe(grid, { childList: true });
    scan();
  });
})();
