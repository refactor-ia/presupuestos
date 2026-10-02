# Brief de producto y diseño — Benchmark v4 (BORRADOR)

La app ayuda a un profesional a preparar y enviar un presupuesto claro a un cliente. Debe sentirse como una herramienta de trabajo tranquila y contemporánea, no como una landing page ni un dashboard de marketing.

## Objetivo observable

La persona debe poder identificar el número del presupuesto, completar cliente e ítems, comprobar los importes y exportar sin recorrer una interfaz ambigua. La información financiera y el documento final tienen prioridad sobre elementos decorativos.

## Dirección visual compartida

| Aspecto | Resultado esperado |
|---|---|
| Jerarquía | Número, cliente, ítems, totales y acción de exportar se reconocen en ese orden. |
| Lectura | Bloques con títulos claros, agrupación consistente y espacio suficiente para revisar datos. |
| Tipografía | Texto de formulario legible; importes y cantidades distinguibles, alineados para comparación. |
| Contraste | Texto, borde, foco, error y acción principal se distinguen en ambos temas. |
| Densidad | Una pantalla de trabajo concentrada, sin módulos promocionales ni métricas ajenas. |
| Documento | La tabla y los totales se leen como un presupuesto profesional, en UI y PDF. |

La paleta, escala tipográfica, iconografía, radios, sombras, distribución exacta y componentes son libres. La calidad se observa en jerarquía, legibilidad, consistencia entre estados y ausencia de conflictos de alineación o contraste, no en adjetivos como “premium”.

## Composición y respuesta

En escritorio, la información debe permitir revisar formulario, ítems y totales sin que los valores monetarios compitan con la acción principal. En móvil, el orden puede apilarse, pero los controles deben conservar etiquetas, objetivos táctiles razonables, lectura de tabla o alternativa equivalente y acceso a los totales sin pérdida de contexto.

Los números de cantidad, precio, subtotales y total se alinean de modo consistente, preferentemente al borde de su columna. Las descripciones largas no deben ocultar cantidades ni importes: pueden envolver, truncarse con una forma accesible de consultar el texto o reorganizarse de forma legible.

## Estados obligatorios

| Estado | Comportamiento visible |
|---|---|
| Inicial vacío | Número `PRES-XXXXXX`, totales `$ 0.00`, exportación deshabilitada y tooltip exacto cuando no hay ítems. |
| Campo inválido | Mensaje claro junto al campo, asociación accesible y foco visible al navegar con teclado. |
| Presupuesto válido | Ítems y totales legibles; exportación disponible. |
| Exportando | Progreso o estado de espera inequívoco; no se disparan dos descargas por clics repetidos. |
| Éxito | Confirmación visible de la descarga iniciada, sin afirmar que el sistema operativo guardó el archivo. |
| Error de PDF | Explicación recuperable, conservación de los datos en la sesión y acción de reintento. |
| Contenido extenso | UI navegable y PDF paginado sin texto superpuesto ni totales aislados sin contexto. |
| Tema | Tema oscuro inicial y toggle dark/light sin persistir preferencia entre recargas. |

## Accesibilidad

- Use etiquetas de texto para todos los campos y un nombre accesible para acciones e iconos.
- Mantenga un orden de tabulación lógico; Enter, Escape u otros atajos solo se agregan si no interfieren con el formulario.
- No comunique errores, foco, estado de exportación o tema solo por color.
- Preserve contraste suficiente, foco perceptible y mensajes que puedan ser anunciados por tecnología asistiva.
- Los controles deshabilitados deben explicar la condición cuando la spec lo exige.

## Coherencia con el PDF

El PDF es una extensión del mismo presupuesto: debe priorizar identificación, fecha, datos del cliente, detalle, totales y paginación. Puede tener un estilo propio sobrio, pero no debe cambiar valores, etiquetas requeridas ni orden conceptual. El contenido opcional vacío puede omitirse sin dejar rótulos vacíos.

## Capturas de comparación propuestas

Estas capturas son una evidencia acotada para evaluación, no mockups ni una prescripción de componentes:

1. **1280 × 800, oscuro, válido:** cliente `Cliente Demo`; ítems `Diseño web` 2 × 50.00 y `A` 3 × 10.55, con totales visibles.
2. **375 × 812, oscuro, inválido:** cliente vacío, intento de cantidad `1.5` y botón de PDF sin ítems.
3. **1280 × 800, claro, válido:** mismos datos del primer caso después de usar el toggle.
4. **PDF de contenido largo:** al menos 25 ítems, una descripción de 120 caracteres y páginas múltiples si el contenido lo requiere.

Si un entorno no permite capturas o apertura de PDF, se reporta esa ausencia. No se fabrican imágenes ni se infiere calidad visual desde pruebas unitarias.

## Calidad de interacción

Los estados obligatorios definen *qué* debe pasar; esta sección define el *nivel* mínimo de percepción. La implementación es enteramente libre: componentes, técnicas, timing y estilo visual son decisiones del participante y parte de lo que se evalúa.

- **Recompensa:** cada acción del usuario debe producir feedback perceptible y satisfactorio. Si el usuario no nota que algo pasó, no cumple. La forma (duraciones, easings, efectos) es libre.
- **Jerarquía de foco:** cada momento tiene un solo protagonista visual. El Total es el punto de mayor énfasis de la interfaz.
- **No molestar:** la validación castiga la acción, no la exploración. Un formulario vacío no es un error; el error aparece cuando el usuario intenta algo. Los mensajes de error no pueden romper la composición.
- **Accesibilidad como piso:** foco visible, mensajes anunciables por tecnología asistiva, respeto por la preferencia de movimiento reducido del sistema.

**Composición estable (invariantes, no estilo):**

- La composición es un contrato: aparecer o desaparecer contenido no puede desplazar elementos que el usuario ya ubicó. En particular, mostrar el mensaje de error de un campo no puede mover los campos vecinos, ni en escritorio ni en móvil.
- En listas/tablas, los controles de fila quedan alineados con el texto de su fila: si el texto tiene varias líneas, el control se alinea con la primera. El desalineado visible es un defecto aunque la celda esté "técnicamente centrada".
- El criterio es perceptual, no estructural: se verifica con medición en navegador (deltas de posición ≤ 2px entre estados con y sin error; control alineado con la línea de texto, no con la celda). Un bounding box que da 0px no cumple si el ojo ve desalineado.

## Invariantes medibles de entrega (obligatorias)

La calidad de interacción no se evalúa por gusto: estas invariantes se miden en navegador
(contra la URL real de evaluación) y su incumplimiento es defecto. La forma de cumplirlas es libre.

| ID | Invariante | Medición |
|---|---|---|
| INV-01 | Sin desbordamiento de página en móvil | `documentElement.scrollWidth ≤ clientWidth` en 375×812, con 1 ítem largo y con 25 ítems |
| INV-02 | Contraste suficiente | ≥ 4.5:1 texto normal, ≥ 3:1 texto grande, en ambos temas (errores, labels, foco incluidos) |
| INV-03 | Un solo indicador de foco | Con foco por teclado: si el contenedor del campo dibuja anillo de foco, el input interno no agrega outline propio; botones y links conservan su outline |
| INV-04 | Targets táctiles ≥ 44×44 px | Bounding box de controles interactivos a 375px |
| INV-05 | Overlay transitorio no bloquea | Tras mostrar el overlay, `elementFromPoint` sobre cada control principal resuelve al control |
| INV-06 | Estado de espera visible | Al exportar, el indicador de progreso se observa ≥ 300ms (muestreo por rAF in-page) |
| INV-07 | Continuidad de foco | Tras agregar/eliminar un ítem, `document.activeElement` es un campo utilizable |
| INV-08 | Éxito con expiración | El mensaje de éxito desaparece solo en ≤ 10s y no persiste tras cambiar datos |
| INV-09 | Doble clic accidental = una descarga | Dos clics con < 150ms de separación generan exactamente 1 descarga |
| INV-10 | Reintentar siempre efectivo | Tras un fallo, el reintento inmediato dispara la acción |
| INV-11 | PDF extrae limpio | `pdftotext` sin mojibake; cada string del contrato aparece literal |
| INV-12 | URL real | La suite e2e corre contra la URL del evaluador (incluida variante HTTP no segura); APIs solo-secure-context requieren fallback |

### Matriz de feedback obligatorio (reemplaza al adjetivo 'recompensa perceptible')

Cada interacción debe producir feedback perceptible. Se evalúa que exista y se perciba (INV-06 e
INV-07 son el piso medible); duraciones, easings y estilo son datos del benchmark, no requisitos.

| Interacción | Feedback exigible (cualquiera de estas formas, no receta) |
|---|---|
| Agregar ítem | confirmación visible en fila o botón + entrada animada de la fila |
| Eliminar ítem | salida animada + reacomodo perceptible |
| Cambio de totales | el valor nuevo se destaca de forma perceptible |
| Cambio de tema | transición global perceptible, no corte seco |
| Exportar | progreso visible durante la espera + confirmación de resultado |
| Error de campo | mensaje asociado + foco utilizable + sin desplazamiento de vecinos |
| Éxito/error de export | estado visible con expiración o cierre |

## Señales de revisión observables

Al revisar una entrega, comprobar sin imponer una maqueta concreta:

- El número de presupuesto se descubre antes de completar datos secundarios.
- Los campos obligatorios y sus errores se distinguen sin depender solo del color.
- La lista de ítems mantiene columnas o relaciones de lectura comprensibles en móvil.
- Los importes comparten alineación y no cambian de formato entre bloques.
- Totales y exportación se identifican sin buscar entre contenido ajeno al presupuesto.
- El tema claro no pierde contraste ni parece una pantalla distinta de producto.
- El tema oscuro inicial no vuelve ilegible el foco, los errores o los valores secundarios.
- Una fila extensa mantiene disponibles su cantidad, precio y subtotal.
- La exportación comunica espera, resultado o recuperación sin ocultar los datos ingresados.
- El PDF conserva una lectura de documento aunque ocupe más de una página.
