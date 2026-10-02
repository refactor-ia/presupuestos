# Constitution técnica — Benchmark v4 (BORRADOR)

Estas reglas comparan implementaciones bajo un entorno común sin imponer una arquitectura, árbol de componentes ni firmas de funciones.

## Entorno común

| Área | Regla |
|---|---|
| Framework | SvelteKit con Svelte 5 y sintaxis actual de runes cuando corresponda. |
| Lenguaje | TypeScript con comprobación estricta. |
| Estilos | Tailwind CSS 4; tokens y composición visual quedan a criterio participante. |
| Salida | Frontend estático, sin backend de aplicación. |
| PDF | jsPDF generado íntegramente en el navegador. |
| Pruebas | Vitest para reglas de dominio y validación. |
| Dependencias | Una línea base exacta, lockfile y herramientas congeladas para todos los modelos. |

La línea base exacta es un requisito de liberación, pero está **NO COMPLETADA** en este borrador: no hay manifests ni versiones verificables en el repositorio. Mantenimiento debe fijarla e instalarla una vez antes de iniciar corridas. Una dependencia adicional solo es admisible si está justificada, incorporada a esa línea base y disponible para todas las corridas; no se admite deriva por modelo. Una herramienta común de prueba de interfaz puede proponerse bajo la misma política.

## Libertad de implementación

Se permite elegir organización de archivos, estado local o compartido, componentes, utilidades, estrategia de validación, biblioteca de componentes y mecanismo de tema, siempre que se cumplan los requisitos conductuales, la línea base y estas restricciones. No se exige una biblioteca de tema, un observador de modo, una estructura global de estado, ni usar todas las runes. Use `$state`, `$derived`, `$props` y `$effect` solo cuando el problema lo justifique; evite APIs reactivas legadas de Svelte 4.

El formato de moneda debe producir exactamente el contrato de la spec (punto como separador de miles, coma como separador decimal). La elección de API de presentación es libre únicamente si conserva ese resultado para todos los valores válidos; la semántica aritmética no depende de una API de formato.

## Límites de seguridad y privacidad

- No hay backend, cuentas, cookies, `localStorage`, `sessionStorage`, IndexedDB ni otra persistencia de navegador, incluida la preferencia de tema.
- No hay llamadas de datos a terceros, telemetría, analítica, CDNs, fuentes remotas ni compartición de datos de presupuesto en tiempo de ejecución.
- Servir los propios activos estáticos de la aplicación sí está permitido.
- El PDF se genera y descarga localmente; los datos no salen del navegador.
- No usar `eval` ni insertar entrada de usuario como HTML sin tratar. La salida debe escapar o tratar de forma segura el texto introducido.

## Calidad de dominio

- La spec define la gramática de entradas, límites, importes en centavos y redondeo; toda UI y todo PDF deben derivar de ese mismo resultado.
- No utilizar aritmética de punto flotante como fuente de verdad monetaria. Las representaciones de presentación pueden convertir desde centavos sin cambiar el valor.
- La tasa es IVA 22% sobre el subtotal agregado, con redondeo half-up una sola vez para el impuesto.
- Los mensajes y strings declarados como exactos en la spec se preservan literalmente.
- El identificador debe coincidir con `PRES-` seguido de seis dígitos. La aleatoriedad no garantiza unicidad entre sesiones y ninguna prueba debe depender de ella.

## Calidad de interfaz y PDF

- La app debe ser operable con teclado, etiquetas accesibles, foco visible y mensajes de validación asociados al campo.
- Debe resolver estados vacío, inválido, carga, éxito, error recuperable y contenido largo según el brief de diseño.
- La exportación debe mostrar avance mientras se prepara, impedir duplicados accidentales y permitir reintentar después de un error.
- El PDF debe conservar información legible en páginas adicionales, con encabezado de tabla repetido cuando corresponda y pie con número de página.

## Reglas estructurales de entrega

- Toda estructura repetida se entrega como componente con nombre; no se duplica marcado.
- Los mensajes de validación derivan de un mapa por código de error (un código = un mensaje).
- Las reglas de dominio (dinero, gramáticas, límites) viven en un módulo puro sin dependencia del
  framework; la UI y el PDF derivan del mismo resultado.
- Iconos y tokens de diseño con fuente única; sin valores mágicos repetidos inline.
- No usar APIs solo-secure-context (por ejemplo `crypto.randomUUID`) sin fallback: la entrega se
  prueba contra la URL real del evaluador, incluida la variante HTTP no segura.
- El PDF debe extraer limpio con herramientas estándar de texto (sin mojibake ni glifos fuera de
  la codificación de la fuente).

## Gate de QA pre-entrega (obligatorio)

No se declara la entrega sin la matriz de QA completa en verde. Un flujo crítico roto = entrega
rechazada, independientemente del resto. La matriz registra cada tipo con estado
(`verde` / `rojo` / `no ejecutado`) y declara URL y build de cada verificación.

| ID | Tipo | Alcance mínimo |
|---|---|---|
| T-01 | Unitarias de dominio | Gramáticas, centavos, half-up, límites, formatos — puro, sin DOM |
| T-02 | Funcional e2e de flujos críticos | Contra la URL real del evaluador, con navegador real |
| T-03 | Accesibilidad | Labels, foco visible, teclado completo, aria-live, contraste, targets táctiles (INV-02, INV-03, INV-04 de design.md) |
| T-04 | Exploratorio | Los estados de design.md en ambos temas, 2 viewports, recarga, límites |
| T-05 | Adversarial de frontera | Hidratación, contextos inseguros, carreras, paginación límite |
| T-06 | Revisión de entrega | Matriz hallazgo → estado; nada afirmado sin evidencia |

Flujos críticos (T-02), con evidencia literal propia y por nombre:

1. Cargar una línea de ítem (descripción + cantidad + precio → aparece en la tabla).
2. Generar el PDF (descarga local con filename correcto y contenido legible).
3. Totales correctos agregando y eliminando ítems.
4. Completar cliente y bloquear export con datos inválidos.
5. Recarga → estado efímero.

Un solo tipo de prueba en rojo bloquea la entrega. 'No ejecutado' es válido pero deja la entrega
incompleta y el evaluador lo publica así.

## Verificación

- Ejecutar pruebas Vitest de cálculos, gramática y validación relevante.
- Ejecutar build y reportar su resultado real.
- Correr la suite e2e contra la URL real de evaluación y declarar URL y build en el informe.
- Revisar manual o independientemente los escenarios, las vistas requeridas y el PDF cuando el entorno lo permita.
- Las pruebas automatizadas no sustituyen una revisión visual, de teclado o de PDF.
- Si una comprobación no puede ejecutarse, se informa como no disponible; no se declara aprobada.
