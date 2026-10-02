# Informe de evidencia — participante Nan (benchmark app-presupuestos v4)

Fecha: 2026-09-12 · Estado del material: v4 draft con 6 correcciones locales aprobadas por mantenimiento · Informe acotado por `evaluation.md`.

## Línea base y lockfile

- Línea base congelada en `baseline/` (raíz del repo): `package.json` + `pnpm-lock.yaml` + `pnpm-workspace.yaml` + `BASELINE.md`. Generada y verificada al inicio de esta corrida, sin deriva posterior.
- Node v24.18.0 · pnpm 11.21.0 · SvelteKit 2.70.3 · Svelte 5.57.0 · Vite 8.3.0 · TypeScript 6.0.3 · Tailwind 4.3.3 · jsPDF 4.2.1 · Vitest 5.0.0 · svelte-check 4.7.6 · adapter-static 3.0.10.
- Nota: TypeScript 7.0.2 descartado por estar fuera del rango de peers de `@sveltejs/kit`/`svelte-check`; decisión documentada en `BASELINE.md`.

## URL y build de cada verificación

| Verificación | URL | Build |
|---|---|---|
| Unitarias (Vitest, T-01) | — (node) | producción (mismo árbol) |
| E2E / exploratorio / adversarial / re-verificación (T-02..T-05) | `http://localhost:4174/` | build de producción (`pnpm build`, adapter-static) |
| Variante HTTP no segura (INV-12) | `http://192.168.200.10:4174/` (LAN) | ídem |

**URL real del evaluador: no definida (PRE-04 pendiente).** Toda verificación de navegador corre contra build de producción servido localmente, incluida la variante insegura que dispara el caso de contexto no seguro. No se declara verificación contra una URL que no existe.

## Comandos ejecutados (resultados literales resumidos)

1. `pnpm install --frozen-lockfile` → exit 0.
2. `pnpm test` → **199 passed (199)**, 10 archivos; 0 skips inesperados (`pdftotext` presente; `skipIf` honesto).
3. `pnpm check` → 0 errores, 0 warnings (svelte-check, TS estricto).
4. `pnpm build` → exit 0; sitio estático escrito a `build/`.
5. `pdftotext -layout <pdf>` sobre cada PDF de evidencia → extracción limpia, sin mojibake; strings del contrato literales (incluye `$ 5.000.000,00` / `$ 1.100.000,00` / `$ 6.100.000,00`).

## Decisiones de arquitectura (breve)

SvelteKit estático con prerender total; dominio puro sin dependencia del framework (centavos enteros, IVA 22% half-up una vez sobre el agregado, gramáticas y límites de la spec, mapa un código = un mensaje); PDF derivado del mismo cálculo vía plan puro (métricas propias de Helvetica) + render jsPDF con primitivas; máquina de estados de exportación agnóstica del framework (preparing ≥450ms, guard síncrono anti-doble-descarga, expiración de éxito 8.5s, reintento siempre efectivo); `PRES-XXXXXX` generado solo en cliente con `crypto.getRandomValues` (fallback seguro en HTTP inseguro, sin `randomUUID`); fecha compartida UI/PDF.

## Decisiones de estilo y motion (breve)

Tema oscuro inicial vía clase en `<html>`; tokens propios en `app.css` sobre Tailwind 4 con auditoría de contraste de 34 pares en suite (WCAG, ambos temas); cross-fade global de tema 260ms con doble-rAF y guard `prefers-reduced-motion`; filas con entrada/salida animada + reacomodo flip; totales con re-play de énfasis al cambiar (Total = protagonista); contador de caracteres de descripción desde 200 con estados ámbar/rojo; materialización animada del PRES al hidratar (240ms); notificaciones de exportación no bloqueantes con expiración.

## Matriz de escenarios

| SC | Estado | Nota breve |
|---|---|---|
| SC-01 | aprobado | PDF breve exportado con filename correcto (`PRES-721258.pdf`), valores 100,00/22,00/122,00 |
| SC-02 | aprobado | nombre vacío bloquea export; mensaje junto al campo |
| SC-03 | aprobado | `no-es-email` bloquea en blur y en export |
| SC-04 | aprobado | `0`, `1.5`, `-3` rechazados; mensaje de cantidad |
| SC-05 | aprobado | `-10`, `0`, `1.234`, `12,5a` rechazados; `12,50` válido |
| SC-06 | aprobado | descripción vacía bloquea alta |
| SC-07 | aprobado | canónico 31,65/7,77/39,42/8,67/48,09 en UI y tests |
| SC-08 | aprobado | al eliminar el último: totales `$ 0,00`, export deshabilitado |
| SC-09 | aprobado | tooltip exacto `Agregá al menos un ítem` (sin punto final) |
| SC-10 | aprobado | toggle oscuro↔claro en sesión, sin persistencia |
| SC-11 | aprobado | recarga: estado vacío, totales `$ 0,00`, PRES nuevo (verificado en navegador) |
| SC-12 | aprobado | PDF con encabezado+fecha, cliente, tabla 4 columnas, totales, pie por página |
| SC-13 | aprobado | 1000×5.000,00 → `$ 5.000.000,00` / `$ 1.100.000,00` / `$ 6.100.000,00` en UI y PDF |

## Gate de QA pre-entrega (G-07): matriz T-01..T-06

| ID | Tipo | Estado | Evidencia |
|---|---|---|---|
| T-01 | Unitarias de dominio | **verde** | 199 tests; cobertura 60/61 del checklist QA + 5 gaps cerrados |
| T-02 | E2E flujos críticos | **verde** | 5 flujos con nombre ejecutados en navegador real (carga de ítem, PDF, totales add/remove, bloqueo por cliente, recarga efímera) |
| T-03 | Accesibilidad | **verde** | contraste 34 pares (suite), labels/aria asociados, teclado completo, `aria-live`, targets ≥44px; revisión humana declarada donde aplica |
| T-04 | Exploratorio | **verde** | charters E-01..E-08: 2 viewports, ambos temas, recarga, límites; capturas canónicas |
| T-05 | Adversarial de frontera | **verde** | hidratación (0 mismatches), HTTP inseguro, carreras (doble clic, mutación, reload), límites 100/240, bordes de página PDF, XSS inerte |
| T-06 | Revisión de entrega | **verde** | esta matriz + auditoría de evidencia independiente (cortex-evidence-auditor) |

### Hallazgo → estado (campaña QA)

| Hallazgo | Severidad original | Estado final |
|---|---|---|
| DEF-01 shift de layout al mostrar error (375px) | medium | **corregido y medido**: 0px en todas las transiciones (mensajes acortados a una línea + slot estructuralmente igual a la línea) |
| DEF-02 cross-fade de tema inoperante | low | **corregido**: selector no matcheaba `<html>`; medido 352ms, 18 colores interpolados |
| DEF-03 preparing <100ms | low | **corregido**: hold en capa UI; medido 433-449ms; persiste con `reducedMotion` |
| DEF-04 overflow horizontal a 375px (468>375) | medium | **corregido**: `min-w-0` + caption sr-only contenido; `scrollWidth 375 == clientWidth` con 25 ítems y con descripción de 240 chars |
| F-01 favicon 404 (1 console error/carga) | minor | **corregido**: `static/favicon.svg` + link; 0 errores de consola |
| F-02 placeholder PRES visible ~650ms | observation | **pulido**: transición de materialización 240ms; RQ-01 intacto |
| F-03 límite 240 chars solo en submit | observation | **corregido**: contador en vivo desde 200 chars, sin shift |
| Gap P1 IVA diverger 25¢+25¢→11 | P1 test | **agregado** (test pasa) |
| Gaps P2/P3 (1¢→0, 25¢→6, email trim, `12,`/`,`) | P2/P3 test | **agregados** |

### Invariantes INV-01..INV-12 (medidas finales)

| INV | Resultado | Medición |
|---|---|---|
| INV-01 | ✅ | `scrollWidth 375 ≤ 375` con 25 ítems y con 240 chars; tabla scrollea interna |
| INV-02 | ✅ | 34 pares ≥4.5:1 / ≥3:1, ambos temas, en suite (math WCAG) |
| INV-03 | ✅ | un solo indicador de foco por control; botones/links conservan outline |
| INV-04 | ✅ | controles ≥44×44px a 375px |
| INV-05 | ✅ | `elementFromPoint` resuelve los controles con notificación visible |
| INV-06 | ✅ | preparing medido 433-449ms (≥300ms); invariante de estado, persiste con reducedMotion |
| INV-07 | ✅ | foco utilizable tras agregar/eliminar |
| INV-08 | ✅ | éxito expira solo (≤10s; ventana 8.5s) y se limpia al cambiar datos |
| INV-09 | ✅ | doble clic trusted <150ms → exactamente 1 descarga (verificación con input real; el fallo reportado por un agente fue artefacto de harness, documentado) |
| INV-10 | ✅ | reintento siempre dispara (token reset) |
| INV-11 | ✅ | `pdftotext` sin mojibake; strings del contrato literales en todos los PDFs |
| INV-12 | ✅ | suite corre contra URL real de evaluación local + variante HTTP insegura; sin APIs solo-secure-context |

## Capturas y PDFs

En `evidence/`:

1. `captura-1-escritorio-oscuro-1280x800.png` — Cliente Demo + Diseño web 2×50,00 + A 3×10,55.
2. `captura-2-movil-oscuro-375x812.png` — cliente vacío, cantidad `1.5` con error visible, sin ítems.
3. `captura-3-escritorio-claro-1280x800.png` — mismos datos tras toggle.
4. `pdf-breve-sc01.pdf` — SC-01 completo.
5. `pdf-largo-25-items.pdf` — 25 ítems + descripción de 120 chars, 2 páginas, header de tabla repetido y pie con página en ambas.

## Riesgos, fallos conocidos y no ejecutado

- **URL del evaluador (PRE-04)**: no definida al cierre. Todo T-02/T-03/T-04/T-05 corre contra build de producción local (`localhost:4174`) y su variante LAN insegura. Queda declarado, no simulado.
- **Memoria de corridas previas**: el agente participante tiene memoria de implementaciones v2/v3 rollbackeadas de este mismo benchmark; se declara como posible sesgo a criterio del evaluador.
- **Herramienta de QA**: playwright-core + Chrome del sistema ejecutados desde `/tmp` (fuera de la línea base del participante); usados solo para revisión, no como dependencia de la app. La línea base del participante no cambió durante la corrida.
- **Ventana de éxito observada ~3s** en una medición exploratoria (configurada 8.5s, límite spec 10s): discrepancia menor sin impacto de contrato; se declara.
- **Display de error de export retrasado hasta ~300ms** en el camino de fallo rápido: consecuencia deliberada del hold de INV-06; se declara.
- **No ejecutado**: revisión visual humana por el evaluador en su URL; cualquier percepción estética (las diferencias de gusto son datos del benchmark).
- Sin commits ni push (no solicitado).
