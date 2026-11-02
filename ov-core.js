/* =====================================================================
   ov-core.js — Lógica pura (sin DOM) de las herramientas nuevas
   ---------------------------------------------------------------------
   Funciona en el navegador (window.OVCore) y en Node (require), por eso
   se puede probar con `npm test` sin abrir un navegador.

   Contiene:
   1) Utilidades de datos: normalización de texto, modalidad, ubicación,
      tipo de título, gestión pública/privada.
   2) El RECOMENDADOR del asistente "Encontrá tu carrera ideal".
   3) Lógica del "Plan para empezar a estudiar" (limpieza de datos
      guardados, armado de pasos y documentación).
   4) Validación y armado del reporte de "¿Encontraste un dato incorrecto?".

   NO inventa datos: todo sale de CAREERS / INSTITUCIONES / BECAS_GENERALES.
   ===================================================================== */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.OVCore = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* ------------------------------------------------------------------
     1) UTILIDADES
     ------------------------------------------------------------------ */
  function normalize(str) {
    return String(str == null ? "" : str)
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/\s+/g, " ").trim();
  }

  function institucionIds(c) {
    return Array.isArray(c.institucion) ? c.institucion : (c.institucion ? [c.institucion] : []);
  }

  function tipoTitulo(nombre) {
    const n = normalize(nombre);
    if (n.startsWith("licenciatura")) return "Licenciatura";
    if (n.startsWith("ingenieria")) return "Ingeniería";
    if (n.startsWith("tecnicatura") || n.startsWith("tecnico")) return "Tecnicatura";
    if (n.startsWith("profesorado")) return "Profesorado";
    if (n.startsWith("analista universitario")) return "Analista Universitario";
    if (n.startsWith("doctorado")) return "Posgrado";
    return "Otros títulos";
  }

  // Mismo criterio que vocational-test.js: no se recomienda a quien recién
  // termina el secundario algo que exige título previo.
  const NOT_ENTRY_LEVEL_RE = /\(CCC\)|Ciclo de Complementaci[oó]n|Ciclo de Licenciatura|Posgrado|Maestr[ií]a|Doctorado|^Especializaci[oó]n|Diplomatura|para Abogados/i;
  function requiereTituloPrevio(c) {
    return c.categoria === "Posgrado" || NOT_ENTRY_LEVEL_RE.test(c.nombre || "");
  }

  /* Modalidad. Devuelve { valores: [...], confiable: bool }.
     Es "confiable" solo si el dato viene de modalidadTipo, del texto de
     modalidadInstituciones o de Siglo 21 (100% virtual). Para el resto
     script.js asume "presencial" por defecto, pero eso es una suposición:
     acá se marca como NO confiable y el recomendador no lo usa para
     descartar ni para premiar. */
  function modalidadInfo(c) {
    if (Array.isArray(c.modalidadTipo) && c.modalidadTipo.length) {
      return { valores: c.modalidadTipo.slice(), confiable: true };
    }
    const txt = normalize(c.modalidadInstituciones || "");
    if (txt) {
      const v = [];
      if (/virtual|a distancia|sied/.test(txt)) v.push("virtual");
      if (/presencial/.test(txt)) v.push("presencial");
      if (/hibrid|semipresencial/.test(txt)) v.push("hibrida");
      if (v.length) return { valores: v, confiable: true };
    }
    const ids = institucionIds(c);
    if (ids.length && ids.every(id => id === "siglo21")) return { valores: ["virtual"], confiable: true };
    return { valores: ids.length ? ["presencial"] : [], confiable: false };
  }

  function ubicacionesDe(c, instituciones) {
    if (Array.isArray(c.ubicaciones) && c.ubicaciones.length) return c.ubicaciones;
    const out = [], seen = new Set();
    institucionIds(c).forEach(id => {
      const inst = instituciones && instituciones[id];
      ((inst && inst.ubicaciones) || []).forEach(u => {
        const k = u.ciudad + "|" + u.provincia;
        if (!seen.has(k)) { seen.add(k); out.push(u); }
      });
    });
    return out;
  }

  /* "publica" | "privada" | null (si el tipo no permite saberlo) */
  function gestionDe(inst) {
    const t = normalize(inst && inst.tipo);
    if (!t) return null;
    if (/privad/.test(t)) return "privada";
    if (/public|estatal|nacional|oficiales|suboficiales|policia|penitenciari|ejercito|armada|fuerza aerea|gendarmeria|prefectura/.test(t)) return "publica";
    return null;
  }

  function gestionesDe(c, instituciones) {
    const set = new Set();
    institucionIds(c).forEach(id => { const g = gestionDe(instituciones && instituciones[id]); if (g) set.add(g); });
    return Array.from(set);
  }

  /* Primer número de un texto como "1.240.000" o "620.000 – 1.240.000". */
  function numeroARS(texto) {
    if (!texto) return null;
    const nums = String(texto).match(/\d[\d.]*/g);
    if (!nums) return null;
    const vals = nums.map(n => parseInt(n.replace(/\./g, ""), 10)).filter(n => !isNaN(n));
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }

  function aniosDe(c) {
    return typeof c.duracionAnios === "number" && c.duracionAnios > 0 ? c.duracionAnios : null;
  }

  /* ------------------------------------------------------------------
     2) PREGUNTAS DEL ASISTENTE
     Cada opción de las preguntas de intereses vincula con (a) categorías
     reales del catálogo y (b) palabras clave que se buscan en el nombre,
     las habilidades y las materias de cada carrera.
     ------------------------------------------------------------------ */
  const STEPS = [
    {
      id: "intereses", tipo: "multi", esencial: false, max: 4, grupo: "afinidad",
      titulo: "¿Qué temas te llaman la atención?",
      ayuda: "Elegí hasta 4. Si no sabés, podés saltear esta pregunta.",
      opciones: [
        { id: "tecnologia", label: "Tecnología y computadoras", cats: ["Tecnología"], kw: ["software", "programacion", "sistemas", "datos", "informatic", "redes", "computac"] },
        { id: "salud", label: "Salud y cuidado de personas", cats: ["Salud"], kw: ["salud", "paciente", "clinic", "enfermeria", "nutricion", "kinesio"] },
        { id: "educacion", label: "Enseñar y educar", cats: ["Educación"], kw: ["ensenanza", "docente", "pedagog", "educativ", "profesorado"] },
        { id: "negocios", label: "Negocios, dinero y empresas", cats: ["Ciencias Económicas"], kw: ["empresa", "administracion", "finanzas", "contab", "marketing", "comercio", "gestion"] },
        { id: "naturaleza", label: "Naturaleza, campo y ambiente", cats: ["Sustentabilidad y Turismo", "Ciencias Exactas y Naturales"], kw: ["ambiente", "agropecuari", "agronom", "forestal", "biolog", "recursos naturales", "animal"] },
        { id: "arte", label: "Arte, diseño y comunicación", cats: ["Diseño y Comunicación"], kw: ["diseno", "arte", "comunicacion", "audiovisual", "periodismo", "creativ", "multimedia"] },
        { id: "leyes", label: "Leyes, justicia y seguridad", cats: ["Derecho y Seguridad"], kw: ["derecho", "juridic", "justicia", "seguridad", "legal", "criminal"] },
        { id: "ingenieria", label: "Construir, fabricar y resolver problemas técnicos", cats: ["Ingeniería"], kw: ["ingenieria", "industrial", "mecanic", "electric", "construccion", "procesos", "proyectar"] },
        { id: "sociedad", label: "Personas, sociedad y cultura", cats: ["Humanidades y Ciencias Sociales"], kw: ["social", "psicolog", "historia", "cultura", "comunidad", "humanidades"] },
        { id: "ciencia", label: "Ciencia, matemática e investigación", cats: ["Ciencias Exactas y Naturales"], kw: ["matematica", "fisica", "quimica", "investigacion", "estadistica", "laboratorio"] }
      ]
    },
    {
      id: "actividades", tipo: "multi", esencial: false, max: 3, grupo: "afinidad",
      titulo: "¿Qué actividades disfrutás hacer?",
      ayuda: "Elegí hasta 3.",
      opciones: [
        { id: "analizar", label: "Analizar datos y resolver problemas lógicos", cats: ["Tecnología", "Ciencias Exactas y Naturales"], kw: ["analisis", "datos", "logic", "resolucion de problemas", "estadistica"] },
        { id: "ayudar", label: "Ayudar y acompañar a otras personas", cats: ["Salud", "Educación"], kw: ["empatia", "acompan", "atencion", "cuidado", "trabajo social"] },
        { id: "crear", label: "Crear cosas: diseñar, escribir, producir", cats: ["Diseño y Comunicación"], kw: ["creativ", "diseno", "redaccion", "produccion"] },
        { id: "organizar", label: "Organizar, liderar y gestionar equipos", cats: ["Ciencias Económicas"], kw: ["liderazgo", "organizacion", "gestion", "planificacion", "equipos"] },
        { id: "manos", label: "Trabajar con las manos o con máquinas", cats: ["Ingeniería", "Tecnicaturas"], kw: ["mecanic", "electric", "mantenimiento", "equipos", "operacion", "taller"] },
        { id: "aire-libre", label: "Estar al aire libre y en contacto con la naturaleza", cats: ["Sustentabilidad y Turismo", "Ciencias Exactas y Naturales"], kw: ["campo", "ambiente", "produccion agropecuaria", "recursos naturales", "territorio"] },
        { id: "argumentar", label: "Argumentar, leer y escribir", cats: ["Derecho y Seguridad", "Humanidades y Ciencias Sociales"], kw: ["argumentacion", "redaccion", "oratoria", "lectura", "analisis normativo"] }
      ]
    },
    {
      id: "materias", tipo: "multi", esencial: false, max: 3, grupo: "afinidad",
      titulo: "¿Qué materias del secundario te gustaban más?",
      ayuda: "Elegí hasta 3.",
      opciones: [
        { id: "matematica", label: "Matemática", cats: ["Ciencias Exactas y Naturales", "Ingeniería", "Tecnología"], kw: ["matematica", "calculo", "estadistica", "algebra"] },
        { id: "naturales", label: "Biología, física o química", cats: ["Salud", "Ciencias Exactas y Naturales"], kw: ["biologia", "fisica", "quimica", "anatomia"] },
        { id: "lengua", label: "Lengua y literatura", cats: ["Humanidades y Ciencias Sociales", "Educación"], kw: ["lengua", "literatura", "redaccion", "comunicacion"] },
        { id: "sociales", label: "Historia, geografía o ciencias sociales", cats: ["Humanidades y Ciencias Sociales", "Derecho y Seguridad"], kw: ["historia", "geografia", "sociolog", "politic"] },
        { id: "economia", label: "Economía o contabilidad", cats: ["Ciencias Económicas"], kw: ["economia", "contabilidad", "administracion"] },
        { id: "artes", label: "Plástica, música o tecnología", cats: ["Diseño y Comunicación", "Tecnología"], kw: ["diseno", "arte", "multimedia", "informatica"] }
      ]
    },
    {
      id: "duracion", tipo: "single", esencial: false, grupo: "restriccion",
      titulo: "¿Cuánto tiempo querés estudiar, más o menos?",
      ayuda: "Es una preferencia, no un límite estricto.",
      opciones: [
        { id: "corta", label: "Hasta 3 años (carreras cortas)" },
        { id: "media", label: "Entre 3 y 5 años" },
        { id: "larga", label: "Más de 5 años" }
      ]
    },
    {
      id: "titulo", tipo: "multi", esencial: false, grupo: "restriccion",
      titulo: "¿Qué tipo de título te interesa?",
      ayuda: "Podés elegir varios.",
      opciones: [
        { id: "Tecnicatura", label: "Tecnicatura" },
        { id: "Profesorado", label: "Profesorado" },
        { id: "Licenciatura", label: "Licenciatura" },
        { id: "Ingeniería", label: "Ingeniería" },
        { id: "grado", label: "Otras carreras de grado" }
      ]
    },
    {
      id: "gestion", tipo: "single", esencial: false, grupo: "restriccion",
      titulo: "¿Preferís una institución pública o privada?",
      ayuda: "Las públicas suelen ser gratuitas; las privadas son aranceladas.",
      opciones: [
        { id: "publica", label: "Pública" },
        { id: "privada", label: "Privada" }
      ]
    },
    {
      id: "modalidad", tipo: "single", esencial: false, grupo: "restriccion",
      titulo: "¿Cómo preferís cursar?",
      ayuda: "Solo usamos este dato cuando la ficha lo confirma.",
      opciones: [
        { id: "presencial", label: "Presencial" },
        { id: "hibrida", label: "Híbrida (parte presencial, parte virtual)" },
        { id: "virtual", label: "A distancia (virtual)" }
      ]
    },
    {
      id: "provincia", tipo: "single", esencial: false, grupo: "ubicacion",
      titulo: "¿En qué provincia te gustaría estudiar?",
      ayuda: "Mostramos las provincias que tienen oferta en el catálogo.",
      opciones: [] // se completa con las provincias reales del catálogo (ver provinciasDisponibles)
    },
    {
      id: "moverse", tipo: "single", esencial: false, grupo: "ubicacion",
      titulo: "¿Podrías mudarte o viajar a otra ciudad para estudiar?",
      opciones: [
        { id: "si", label: "Sí, puedo trasladarme" },
        { id: "no", label: "No, necesito estudiar en mi zona (o a distancia)" }
      ]
    },
    {
      id: "trabaja", tipo: "single", esencial: false, grupo: "practico",
      titulo: "¿Vas a necesitar trabajar mientras estudiás?",
      opciones: [
        { id: "si", label: "Sí, necesito trabajar" },
        { id: "no", label: "No, puedo dedicarme solo a estudiar" }
      ]
    },
    {
      id: "prioridad", tipo: "multi", esencial: false, max: 2, grupo: "practico",
      titulo: "¿Qué es lo más importante para vos?",
      ayuda: "Elegí hasta 2.",
      opciones: [
        { id: "costo", label: "Que no cueste mucho" },
        { id: "duracion", label: "Que dure poco" },
        { id: "laboral", label: "Que tenga buenas salidas laborales" }
      ]
    }
  ];

  function provinciasDisponibles(careers, instituciones) {
    const set = new Set();
    careers.forEach(c => ubicacionesDe(c, instituciones).forEach(u => set.add(u.provincia)));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "es"));
  }

  /* ------------------------------------------------------------------
     3) RECOMENDADOR
     Puntaje 0–100 sobre las dimensiones que la persona respondió y para
     las cuales HAY datos fiables:

       Afinidad temática ........ 50 pts  (intereses, actividades, materias)
       Duración ................. 8
       Tipo de título ........... 6
       Gestión pública/privada .. 4
       Modalidad ................ 6   (solo si la modalidad es confiable)
       Ubicación ................ 8   (solo si hay ubicaciones cargadas)
       Trabajar mientras estudia  6   (modalidad flexible / carrera corta)
       Prioridades .............. 6   (costo, duración, salida laboral)
       Test RIASEC .............. 15  (solo si hay resultado guardado)

     score = 100 · puntos obtenidos / puntos posibles de las dimensiones
     aplicables. Una dimensión sin respuesta o sin dato fiable NO suma ni
     resta: se informa en "aInvestigar".
     ------------------------------------------------------------------ */
  const PESOS = { afinidad: 50, duracion: 8, titulo: 6, gestion: 4, modalidad: 6, ubicacion: 8, trabaja: 6, prioridad: 6, riasec: 15 };
  const MIN_PESO_APLICABLE = 20;   // por debajo, "faltan respuestas"
  const UMBRAL_COINCIDENCIA_BAJA = 40;
  const MAX_RESULTADOS = 5;
  const MAX_POR_CATEGORIA = 3;

  function opcionPorId(stepId, optId) {
    const s = STEPS.find(x => x.id === stepId);
    return s && s.opciones.find(o => o.id === optId);
  }

  function opcionesSeleccionadas(answers, stepIds) {
    const out = [];
    stepIds.forEach(sid => {
      (Array.isArray(answers[sid]) ? answers[sid] : []).forEach(oid => {
        const o = opcionPorId(sid, oid);
        if (o) out.push({ step: sid, opt: o });
      });
    });
    return out;
  }

  function haystackDe(c) {
    return normalize([
      c.nombre, c.descripcionBreve, (c.habilidades || []).join(" "),
      (c.materiasPrincipales || []).map(m => typeof m === "string" ? m : (m && (m.nombre || m.materia)) || "").join(" "),
      c.perfilRecomendado
    ].join(" "));
  }

  function hitOpcion(opt, career, hay) {
    let hit = 0;
    const razones = [];
    if (opt.cats && opt.cats.includes(career.categoria)) { hit += 0.6; razones.push("área: " + career.categoria); }
    const kws = (opt.kw || []).filter(k => hay.includes(k));
    if (kws.length) hit += Math.min(0.4, 0.15 * kws.length);
    return { hit, kws, razones };
  }

  function evaluar(career, answers, ctx) {
    const inst = ctx.instituciones || {};
    let obtenido = 0, posible = 0;
    const coincide = [], aInvestigar = [], razones = [], noCoincide = [];

    // --- afinidad temática
    const sel = opcionesSeleccionadas(answers, ["intereses", "actividades", "materias"]);
    let afinidadHit = 0;
    if (sel.length) {
      const hay = haystackDe(career);
      let suma = 0;
      sel.forEach(({ opt }) => {
        const r = hitOpcion(opt, career, hay);
        suma += r.hit;
        if (r.hit >= 0.6) coincide.push(opt.label);
        else if (r.hit > 0) coincide.push(opt.label + " (coincidencia parcial)");
      });
      afinidadHit = Math.min(1, suma / Math.max(1, Math.min(3, sel.length)));
      posible += PESOS.afinidad; obtenido += PESOS.afinidad * afinidadHit;
      if (afinidadHit > 0) razones.push("Se relaciona con " + coincide.slice(0, 3).join("; ").toLowerCase() + ".");
    }

    // --- duración
    if (answers.duracion) {
      const a = aniosDe(career);
      if (a == null) aInvestigar.push("La ficha no confirma la duración exacta.");
      else {
        posible += PESOS.duracion;
        const cat = a <= 3 ? "corta" : (a <= 5 ? "media" : "larga");
        let f = 0;
        if (cat === answers.duracion) f = 1;
        else if ((cat === "media" && answers.duracion !== "media") || (answers.duracion === "media" && cat !== "media")) f = 0.4;
        obtenido += PESOS.duracion * f;
        if (f === 1) { coincide.push("Duración: " + a + " años"); }
        else noCoincide.push("Dura " + a + " años, distinto de lo que buscabas.");
      }
    }

    // --- tipo de título
    if (Array.isArray(answers.titulo) && answers.titulo.length) {
      posible += PESOS.titulo;
      const t = tipoTitulo(career.nombre);
      const ok = answers.titulo.includes(t) || (answers.titulo.includes("grado") && t === "Otros títulos" && !requiereTituloPrevio(career));
      if (ok) { obtenido += PESOS.titulo; coincide.push("Tipo de título: " + t); }
      else noCoincide.push("El título es de tipo " + t + ", distinto de lo que elegiste.");
    }

    // --- gestión pública / privada
    if (answers.gestion) {
      const gs = gestionesDe(career, inst);
      if (!gs.length) aInvestigar.push("No se pudo determinar si la institución es pública o privada.");
      else {
        posible += PESOS.gestion;
        if (gs.includes(answers.gestion)) {
          obtenido += PESOS.gestion;
          coincide.push(answers.gestion === "publica" ? "Hay opción en institución pública" : "Hay opción en institución privada");
        } else noCoincide.push(answers.gestion === "publica" ? "Solo figura en instituciones privadas." : "Solo figura en instituciones públicas.");
      }
    }

    // --- modalidad (solo con dato confiable)
    const mod = modalidadInfo(career);
    if (answers.modalidad) {
      if (!mod.confiable) aInvestigar.push("La modalidad de cursada no está confirmada en la ficha: consultala en la institución.");
      else {
        posible += PESOS.modalidad;
        if (mod.valores.includes(answers.modalidad)) {
          obtenido += PESOS.modalidad; coincide.push("Modalidad: " + answers.modalidad);
          if (mod.valores.length > 1) aInvestigar.push("La modalidad varía según la institución: confirmá en cuál se ofrece como la buscás.");
        } else noCoincide.push("La ficha indica modalidad " + mod.valores.join(" / ") + ".");
      }
    }

    // --- ubicación
    const ubic = ubicacionesDe(career, inst);
    const virtualConfirmada = mod.confiable && mod.valores.includes("virtual");
    let disponible = null; // true / false / null (no se sabe)
    if (answers.provincia) {
      if (!ubic.length) aInvestigar.push("No hay sedes cargadas para esta carrera.");
      else {
        posible += PESOS.ubicacion;
        const enProv = ubic.filter(u => u.provincia === answers.provincia);
        disponible = enProv.length > 0 || virtualConfirmada;
        if (enProv.length) { obtenido += PESOS.ubicacion; coincide.push("Se cursa en " + enProv.map(u => u.ciudad).slice(0, 2).join(" / ") + " (" + answers.provincia + ")"); }
        else if (virtualConfirmada) { obtenido += PESOS.ubicacion * 0.8; coincide.push("Se puede cursar a distancia"); }
        else noCoincide.push("No hay sede en " + answers.provincia + " según el catálogo (" + ubic.map(u => u.ciudad).slice(0, 2).join(" / ") + ").");
      }
    }
    if (answers.moverse === "no" && answers.provincia && disponible === false) {
      return { excluida: true, motivo: "sin sede en la zona elegida" };
    }

    // --- trabajar mientras estudia
    if (answers.trabaja === "si") {
      const a = aniosDe(career);
      let f = null;
      if (mod.confiable && mod.valores.some(v => v === "virtual" || v === "hibrida")) { f = 1; coincide.push("Modalidad flexible para combinar con trabajo"); }
      else if (mod.confiable) { f = a != null && a <= 3 ? 0.5 : 0.2; aInvestigar.push("Cursada presencial: consultá horarios si vas a trabajar."); }
      else aInvestigar.push("Consultá si hay turnos o cursada flexible si vas a trabajar.");
      if (f != null) { posible += PESOS.trabaja; obtenido += PESOS.trabaja * f; }
    }

    // --- prioridades
    if (Array.isArray(answers.prioridad) && answers.prioridad.length) {
      let p = 0, n = 0;
      if (answers.prioridad.includes("costo")) {
        const gs = gestionesDe(career, inst);
        if (gs.length) { n++; if (gs.includes("publica")) { p += 1; coincide.push("Hay opción en institución pública (gratuita)"); } else aInvestigar.push("Solo figura en instituciones privadas: revisá aranceles."); }
      }
      if (answers.prioridad.includes("duracion")) {
        const a = aniosDe(career);
        if (a != null) { n++; p += a <= 3 ? 1 : (a <= 4 ? 0.5 : 0); }
      }
      if (answers.prioridad.includes("laboral")) {
        const jr = numeroARS(career.salario && career.salario.junior);
        if (jr != null && ctx.salarioMediana) { n++; p += jr >= ctx.salarioMediana ? 1 : 0.4; if (jr >= ctx.salarioMediana) coincide.push("Sueldo inicial de referencia por encima de la mediana del catálogo"); }
        aInvestigar.push("Los sueldos son valores de referencia aproximados; verificá la demanda laboral en tu zona.");
      }
      if (n > 0) { posible += PESOS.prioridad; obtenido += PESOS.prioridad * (p / n); }
    }

    // --- RIASEC
    let riasecPct = null;
    if (ctx.riasec && ctx.riasec.scores && ctx.riasec.perfiles && ctx.riasec.perfiles[career.categoria] && answers.usarRiasec !== false) {
      const perfil = ctx.riasec.perfiles[career.categoria];
      let ws = 0, wt = 0;
      Object.keys(perfil).forEach(d => { const w = perfil[d]; ws += w * Math.min(1, (ctx.riasec.scores[d] || 0) / 9); wt += w; });
      if (wt > 0) {
        riasecPct = Math.round((ws / wt) * 100);
        posible += PESOS.riasec; obtenido += PESOS.riasec * (ws / wt);
        if (riasecPct >= 60) coincide.push("Afín a tu resultado del test vocacional (" + riasecPct + "%)");
      }
    }

    return { posible, obtenido, afinidadHit, coincide, aInvestigar, noCoincide, razones, riasecPct, mod, ubic };
  }

  function recomendar(answers, careers, instituciones, opts) {
    opts = opts || {};
    answers = answers || {};
    const salarios = careers.map(c => numeroARS(c.salario && c.salario.junior)).filter(n => n != null).sort((a, b) => a - b);
    const ctx = {
      instituciones,
      riasec: opts.riasec || null,
      salarioMediana: salarios.length ? salarios[Math.floor(salarios.length / 2)] : null
    };

    const candidatas = careers.filter(c => !requiereTituloPrevio(c));
    const evals = [];
    let excluidas = 0, pesoAplicable = 0;
    candidatas.forEach(c => {
      const e = evaluar(c, answers, ctx);
      if (e.excluida) { excluidas++; return; }
      pesoAplicable = Math.max(pesoAplicable, e.posible);
      evals.push({ career: c, e });
    });

    if (pesoAplicable < MIN_PESO_APLICABLE) {
      return { estado: "faltan-respuestas", resultados: [], excluidas, mensaje: "Con las respuestas actuales no hay información suficiente para recomendar. Respondé al menos una pregunta de intereses, actividades o materias." };
    }

    const puntuadas = evals.filter(x => x.e.posible >= MIN_PESO_APLICABLE).map(x => {
      const score = Math.round(100 * x.e.obtenido / x.e.posible);
      return { career: x.career, score, detalle: x.e };
    });
    puntuadas.sort((a, b) => b.score - a.score || (b.detalle.afinidadHit - a.detalle.afinidadHit) || a.career.nombre.localeCompare(b.career.nombre, "es"));

    const porCat = {}, elegidas = [];
    for (const p of puntuadas) {
      const k = p.career.categoria;
      if ((porCat[k] || 0) >= MAX_POR_CATEGORIA) continue;
      // sin ninguna coincidencia temática ni restricción cumplida no se recomienda
      if (p.detalle.coincide.length === 0) continue;
      porCat[k] = (porCat[k] || 0) + 1;
      elegidas.push(p);
      if (elegidas.length >= MAX_RESULTADOS) break;
    }

    const resultados = elegidas.map(p => ({
      id: p.career.id,
      nombre: p.career.nombre,
      score: p.score,
      // una coincidencia "alta" no se muestra si hay 2 o más preferencias que no se cumplen
      confianza: p.score >= 70 && p.detalle.noCoincide.length < 2 ? "alta" : (p.score >= UMBRAL_COINCIDENCIA_BAJA ? "media" : "baja"),
      noCoincide: Array.from(new Set(p.detalle.noCoincide)).slice(0, 4),
      razones: p.detalle.razones,
      coincidencias: Array.from(new Set(p.detalle.coincide)),
      aInvestigar: Array.from(new Set(p.detalle.aInvestigar)).slice(0, 4)
    }));

    const mejor = resultados[0] ? resultados[0].score : 0;
    let estado = "ok";
    if (!resultados.length) estado = "sin-coincidencias";
    else if (mejor < UMBRAL_COINCIDENCIA_BAJA) estado = "coincidencia-baja";

    return {
      estado, resultados, excluidas,
      mensaje: estado === "sin-coincidencias" ? "No encontramos carreras que coincidan con esas preferencias. Probá flexibilizar la ubicación, la modalidad o la duración."
        : estado === "coincidencia-baja" ? "Las coincidencias son bajas: tus respuestas son muy específicas o contradictorias para el catálogo actual. Tomá estas opciones solo como punto de partida."
        : ""
    };
  }

  /* ------------------------------------------------------------------
     4) PLAN PARA EMPEZAR A ESTUDIAR
     ------------------------------------------------------------------ */
  const PLAN_VERSION = 1;
  const MAX_NOTAS = 5000;
  const MAX_TAREA = 200;
  const MAX_TAREAS = 60;

  const TAREAS_BASE = [
    { id: "base-confirmar-fechas", texto: "Confirmar en el sitio oficial de cada institución las fechas y el período de inscripción" },
    { id: "base-requisitos", texto: "Leer los requisitos de ingreso (curso de ingreso, examen, cupos) de cada carrera elegida" },
    { id: "base-documentacion", texto: "Reunir la documentación que pida cada institución" },
    { id: "base-becas", texto: "Revisar las becas y ayudas económicas disponibles y sus requisitos" },
    { id: "base-consultar", texto: "Escribir o visitar a las instituciones para sacarme dudas sobre las carreras que más me interesan" }
  ];

  const DOCUMENTACION_HABITUAL = [
    { id: "doc-dni", texto: "DNI (frente y dorso)" },
    { id: "doc-titulo", texto: "Título secundario o constancia de título en trámite" },
    { id: "doc-foto", texto: "Foto carnet" }
  ];

  function defaultPlan() {
    return { version: PLAN_VERSION, carreras: [], instituciones: [], becas: [], tareas: [], hechas: {}, docsListos: {}, notas: "", actualizado: null };
  }

  function soloTexto(v, max) { return typeof v === "string" ? v.slice(0, max) : ""; }
  function listaIds(v, validos) {
    if (!Array.isArray(v)) return [];
    const out = [];
    v.forEach(x => { if (typeof x === "string" && (!validos || validos(x)) && !out.includes(x)) out.push(x); });
    return out;
  }

  /* Limpia lo leído de localStorage: nunca se confía en su forma. */
  function normalizarPlan(raw, ctx) {
    const base = defaultPlan();
    if (!raw || typeof raw !== "object") return base;
    ctx = ctx || {};
    const hasCareer = ctx.careerIds ? (id => ctx.careerIds.has(id)) : null;
    const hasInst = ctx.instIds ? (id => ctx.instIds.has(id)) : null;
    const nBecas = typeof ctx.nBecas === "number" ? ctx.nBecas : null;
    base.carreras = listaIds(raw.carreras, hasCareer);
    base.instituciones = listaIds(raw.instituciones, hasInst);
    base.becas = listaIds(raw.becas, id => /^\d+$/.test(id) && (nBecas == null || Number(id) < nBecas));
    base.tareas = [];
    if (Array.isArray(raw.tareas)) {
      raw.tareas.slice(0, MAX_TAREAS).forEach((t, i) => {
        const texto = soloTexto(t && t.texto, MAX_TAREA).trim();
        if (!texto) return;
        const id = soloTexto(t && t.id, 40) || ("t-" + i);
        if (!base.tareas.some(x => x.id === id)) base.tareas.push({ id, texto });
      });
    }
    ["hechas", "docsListos"].forEach(k => {
      const src = raw[k];
      if (src && typeof src === "object") Object.keys(src).slice(0, 200).forEach(id => { if (src[id] === true) base[k][id] = true; });
    });
    base.notas = soloTexto(raw.notas, MAX_NOTAS);
    base.actualizado = typeof raw.actualizado === "string" ? raw.actualizado.slice(0, 40) : null;
    return base;
  }

  function agregarTarea(plan, texto) {
    const t = String(texto == null ? "" : texto).replace(/\s+/g, " ").trim();
    if (!t) return { ok: false, error: "Escribí la tarea antes de agregarla." };
    if (t.length > MAX_TAREA) return { ok: false, error: "La tarea es demasiado larga (máximo " + MAX_TAREA + " caracteres)." };
    if (plan.tareas.length >= MAX_TAREAS) return { ok: false, error: "Llegaste al máximo de " + MAX_TAREAS + " tareas propias." };
    if (plan.tareas.some(x => normalize(x.texto) === normalize(t))) return { ok: false, error: "Esa tarea ya está en tu lista." };
    plan.tareas.push({ id: "t-" + Date.now().toString(36) + "-" + plan.tareas.length, texto: t });
    return { ok: true };
  }

  /* Arma, a partir de las carreras elegidas, lo que hay que investigar. Todo
     sale de los datos: si algo no figura, lo dice (no se inventa). */
  function armarPlan(plan, careers, instituciones, becas) {
    const byId = {}; careers.forEach(c => { byId[c.id] = c; });
    const carreras = plan.carreras.map(id => byId[id]).filter(Boolean);

    const instIds = [];
    carreras.forEach(c => institucionIds(c).forEach(id => { if (!instIds.includes(id)) instIds.push(id); }));
    plan.instituciones.forEach(id => { if (!instIds.includes(id) && instituciones[id]) instIds.push(id); });

    const instituciones_ = instIds.filter(id => instituciones[id]).map(id => {
      const i = instituciones[id];
      const ib = i.ingresoBecas || null;
      return {
        id, nombre: i.nombre, web: i.web || null, direccion: i.direccion || null,
        ingreso: ib && ib.ingreso ? ib.ingreso : null,
        arancel: ib && ib.arancel ? ib.arancel : null,
        becasPropias: ib && Array.isArray(ib.becas) ? ib.becas : [],
        fuente: ib && ib.fuente ? ib.fuente : null,
        carreras: carreras.filter(c => institucionIds(c).includes(id)).map(c => c.nombre)
      };
    });

    const becas_ = plan.becas.map(i => ({ idx: Number(i), b: becas[Number(i)] })).filter(x => x.b);

    return {
      carreras: carreras.map(c => ({ id: c.id, nombre: c.nombre, duracion: aniosDe(c) })),
      instituciones: instituciones_,
      becas: becas_.map(x => ({ idx: x.idx, nombre: x.b.nombre, alcance: x.b.alcance, requisitos: x.b.requisitos, comoAnotarse: x.b.comoAnotarse, fuente: x.b.fuente || null, url: x.b.url || null, organismo: x.b.organismo || null })),
      tareasBase: TAREAS_BASE,
      documentacion: DOCUMENTACION_HABITUAL,
      avisoFechas: "Este plan no incluye fechas de inscripción porque cambian cada año: confirmalas siempre en el sitio oficial de cada institución."
    };
  }

  /* Texto plano del plan (para copiar). */
  function planATexto(plan, armado) {
    const L = [];
    L.push("MI PLAN PARA EMPEZAR A ESTUDIAR");
    L.push("");
    L.push("Carreras que me interesan:");
    if (armado.carreras.length) armado.carreras.forEach(c => L.push("- " + c.nombre + (c.duracion ? " (" + c.duracion + " años)" : "")));
    else L.push("- (todavía no elegí ninguna)");
    L.push("");
    L.push("Instituciones a consultar:");
    if (armado.instituciones.length) armado.instituciones.forEach(i => L.push("- " + i.nombre + (i.web ? " — " + i.web : "")));
    else L.push("- (ninguna)");
    L.push("");
    L.push("Tareas:");
    TAREAS_BASE.concat(plan.tareas).forEach(t => L.push((plan.hechas[t.id] ? "[x] " : "[ ] ") + t.texto));
    L.push("");
    L.push("Documentación habitual (confirmá cuál pide cada institución):");
    DOCUMENTACION_HABITUAL.forEach(d => L.push((plan.docsListos[d.id] ? "[x] " : "[ ] ") + d.texto));
    if (armado.becas.length) { L.push(""); L.push("Becas que quiero revisar:"); armado.becas.forEach(b => L.push("- " + b.nombre + " (" + b.alcance + ")")); }
    if (plan.notas) { L.push(""); L.push("Notas:"); L.push(plan.notas); }
    L.push("");
    L.push(armado.avisoFechas);
    return L.join("\n");
  }

  /* ------------------------------------------------------------------
     5) SUGERIR CORRECCIONES
     ------------------------------------------------------------------ */
  const LIMITES_SUGERENCIA = { sobre: 160, dato: 600, correccion: 600, fuente: 500, comentario: 800 };

  function esUrlHttp(s) {
    try { const u = new URL(s); return u.protocol === "http:" || u.protocol === "https:"; } catch (e) { return false; }
  }

  function validarSugerencia(f) {
    f = f || {};
    const errores = {};
    const v = k => String(f[k] == null ? "" : f[k]).trim();
    if (!v("sobre")) errores.sobre = "Indicá a qué carrera o institución se refiere.";
    else if (v("sobre").length > LIMITES_SUGERENCIA.sobre) errores.sobre = "Es demasiado largo (máximo " + LIMITES_SUGERENCIA.sobre + " caracteres).";
    if (!v("dato")) errores.dato = "Contanos qué dato creés que es incorrecto.";
    else if (v("dato").length < 5) errores.dato = "Describí el dato con un poco más de detalle.";
    else if (v("dato").length > LIMITES_SUGERENCIA.dato) errores.dato = "Es demasiado largo (máximo " + LIMITES_SUGERENCIA.dato + " caracteres).";
    if (!v("correccion")) errores.correccion = "Escribí cuál sería la corrección.";
    else if (v("correccion").length > LIMITES_SUGERENCIA.correccion) errores.correccion = "Es demasiado largo (máximo " + LIMITES_SUGERENCIA.correccion + " caracteres).";
    if (v("fuente")) {
      if (!esUrlHttp(v("fuente"))) errores.fuente = "El enlace debe empezar con http:// o https://";
      else if (v("fuente").length > LIMITES_SUGERENCIA.fuente) errores.fuente = "El enlace es demasiado largo.";
    }
    if (v("comentario").length > LIMITES_SUGERENCIA.comentario) errores.comentario = "El comentario es demasiado largo (máximo " + LIMITES_SUGERENCIA.comentario + " caracteres).";
    return { ok: Object.keys(errores).length === 0, errores };
  }

  function armarReporte(f, meta) {
    const v = k => String(f[k] == null ? "" : f[k]).trim();
    const L = [
      "Sugerencia de corrección — Orientación Vocacional",
      "",
      "Carrera o institución: " + v("sobre"),
      "Dato que parece incorrecto: " + v("dato"),
      "Corrección sugerida: " + v("correccion"),
      "Fuente: " + (v("fuente") || "(no indicada)")
    ];
    if (v("comentario")) L.push("Comentario: " + v("comentario"));
    if (meta && meta.pagina) L.push("", "Página: " + meta.pagina);
    return L.join("\n");
  }

  function armarMailto(email, asunto, cuerpo) {
    return "mailto:" + email + "?subject=" + encodeURIComponent(asunto) + "&body=" + encodeURIComponent(cuerpo);
  }

  return {
    normalize, institucionIds, tipoTitulo, requiereTituloPrevio, modalidadInfo, ubicacionesDe,
    gestionDe, gestionesDe, numeroARS, aniosDe, provinciasDisponibles,
    STEPS, PESOS, MAX_RESULTADOS, UMBRAL_COINCIDENCIA_BAJA, recomendar,
    PLAN_VERSION, TAREAS_BASE, DOCUMENTACION_HABITUAL, defaultPlan, normalizarPlan, agregarTarea, armarPlan, planATexto,
    LIMITES_SUGERENCIA, validarSugerencia, armarReporte, armarMailto, esUrlHttp
  };
});
