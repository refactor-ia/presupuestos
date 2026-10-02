---
name: "bench-evaluator"
description: "Calibrate and score LLM benchmark deliveries. Trigger: evaluating a model delivery in a bench repo, calibrating against a gold reference, scoring the rubric, auditing delivery evidence, running the QA gate matrix (T-01..T-06), deciding G-gates, or comparing two bench implementations. Use when asked to 'evaluate a delivery', 'score the bench', 'calibrate the evaluator', or 'run the gate matrix'."
license: "CC-BY-SA-4.0"
---

# Bench Evaluator — calibración y puntuación de entregas

Procedimiento formal para el rol de **evaluador** en benchmarks de comparación de
modelos/proveedores (estilo "one app, one spec, many models"). Funciona para cualquier
participante; el ejemplo concreto de este benchmark es `presupuestos` (canon en `.ai/`,
contrato v4), pero las reglas son genéricas.

## Principios inviolables

1. **Neutralidad de sesgo**: nada específico de un participante vive en el raíz del repo.
   Las referencias de oro (`gold artifacts`) se guardan **fuera del repo**, convención:
   `<bench-artifacts-dir>/<modelo>-v<versión>-gold/` (ej: `~/dev/bench-artifacts/nan-v4-gold/`).
   Los participantes solo reciben los insumos canónicos; nunca deben poder alcanzar el oro
   ni la evidencia de otros participantes.
2. **Prescribir el piso de calidad y su medición; nunca estética.** "Fondo verde" = mal.
   "Cero targets < 44px" = bien. Las preferencias del evaluador no sustituyen una observación
   del brief y no crean requisitos nuevos.
3. **Evidencia o no existe.** Nada se puntúa como aprobado sin salida literal, captura o
   medición. "No ejecutado" es un estado válido y se publica como incompleto.
4. **Un solo rojo bloquea.** Las puertas y la matriz QA son binarias: verde / rojo /
   no evaluable. Un rojo en cualquier puerta o tipo de prueba bloquea el agregado del puntaje.

## Flujo de evaluación (en orden)

### 1. Pre-vuelo

- Identificar el canon vigente (`.ai/` del repo) y su versión. No evaluar contra una versión
  distinta a la declarada en la entrega.
- Leer `constitution.md` (gates, matriz T), `evaluation.md` (rúbrica, checks conocidos),
  `design.md` (invariantes INV, matriz de feedback), `plans/` (flujos críticos y reporte exigido).
- Confirmar URL(s) de evaluación: la real que usará el comparador **incluida la variante HTTP
  no segura si aplica** (IP de LAN, no solo localhost). Esta regla existe porque APIs
  solo-secure-context (ej: `crypto.randomUUID`) se rompen solo en la URL del evaluador.
- Si existe oro para la versión (`<bench-artifacts-dir>/...-gold/`), usarlo **solo para
  calibrar** el propio juicio (contrastar observaciones), nunca como respuesta correcta para
  diff. La rúbrica está anclada a observables, no a una solución.

### 2. Puertas (G-01..G-0N)

Clasificar cada puerta: `cumple` / `no cumple` / `no evaluable`. Un `no evaluable` no equivale
a cumple: el agregado queda incompleto hasta tener la prueba independiente. Registrar ID + evidencia.

### 3. Matriz de QA del participante (T-01..T-06)

La entrega debe incluir su propia matriz (unitarias de dominio, e2e de flujos críticos contra la
URL real, accesibilidad, exploratorio, adversarial, revisión de entrega). Auditarla:

- Repetir un muestreo independiente de cada tipo (no fiarse del informe del participante).
- Verificar que los **flujos críticos** del plan aparezcan con evidencia literal y por nombre
  (no agrupados en "funciona").
- Verificar que el informe declare URL y build de cada verificación.
- Si el participante no documentó ningún bug encontrado y corregido, sospechar que no buscó.

### 4. Verificación medible en navegador (INV / invariantes)

Ejecutar las mediciones del contrato (ej: INV-01..INV-12) con scripts, no con el ojo:
desbordamiento (`scrollWidth ≤ clientWidth`), contraste (≥4.5:1 normal, ≥3:1 grande — ojo:
`getComputedStyle` devuelve `oklch` en Chrome moderno; usar un parser correcto, no regex RGB),
targets táctiles ≥44px, un solo indicador de foco, overlay que no bloquea, estado de espera
visible (muestreo por rAF in-page: el polling por CDP de Playwright pierde ventanas de <500ms),
foco continuo, expiración de éxito, doble clic = 1 descarga, PDF extrae limpio por `pdftotext`.
Los dos flujos críticos más traicioneros del dominio presupuesto: **cargar una línea de ítem** y
**generar el PDF** — probarlos primero, siempre.

### 5. Casos conocidos y escenarios

Repetir los datos canónicos del contrato (strings exactos, aritmética, filename, fechas).
Abrir los PDF reales (no inferir desde el código). Recorrer los escenarios SC por ID.

### 6. Rúbrica

Puntuar cada dimensión con valor + observación basada en evidencia. Diferencias de gusto entre
participantes son **datos del benchmark**, no defectos. Sumar solo si todas las puertas cumplen
y todas las dimensiones están evaluadas; de otro modo publicar dimensiones observadas + estado
`sin agregado / evaluación incompleta`.

### 7. Informe del evaluador

Estructura mínima: puertas, matriz T audicionada, hallazgos con severidad y evidencia, puntaje
por dimensión (o estado incompleto), y **declaración de lo no verificado**. El informe del
evaluador está sujeto a las mismas reglas de honestidad que el del participante.

## Anti-patrones del evaluador

- Atribuir causas al modelo sin evidencia observada.
- Usar los mismos datos/tamaños distintos por participante.
- Puntuar estética con adjetivos ("premium") en lugar de observables ("composición estable,
  delta 0px").
- Dejar que el oro contamine: nunca difundirlo, nunca referenciarlo desde el canon.
- Aceptar "funciona" como evidencia de un flujo crítico.

## Convención de repositorio

```
<repo-del-bench>/            ← raíz agnóstica: .ai/ canon + dirs de participantes. Sin gold.
~/<bench-artifacts-dir>/     ← fuera del repo: <modelo>-v<n>-gold/ (app, evidencia, informes)
```

El script de reset del repo (si existe) solo toca los directorios de participantes; verificar
que la carpeta de artefactos esté fuera de su alcance antes de correrlo.
