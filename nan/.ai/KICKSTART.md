# Benchmark de app de presupuestos — v4 (BORRADOR)

Este directorio define el input canónico propuesto para comparar implementaciones de una misma app de presupuestos. No es un benchmark liberado ni una instrucción para modificar las copias de modelos.

## Estado y alcance

- **Estado:** BORRADOR v4, pendiente de revisión y congelamiento del entorno.
- **Fuente de verdad propuesta:** estos seis documentos bajo `.ai/`.
- **Precedencia:** spec conductual → constitution técnica → design → plan → evaluation. Este archivo solo orienta; no reemplaza requisitos.
- Las copias v1 de modelos y los documentos raíz pueden contradecir este borrador. No deben tratarse como una versión v3 publicada ni propagarse hasta una aprobación posterior.

## Ruta para el participante

1. Lea `.ai/specs/app-presupuestos.yaml` para requisitos y escenarios identificados.
2. Lea `.ai/constitution.md` para límites compartidos de entorno, seguridad y calidad.
3. Lea `.ai/design.md` para el resultado de producto y los estados a resolver.
4. Use `.ai/plans/app-presupuestos.yaml` como secuencia verificable, sin copiar una arquitectura predeterminada.
5. Prepare la evidencia indicada en `.ai/evaluation.md` y declare con honestidad cualquier prueba no ejecutada.

El participante entrega una app estática funcional, su código, pruebas que haya ejecutado y un informe de evidencia acotado. Puede elegir arquitectura, composición, nombres, componentes y detalles visuales dentro de los contratos comunes.

## Ruta para mantenimiento antes de liberar

1. Aprobar o corregir este borrador canónico.
2. Fijar una sola línea base reproducible: versiones exactas de herramientas y dependencias, lockfile y procedimiento de instalación común.
3. Registrar que esa línea base fue verificada; hoy este paso está **NO COMPLETADO** porque el repositorio no aporta manifests ni pins verificables.
4. Propagar los documentos aprobados a las copias de modelos y al material raíz en una revisión separada.
5. Ejecutar las evaluaciones independientes previstas y publicar solo evidencia observada.

No se deben usar rangos como “última versión”, hashes inventados ni instalaciones diferentes por modelo. Las dependencias y herramientas deben estar instaladas desde la misma línea base antes de cada ejecución participante.

## Registro de cambios propuestos v1 → v2

| Cambio propuesto | Motivo de comparabilidad |
|---|---|
| Se reemplaza el árbol de archivos, APIs y código de referencia por contratos observables. | Permite decisiones técnicas genuinas sin cambiar el reto. |
| Precios de hasta dos decimales y cantidades enteras se convierten a unidades de centavos para calcular. | Cierra la ambigüedad de punto flotante y redondeo. |
| Se agregan límites de entrada y reglas para contenido largo. | Hace verificables los bordes y el PDF paginado. |
| El PDF pasa de asumir una página a requerir paginación legible. | Evita fallas con presupuestos extensos. |
| El tema permanece oscuro por defecto, pero no se exige una biblioteca ni persistencia de preferencia. | Respeta estado efímero y libertad de implementación. |
| Se define progreso, error y reintento de exportación. | Evalúa una interacción real, no solo el caso ideal. |
| Se separan puertas obligatorias, puntaje y evidencia no disponible. | Evita puntuar como aprobado lo que no se comprobó. |

## Registro de cambios propuestos v2 → v3

| Cambio propuesto | Motivo de comparabilidad |
|---|---|
| Se define una calidad mínima de interacción: recompensa perceptible, jerarquía de foco, validación que no moleste ni rompa la composición. | Codifica como resultado observable el nivel que una corrida previa solo alcanzó tras varias rondas de corrección, sin prescribir implementación. |
| Se establecen invariantes de composición estable y su verificación perceptual con medición en navegador. | Los defectos de alineación son los más difíciles de detectar en revisión estática y los más visibles para el usuario. |
| El PDF pasa de requerir solo contenido y paginación a requerir documento diseñado. | Un documento de texto plano cumple los datos pero no representa al producto; la estética específica queda libre. |
| La rúbrica incorpora recompensa percibida (UX) y el documento exportado (coherencia visual). | Evalúa nivel de calidad sin conformidad con una receta: las diferencias de gusto entre participantes son datos del benchmark. |

## Registro de cambios propuestos v3 → v4

| Cambio propuesto | Motivo de comparabilidad |
|---|---|
| El formato monetario adopta separador de miles y coma decimal ('$ 1.234,50'), locale es unificado. | Los montos reales del dominio eran ilegibles sin separador; el formato v3 (punto decimal, sin miles) era anglosajón y ambiguo en valores grandes. |
| Se agrega SC-13 (monto grande legible) y se actualizan los casos canónicos. | El chequeo de formato sigue siendo de string exacto, contra el nuevo patrón, en UI y PDF. |
| Se fijan invariantes medibles de entrega (INV-01 a INV-12) y una matriz de feedback obligatorio por interacción. | La calidad de interacción deja de ser adjetivo: se mide en navegador y su incumplimiento es defecto, sin recetas de estilo. |
| Se agrega el gate de QA pre-entrega (G-07) con matriz T-01 a T-06 y flujos críticos por nombre. | En la corrida de entrenamiento, flujos críticos (agregar ítem, generar PDF) llegaron rotos: ningún gate obligaba a cruzar tipos de prueba. |
| Se exige verificación contra la URL real de evaluación, incluida la variante HTTP no segura. | APIs solo-secure-context sin fallback rompieron un flujo crítico solo en la URL por la que el evaluador entra. |
| Reglas estructurales: componentes, mapa de mensajes por código, dominio puro, fuente única de iconos/tokens. | Empujan ingeniería de entrega sin prescribir estética. |
| El informe declara URL y build de cada verificación. | Rastreabilidad de la evidencia. |
| El informe del participante incluye decisiones de estilo y motion. | Permite comparar qué decidió cada modelo, no solo el resultado. |

## Límites del reto

No agregar cuentas, backend, persistencia, colaboración, paneles, edición de presupuestos previos, múltiples monedas o impuestos, IA, envío de email ni exportaciones distintas de PDF. Un identificador `PRES-` de seis dígitos es aleatorio por sesión; no se exige ni se prueba unicidad entre recargas.

## Lista de liberación del borrador

- [ ] La revisión aprobó los seis documentos como una única entrada canónica.
- [ ] Se registraron versiones exactas de Node, pnpm, framework y dependencias.
- [ ] Un lockfile común fue generado y verificado sin cambios posteriores por modelo.
- [ ] La instalación común se ejecutó antes de cualquier participante.
- [ ] Se aclaró si habrá herramienta común de prueba de interfaz y quedó incluida en la línea base.
- [ ] Se actualizaron las copias de modelos y documentos raíz solo después de la aprobación.
- [ ] La evaluación independiente conserva pruebas no disponibles como incompletas.

## Informe final honesto

El informe debe indicar: línea base usada, comandos y resultado, escenarios cubiertos, capturas/PDF revisados, limitaciones y pruebas no ejecutadas. “No ejecutado” o “no disponible” son resultados válidos; no deben reemplazarse por afirmaciones de éxito.
