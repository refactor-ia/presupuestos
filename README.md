# Presupuestos — Benchmark de 7 LLMs

App de presupuestos en **SvelteKit + Svelte 5 + Tailwind v4** implementada en paralelo por siete modelos de lenguaje, todos partiendo del mismo spec, las mismas constraints y los mismos números de prueba determinísticos.

El experimento compara cómo distintos LLMs interpretan un spec único cuando reciben tres documentos canónicos: una constitución que fija stack y anti-patterns, un spec con scenarios `Given/When/Then`, y un plan de tasks ordenado por dependencias. Cada modelo trabaja aislado en su subcarpeta, sin ver el output de los demás.

## El input compartido

Los tres archivos canónicos viven en [`.ai/`](./.ai/) y son idénticos para los siete modelos:

| Archivo | Qué define |
|---------|-----------|
| [`.ai/constitution.md`](./.ai/constitution.md) | Stack, principios de implementación, anti-patterns prohibidos |
| [`.ai/specs/app-presupuestos.yaml`](./.ai/specs/app-presupuestos.yaml) | Goals, constraints y scenarios `Given/When/Then` con números exactos |
| [`.ai/plans/app-presupuestos.yaml`](./.ai/plans/app-presupuestos.yaml) | Tasks ordenadas, dependencias y datos de prueba determinísticos |

[`.ai/KICKSTART.md`](./.ai/KICKSTART.md) es el punto de entrada que cada modelo lee primero — explica el orden de lectura y los números exactos del scenario de IVA.

## Los siete modelos

| Modelo | Vendor | Carpeta |
|--------|--------|---------|
| Claude | Anthropic | [`claude/`](./claude/) |
| Codex / GPT | OpenAI | [`codex/`](./codex/) |
| DeepSeek | DeepSeek | [`deepseek/`](./deepseek/) |
| GLM | Zhipu | [`glm/`](./glm/) |
| Kimi | Moonshot | [`kimi/`](./kimi/) |
| MiMo | Xiaomi | [`mimo/`](./mimo/) |
| MiniMax | MiniMax | [`minimax/`](./minimax/) |

Cada subcarpeta replica el mismo `.ai/` y suma la implementación en SvelteKit cuando el modelo termina.

## Stack y constraints

- **Framework:** SvelteKit con Svelte 5 runes (`$state`, `$derived`, `$effect`)
- **Estilos:** Tailwind v4, configuración en `app.css` con `@theme` (no existe `tailwind.config.js`)
- **PDF:** jsPDF importado dinámicamente dentro del handler — nunca top-level (rompe prerender)
- **Numérico:** redondeo half-up manual, sin `toFixed` ni `Math.round`; `formatCurrency` propio sin `Intl.NumberFormat`
- **Locale:** `es-UY`, IVA 22%, formato de moneda `$ 1.234,56`

Los anti-patterns están enumerados en `constitution.md` y son condición de aprobación: cada implementación debe respetarlos.

## Correr una implementación

Una vez que la carpeta del modelo tiene el código fuente:

```bash
cd <modelo>            # por ejemplo: cd claude
pnpm install
pnpm dev               # http://localhost:5173
```

Cada implementación es independiente — no comparten `node_modules` ni configuración. Para comparar dos modelos lado a lado conviene levantarlos en puertos distintos (`pnpm dev --port 5174`).

## Replicar el experimento con otro modelo

¿Querés sumar Gemini, Mistral, Qwen, o cualquier otro LLM al benchmark?

1. Cloná el repo y creá una carpeta nueva con el nombre del modelo:
   ```bash
   git clone https://github.com/refactor-ia/presupuestos
   cd presupuestos
   mkdir mi-modelo && cd mi-modelo
   ```

2. Copiá el `.ai/` canónico a la subcarpeta:
   ```bash
   cp -r ../.ai .
   ```

3. Pasale al modelo el `KICKSTART.md`, la constitución, el spec y el plan. El modelo implementa la app en esa carpeta sin ver el resto del repo.

4. Subí el resultado en una rama o fork y comparalo con los otros.

## Qué se observa

El benchmark no busca declarar "el mejor modelo". Mira diferencias cualitativas entre implementaciones a partir del mismo input:

- Adherencia a los anti-patterns prohibidos
- Interpretación de scenarios `Given/When/Then`
- Organización de componentes Svelte 5 (runes vs stores legacy)
- Manejo de half-up rounding y formato monetario manual
- Decisiones de import dinámico para jsPDF
- Granularidad y nombres de archivos generados

## Estado

Los siete contendientes ya tienen su `.ai/` publicado. Las implementaciones se van sumando a medida que cada modelo termina la suya.
