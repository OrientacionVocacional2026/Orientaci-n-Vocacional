/* =====================================================================
   vocational-test.js — Test vocacional interactivo (modelo RIASEC/Holland)
   ---------------------------------------------------------------------
   Módulo independiente, no toca script.js ni careers-data.js.
   Requiere que CAREERS (careers-data.js) y window.openDetail (expuesto
   al final de script.js) ya estén cargados.

   CÓMO FUNCIONA, EN CRIOLLO:
   1) 18 preguntas, 3 por cada una de las 6 dimensiones RIASEC
      (Realista, Investigativo, Artístico, Social, Emprendedor,
      Convencional). El estudiante responde en una escala de 4 puntos.
   2) Se suman los puntos de cada dimensión → "perfil" del estudiante.
   3) Cada categoría de carrera de la página tiene un perfil RIASEC
      típico (CATEGORY_RIASEC, definido a mano más abajo). Se compara
      el perfil del estudiante contra el de cada categoría con
      similitud de producto punto → ranking de áreas afines.
   4) Dentro de las categorías mejor rankeadas, se buscan las carreras
      concretas de CAREERS cuyas habilidades/perfil recomendado tengan
      más coincidencia de palabras clave con las dimensiones más
      fuertes del estudiante → 6 a 8 carreras recomendadas puntuales.
   5) El resultado se guarda en localStorage para no perderlo al
      recargar la página.
   ===================================================================== */

(function () {
  "use strict";

  const STORAGE_KEY = "ov_test_vocacional_v1";

  /* ---------------------------------------------------------------------
     1) PREGUNTAS
     Cada pregunta tiene una dimensión RIASEC asociada. El orden de las
     preguntas está mezclado a propósito para que no sea obvio qué mide
     cada una (si fueran todas seguidas de la misma dimensión, el
     estudiante tiende a contestar "en piloto automático").
     --------------------------------------------------------------------- */
  const QUESTIONS = [
    { dim: "R", text: "Armar, desarmar o reparar cosas con las manos (motores, muebles, aparatos electrónicos)." },
    { dim: "I", text: "Investigar por qué pasan las cosas, hacer experimentos o resolver problemas complejos." },
    { dim: "A", text: "Dibujar, escribir, tocar un instrumento, actuar o crear contenido visual/audiovisual." },
    { dim: "S", text: "Escuchar los problemas de otras personas y ayudarlas a resolverlos." },
    { dim: "E", text: "Convencer a otros de una idea, liderar un grupo o negociar algo." },
    { dim: "C", text: "Organizar información en tablas, planillas o sistemas ordenados." },
    { dim: "R", text: "Trabajar al aire libre, con animales, plantas o maquinaria." },
    { dim: "I", text: "Leer o mirar contenido de ciencia, tecnología o cómo funciona el universo." },
    { dim: "A", text: "Diseñar algo desde cero: un logo, una app, una publicación, un espacio." },
    { dim: "S", text: "Enseñarle algo a alguien y ver cómo lo va entendiendo." },
    { dim: "E", text: "Empezar un emprendimiento propio o un proyecto sin que nadie te lo pida." },
    { dim: "C", text: "Seguir procedimientos claros, paso a paso, sin demasiada improvisación." },
    { dim: "R", text: "Usar herramientas, construir, instalar o hacer trabajo físico concreto." },
    { dim: "I", text: "Analizar datos, estadísticas o números para sacar una conclusión." },
    { dim: "A", text: "Que tu trabajo final sea algo original, distinto a lo que hace todo el mundo." },
    { dim: "S", text: "Trabajar en equipo, en contacto directo con personas todo el día." },
    { dim: "E", text: "Tomar decisiones bajo presión y hacerte cargo de los resultados." },
    { dim: "C", text: "Llevar el control de gastos, horarios o inventarios con precisión." }
  ];

  const DIMENSIONS = ["R", "I", "A", "S", "E", "C"];

  const DIM_INFO = {
    R: { name: "Realista",      desc: "te gusta lo concreto, lo técnico y lo manual." },
    I: { name: "Investigativo", desc: "te gusta entender, analizar e investigar." },
    A: { name: "Artístico",     desc: "te gusta crear, expresarte e innovar." },
    S: { name: "Social",        desc: "te gusta ayudar, enseñar y trabajar con gente." },
    E: { name: "Emprendedor",   desc: "te gusta liderar, decidir y convencer." },
    C: { name: "Convencional",  desc: "te gusta el orden, la precisión y la organización." }
  };

  const SCALE = [
    { value: 0, label: "No me gusta" },
    { value: 1, label: "Un poco" },
    { value: 2, label: "Bastante" },
    { value: 3, label: "Me encanta" }
  ];

  /* ---------------------------------------------------------------------
     2) PERFIL RIASEC APROXIMADO DE CADA CATEGORÍA DEL SITIO.
     Números del 0 (nada que ver) al 3 (muy afín). Son aproximaciones
     razonables para orientar, no una medición científica exacta.
     --------------------------------------------------------------------- */
  const CATEGORY_RIASEC = {
    "Ingeniería":                       { R: 3, I: 3, A: 0, S: 0, E: 1, C: 1 },
    "Salud":                            { R: 1, I: 3, A: 0, S: 3, E: 0, C: 1 },
    "Humanidades y Ciencias Sociales":  { R: 0, I: 2, A: 2, S: 3, E: 1, C: 0 },
    "Ciencias Económicas":              { R: 0, I: 2, A: 0, S: 1, E: 3, C: 2 },
    "Educación":                        { R: 0, I: 1, A: 1, S: 3, E: 1, C: 1 },
    "Tecnicaturas":                     { R: 2, I: 1, A: 0, S: 1, E: 1, C: 2 },
    "Derecho y Seguridad":              { R: 1, I: 1, A: 0, S: 2, E: 2, C: 2 },
    "Posgrado":                         { R: 0, I: 3, A: 0, S: 1, E: 1, C: 1 },
    "Sustentabilidad y Turismo":        { R: 2, I: 1, A: 1, S: 2, E: 2, C: 0 },
    "Tecnología":                       { R: 1, I: 3, A: 1, S: 0, E: 1, C: 1 },
    "Diseño y Comunicación":            { R: 0, I: 0, A: 3, S: 1, E: 1, C: 0 }
  };

  /* Palabras clave por dimensión, para afinar qué carrera puntual
     recomendar dentro de una categoría (se buscan en habilidades,
     perfilRecomendado, queHace y materiasPrincipales de cada carrera). */
  const DIM_KEYWORDS = {
    R: ["manual", "técnic", "campo", "maquinaria", "construc", "mantenimiento", "instalaci", "mecánic", "reparaci", "operari", "planta", "terreno"],
    I: ["análisis", "analític", "investigaci", "científic", "datos", "laboratorio", "lógic", "matemátic", "diagnóstic", "estadístic", "tecnológic"],
    A: ["creativ", "diseñ", "artístic", "innovaci", "comunicaci", "estétic", "narrativ", "visual", "contenido", "producción"],
    S: ["ayudar", "acompañ", "enseñ", "salud", "cuidado", "social", "personas", "comunidad", "educaci", "escuch"],
    E: ["liderar", "gestion", "negoci", "empren", "estrateg", "comercial", "venta", "dirigir", "decisión", "negocios"],
    C: ["organiz", "administra", "control", "planilla", "procedimiento", "normativ", "registro", "auditor", "orden", "gestión administrativa"]
  };

  /* ---------------------------------------------------------------------
     ESTADO
     --------------------------------------------------------------------- */
  let current = 0;
  let answers = new Array(QUESTIONS.length).fill(null);

  const root = document.getElementById("testVocacionalContent");
  if (!root) return; // si el HTML no tiene el contenedor, no hacemos nada

  function saveResult(scores, topDims, topCategories, recommended) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        scores, topDims, topCategories,
        recommendedIds: recommended.map(c => c.id),
        date: new Date().toISOString()
      }));
    } catch (e) { /* localStorage no disponible, seguimos sin guardar */ }
  }

  function loadSavedResult() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  /* ---------------------------------------------------------------------
     RENDER: PANTALLA DE INICIO
     --------------------------------------------------------------------- */
  function renderIntro() {
    const saved = loadSavedResult();
    root.innerHTML = `
      <div class="vt-intro">
        <p class="vt-intro-text">Son ${QUESTIONS.length} frases sobre cosas que te pueden gustar hacer. No hay respuestas correctas ni incorrectas: contestá lo más sincero posible, pensando en qué te gusta a vos, no en qué "conviene" o qué esperan tus papás. Tarda unos 3 minutos.</p>
        <button type="button" class="vt-start-btn" id="vtStartBtn">Empezar el test →</button>
        ${saved ? `<button type="button" class="vt-secondary-btn" id="vtViewLastBtn">Ver mi último resultado</button>` : ""}
      </div>
    `;
    document.getElementById("vtStartBtn").addEventListener("click", () => {
      current = 0;
      answers = new Array(QUESTIONS.length).fill(null);
      renderQuestion();
    });
    const viewLastBtn = document.getElementById("vtViewLastBtn");
    if (viewLastBtn) {
      viewLastBtn.addEventListener("click", () => {
        renderResultFromSaved(saved);
      });
    }
  }

  /* ---------------------------------------------------------------------
     RENDER: PREGUNTA ACTUAL
     --------------------------------------------------------------------- */
  function renderQuestion() {
    const q = QUESTIONS[current];
    const progressPct = Math.round((current / QUESTIONS.length) * 100);

    root.innerHTML = `
      <div class="vt-quiz">
        <div class="vt-progress-track" role="progressbar" aria-valuenow="${current}" aria-valuemin="0" aria-valuemax="${QUESTIONS.length}">
          <div class="vt-progress-fill" style="width:${progressPct}%"></div>
        </div>
        <p class="vt-progress-label">Pregunta ${current + 1} de ${QUESTIONS.length}</p>

        <h3 class="vt-question">${q.text}</h3>

        <div class="vt-options" role="radiogroup" aria-label="Nivel de acuerdo">
          ${SCALE.map(opt => `
            <button type="button" class="vt-option-btn${answers[current] === opt.value ? " selected" : ""}" data-value="${opt.value}" role="radio" aria-checked="${answers[current] === opt.value}">
              ${opt.label}
            </button>
          `).join("")}
        </div>

        <div class="vt-nav">
          <button type="button" class="vt-secondary-btn" id="vtBackBtn" ${current === 0 ? "disabled" : ""}>← Anterior</button>
          <button type="button" class="vt-start-btn" id="vtNextBtn" ${answers[current] === null ? "disabled" : ""}>${current === QUESTIONS.length - 1 ? "Ver mi resultado" : "Siguiente →"}</button>
        </div>
      </div>
    `;

    root.querySelectorAll(".vt-option-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        answers[current] = Number(btn.dataset.value);
        // avance automático breve para que se sienta ágil, pero dejando ver la selección
        renderQuestion();
        setTimeout(() => {
          if (current < QUESTIONS.length - 1) {
            current++;
            renderQuestion();
          } else {
            computeAndRenderResult();
          }
        }, 220);
      });
    });

    document.getElementById("vtBackBtn").addEventListener("click", () => {
      if (current > 0) { current--; renderQuestion(); }
    });
    document.getElementById("vtNextBtn").addEventListener("click", () => {
      if (answers[current] === null) return;
      if (current < QUESTIONS.length - 1) { current++; renderQuestion(); }
      else { computeAndRenderResult(); }
    });
  }

  /* ---------------------------------------------------------------------
     CÁLCULO DE RESULTADOS
     --------------------------------------------------------------------- */
  function computeScores() {
    const scores = { R: 0, I: 0, A: 0, S: 0, E: 0, C: 0 };
    const maxPerDim = { R: 0, I: 0, A: 0, S: 0, E: 0, C: 0 };
    QUESTIONS.forEach((q, i) => {
      scores[q.dim] += answers[i] || 0;
      maxPerDim[q.dim] += 3;
    });
    return { scores, maxPerDim };
  }

  function rankCategories(scores) {
    const entries = Object.keys(CATEGORY_RIASEC).map(cat => {
      const profile = CATEGORY_RIASEC[cat];
      let dot = 0;
      DIMENSIONS.forEach(d => { dot += (scores[d] || 0) * profile[d]; });
      return { cat, score: dot };
    });
    entries.sort((a, b) => b.score - a.score);
    return entries;
  }

  function careerText(c) {
    return [
      (c.habilidades || []).join(" "),
      c.perfilRecomendado || "",
      c.queHace || "",
      (c.materiasPrincipales || []).join(" ")
    ].join(" ").toLowerCase();
  }

  function careerAffinityScore(c, topDims) {
    const text = careerText(c);
    let score = 0;
    topDims.forEach((dim, idx) => {
      const weight = topDims.length - idx; // la 1ra dimensión pesa más que la 2da, etc.
      (DIM_KEYWORDS[dim] || []).forEach(kw => {
        if (text.indexOf(kw) !== -1) score += weight;
      });
    });
    if (c.investigado) score += 0.5; // leve preferencia por fichas con datos verificados
    return score;
  }

  function recommendCareers(topCategoriesList, topDims) {
    const topCatNames = topCategoriesList.slice(0, 3).map(e => e.cat);
    const pool = CAREERS.filter(c => topCatNames.includes(c.categoria));
    const scored = pool.map(c => ({ c, s: careerAffinityScore(c, topDims) }));
    scored.sort((a, b) => b.s - a.s);
    // Nos aseguramos de traer variedad: no más de 3 de la misma categoría entre las primeras 8
    const picked = [];
    const perCategoryCount = {};
    for (const item of scored) {
      const cat = item.c.categoria;
      perCategoryCount[cat] = perCategoryCount[cat] || 0;
      if (perCategoryCount[cat] >= 3) continue;
      picked.push(item.c);
      perCategoryCount[cat]++;
      if (picked.length >= 8) break;
    }
    // Si no llegamos a 6 (categorías con pocas carreras), completamos con el resto del pool
    if (picked.length < 6) {
      for (const item of scored) {
        if (picked.length >= 6) break;
        if (!picked.includes(item.c)) picked.push(item.c);
      }
    }
    return picked;
  }

  function computeAndRenderResult() {
    const { scores } = computeScores();
    const ranked = Object.keys(scores).sort((a, b) => scores[b] - scores[a]);
    const topDims = ranked.slice(0, 3);
    const topCategories = rankCategories(scores);
    const recommended = recommendCareers(topCategories, topDims);

    saveResult(scores, topDims, topCategories.slice(0, 3).map(e => e.cat), recommended);
    renderResult(scores, topDims, topCategories, recommended);
  }

  function renderResultFromSaved(saved) {
    const recommended = saved.recommendedIds
      .map(id => CAREERS.find(c => c.id === id))
      .filter(Boolean);
    const topCategories = saved.topCategories.map(cat => ({ cat, score: 0 }))
      .concat(rankCategories(saved.scores).filter(e => !saved.topCategories.includes(e.cat)));
    renderResult(saved.scores, saved.topDims, topCategories, recommended);
  }

  /* ---------------------------------------------------------------------
     RENDER: RESULTADO
     --------------------------------------------------------------------- */
  function renderResult(scores, topDims, topCategories, recommended) {
    const maxScore = 9; // 3 preguntas x 3 puntos máx cada una, por dimensión
    const codeLabel = topDims.map(d => DIM_INFO[d].name).join(" – ");
    const codeLetters = topDims.join("");

    const dimBarsHTML = DIMENSIONS
      .slice()
      .sort((a, b) => scores[b] - scores[a])
      .map(d => `
        <div class="vt-dim-row">
          <span class="vt-dim-label">${DIM_INFO[d].name}</span>
          <div class="vt-dim-track"><div class="vt-dim-fill" style="width:${Math.round((scores[d] / maxScore) * 100)}%"></div></div>
          <span class="vt-dim-value">${scores[d]}/${maxScore}</span>
        </div>
      `).join("");

    const catBarsHTML = topCategories.slice(0, 4).map((e, idx) => {
      const maxCatScore = topCategories[0].score || 1;
      const pct = Math.max(6, Math.round((e.score / maxCatScore) * 100));
      return `
        <div class="vt-cat-row">
          <span class="vt-cat-label">${idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : "•"} ${e.cat}</span>
          <div class="vt-cat-track"><div class="vt-cat-fill" style="width:${pct}%"></div></div>
        </div>
      `;
    }).join("");

    const careersHTML = recommended.map(c => `
      <button type="button" class="vt-career-card" data-id="${c.id}">
        <span class="vt-career-icon" aria-hidden="true">${c.icono}</span>
        <span class="vt-career-info">
          <strong>${c.nombre}</strong>
          <span class="vt-career-cat">${c.categoria}</span>
          <span class="vt-career-desc">${c.descripcionBreve || ""}</span>
        </span>
      </button>
    `).join("");

    root.innerHTML = `
      <div class="vt-result">
        <p class="vt-result-eyebrow">Tu perfil vocacional</p>
        <h3 class="vt-result-title">${codeLabel}</h3>
        <p class="vt-result-code">Código Holland: <strong>${codeLetters}</strong></p>
        <p class="vt-result-explain">Sos alguien a quien ${topDims.map(d => DIM_INFO[d].desc).join(" ")}</p>

        <div class="vt-result-block">
          <h4>Tu perfil completo</h4>
          <div class="vt-dim-bars">${dimBarsHTML}</div>
        </div>

        <div class="vt-result-block">
          <h4>Tus áreas más afines</h4>
          <div class="vt-cat-bars">${catBarsHTML}</div>
        </div>

        <div class="vt-result-block">
          <h4>Carreras que podrían interesarte</h4>
          <p class="vt-result-note">Elegidas de nuestra base de ${CAREERS.length} carreras según tu perfil. Tocá cualquiera para ver la ficha completa.</p>
          <div class="vt-careers-grid">${careersHTML}</div>
        </div>

        <div class="vt-result-actions">
          <button type="button" class="vt-secondary-btn" id="vtRetakeBtn">↻ Volver a hacer el test</button>
        </div>
      </div>
    `;

    root.querySelectorAll(".vt-career-card").forEach(btn => {
      btn.addEventListener("click", () => {
        if (typeof window.openDetail === "function") window.openDetail(btn.dataset.id);
      });
    });
    document.getElementById("vtRetakeBtn").addEventListener("click", () => {
      current = 0;
      answers = new Array(QUESTIONS.length).fill(null);
      renderQuestion();
    });
  }

  /* ---------------------------------------------------------------------
     ARRANQUE
     --------------------------------------------------------------------- */
  renderIntro();

})();
