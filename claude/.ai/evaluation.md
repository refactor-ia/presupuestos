# Evaluación común — Benchmark v4 (BORRADOR)

La evaluación compara resultados terminados, no volumen de código, cantidad de archivos, número de tests ni funcionalidades no solicitadas.

## Puertas obligatorias

Antes de asignar un total, registrar cada puerta como **cumple**, **no cumple** o **no evaluable**.

| ID | Puerta |
|---|---|
| G-01 | App estática SvelteKit/Svelte 5, TypeScript estricto, Tailwind 4, jsPDF en navegador y Vitest dentro de la línea base congelada. |
| G-02 | Sin backend, cuentas, persistencia de navegador, telemetría, red de terceros, CDN o fuente remota en runtime. |
| G-03 | Estado efímero, tema oscuro inicial, toggle funcional y sin guardar preferencia de tema. |
| G-04 | Trece escenarios `SC-01` a `SC-13` conformes, incluidos strings, IVA, filename, información del PDF y separador de miles. |
| G-05 | Cálculo exacto en centavos; IVA 22% sobre subtotal agregado con half-up una vez. |
| G-06 | PDF local, paginado cuando haga falta, con identificación, cliente, ítems, totales y pie por página. |
| G-07 | Matriz de QA pre-entrega (T-01 a T-06 de la constitución) en verde, con los flujos críticos verificados contra la URL real de evaluación y URL/build declaradas. |

Un “no cumple” bloquea el agregado y se informa con el ID y evidencia. Un “no evaluable” no equivale a cumplimiento: el agregado queda incompleto hasta obtener la prueba independiente necesaria.

## Rúbrica anclada (100 puntos)

| Dimensión | Peso | 0 puntos | Mitad del peso | Peso completo |
|---|---:|---|---|---|
| Funcionalidad y dinero | 30 | Flujos principales fallan o los importes son incorrectos. | Flujos básicos funcionan con errores en bordes o consistencia. | Escenarios, gramática, centavos, IVA y restricciones se cumplen de forma consistente. |
| UX y accesibilidad | 20 | Flujo confuso, errores inaccesibles o teclado inutilizable. | Flujo usable con carencias en estados, foco o móvil. | Jerarquía clara, validación asociada, teclado, foco y estados recuperables, y una sensación de recompensa perceptible en las interacciones núcleo. |
| Coherencia visual | 20 | Jerarquía, contraste o adaptación dañan la lectura. | Presentación consistente pero con problemas visibles de densidad, alineación o tema. | Interfaz sobria, legible y consistente entre escritorio, móvil, temas y contenido largo; la calidad visual observada incluye el documento exportado. |
| Usabilidad del PDF | 15 | Documento incompleto, ilegible o no descargable. | Contiene lo esencial con defectos de composición o páginas largas. | Documento legible, consistente con UI, paginado y utilizable para enviar al cliente. |
| Mantenibilidad técnica | 10 | Lógica frágil, insegura o fuera del entorno común. | Estructura razonable con deuda visible o validación limitada. | Decisiones justificadas, límites claros, código mantenible y pruebas relevantes. |
| Evidencia de verificación | 5 | No hay resultados reproducibles. | Hay comandos o revisiones parciales sin cubrir los riesgos principales. | Informe conciso con comandos, resultados, escenarios, vistas/PDF y límites explícitos. |

Para cada dimensión se asigna un valor entre 0 y su peso, con una observación basada en evidencia. El puntaje bruto es la suma de los seis valores: **30 + 20 + 20 + 15 + 10 + 5 = 100**. Solo se publica un puntaje agregado cuando todas las puertas cumplen y todas las dimensiones fueron evaluadas. En cualquier otro caso, publicar dimensiones observadas y el estado **sin agregado / evaluación incompleta**.

## Datos conocidos y comprobaciones

| Caso | Expectativa verificable |
|---|---|
| IVA canónico | `3 × 10,55` y `1 × 7,77` producen subtotal `$ 39,42`, IVA `$ 8,67` y total `$ 48,09`. |
| Formato | `1234,5` se presenta exactamente como `$ 1234,50`; `6100000,00` como `$ 6.100.000,00` (separador de miles). |
| Caso PDF breve | `Cliente Demo`, `Diseño web`, 2 × 50,00: filename y valores 100,00 / 22,00 / 122,00. |
| Validación | Nombre vacío, email `no-es-email`, cantidades 0/1.5/-3, precios -10/0/`1.234`/`12,5a` y descripción vacía bloquean el flujo correspondiente. `12,50` es válido. |
| Vistas | Las cuatro capturas definidas en `design.md` muestran escritorio, móvil, tema claro y PDF largo. |
| PDF largo | No hay solapamientos; hay pie por página y encabezado de tabla repetido en continuaciones. |

Las pruebas automatizadas verifican reglas y regresiones, pero no prueban por sí solas contraste, composición, teclado, descarga ni legibilidad de PDF. Las comprobaciones visuales y de documento requieren revisión independiente cuando estén disponibles.

## Procedimiento de evaluación

1. Confirmar la línea base recibida y clasificar las seis puertas antes de puntuar.
2. Repetir los datos conocidos y revisar la matriz de escenarios contra los IDs de la spec.
3. Revisar las capturas en sus tamaños declarados y usar teclado para el flujo de validación si el entorno está disponible.
4. Abrir los PDF breve y largo para comprobar contenido, orden, paginación y legibilidad; no inferirlo desde el código.
5. Exigir la matriz de QA T-01 a T-06 con URL y build declaradas; sin ella, la entrega queda incompleta y G-07 no cumple.
6. Puntuar cada dimensión con una nota concreta y marcar no evaluable cuando falte evidencia independiente.
7. Sumar solo si no hay puerta fallida ni dimensión sin evaluar; de otro modo entregar hallazgos sin agregado.

La comparación aplica los mismos datos, tamaños de viewport y criterio a cada resultado. Las diferencias de gusto y estilo entre participantes son datos del benchmark, no defectos: se evalúa nivel de calidad, no conformidad con una receta. Una preferencia estética del evaluador no sustituye una observación del brief ni crea requisitos nuevos.

## Informe de evidencia acotado

Cada participante entrega como máximo:

- Línea base y lockfile usados, o declaración de que la línea base no estaba congelada.
- Hasta cinco comandos ejecutados con resultado literal resumido.
- Matriz `SC-01` a `SC-12`: aprobado, fallido o no ejecutado, con una nota breve.
- Las cuatro capturas o una explicación de por qué no pudieron obtenerse.
- Un PDF breve y uno largo, o una declaración de no disponibilidad.
- Riesgos, fallos conocidos y verificaciones no ejecutadas.

El evaluador usa el mismo conjunto de datos y estados para cada modelo. No atribuye causas al rendimiento de un modelo cuando no hay evidencia observada.
