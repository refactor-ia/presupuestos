# Contribuir al benchmark

Hay dos formas de aportar: **sumar un modelo nuevo** o **mejorar uno que ya está**. El flujo cambia bastante entre uno y otro, así que están separados.

## Sumar un modelo nuevo

Es la contribución principal: meter un LLM que todavía no está en el benchmark.

1. **Abrí un issue primero** con el template "Nuevo modelo". Sirve para reservar el modelo y evitar que dos personas trabajen en paralelo sobre lo mismo.
2. **Forkeá el repo** y creá una branch: `feat/<modelo>` (ej: `feat/gemini`).
3. **Creá la carpeta** del modelo en la raíz: `mi-modelo/`.
4. **Copiá el `.ai/` canónico** adentro:
   ```bash
   cp -r .ai mi-modelo/
   ```
5. **No toques los archivos canónicos del `.ai/` raíz.** Esa es la verdad compartida del benchmark. Si la modificás, el resto de las implementaciones dejan de ser comparables.
6. **Pasale al modelo el `KICKSTART.md`, la constitución, el spec y el plan.** Que implemente la app en `mi-modelo/` sin ver el resto del repo. La idea es que cada modelo trabaje aislado, igual que los siete que ya están.
7. **Verificá** que la app levante con `pnpm install && pnpm dev` y que respete los anti-patterns de la constitución.
8. **Abrí el PR** desde tu fork hacia `main`.

## Mejorar una implementación existente

Si encontrás un bug o algo que se puede pulir en una de las carpetas ya publicadas:

1. Abrí un issue con el template "Bug" describiendo el problema y a qué modelo afecta.
2. Forkeá, branch `fix/<modelo>-<descripcion>` o `refactor/<modelo>-<descripcion>`.
3. PR hacia `main`.

Ojo con un matiz: las mejoras son del código generado, no del prompt. La gracia del benchmark es ver lo que cada modelo decidió originalmente, así que si tu cambio altera una decisión de diseño del modelo (no un bug claro), anotalo en la descripción del PR para discutirlo antes del merge.

## Reglas que aplican a cualquier PR

- **No tocar el `.ai/` canónico** de la raíz. Solo se modifican subcarpetas.
- **No tocar carpetas de otros modelos** en un PR de un modelo nuevo. Un PR, un modelo.
- **Commits en español** con [Conventional Commits](https://www.conventionalcommits.org/es/v1.0.0/): `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`.
- **Stack fijo:** SvelteKit + Svelte 5 runes + Tailwind v4. No proponer cambios de stack en PRs de implementación.
- **Anti-patterns:** los enumerados en `.ai/constitution.md` son condición de aprobación. No son sugerencias.

## Setup local

```bash
git clone https://github.com/<tu-usuario>/presupuestos
cd presupuestos/<modelo>
pnpm install
pnpm dev               # http://localhost:5173
```

Cada subcarpeta es un proyecto SvelteKit independiente. No comparten `node_modules`, así que vas a instalar una vez por carpeta que toques.

## Dudas

Abrí un issue con label `question` y conversamos ahí.
