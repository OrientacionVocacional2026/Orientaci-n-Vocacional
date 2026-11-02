/* =====================================================================
   header-nav.js — Resalta en la barra superior la sección que se está
   viendo (aria-current) y, en pantallas angostas, desliza la barra para
   que el enlace activo quede visible. Si el navegador no soporta
   IntersectionObserver, la barra funciona igual, solo sin resaltado.
   ===================================================================== */
(function () {
  "use strict";
  const nav = document.querySelector(".main-nav");
  if (!nav || !("IntersectionObserver" in window)) return;
  const links = Array.from(nav.querySelectorAll('a[href^="#"]'));
  const byId = {};
  links.forEach(a => { const el = document.getElementById(a.getAttribute("href").slice(1)); if (el) byId[el.id] = a; });
  const visible = new Set();

  function marcar(id) {
    links.forEach(a => {
      const on = byId[id] === a;
      a.classList.toggle("is-active", on);
      if (on) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current");
    });
    const act = byId[id];
    if (act && nav.scrollWidth > nav.clientWidth) {
      const left = act.offsetLeft - (nav.clientWidth - act.offsetWidth) / 2;
      nav.scrollTo({ left: Math.max(0, left), behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    }
  }

  const io = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) visible.add(e.target.id); else visible.delete(e.target.id); });
    // gana la primera sección (en orden del documento) que esté en la franja superior de la pantalla
    const orden = Object.keys(byId).filter(id => visible.has(id));
    if (orden.length) marcar(orden[0]); else if (window.scrollY < 200) marcar("");
  }, { rootMargin: "-20% 0px -65% 0px" });
  Object.keys(byId).forEach(id => io.observe(document.getElementById(id)));
})();
