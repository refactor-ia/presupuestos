# Kickstart — App de Presupuestos

Tu tarea: implementar una **app web de presupuestos pure-frontend** siguiendo el SDD que está en este directorio.

## Inputs (leelos en este orden, completos, antes de tocar código)

1. **`.ai/specs/app-presupuestos.yaml`** — qué tiene que hacer la app (12 scenarios Given/When/Then)
2. **`.ai/plans/app-presupuestos.yaml`** — cómo implementarlo (8 tasks en 4 batches con código de referencia)
3. **`.ai/constitution.md`** — stack obligatorio y anti-patterns prohibidos

## Cómo trabajar

- Implementá las tasks **en orden** T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8.
- Cada task tiene `verify:` — corré ese comando antes de pasar a la siguiente.
- No saltees tasks. No optimices el plan. No agregues features que no estén en el spec.
- El stack del `constitution.md` es **obligatorio**: SvelteKit + Svelte 5 (runes) + TypeScript + Tailwind v4 + shadcn-svelte + mode-watcher + jsPDF + Vitest. Cualquier desviación rompe el benchmark.

## Reglas duras (no negociables)

- **Svelte 5 runes únicamente** — prohibido `writable()`, `$:`, `export let`. Usá `$state`, `$derived`, `$effect`, `$props`.
- **Tailwind v4** — prohibido `tailwind.config.js`. Configuración via `@theme` en `src/app.css`.
- **mode-watcher** — usá `mode.current`. Prohibido `$mode`.
- **jsPDF con import dinámico** — `const { default: jsPDF } = await import('jspdf')` dentro del handler. Prohibido importarlo en top-level.
- **`adapter-static`** — debe tener `fallback: 'index.html'`.
- **Sin localStorage / sessionStorage / IndexedDB.** Estado efímero por diseño.
- **Formato `$ 1234.50`** — prefijo `$ ` (signo + espacio) + entero + punto + 2 decimales. No uses `Intl.NumberFormat`.
- **Redondeo half-up manual** — no uses `toFixed(2)` ni `Math.round()` para redondeo crítico.

## Criterio de éxito

Tu implementación está completa cuando:

1. `pnpm test` corre sin fallos (cubre rounding, currency, budgetNumber, totals, validation)
2. `pnpm build` completa sin errores TypeScript ni warnings
3. `pnpm dev` levanta y los 12 scenarios del spec pasan en walkthrough manual
4. Los números del scenario de IVA dan exactos: `3×10.55 + 1×7.77 → Subtotal $ 39.42, IVA 22% $ 8.67, Total $ 48.09`
5. El PDF descargado se llama `PRES-XXXXXX.pdf` con el número exacto que muestra la UI
6. Dark mode arranca activo sin flash, toggle funciona en ambas direcciones

## Empezá ahora

Leé el spec, el plan y la constitution. Después arrancá por T1 (Bootstrap del proyecto). No me pidas confirmación intermedia — el plan ya está aprobado, ejecutá hasta T8.
