# Contribuir al benchmark

El repo recibe dos tipos de contribuciones: **sumar un modelo nuevo** o **mejorar uno ya existente**. El flujo es distinto en cada caso.

## Sumar un modelo nuevo

Es el flujo principal: meter una implementación de un LLM que todavía no está en el benchmark.

1. **Abrí un issue** con el template "Nuevo modelo" antes de empezar. Sirve para que quede registro público de quién está trabajando en qué y para evitar dos PRs simultáneos del mismo modelo.
2. **Forkeá el repo** y creá una branch: `feat/<modelo>` (ej: `feat/gemini`).
3. **Creá la carpeta del modelo** en la raíz: `mi-modelo/`.
4. **Copiá el `.ai/` canónico** a la subcarpeta:
   ```bash
   cp -r .ai mi-modelo/
   ```
5. **No modifiques los archivos canónicos.** El `.ai/` raíz es la verdad compartida. Si lo cambiás, rompés el benchmark.
6. **Pasale al modelo** el `KICKSTART.md`, la constitución, el spec y el plan. El modelo implementa la app en `mi-modelo/` sin ver el resto del repo.
7. **Verificá** que la app levante con `pnpm install && pnpm dev` y que respete los anti-patterns de la constitución.
8. **Abrí el PR** desde tu fork hacia `main`.

## Mejorar una implementación existente

Si encontrás un bug o mejora en una de las carpetas ya publicadas:

1. Abrí un issue describiendo el problema y a qué modelo afecta.
2. Forkeá, branch `fix/<modelo>-<descripcion>` o `refactor/<modelo>-<descripcion>`.
3. PR hacia `main`.

Importante: las mejoras son del código generado, no del prompt. La gracia del benchmark es comparar lo que cada modelo produjo originalmente. Si el cambio altera lo que el modelo "decidió", anotalo en el PR para discutirlo antes del merge.

## Reglas que aplican a todo PR

- **No tocar el `.ai/` canónico** de la raíz. Solo se modifican subcarpetas.
- **No tocar carpetas de otros modelos** en un PR de un modelo nuevo.
- **Commits en español** con [Conventional Commits](https://www.conventionalcommits.org/es/v1.0.0/) (`feat:`, `fix:`, `refactor:`, `docs:`, `chore:`).
- **Stack fijo:** SvelteKit + Svelte 5 runes + Tailwind v4. No proponer cambios de stack en PRs de implementación.
- **Anti-patterns:** los enumerados en `.ai/constitution.md` son condición de aprobación.

## Setup local

```bash
git clone https://github.com/<tu-usuario>/presupuestos
cd presupuestos/<modelo>
pnpm install
pnpm dev               # http://localhost:5173
```

Cada subcarpeta es un proyecto SvelteKit independiente. No comparten `node_modules`.

## Dudas

Abrí un issue con el label `question` y conversamos ahí.
