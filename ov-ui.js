/* =====================================================================
   ov-ui.js — Utilidades mínimas de DOM para assistant.js, plan.js y
   suggest.js. Todo el texto se inserta con textContent (nunca con
   innerHTML), así que ningún dato del catálogo ni del usuario puede
   inyectar HTML.
   ===================================================================== */
(function () {
  "use strict";

  /* h("div", { class: "x", onclick: fn }, ["texto", otroNodo]) */
  function h(tag, attrs, children) {
    const el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(k => {
      const v = attrs[k];
      if (v == null || v === false) return;
      if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (v === true) el.setAttribute(k, "");
      else el.setAttribute(k, String(v));
    });
    // Acepta un hijo, un array, o arrays anidados (se aplanan); ignora null/false.
    (function add(list) {
      (Array.isArray(list) ? list : [list]).forEach(c => {
        if (c == null || c === false) return;
        if (Array.isArray(c)) { add(c); return; }
        el.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
      });
    })(children);
    return el;
  }

  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

  function toast(msg) {
    if (typeof window.showToast === "function") window.showToast(msg);
  }

  function safeUrl(u) { return typeof u === "string" && /^https?:\/\//i.test(u) ? u : null; }

  /* localStorage con manejo de errores (modo privado, cuota llena, JSON roto). */
  const store = {
    get(key) { try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : null; } catch (e) { return null; } },
    set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; } },
    remove(key) { try { localStorage.removeItem(key); return true; } catch (e) { return false; } }
  };

  window.OVUI = { h, clear, toast, safeUrl, store };
})();
