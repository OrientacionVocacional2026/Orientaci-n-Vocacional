/* =====================================================================
   suggest.js — "¿Encontraste un dato incorrecto?"
   ---------------------------------------------------------------------
   GitHub Pages es un alojamiento estático: NO hay servidor ni base de
   datos que reciba esto. Por eso el formulario NUNCA dice "enviado".
   Lo único que hace es preparar el reporte para que la persona lo envíe:
     1) abrir su app de correo con el mensaje armado (mailto:), usando la
        dirección de contacto que ya figura en la página;
     2) copiar el reporte al portapapeles;
     3) descargarlo como archivo .txt.
   No se guarda ni se transmite nada desde este código.
   ===================================================================== */
(function () {
  "use strict";
  const root = document.getElementById("ovSuggest");
  if (!root || !window.OVCore || !window.OVUI || typeof CAREERS === "undefined") return;

  const { h, clear, toast } = window.OVUI;
  const Core = window.OVCore;
  const L = Core.LIMITES_SUGERENCIA;

  // La dirección sale del enlace de contacto que ya existe en la página
  // (single source of truth). Si no existe, el botón de correo no se muestra.
  const mailLink = document.querySelector('a[href^="mailto:"]:not([data-ov-suggest])');
  const EMAIL = mailLink ? decodeURIComponent(mailLink.getAttribute("href").replace(/^mailto:/i, "").split("?")[0]) : null;
  const EMAIL_OK = EMAIL && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(EMAIL) ? EMAIL : null;

  const campos = [
    { id: "sobre", label: "Carrera o institución relacionada", tipo: "input", req: true, ayuda: "Escribí el nombre y elegilo de la lista si aparece." },
    { id: "dato", label: "¿Qué dato creés que es incorrecto?", tipo: "textarea", req: true },
    { id: "correccion", label: "¿Cuál sería la corrección?", tipo: "textarea", req: true },
    { id: "fuente", label: "Enlace a una fuente que lo respalde (opcional)", tipo: "input", inputType: "url", placeholder: "https://" },
    { id: "comentario", label: "Comentario (opcional)", tipo: "textarea" }
  ];

  const refs = {};
  function valores() { const o = {}; campos.forEach(c => { o[c.id] = refs[c.id].input.value; }); return o; }

  function mostrarErrores(errores) {
    campos.forEach(c => {
      const r = refs[c.id];
      const msg = errores[c.id] || "";
      r.err.textContent = msg;
      if (msg) r.input.setAttribute("aria-invalid", "true"); else r.input.removeAttribute("aria-invalid");
    });
    const primero = campos.find(c => errores[c.id]);
    if (primero) refs[primero.id].input.focus();
  }

  function estado(msg) { refs._status.textContent = msg; }

  function preparar(accion) {
    const v = valores();
    const r = Core.validarSugerencia(v);
    mostrarErrores(r.errores);
    if (!r.ok) { estado("Revisá los campos marcados: hay datos que faltan o no son válidos."); return; }
    const cuerpo = Core.armarReporte(v, { pagina: location.href.split("#")[0] });
    if (accion === "mail") {
      if (!EMAIL_OK) { estado("No hay una dirección de correo configurada en esta página. Usá «Copiar reporte» o «Descargar» y envialo por el medio que prefieras."); return; }
      const url = Core.armarMailto(EMAIL_OK, "Corrección de datos — Orientación Vocacional", cuerpo);
      if (url.length > 1900) { estado("El reporte es muy largo para abrirlo en el correo. Usá «Copiar reporte» o «Descargar» y pegalo en tu mensaje."); return; }
      window.location.href = url;
      estado("Intentamos abrir tu aplicación de correo con el mensaje listo. Todavía NO se envió nada: tenés que enviarlo vos desde tu correo. Si no se abrió, usá «Copiar reporte» o «Descargar» y enviálo a " + EMAIL_OK + ".");
    } else if (accion === "copiar") {
      const ok = () => estado("Reporte copiado al portapapeles. Todavía NO se envió: pegalo en un correo" + (EMAIL_OK ? " a " + EMAIL_OK : "") + " o en el medio que prefieras.");
      const fallo = () => estado("No se pudo copiar automáticamente. Usá «Descargar» o seleccioná el texto del formulario manualmente.");
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(cuerpo).then(ok, fallo); else fallo();
    } else {
      const blob = new Blob([cuerpo + "\n"], { type: "text/plain;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = "sugerencia-orientacion-vocacional.txt";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      estado("Descargamos el reporte como archivo. Todavía NO se envió: adjuntalo o pegalo en un correo" + (EMAIL_OK ? " a " + EMAIL_OK : "") + ".");
    }
  }

  const datalist = h("datalist", { id: "ovSuggestList" },
    CAREERS.map(c => h("option", { value: c.nombre })).concat(Object.keys(INSTITUCIONES).map(id => h("option", { value: INSTITUCIONES[id].nombre }))));

  const form = h("form", { class: "ov-card", novalidate: true, "aria-describedby": "ovSuggestHint", onsubmit: e => e.preventDefault() }, [
    h("p", { class: "ov-note", id: "ovSuggestHint", style: "margin-top:0", text: "Este formulario no envía nada por sí solo: prepara el mensaje para que lo mandes vos por correo. No te pedimos datos personales." })
  ].concat(campos.map(c => {
    const id = "ovS-" + c.id;
    const input = c.tipo === "textarea"
      ? h("textarea", { id, maxlength: String(L[c.id]), rows: "3", "aria-required": c.req ? "true" : null, "aria-describedby": id + "-err" })
      : h("input", { id, type: c.inputType || "text", maxlength: String(L[c.id]), list: c.id === "sobre" ? "ovSuggestList" : null, placeholder: c.placeholder || null, autocomplete: "off", "aria-required": c.req ? "true" : null, "aria-describedby": id + "-err" });
    const err = h("p", { class: "ov-error", id: id + "-err", role: "alert" });
    refs[c.id] = { input, err };
    return h("div", { class: "ov-field" }, [
      h("label", { for: id, text: c.label + (c.req ? " *" : "") }),
      c.ayuda ? h("span", { class: "ov-help", style: "margin:0", text: c.ayuda }) : null,
      input, err
    ]);
  })).concat([
    h("div", { class: "ov-actions" }, [
      EMAIL_OK ? h("button", { type: "button", class: "ov-btn ov-btn-primary", onclick: () => preparar("mail") }, "✉️ Preparar correo") : null,
      h("button", { type: "button", class: "ov-btn", onclick: () => preparar("copiar") }, "📋 Copiar reporte"),
      h("button", { type: "button", class: "ov-btn", onclick: () => preparar("descargar") }, "⬇️ Descargar")
    ]),
    (refs._status = h("div", { class: "ov-status", role: "status", "aria-live": "polite" })),
    datalist
  ]));

  clear(root).appendChild(form);
  window.OVSuggest = { prefill(texto) { if (refs.sobre) refs.sobre.input.value = String(texto || "").slice(0, L.sobre); } };
})();
