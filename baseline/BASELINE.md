# Línea base común — Benchmark app de presupuestos

Estado: **VERIFICADA** — build, tests y type-check en verde contra esta línea exacta.

## Herramientas

| Herramienta | Versión |
|---|---|
| Node | v24.18.0 |
| pnpm | 11.21.0 (vía corepack) |

## Dependencias (versiones exactas, sin rangos)

| Paquete | Versión |
|---|---|
| jspdf | 4.2.1 |
| @sveltejs/adapter-static | 3.0.10 |
| @sveltejs/kit | 2.70.3 |
| @sveltejs/vite-plugin-svelte | 7.3.0 |
| @tailwindcss/vite | 4.3.3 |
| svelte | 5.57.0 |
| svelte-check | 4.7.6 |
| tailwindcss | 4.3.3 |
| typescript | 6.0.3 |
| vite | 8.3.0 |
| vitest | 5.0.0 |

Notas de elección:
- TypeScript 7.0.2 existe pero NO entra en el rango de peers de `@sveltejs/kit` (`^5.3.3 || ^6.0.0`) ni de `svelte-check`; se fija el último 6.x.
- `core-js` (transitiva de jspdf vía canvg) tiene su build script deshabilitado explícitamente en `pnpm-workspace.yaml` (`allowBuilds: core-js: false`): su postinstall es un banner sin efecto funcional.
- Política de supply chain activa en el entorno: `min-release-age=7` (npmrc global); el lockfile pasa esa política.

## Procedimiento de instalación común

1. Copiar `package.json`, `pnpm-workspace.yaml` y `pnpm-lock.yaml` de este directorio al directorio del participante.
2. Ejecutar `pnpm install --frozen-lockfile`.
3. No se admite deriva por modelo: ninguna dependencia adicional fuera de esta línea. Una adición requiere enmienda de esta línea base por mantenimiento.

## Verificación de la línea

Comandos ejecutados contra esta línea (directorio nan/, 2026-09-12, build de producción):

| Comando | Resultado |
|---|---|
| `pnpm install --frozen-lockfile` | exit 0 |
| `pnpm build` | exit 0 — adapter-static escribió `build/` |
| `pnpm test` (vitest) | exit 0 — 1/1 smoke |
| `pnpm check` (svelte-check) | exit 0 — 0 errores, 0 warnings |

Cualquier corrida participante debe reportar la línea usada y re-ejecutar estas verificaciones; un cambio de resultados sin cambio de línea es hallazgo.
