# Constitution — presupuestos

> Generado el 2026-05-03.
> Centraliza las restricciones técnicas y estándares que guían toda implementación en este proyecto.
> El stack y las convenciones reflejan un estándar web moderno con SvelteKit + Svelte 5 runes + Tailwind v4.

## Stack

- **Runtime:** Node 20 LTS
- **Package manager:** pnpm 9
- **Framework:** SvelteKit (última versión estable)
- **Lenguaje:** TypeScript estricto (`strict: true` en tsconfig)
- **UI library:** Svelte 5 con runes (`$state`, `$derived`, `$effect`, `$props`, `$bindable`)
- **Adapter:** `@sveltejs/adapter-static` con `fallback: 'index.html'` (SPA pure-frontend, sin server)
- **Styling:** Tailwind CSS v4 con tokens semánticos
- **UI components:** shadcn-svelte (sobre `bits-ui`)
- **Dark mode:** mode-watcher v1.x
- **PDF:** jsPDF (importación dinámica en el handler para evitar SSR)
- **Testing:** Vitest

## Conventions

### Estructura de archivos

```
src/
├── app.css                # @import "tailwindcss" + @variant dark + tokens
├── app.html
├── lib/
│   ├── components/
│   │   ├── ui/            # shadcn-svelte (no editar a mano)
│   │   ├── BudgetForm.svelte
│   │   ├── ItemsTable.svelte
│   │   ├── TotalsPanel.svelte
│   │   └── ThemeToggle.svelte
│   ├── state/             # state global con runes
│   │   └── budget.svelte.ts
│   ├── pdf/               # generación PDF
│   │   └── exportBudget.ts
│   ├── utils/
│   │   ├── currency.ts    # formateo $ con 2 decimales
│   │   ├── rounding.ts    # half-up a 2 decimales
│   │   └── budgetNumber.ts
│   └── types/
│       └── budget.ts      # tipos TypeScript del dominio
└── routes/
    ├── +layout.svelte     # ModeWatcher + theme provider
    ├── +layout.ts         # export const prerender = true; ssr = false (si aplica)
    └── +page.svelte       # pantalla única
```

### Naming

- **Componentes:** `PascalCase.svelte` (ej: `BudgetForm.svelte`)
- **Módulos TS:** `camelCase.ts` (ej: `budgetNumber.ts`)
- **Archivos de state con runes:** sufijo `.svelte.ts` (ej: `budget.svelte.ts`)
- **Tipos:** `PascalCase` en interfaces (`Budget`, `BudgetItem`, `Client`)
- **Funciones puras / utils:** `camelCase` (`formatCurrency`, `roundHalfUp`, `generateBudgetNumber`)

### Imports

- Usar alias `$lib/` para imports internos
- Orden: externos → `$lib/` → relativos
- Sin imports default cuando hay nombrados disponibles

### Svelte 5 — obligatorio

- **PROHIBIDO:** `writable()`, `derived()`, `$:`, `export let`, slot syntax viejo (`<slot>`)
- **OBLIGATORIO:** `$state`, `$derived`, `$effect`, `$props`, snippets (`{#snippet}` / `{@render}`)
- Props tipadas: `let { prop }: { prop: string } = $props();`
- State global compartido entre componentes: módulo `.svelte.ts` exportando objeto con `$state` (no stores).

### Tailwind CSS v4 — obligatorio

- **PROHIBIDO:** `tailwind.config.js`/`.ts`, directivas `@tailwind base/components/utilities`, colores hardcoded (`bg-white`, `text-gray-500`, etc.)
- **OBLIGATORIO:**
  - `@import "tailwindcss";` en `app.css`
  - `@variant dark (&:where(.dark, .dark *));` debajo del import (crítico para que `dark:` responda a la clase `.dark` de mode-watcher)
  - Configuración de tema con `@theme { ... }` directamente en CSS
  - Colores via tokens semánticos: `bg-background`, `text-foreground`, `bg-card`, `text-muted-foreground`, `border-border`, `bg-primary`, `text-primary-foreground`, `bg-destructive`, etc.
- **Patrón de migración:** `bg-white` → `bg-card` · `bg-gray-100` → `bg-muted` · `text-gray-900` → `text-foreground` · `text-gray-500` → `text-muted-foreground` · `border-gray-*` → `border-border` · `hover:bg-gray-50` → `hover:bg-muted`

### shadcn-svelte

- Inicializar con `pnpm dlx shadcn-svelte@latest init`
- Componentes UI dentro de `src/lib/components/ui/`
- **NO confundir con shadcn/ui (React).** shadcn-svelte usa `bits-ui`, no Radix.
- Bug conocido: si `sheet-content.svelte` se genera con `import { cn, type WithoutChildrenOrChild } from "$lib/utils.js"`, corregir a `import type { WithoutChildrenOrChild } from "bits-ui"` (no relevante para este proyecto si no se usa Sheet, pero documentar).

### Dark mode (mode-watcher)

- Instalar `mode-watcher` v1.x
- En `+layout.svelte`: `<ModeWatcher defaultMode="dark" />` (default ON por requerimiento del producto)
- Acceso al estado: `mode.current` (string `'dark' | 'light'`) — **NO** `$mode`
- Toggle: `import { toggleMode } from 'mode-watcher'` y `onclick={toggleMode}`
- Para evitar flash en carga: `<html class="dark">` hardcoded en `app.html` (mode-watcher se encarga de actualizar al iniciar)

### TypeScript

- `strict: true` en `tsconfig.json` (heredado del default de `pnpm create svelte`)
- Sin `any` salvo casos justificados con comentario
- Tipar todos los props, return types públicos y modelos de dominio

## Security Restrictions

- **No persistencia:** prohibido `localStorage`, `sessionStorage`, `IndexedDB`, cookies, llamadas a APIs externas.
- **No telemetría:** sin analytics, sin tracking, sin requests salientes.
- **PDF generado en cliente:** jsPDF corre 100% en browser, no envía datos a ningún servidor.
- **No eval / no innerHTML con input del usuario:** todo render via templates Svelte (escapado por defecto).
- **No deps de runtime no listadas:** solo el stack pinned. Cualquier librería adicional requiere justificación.

## Testing Standards

- **Framework:** Vitest
- **Tipos de tests requeridos:**
  - Unit tests para utils puros (`currency.ts`, `rounding.ts`, `budgetNumber.ts`)
  - Unit tests para lógica de cálculo de totales
  - Tests de validación (cantidad inválida, precio inválido, email inválido)
- **Cobertura mínima:** funciones puras al 100%; componentes con lógica de negocio al menos los happy paths.
- **Naming:** archivos `*.test.ts` o `*.spec.ts` colocados junto al módulo testeado o en `tests/` cuando sea integration.
- **Comando:** `pnpm test` debe correr la suite completa sin errores.

## Technical Decisions

- **State management:** runes en módulos `.svelte.ts` exportando objetos con `$state`. Sin Pinia, sin stores legacy.
- **Data fetching:** N/A (app pure-frontend sin backend).
- **Error handling:** validación inline en formularios con mensajes específicos por campo. Errores de PDF (improbables) se loggean a console en dev y se muestran al usuario via toast/alert visible.
- **Number/currency formatting:** función propia `formatCurrency(value: number): string` que devuelve `$ 1234.50` (prefijo `$ ` con espacio + 2 decimales con punto). **No** usar `Intl.NumberFormat` con locale (genera comas en `es-UY`).
- **Rounding:** `roundHalfUp(value: number, decimals: number = 2): number` implementado a mano. **No** confiar en `toFixed` (banker's rounding en algunos motores) ni `Math.round` directo (rounds half-to-even para `.5` exactos en algunos cases).
- **Random number generation (PRES-XXXXXX):** `crypto.getRandomValues()` para 6 dígitos numéricos. Generado una vez al iniciar la sesión, almacenado en módulo state, persiste hasta refresh.
- **Build:** `pnpm build` debe completar sin errores; el output en `build/` es servible estáticamente.

## Anti-patterns prohibidos (lista corta para checklist)

- ❌ `writable()`, `derived()`, `readable()` de `svelte/store`
- ❌ `$: derived = a + b` (reactividad Svelte 4)
- ❌ `export let prop` (props Svelte 4)
- ❌ `$mode` (mode-watcher viejo)
- ❌ `tailwind.config.js`/`.ts`
- ❌ `@tailwind base/components/utilities`
- ❌ Colores hardcoded (`bg-white`, `text-gray-500`, etc.)
- ❌ `localStorage` / `sessionStorage` / `IndexedDB`
- ❌ `Intl.NumberFormat` con locale `es-*` (genera coma decimal)
- ❌ `toFixed(2)` para redondeo crítico (no es half-up consistente)
- ❌ Importar jsPDF en top-level (rompe SSR aunque sea `prerender`)
- ❌ Olvidar `fallback: 'index.html'` en `adapter-static` config
