# Orientación Vocacional 2026 (v1.13.4)

Guía para estudiantes secundarios del Chaco y provincias cercanas: catálogo de carreras, test vocacional RIASEC, asistente para elegir carrera, comparador, plan para empezar a estudiar, instituciones y becas.
Es HTML, CSS y JavaScript puro, sin framework ni paso de compilación. Se publica en GitHub Pages en el subdirectorio `/Orientaci-n-Vocacional/`.

## Estructura de archivos

| Archivo | Qué hace |
|---|---|
| `index.html` | Página única. Contiene datos estáticos para SEO (JSON-LD) que se regeneran con `tools/sync-seo.js`. |
| `careers-data.js` | **Fuente de verdad**: `CAREERS` (283), `INSTITUCIONES`, `BECAS_GENERALES`. |
| `script.js` | Catálogo, búsqueda, filtros, fichas de carrera, favoritos, comparador, tema. Expone `window.OV` (favoritos/comparador) y dispara los eventos `ov:favorites-changed` y `ov:compare-changed`. |
| `vocational-test.js` | Test vocacional RIASEC (24 frases + preguntas de contexto). |
| `ov-core.js` | Lógica pura (sin DOM): recomendador, plan, validación de sugerencias. Se prueba en Node. |
| `ov-ui.js` | Helper de DOM seguro (`textContent`, nunca `innerHTML`) y acceso a `localStorage`. |
| `assistant.js` | Pantallas de "Encontrá tu carrera ideal". |
| `plan.js` | "Mi plan para empezar a estudiar". |
| `header-nav.js` | Resalta en la barra superior la sección visible. |
| `sw-register.js` | Registro del service worker (antes estaba en línea en `index.html`; se movió para poder usar una CSP estricta). |
| `suggest.js` | "¿Encontraste un dato incorrecto?". |
| `ov-tools.css` | Estilos de lo anterior, mejoras del comparador e impresión del plan. |
| `style.css`, `reveal.js`, `careers-toggle.js` | Estilos y comportamiento originales. |
| `sw.js`, `manifest.json`, `icons/` | PWA. |
| `pdfs/`, `pdfs-index.js`, `pdfs-data.js`, `pdf-assets.js` | Planes de estudio en PDF (los dos últimos se cargan solo al descargar). |
| `tools/` | `sync-seo.js` (SEO ↔ datos) y `sw-version.js` (versión de caché). |
| `tests/` | `unit.test.js` (Node) y `e2e/smoke.py` (navegador real, Playwright). |

## Probar y verificar

```bash
npm run check      # SEO sincronizado con los datos + versión del service worker al día
npm test           # pruebas unitarias (Node 18+, sin dependencias)
npm run test:e2e   # pruebas en Chromium (requiere: pip install playwright && playwright install chromium)
```

`test:e2e` levanta su propio servidor local en el subdirectorio `/Orientaci-n-Vocacional/`, igual que GitHub Pages, y falla ante errores de consola, recursos locales 404 o scroll horizontal.
El workflow `.github/workflows/test.yml` corre las tres cosas en cada push o pull request (no publica nada).

## Cómo agregar o modificar datos

1. Editá `careers-data.js` siguiendo el formato de las carreras existentes (el comentario del inicio del archivo lo explica). El `id` debe ser único y usar solo `a-z`, `0-9` y `-`.
2. Ejecutá `npm run build`. Esto regenera el JSON-LD y los contadores de `index.html` y actualiza la versión de caché del service worker.
3. Ejecutá `npm test`. Falla si hay ids repetidos, instituciones inexistentes, campos esenciales vacíos, cantidades de carreras incoherentes o archivos de la PWA faltantes.

El número de carreras de la portada se calcula con JavaScript; el que está escrito en el HTML y en el JSON-LD es el que ven los buscadores, y `sync-seo.js` lo mantiene igual al del catálogo.

## Publicar una versión

1. `npm run build` y luego `npm test` (y `npm run test:e2e` si podés).
2. Subí los cambios a la rama que usa GitHub Pages.
3. Los visitantes reciben la actualización solos: `sw-version.js` cambia el nombre de la caché cuando cambia cualquier archivo precacheado, el navegador instala el service worker nuevo y recarga una vez.

## PWA

- Alcance y rutas relativas (`./`): funciona en el subdirectorio de GitHub Pages.
- **Se precachean** al instalar los archivos de `PRECACHE_URLS` en `sw.js` (HTML, JS, CSS, íconos, datos). Si agregás un archivo que `index.html` carga, agregalo a esa lista: un test lo exige.
- Navegación: red primero, con copia guardada de `index.html` si no hay conexión. Resto de archivos: caché primero; lo que no esté guardado se pide a la red y se guarda.
- Los PDFs y las fuentes de Google se guardan recién cuando se usan: sin conexión, los PDFs no abiertos antes no están disponibles.
- Al activar una versión nueva solo se borran cachés que empiezan con `ov-cache-` y no son la actual.

## Encontrá tu carrera ideal (asistente)

Recomendador **local basado en reglas**; no hay IA ni servidor. Usa únicamente `CAREERS` e `INSTITUCIONES`.

Puntaje 0–100 = `100 × puntos obtenidos / puntos posibles` sobre las dimensiones que la persona respondió **y** para las que hay dato fiable:

| Dimensión | Puntos | Fuente del dato |
|---|---|---|
| Afinidad temática (intereses, actividades, materias) | 50 | categoría de la carrera + palabras clave en nombre, descripción, habilidades, materias y perfil |
| Duración | 8 | `duracionAnios` |
| Tipo de título | 6 | prefijo del nombre (Licenciatura, Ingeniería, Tecnicatura, Profesorado…) |
| Gestión pública/privada | 4 | `tipo` de la institución |
| Modalidad | 6 | solo si es **confiable** (`modalidadTipo`, texto de `modalidadInstituciones` o Siglo 21) |
| Ubicación | 8 | `ubicaciones` de la carrera o de sus instituciones |
| Trabajar mientras estudia | 6 | modalidad flexible o carrera corta |
| Prioridades (costo, duración, salida laboral) | 6 | gestión, duración, sueldo junior vs. mediana del catálogo |
| Test RIASEC guardado | 15 | `CATEGORY_RIASEC` de `vocational-test.js` |

Reglas importantes:
- Una pregunta sin responder, o sin dato fiable, **no suma ni resta**; se informa en "Conviene investigar".
- Las preferencias que no se cumplen aparecen en "Lo que no coincide"; con 2 o más, la coincidencia no puede ser "alta".
- "No puedo mudarme" + provincia excluye carreras sin sede allí (salvo las confirmadas como virtuales).
- Se excluyen carreras que exigen título previo (CCC, posgrados…), igual que el test vocacional.
- Máximo 5 resultados y 3 por área. Con pocas respuestas, sin coincidencias o coincidencias bajas se avisa en vez de inventar.
- Es orientación para explorar, no un diagnóstico psicológico.

**Limitación conocida de los datos:** 268 de 283 carreras no tienen `modalidadTipo`; `script.js` asume "presencial" para ellas salvo que sean de Siglo 21. El asistente no usa esa suposición, así que filtrar por modalidad solo funciona con las carreras que tienen el dato.

## Comparador

Se mantiene el comparador original (hasta 3 carreras). Se agregaron las filas Requisitos de ingreso, Costo (arancel), Ventajas, Dificultades y Sitio oficial (desde la ficha de cada institución; si falta el dato, lo dice), el aviso de que los sueldos son aproximados con su fecha de referencia, la marca "difiere" por fila y la casilla "solo diferencias". No declara una carrera ganadora.

## Mi plan

Se guarda **solo en el navegador** (`localStorage`, clave `ov-plan-v1`): carreras, instituciones, becas marcadas, tareas hechas, documentación y notas. No pide datos personales. Se pierde si se borran los datos del navegador o se usa otro dispositivo (la pantalla lo avisa). No incluye fechas de inscripción: cambian cada año. Imprimir/PDF usa la impresión del navegador con una versión limpia del plan. Lo leído de `localStorage` se valida siempre.

## ¿Encontraste un dato incorrecto? (dentro del bloque de Contacto)

Como GitHub Pages es estático, **no hay servidor que reciba las sugerencias**. El formulario valida los campos y ofrece: abrir el correo (`mailto:`) con el mensaje armado, copiar el reporte o descargarlo. Nunca dice "enviado": aclara que el envío lo hace la persona. La dirección se lee del enlace de contacto que ya tiene la página; si no existe, el botón de correo no aparece.
Para recibir sugerencias automáticamente haría falta un servicio externo (por ejemplo un formulario de terceros): implicaría datos que salen del sitio y revisar privacidad, por eso no se agregó.

## Datos guardados en el navegador

| Clave | Contenido |
|---|---|
| `ov-favorites`, `ov-compare` | ids de carreras |
| `ov_test_vocacional_v4` | resultado del test vocacional |
| `ov-asistente-v1` | respuestas del asistente |
| `ov-plan-v1` | plan |
| tema / modo lectura | preferencias de visualización |

No se envía nada a ningún servidor. Los enlaces externos usan `rel="noopener noreferrer"`.

## Instituciones

Además del filtro por provincia y el buscador que ya existían, se agregaron filtros por **ciudad**, **tipo de institución** (universidades y facultades / institutos terciarios / fuerzas de seguridad y armadas) y **gestión** (pública / privada). Las opciones salen de los datos de `INSTITUCIONES`.
Cada tarjeta tiene un botón **"Ver en Maps"**: abre Google Maps con la dirección cargada (o, si la dirección es aproximada, con el nombre y la ciudad). No se guardan coordenadas propias.

## Becas

Cada beca de `BECAS_GENERALES` tiene `organismo`, `url` (enlace oficial), `verificado` (mes de la última verificación) y `fechaLimite`, y opcionalmente `estado` (por ejemplo "sin convocatoria abierta"; se muestra en la tarjeta). Los planes guardados identifican las becas por su **posición** en la lista: si agregás una, ponela al final; no reordenes ni borres las existentes. `fechaLimite: null` significa que no está confirmada y la tarjeta lo dice; **no se investigan ni se cargan fechas de inscripción** (cambian en cada convocatoria y las consulta quien visita). Si cargás una fecha, escribila como texto (por ejemplo `"15 de marzo de 2027"`) y actualizá `verificado`.

## Seguridad

- `index.html` declara una **Content-Security-Policy** (meta): scripts solo propios y `cdnjs.cloudflare.com` (para jsPDF), sin `'unsafe-inline'` en scripts; sin scripts ni manejadores en línea. Si agregás otro origen externo, hay que sumarlo a la CSP (un test lo comprueba).
- Los módulos nuevos no usan `innerHTML`. El código original sí lo usa con datos del catálogo; `npm test` verifica que ninguna cadena de los datos contenga `<`, y las pruebas de navegador comprueban que payloads de inyección en `localStorage`, el hash o el buscador no se ejecuten.
- Lo leído de `localStorage` se valida (incluido el resultado del test vocacional).

## Pendiente / no implementado

- **Mapa incrustado de instituciones**: no hay coordenadas verificadas (no se pudieron obtener de fuentes confiables) y no se inventaron; en su lugar cada tarjeta enlaza a Google Maps por dirección.
- **Fechas de inscripción y fecha límite de becas**: no se cargan (decisión del proyecto); se remite al sitio oficial.
- **Fuentes externas**: tipografías de Google Fonts (con *fallback* del sistema).
- No se probaron los enlaces externos del catálogo.
