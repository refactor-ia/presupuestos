# Presupuestos: benchmark de 7 LLMs

Misma app, mismo spec, mismas constraints. Siete modelos la implementan en paralelo, cada uno aislado en su carpeta, sin ver lo que hicieron los demás.

La app es una calculadora de presupuestos en SvelteKit + Svelte 5 + Tailwind v4. Lo interesante no es la app: es ver qué hace cada modelo cuando le pasás exactamente el mismo input (constitución, spec con scenarios `Given/When/Then`, plan de tasks ordenado, números de prueba determinísticos) y lo dejás trabajar solo.

## El input compartido

Los tres archivos canónicos viven en [`.ai/`](./.ai/) y son idénticos para los siete modelos:

| Archivo | Qué define |
|---------|-----------|
| [`.ai/constitution.md`](./.ai/constitution.md) | Stack, principios de implementación, anti-patterns prohibidos |
| [`.ai/specs/app-presupuestos.yaml`](./.ai/specs/app-presupuestos.yaml) | Goals, constraints y scenarios `Given/When/Then` con números exactos |
| [`.ai/plans/app-presupuestos.yaml`](./.ai/plans/app-presupuestos.yaml) | Tasks ordenadas, dependencias y datos de prueba determinísticos |

[`.ai/KICKSTART.md`](./.ai/KICKSTART.md) es el punto de entrada. Cada modelo lo lee primero: dice en qué orden leer los otros tres archivos y fija los números exactos del scenario de IVA.

## Los siete contendientes

| Modelo | Vendor | Carpeta |
|--------|--------|---------|
| Claude | Anthropic | [`claude/`](./claude/) |
| Codex / GPT | OpenAI | [`codex/`](./codex/) |
| DeepSeek | DeepSeek | [`deepseek/`](./deepseek/) |
| GLM | Zhipu | [`glm/`](./glm/) |
| Kimi | Moonshot | [`kimi/`](./kimi/) |
| MiMo | Xiaomi | [`mimo/`](./mimo/) |
| MiniMax | MiniMax | [`minimax/`](./minimax/) |

Cada subcarpeta replica el mismo `.ai/` y suma la implementación SvelteKit cuando el modelo termina.

## Stack y constraints

- **Framework:** SvelteKit con Svelte 5 runes (`$state`, `$derived`, `$effect`)
- **Estilos:** Tailwind v4 configurado en `app.css` con `@theme` (no existe `tailwind.config.js`)
- **PDF:** jsPDF importado dinámico dentro del handler. Top-level rompe prerender
- **Numérico:** redondeo half-up manual, sin `toFixed` ni `Math.round`. `formatCurrency` propio sin `Intl.NumberFormat`
- **Locale:** `es-UY`, IVA 22%, formato de moneda `$ 1.234,56`

Los anti-patterns están enumerados en `constitution.md` y son condición de aprobación. Cada implementación los respeta o no entra.

## Correr una implementación

Una vez que la carpeta del modelo tiene el código:

```bash
cd <modelo>            # por ejemplo: cd claude
pnpm install
pnpm dev               # http://localhost:5173
```

Cada implementación es independiente: no comparten `node_modules` ni configuración. Para comparar dos modelos lado a lado, levantalos en puertos distintos (`pnpm dev --port 5174`).

## Sumar otro modelo al benchmark

¿Querés meter Gemini, Mistral, Qwen, o el que quieras?

1. Cloná el repo y creá la carpeta del modelo:
   ```bash
   git clone https://github.com/refactor-ia/presupuestos
   cd presupuestos
   mkdir mi-modelo && cd mi-modelo
   ```

2. Copiá el `.ai/` canónico a la subcarpeta:
   ```bash
   cp -r ../.ai .
   ```

3. Pasale al modelo el `KICKSTART.md`, la constitución, el spec y el plan. Implementa la app en esa carpeta sin ver el resto del repo.

4. Subí el resultado en una rama o fork.

## Qué se mira

Esto no es un ranking. No busca decir cuál modelo "es el mejor". Lo que mira son las diferencias cualitativas entre implementaciones partiendo del mismo input:

- Si respeta los anti-patterns prohibidos o se los saltea
- Cómo interpreta los scenarios `Given/When/Then`
- Si organiza componentes con Svelte 5 runes o cae en stores legacy
- Cómo resuelve el half-up rounding y el formato monetario manual
- Si importa jsPDF dinámico o lo sube a top-level
- Cómo nombra y granula los archivos que genera

## Estado

Los siete tienen el `.ai/` publicado. Las implementaciones se van sumando a medida que cada modelo termina la suya.
