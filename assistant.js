/* =====================================================================
   assistant.js — "Encontrá tu carrera ideal"
   ---------------------------------------------------------------------
   Interfaz del asistente guiado. La lógica de recomendación vive en
   ov-core.js (OVCore.recomendar) y usa SOLO los datos reales de
   careers-data.js. No hay IA externa: es un recomendador local basado
   en reglas y puntajes documentados en el README.

   Guarda en localStorage ("ov-asistente-v1") únicamente las respuestas
   a las preguntas y si querés usar el resultado del test vocacional.
   ===================================================================== */
(function () {
  "use strict";
  const root = document.getElementById("ovAssistant");
  if (!root || !window.OVCore || !window.OVUI || typeof CAREERS === "undefined") return;

  const { h, clear, toast, store } = window.OVUI;
  const Core = window.OVCore;
  const KEY = "ov-asistente-v1";

  // Completa las provincias con las que realmente existen en el catálogo.
  const STEPS = Core.STEPS.map(s => Object.assign({}, s));
  const provStep = STEPS.find(s => s.id === "provincia");
  provStep.opciones = Core.provinciasDisponibles(CAREERS, INSTITUCIONES).map(p => ({ id: p, label: p }));

  const state = { vista: "intro", paso: 0, answers: {}, usarRiasec: true };

  /* ---------- Persistencia (validada: nunca se confía en lo guardado) ---------- */
  function cargar() {
    const raw = store.get(KEY);
    if (!raw || typeof raw !== "object" || !raw.answers || typeof raw.answers !== "object") return;
    const limpio = {};
    STEPS.forEach(s => {
      const v = raw.answers[s.id];
      const validos = new Set(s.opciones.map(o => o.id));
      if (s.tipo === "multi" && Array.isArray(v)) {
        const f = v.filter(x => validos.has(x)).slice(0, s.max || 99);
        if (f.length) limpio[s.id] = f;
      } else if (s.tipo === "single" && typeof v === "string" && validos.has(v)) limpio[s.id] = v;
    });
    state.answers = limpio;
    state.usarRiasec = raw.usarRiasec !== false;
  }
  function guardar() { store.set(KEY, { answers: state.answers, usarRiasec: state.usarRiasec }); }

  function hayRespuestas() { return Object.keys(state.answers).length > 0; }

  function resultadoTestGuardado() {
    const raw = store.get(window.OV_TEST_STORAGE_KEY || "ov_test_vocacional_v3");
    return raw && raw.scores && typeof raw.scores === "object" ? raw.scores : null;
  }

  function pasosVisibles() {
    return STEPS.filter(s => s.id !== "moverse" || state.answers.provincia);
  }

  /* ---------- Piezas ---------- */
  function live() { return document.getElementById("ovAssistantLive"); }
  function anunciar(t) { const l = live(); if (l) l.textContent = t; }

  function opcion(step, o, seleccionado, onChange, deshabilitado) {
    const multi = step.tipo === "multi";
    const input = h("input", { type: multi ? "checkbox" : "radio", name: "ov-q-" + step.id, value: o.id, onchange: onChange });
    input.checked = seleccionado;
    input.disabled = !!deshabilitado;
    return h("label", { class: "ov-opt" + (multi ? " is-multi" : "") }, [input, h("span", { text: o.label })]);
  }

  /* ---------- Vistas ---------- */
  function vistaIntro() {
    const tieneTest = !!resultadoTestGuardado();
    const frag = [
      h("div", { class: "ov-card" }, [
        h("p", { class: "ov-intro", text: "Respondé unas pocas preguntas sobre lo que te gusta y lo que necesitás (podés saltear las que no sepas) y te mostramos hasta 5 carreras de esta guía que encajan con vos, explicando por qué." }),
        tieneTest ? h("label", { class: "ov-check" }, [
          (function () { const i = h("input", { type: "checkbox", id: "ovUseRiasec", onchange: e => { state.usarRiasec = e.target.checked; guardar(); } }); i.checked = state.usarRiasec; return i; })(),
          h("span", { text: "Usar también mi resultado del test vocacional (así no tenés que repetir esas respuestas)." })
        ]) : null,
        h("div", { class: "ov-actions" }, [
          h("button", { type: "button", class: "ov-btn ov-btn-primary", onclick: () => { state.vista = "preguntas"; state.paso = 0; render(); } }, hayRespuestas() ? "Revisar mis respuestas" : "Empezar"),
          hayRespuestas() ? h("button", { type: "button", class: "ov-btn", onclick: () => { state.vista = "resultados"; render(); } }, "Ver mis últimas recomendaciones") : null,
          hayRespuestas() ? h("button", { type: "button", class: "ov-btn-link", onclick: reiniciar }, "Empezar de nuevo") : null
        ]),
        h("p", { class: "ov-note", text: "Es una herramienta de orientación y exploración, no un diagnóstico psicológico ni una decisión definitiva sobre tu futuro. Guardamos tus respuestas solo en este navegador." })
      ])
    ];
    return frag;
  }

  function vistaPregunta() {
    const pasos = pasosVisibles();
    if (state.paso >= pasos.length) state.paso = pasos.length - 1;
    const step = pasos[state.paso];
    const actual = state.answers[step.id];
    const esUltimo = state.paso === pasos.length - 1;
    const seleccion = step.tipo === "multi" ? (Array.isArray(actual) ? actual : []) : actual;
    const maxAlcanzado = step.tipo === "multi" && step.max && seleccion.length >= step.max;

    const onChange = e => {
      const v = e.target.value;
      if (step.tipo === "multi") {
        const list = Array.isArray(state.answers[step.id]) ? state.answers[step.id].slice() : [];
        const i = list.indexOf(v);
        if (e.target.checked && i === -1) list.push(v);
        if (!e.target.checked && i > -1) list.splice(i, 1);
        if (list.length) state.answers[step.id] = list; else delete state.answers[step.id];
      } else state.answers[step.id] = v;
      if (step.id === "provincia") { /* mostrar/ocultar "moverse" cambia el total de pasos */ }
      guardar();
      renderPreguntaEnSitio();
    };

    const legend = h("legend", { tabindex: "-1", id: "ovQLegend", text: step.titulo });
    const opts = h("div", { class: "ov-opts" }, step.opciones.map(o => {
      const sel = step.tipo === "multi" ? seleccion.includes(o.id) : seleccion === o.id;
      return opcion(step, o, sel, onChange, step.tipo === "multi" && maxAlcanzado && !sel);
    }));
    const avance = Math.round(((state.paso) / pasos.length) * 100);

    return [h("div", { class: "ov-card" }, [
      h("div", { class: "ov-progress" }, [
        h("span", { text: "Pregunta " + (state.paso + 1) + " de " + pasos.length }),
        h("div", { class: "ov-progress-track", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(avance), "aria-label": "Progreso del asistente" },
          h("div", { class: "ov-progress-fill", style: "width:" + avance + "%" }))
      ]),
      h("fieldset", { class: "ov-q" }, [legend, step.ayuda ? h("p", { class: "ov-help", text: step.ayuda }) : null, opts]),
      step.id === "provincia" && !step.opciones.length ? h("p", { class: "ov-note", text: "No hay provincias cargadas." }) : null,
      h("div", { class: "ov-actions" }, [
        h("button", { type: "button", class: "ov-btn", disabled: state.paso === 0, onclick: () => { state.paso--; render(); } }, "← Atrás"),
        h("button", { type: "button", class: "ov-btn", onclick: () => { delete state.answers[step.id]; guardar(); avanzar(esUltimo); } }, "Omitir"),
        h("button", { type: "button", class: "ov-btn ov-btn-primary", onclick: () => avanzar(esUltimo) }, esUltimo ? "Ver mis recomendaciones" : "Siguiente →"),
        h("button", { type: "button", class: "ov-btn-link", onclick: () => { state.vista = "intro"; render(); } }, "Salir")
      ])
    ])];
  }

  function avanzar(esUltimo) {
    if (esUltimo) { state.vista = "resultados"; } else state.paso++;
    render();
  }

  function reiniciar() {
    state.answers = {}; state.paso = 0; state.vista = "preguntas";
    store.remove(KEY);
    render();
    toast("Empezaste de nuevo. Tus respuestas anteriores se borraron de este navegador.");
  }

  function lista(titulo, items) {
    if (!items || !items.length) return null;
    return [h("h4", { text: titulo }), h("ul", {}, items.map(t => h("li", { text: t })))];
  }

  function tarjeta(r, i) {
    const OV = window.OV;
    const etiqueta = r.confianza === "alta" ? "Coincidencia alta" : r.confianza === "media" ? "Coincidencia media" : "Coincidencia baja";
    const fav = h("button", { type: "button", class: "ov-btn", "aria-pressed": OV && OV.isFavorite(r.id) ? "true" : "false", "data-fav": r.id,
      onclick: () => { OV.toggleFavorite(r.id); } }, OV && OV.isFavorite(r.id) ? "❤️ En favoritos" : "🤍 Guardar en favoritos");
    const cmp = h("button", { type: "button", class: "ov-btn", "aria-pressed": OV && OV.isInCompare(r.id) ? "true" : "false", "data-cmp": r.id,
      onclick: () => { OV.toggleCompare(r.id); } }, OV && OV.isInCompare(r.id) ? "✓ En el comparador" : "⚖️ Agregar al comparador");
    const plan = h("button", { type: "button", class: "ov-btn", onclick: () => { if (window.OVPlan) window.OVPlan.addCareer(r.id); } }, "📝 Agregar a mi plan");
    return h("article", { class: "ov-result", "aria-labelledby": "ovr-" + r.id }, [
      h("div", { class: "ov-result-head" }, [
        h("h3", { id: "ovr-" + r.id, text: (i + 1) + ". " + r.nombre }),
        h("span", { class: "ov-badge " + r.confianza, text: etiqueta + " · " + r.score + "/100" })
      ]),
      lista("Por qué te la sugerimos", r.coincidencias.length ? r.coincidencias : r.razones),
      lista("Lo que no coincide con lo que pediste", r.noCoincide),
      lista("Conviene investigar", r.aInvestigar),
      h("div", { class: "ov-actions" }, [
        h("button", { type: "button", class: "ov-btn ov-btn-primary", onclick: () => OV && OV.openDetail(r.id) }, "Ver ficha completa"),
        fav, cmp, plan
      ])
    ]);
  }

  function vistaResultados() {
    const scores = state.usarRiasec ? resultadoTestGuardado() : null;
    const riasec = scores && window.CATEGORY_RIASEC ? { scores, perfiles: window.CATEGORY_RIASEC } : null;
    const res = Core.recomendar(state.answers, CAREERS, INSTITUCIONES, { riasec });
    const nodos = [];

    nodos.push(h("div", { class: "ov-actions", style: "margin:0 0 14px" }, [
      h("button", { type: "button", class: "ov-btn", onclick: () => { state.vista = "preguntas"; state.paso = 0; render(); } }, "✏️ Editar mis respuestas"),
      h("button", { type: "button", class: "ov-btn-link", onclick: reiniciar }, "Empezar de nuevo")
    ]));

    if (res.mensaje) nodos.push(h("p", { class: "ov-warn", role: "status", text: res.mensaje }));
    if (res.resultados.length) {
      nodos.push(h("p", { class: "ov-intro", style: "margin:0 0 12px", text: "Estas son " + res.resultados.length + " carreras del catálogo que mejor encajan con tus respuestas" + (riasec ? " y con tu test vocacional" : "") + ". El puntaje resume cuántas de tus preferencias coinciden con los datos de cada ficha; no mide tu capacidad ni garantiza resultados." }));
      const cont = h("div", { class: "ov-results" }, res.resultados.map(tarjeta));
      nodos.push(cont);
      nodos.push(h("div", { class: "ov-actions" }, [
        res.resultados.length >= 2 ? h("button", { type: "button", class: "ov-btn", onclick: () => window.compareCareersFromOutside && window.compareCareersFromOutside(res.resultados.slice(0, 3).map(r => r.id)) }, "⚖️ Comparar las primeras " + Math.min(3, res.resultados.length)) : null,
        h("button", { type: "button", class: "ov-btn", onclick: () => { res.resultados.forEach(r => window.OVPlan && window.OVPlan.addCareer(r.id, true)); toast("Agregamos estas carreras a tu plan."); } }, "📝 Agregar todas a mi plan")
      ]));
    }
    if (res.excluidas > 0 && state.answers.moverse === "no") {
      nodos.push(h("p", { class: "ov-note", text: "Dejamos afuera " + res.excluidas + " carreras que no tienen sede en la provincia que elegiste ni se cursan a distancia (según los datos cargados)." }));
    }
    nodos.push(h("p", { class: "ov-disclaimer", text: "Esto es orientación para explorar opciones, no un diagnóstico ni una decisión definitiva. Antes de decidir, confirmá requisitos, modalidad y fechas en el sitio oficial de cada institución." }));
    return nodos;
  }

  /* ---------- Render ---------- */
  function render() {
    clear(root);
    root.appendChild(h("div", { id: "ovAssistantLive", class: "ov-sr-only", role: "status", "aria-live": "polite" }));
    const nodos = state.vista === "intro" ? vistaIntro() : state.vista === "preguntas" ? vistaPregunta() : vistaResultados();
    nodos.filter(Boolean).forEach(n => root.appendChild(n));
    if (state.vista === "preguntas") {
      const lg = document.getElementById("ovQLegend");
      if (lg && root.dataset.ready) lg.focus({ preventScroll: true });
      anunciar("Pregunta " + (state.paso + 1));
    } else if (state.vista === "resultados" && root.dataset.ready) {
      anunciar("Resultados listos");
      const first = root.querySelector(".ov-result h3, .ov-warn");
      if (first) { first.setAttribute("tabindex", "-1"); first.focus({ preventScroll: false }); }
    }
    root.dataset.ready = "1";
  }

  // Al elegir una opción se re-renderiza solo la pregunta, conservando el foco en la opción.
  function renderPreguntaEnSitio() {
    const activo = document.activeElement;
    const val = activo && activo.getAttribute && activo.getAttribute("value");
    const name = activo && activo.getAttribute && activo.getAttribute("name");
    render();
    if (name && val != null) {
      const again = root.querySelector('input[name="' + CSS.escape(name) + '"][value="' + CSS.escape(val) + '"]');
      if (again) again.focus({ preventScroll: true });
    }
  }

  // Mantiene sincronizados los botones de favoritos / comparador de las tarjetas.
  function sincronizarBotones() {
    const OV = window.OV; if (!OV) return;
    root.querySelectorAll("[data-fav]").forEach(b => {
      const on = OV.isFavorite(b.dataset.fav);
      b.setAttribute("aria-pressed", on ? "true" : "false");
      b.textContent = on ? "❤️ En favoritos" : "🤍 Guardar en favoritos";
    });
    root.querySelectorAll("[data-cmp]").forEach(b => {
      const on = OV.isInCompare(b.dataset.cmp);
      b.setAttribute("aria-pressed", on ? "true" : "false");
      b.textContent = on ? "✓ En el comparador" : "⚖️ Agregar al comparador";
    });
  }
  document.addEventListener("ov:favorites-changed", sincronizarBotones);
  document.addEventListener("ov:compare-changed", sincronizarBotones);

  cargar();
  render();
  window.OVAssistant = { getAnswers: () => JSON.parse(JSON.stringify(state.answers)), recomendar: () => Core.recomendar(state.answers, CAREERS, INSTITUCIONES) };
})();
