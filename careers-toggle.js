/* =====================================================================
   careers-toggle.js — Botón para replegar/desplegar la lista de 139
   carreras, sin afectar el buscador ni los filtros.
   ---------------------------------------------------------------------
   Se carga después de script.js, así que cuando corre, la grilla ya
   está renderizada con las CAREERS por defecto (visibles todas).

   REGLA CLAVE que pidió Dilan:
   - El botón solo repliega/despliega la GRILLA. Nunca toca el buscador
     ni los filtros.
   - Si hay una búsqueda o un filtro activo (la grilla muestra menos
     carreras que el total), la lista se despliega sola y el botón se
     desactiva para "replegar" hasta que se limpie la búsqueda/filtro.
     Así nunca se puede ocultar sin querer un resultado filtrado.
   - Detectamos "hay un filtro activo" comparando cuántas tarjetas hay
     renderizadas en #careersGrid contra el total de CAREERS. Es un
     truco simple pero confiable: no hace falta duplicar la lógica de
     filtros de script.js ni tocar ese archivo.
   ===================================================================== */

(function () {
  "use strict";

  const wrap = document.getElementById("careersListWrap");
  const grid = document.getElementById("careersGrid");
  const toggleBtn = document.getElementById("toggleCareersBtn");
  const searchInput = document.getElementById("searchInput");
  const categoryChips = document.getElementById("categoryChips");
  const filtersPanel = document.getElementById("filtersPanel");
  const clearFiltersBtn = document.getElementById("clearFilters");
  const favoritesToggleBtn = document.getElementById("favoritesToggle");

  if (!wrap || !grid || !toggleBtn) return;

  const TOTAL = Array.isArray(window.CAREERS) ? window.CAREERS.length : null;

  let collapsed = false;

  function visibleCount() {
    return grid.children.length;
  }

  function hasActiveFilterOrSearch() {
    if (searchInput && searchInput.value.trim() !== "") return true;
    if (TOTAL === null) return false;
    return visibleCount() !== TOTAL;
  }

  function labelHTML(isCollapsed) {
    const chevronPoints = isCollapsed ? "6 9 12 15 18 9" : "18 15 12 9 6 15";
    const text = isCollapsed
      ? `Mostrar las ${TOTAL !== null ? TOTAL + " " : ""}carreras`
      : "Ocultar la lista";
    return `
      <svg class="toggle-careers-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="${chevronPoints}"/></svg>
      <span>${text}</span>
    `;
  }

  function applyCollapseUI() {
    wrap.classList.toggle("careers-collapsed", collapsed);
    toggleBtn.setAttribute("aria-expanded", String(!collapsed));
    toggleBtn.innerHTML = labelHTML(collapsed);
  }

  function refreshLockState() {
    const active = hasActiveFilterOrSearch();
    if (active && collapsed) {
      // Hay búsqueda/filtro activo: nunca se queda replegada.
      collapsed = false;
      applyCollapseUI();
    }
    toggleBtn.disabled = active;
    toggleBtn.classList.toggle("is-locked", active);
    toggleBtn.title = active
      ? "Limpiá la búsqueda o los filtros para poder ocultar la lista"
      : "";
  }

  toggleBtn.addEventListener("click", () => {
    if (toggleBtn.disabled) return;
    collapsed = !collapsed;
    applyCollapseUI();
  });

  // Cualquier interacción que pueda cambiar qué se muestra en la grilla
  // dispara refreshLockState(). Como estos listeners se agregan después
  // de que corrió script.js, se ejecutan después de que la grilla ya
  // se volvió a renderizar con el nuevo resultado.
  if (searchInput) searchInput.addEventListener("input", refreshLockState);
  if (categoryChips) categoryChips.addEventListener("click", refreshLockState);
  if (filtersPanel) {
    filtersPanel.addEventListener("click", refreshLockState);
    filtersPanel.addEventListener("change", refreshLockState);
  }
  if (clearFiltersBtn) clearFiltersBtn.addEventListener("click", refreshLockState);
  if (favoritesToggleBtn) favoritesToggleBtn.addEventListener("click", refreshLockState);

  applyCollapseUI();
  refreshLockState();

})();
