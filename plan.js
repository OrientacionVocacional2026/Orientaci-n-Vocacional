/* =====================================================================
   plan.js — "Mi plan para empezar a estudiar"
   ---------------------------------------------------------------------
   Organiza carreras, instituciones, becas, tareas, documentación y notas.
   - Se guarda SOLO en este navegador (localStorage "ov-plan-v1").
   - No pide datos personales.
   - No incluye fechas de inscripción: cambian cada año y no se pueden
     garantizar; el plan siempre manda a confirmarlas en el sitio oficial.
   - Imprimir / guardar como PDF usa la impresión del navegador.
   ===================================================================== */
(function () {
  "use strict";
  const root = document.getElementById("ovPlan");
  if (!root || !window.OVCore || !window.OVUI || typeof CAREERS === "undefined") return;

  const { h, clear, toast, store, safeUrl } = window.OVUI;
  const Core = window.OVCore;
  const KEY = "ov-plan-v1";
  const ctx = {
    careerIds: new Set(CAREERS.map(c => c.id)),
    instIds: new Set(Object.keys(INSTITUCIONES)),
    nBecas: typeof BECAS_GENERALES !== "undefined" ? BECAS_GENERALES.length : 0
  };
  const BECAS = typeof BECAS_GENERALES !== "undefined" ? BECAS_GENERALES : [];

  let plan = Core.normalizarPlan(store.get(KEY), ctx);
  let guardadoOk = true;
  let notasTimer = null;

  function guardar() {
    plan.actualizado = new Date().toISOString();
    guardadoOk = store.set(KEY, plan);
    const aviso = document.getElementById("ovPlanSave");
    if (aviso) aviso.textContent = guardadoOk ? "Guardado en este navegador." : "No se pudo guardar: tu navegador bloquea el almacenamiento (¿modo privado?). Copiá o imprimí el plan para no perderlo.";
  }

  function carreraPorId(id) { return CAREERS.find(c => c.id === id); }

  /* ---------- API pública (la usa el asistente) ---------- */
  function addCareer(id, silencioso) {
    if (!ctx.careerIds.has(id)) return false;
    if (plan.carreras.includes(id)) { if (!silencioso) toast("Esa carrera ya está en tu plan."); return false; }
    plan.carreras.push(id);
    guardar(); render();
    if (!silencioso) toast("Agregada a tu plan.");
    return true;
  }
  window.OVPlan = { addCareer, getPlan: () => JSON.parse(JSON.stringify(plan)) };

  /* ---------- Piezas ---------- */
  function bloque(titulo, hijos, id) {
    return h("section", { class: "ov-plan-block", "aria-labelledby": id }, [h("h3", { id, text: titulo })].concat(hijos));
  }

  function check(idChk, texto, marcado, onChange) {
    const i = h("input", { type: "checkbox", id: idChk, onchange: e => onChange(e.target.checked) });
    i.checked = marcado;
    return h("label", { class: "ov-task", for: idChk }, [i, h("span", { text: texto })]);
  }

  function bloqueCarreras(armado) {
    const items = armado.carreras.map(c => h("li", {}, [
      h("span", {}, [c.nombre, c.duracion ? h("span", { class: "ov-sub", text: c.duracion + " años" }) : null]),
      h("span", { class: "ov-no-print" }, [
        h("button", { type: "button", class: "ov-mini", onclick: () => window.OV && window.OV.openDetail(c.id) }, "Ver ficha"),
        h("button", { type: "button", class: "ov-mini", "aria-label": "Quitar " + c.nombre + " del plan", onclick: () => { plan.carreras = plan.carreras.filter(x => x !== c.id); guardar(); render(); } }, "Quitar")
      ])
    ]));
    const dl = h("datalist", { id: "ovPlanCareerList" }, CAREERS.map(c => h("option", { value: c.nombre })));
    const input = h("input", { type: "text", id: "ovPlanCareerInput", list: "ovPlanCareerList", placeholder: "Escribí el nombre de una carrera", "aria-label": "Agregar una carrera al plan", autocomplete: "off" });
    const err = h("p", { class: "ov-error", id: "ovPlanCareerErr", role: "alert" });
    const agregar = () => {
      const n = Core.normalize(input.value);
      const found = n && CAREERS.filter(c => Core.normalize(c.nombre) === n);
      if (!n) { err.textContent = "Escribí el nombre de una carrera."; return; }
      if (!found.length) { err.textContent = "No encontramos una carrera con ese nombre exacto. Elegila de la lista que aparece al escribir."; return; }
      err.textContent = ""; input.value = ""; addCareer(found[0].id);
    };
    const favs = (window.OV && window.OV.getFavorites ? window.OV.getFavorites() : []).filter(id => !plan.carreras.includes(id));
    return bloque("Carreras que me interesan", [
      items.length ? h("ul", { class: "ov-list" }, items) : h("p", { class: "ov-empty", text: "Todavía no elegiste carreras. Podés traerlas desde tus favoritas, desde el asistente o escribir el nombre." }),
      h("div", { class: "ov-inline-form ov-no-print" }, [input, dl, h("button", { type: "button", class: "ov-btn", onclick: agregar }, "Agregar")]),
      err,
      h("div", { class: "ov-actions ov-no-print" }, [
        h("button", { type: "button", class: "ov-btn", disabled: !favs.length, onclick: () => { favs.forEach(id => plan.carreras.push(id)); guardar(); render(); toast("Traímos tus favoritas al plan."); } },
          favs.length ? "❤️ Traer mis favoritas (" + favs.length + ")" : "❤️ No hay favoritas para traer"),
        h("a", { class: "ov-btn", href: "#asistente" }, "🧭 Usar el asistente")
      ])
    ], "ovPlanH1");
  }

  function bloqueInstituciones(armado) {
    const items = armado.instituciones.map(i => {
      const link = safeUrl(i.web);
      return h("li", {}, [
        h("span", {}, [
          i.nombre,
          h("span", { class: "ov-sub", text: i.carreras.length ? "Para: " + i.carreras.join(" · ") : "Agregada por vos" }),
          link ? h("a", { href: link, target: "_blank", rel: "noopener noreferrer", text: link }) : h("span", { class: "ov-sub", text: "Sin sitio web cargado: buscá el sitio oficial de la institución." }),
          i.arancel ? h("span", { class: "ov-sub", text: "Costo (según la ficha): " + i.arancel }) : h("span", { class: "ov-sub", text: "Costo: sin dato cargado, consultalo en la institución." }),
          i.ingreso ? h("details", { class: "ov-no-print" }, [h("summary", { text: "Requisitos de ingreso conocidos" }), h("p", { class: "ov-sub", text: i.ingreso })]) : h("span", { class: "ov-sub", text: "Requisitos de ingreso: sin dato cargado, consultalos en el sitio oficial." })
        ])
      ]);
    });
    const sel = h("select", { id: "ovPlanInstSel", "aria-label": "Agregar una institución al plan" }, [h("option", { value: "", text: "Agregar otra institución…" })]
      .concat(Object.keys(INSTITUCIONES).filter(id => !armado.instituciones.some(i => i.id === id)).sort((a, b) => INSTITUCIONES[a].nombre.localeCompare(INSTITUCIONES[b].nombre, "es")).map(id => h("option", { value: id, text: INSTITUCIONES[id].nombre }))));
    sel.className = "ov-select";
    sel.addEventListener("change", () => { if (sel.value && ctx.instIds.has(sel.value) && !plan.instituciones.includes(sel.value)) { plan.instituciones.push(sel.value); guardar(); render(); } });
    return bloque("Instituciones para consultar", [
      items.length ? h("ul", { class: "ov-list" }, items) : h("p", { class: "ov-empty", text: "Aparecen automáticamente las instituciones de las carreras que elijas." }),
      h("div", { class: "ov-inline-form ov-no-print" }, [sel])
    ], "ovPlanH2");
  }

  function bloqueTareas() {
    const todas = Core.TAREAS_BASE.concat(plan.tareas);
    const items = todas.map(t => {
      const propia = plan.tareas.some(x => x.id === t.id);
      return h("li", {}, [
        check("ovT-" + t.id, t.texto, !!plan.hechas[t.id], v => { if (v) plan.hechas[t.id] = true; else delete plan.hechas[t.id]; guardar(); actualizarProgreso(); }),
        propia ? h("button", { type: "button", class: "ov-mini ov-no-print", "aria-label": "Eliminar tarea: " + t.texto, onclick: () => { plan.tareas = plan.tareas.filter(x => x.id !== t.id); delete plan.hechas[t.id]; guardar(); render(); } }, "Eliminar") : null
      ]);
    });
    const input = h("input", { type: "text", id: "ovTaskInput", maxlength: "200", placeholder: "Escribí una tarea propia", "aria-label": "Nueva tarea", autocomplete: "off" });
    const err = h("p", { class: "ov-error", role: "alert" });
    const add = () => {
      const r = Core.agregarTarea(plan, input.value);
      if (!r.ok) { err.textContent = r.error; return; }
      err.textContent = ""; guardar(); render();
      const again = document.getElementById("ovTaskInput"); if (again) again.focus();
    };
    input.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); add(); } });
    return bloque("Tareas pendientes", [
      h("p", { class: "ov-sub", id: "ovPlanProgress" }),
      h("ul", { class: "ov-list" }, items),
      h("div", { class: "ov-inline-form ov-no-print" }, [input, h("button", { type: "button", class: "ov-btn", onclick: add }, "Agregar tarea")]),
      err
    ], "ovPlanH3");
  }

  function actualizarProgreso() {
    const el = document.getElementById("ovPlanProgress"); if (!el) return;
    const todas = Core.TAREAS_BASE.concat(plan.tareas);
    const hechas = todas.filter(t => plan.hechas[t.id]).length;
    el.textContent = hechas + " de " + todas.length + " tareas completadas";
  }

  function bloqueDocs(armado) {
    return bloque("Documentación para preparar", [
      h("p", { class: "ov-sub", text: "Documentación habitual. Cada institución define la suya: confirmá cuál te piden en su sitio oficial." }),
      h("ul", { class: "ov-list" }, armado.documentacion.map(d => h("li", {}, [
        check("ovD-" + d.id, d.texto, !!plan.docsListos[d.id], v => { if (v) plan.docsListos[d.id] = true; else delete plan.docsListos[d.id]; guardar(); })
      ])))
    ], "ovPlanH4");
  }

  function bloqueBecas() {
    if (!BECAS.length) return null;
    return bloque("Becas que quiero revisar", [
      h("ul", { class: "ov-list" }, BECAS.map((b, i) => {
        const link = safeUrl(b.url); // enlace oficial (campo url de BECAS_GENERALES)
        return h("li", {}, [
          h("div", { style: "flex:1" }, [
            check("ovB-" + i, b.nombre + " (" + b.alcance + ")", plan.becas.includes(String(i)), v => {
              const s = String(i);
              if (v && !plan.becas.includes(s)) plan.becas.push(s);
              if (!v) plan.becas = plan.becas.filter(x => x !== s);
              guardar();
            }),
            h("span", { class: "ov-sub", style: "padding-left:28px", text: "Quiénes pueden postularse: " + (b.requisitos || "consultar en el sitio oficial") }),
            link ? h("a", { style: "padding-left:28px", href: link, target: "_blank", rel: "noopener noreferrer", text: link }) : null
          ])
        ]);
      }))
    ], "ovPlanH5");
  }

  function bloqueFechas() {
    return bloque("Fechas importantes", [
      h("p", { class: "ov-note", style: "margin:0", text: "No cargamos fechas de inscripción ni de becas porque cambian todos los años y no podemos garantizarlas. Confirmalas en el sitio oficial de cada institución y anotalas abajo, en tus notas." })
    ], "ovPlanH6");
  }

  function bloqueNotas() {
    const ta = h("textarea", { id: "ovPlanNotes", maxlength: String(5000), rows: "5", "aria-label": "Notas personales", placeholder: "Fechas que confirmaste, preguntas para hacer, ideas…" });
    ta.value = plan.notas;
    const contador = h("div", { class: "ov-count", id: "ovPlanCount", text: plan.notas.length + " / 5000" });
    ta.addEventListener("input", () => {
      contador.textContent = ta.value.length + " / 5000";
      clearTimeout(notasTimer);
      notasTimer = setTimeout(() => { plan.notas = ta.value.slice(0, 5000); guardar(); }, 400);
    });
    ta.addEventListener("blur", () => { clearTimeout(notasTimer); plan.notas = ta.value.slice(0, 5000); guardar(); });
    return bloque("Notas personales", [ta, contador], "ovPlanH7");
  }

  function imprimir() {
    // Guarda lo último escrito en notas antes de imprimir.
    const ta = document.getElementById("ovPlanNotes"); if (ta) { plan.notas = ta.value.slice(0, 5000); guardar(); }
    document.body.classList.add("print-plan");
    const quitar = () => { document.body.classList.remove("print-plan"); window.removeEventListener("afterprint", quitar); };
    window.addEventListener("afterprint", quitar);
    window.print();
    setTimeout(quitar, 1500);
  }

  function copiar() {
    const armado = Core.armarPlan(plan, CAREERS, INSTITUCIONES, BECAS);
    const texto = Core.planATexto(plan, armado);
    const ok = () => toast("Plan copiado. Pegalo en una nota o en un mensaje.");
    const fallback = () => {
      const t = h("textarea", { style: "position:fixed;opacity:0" }); t.value = texto; document.body.appendChild(t); t.select();
      try { document.execCommand("copy") ? ok() : toast("No se pudo copiar automáticamente."); } catch (e) { toast("No se pudo copiar automáticamente."); }
      document.body.removeChild(t);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(texto).then(ok, fallback); else fallback();
  }

  function borrar() {
    const btn = document.getElementById("ovPlanDelete");
    if (btn && btn.dataset.armed !== "1") { btn.dataset.armed = "1"; btn.textContent = "Tocá de nuevo para confirmar"; setTimeout(() => { if (btn) { btn.dataset.armed = ""; btn.textContent = "🗑️ Borrar mi plan"; } }, 4000); return; }
    plan = Core.defaultPlan(); store.remove(KEY); render(); toast("Borramos tu plan de este navegador.");
  }

  function render() {
    const foco = document.activeElement && document.activeElement.id;
    clear(root);
    const armado = Core.armarPlan(plan, CAREERS, INSTITUCIONES, BECAS);
    root.appendChild(h("div", { class: "ov-plan-grid" }, [
      h("p", { class: "ov-warn ov-no-print", role: "note", text: "Tu plan se guarda solo en este navegador y en este dispositivo. Si borrás los datos del navegador o entrás desde otro aparato, se pierde: imprimilo o copialo para conservarlo." }),
      bloqueCarreras(armado), bloqueInstituciones(armado), bloqueTareas(), bloqueDocs(armado), bloqueBecas(), bloqueFechas(), bloqueNotas(),
      h("div", { class: "ov-actions ov-no-print" }, [
        h("button", { type: "button", class: "ov-btn ov-btn-primary", onclick: imprimir }, "🖨️ Imprimir o guardar como PDF"),
        h("button", { type: "button", class: "ov-btn", onclick: copiar }, "📋 Copiar como texto"),
        h("button", { type: "button", class: "ov-btn-link", id: "ovPlanDelete", onclick: borrar }, "🗑️ Borrar mi plan")
      ]),
      h("p", { class: "ov-note ov-no-print", id: "ovPlanSave", role: "status", "aria-live": "polite" }),
      h("p", { class: "ov-print-only", text: armado.avisoFechas })
    ].filter(Boolean)));
    actualizarProgreso();
    if (foco) { const el = document.getElementById(foco); if (el && el.focus) el.focus({ preventScroll: true }); }
  }

  document.addEventListener("ov:favorites-changed", () => {
    // Solo refresca el botón de "traer favoritas"; no pisa lo que se está escribiendo.
    const act = document.activeElement;
    if (act && (act.tagName === "TEXTAREA" || act.tagName === "INPUT")) return;
    render();
  });

  render();
})();
