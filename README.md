# El reto estrategIA

[Jugar al reto](https://elcontemplador.github.io/reto-estrategia-ia/) · [estrategIA LAB](https://elcontemplador.github.io/estrategIA-lab/) · [Newsletter estrategIA](https://estrategiabyaleph.substack.com/)

Un concurso de cultura general sobre inteligencia artificial para celebrar tres años de estrategIA. Personas, ideas, empresas, herramientas e historia de la IA, sin exigir conocimientos de programación.

Quince preguntas, cuatro opciones, tres comodines y hasta **100.000 puntos**. La dificultad aumenta en cinco etapas. Cada acierto permite continuar o plantarse; un error termina la partida conservando el último seguro alcanzado: 1.000 puntos tras la quinta respuesta correcta y 10.000 tras la décima. No hay dinero, reloj ni clasificación pública.

El banco reúne **1.000 preguntas**, 459 familias editoriales, 15 categorías temáticas y 426 fuentes principales. Cada respuesta incluye explicación y referencia. La selección prioriza preguntas no vistas en este navegador y evita repetir familias dentro de una partida; un banco finito no garantiza que nunca se repitan preguntas.

## Jugar y comunicar una incidencia

El juego se utiliza directamente en el navegador, sin crear una cuenta. La partida y la mejor marca se guardan en ese navegador. El historial no se comparte entre dispositivos o dominios. Si el almacenamiento no está disponible, la interfaz lo indica y permite continuar durante la visita.

En «Consultar la fuente» se puede copiar la referencia de una pregunta y añadir una observación. Para comunicarla, pega el texto en un correo a **[fernandonieto@institucioneducativaaleph.com](mailto:fernandonieto@institucioneducativaaleph.com)**. Copiar no envía ningún mensaje automáticamente.

## Ejecutar y comprobar

Requisitos de mantenimiento: Node.js 24, npm y Python 3. El juego publicado no necesita instalar nada.

```sh
npm ci
python qa/compose_bank.py --check
npm test
npm run test:calibration
npm run test:bank
npx playwright install chromium
npm run test:browser
npm run test:usability
python -m http.server 4319 --bind 127.0.0.1 --directory dist
```

Abre `http://127.0.0.1:4319/` para jugar localmente. En Linux, la instalación de los navegadores puede requerir `npx playwright install --with-deps chromium`.

- `dist/`: aplicación estática publicada. No utiliza servicios de IA, servidor de aplicación ni base de datos remota.
- `data/`: bloques editoriales de conceptos, historia y sociedad. Son la fuente para reconstruir `dist/questions.json` con `python qa/compose_bank.py`.
- `qa/`: pruebas de motor, validación del banco, simulación de selección y recorridos de navegador. Los resultados temporales se excluyen del repositorio.
- `.github/workflows/pages.yml`: valida cada cambio de `main` y publica únicamente `dist/` si los controles pasan. Las pull requests ejecutan los controles sin publicar.

La actualización editorial del 1 de octubre de 2026 mejora 94 fichas: menos fechas menores, alternativas más plausibles, más preguntas iniciales y nuevos casos de gobernanza y uso responsable. Las preguntas con cuatro años como opciones pasan de 48 a 20. Las 60 etiquetas anteriores se agrupan en 15 categorías. Se mantienen personajes, empresas, ciencia y ficción como parte de la cultura general sobre IA.

Distribución actual por niveles: **209 / 296 / 257 / 185 / 53**. SHA-256 del banco: `7b98564f8ccd63f38140ab4feb14f32fd218a95fb614000f013c9cc8061f3216`. Cada ficha indica su propia fecha de revisión; esta actualización no atribuye una nueva comprobación factual a las preguntas que solo cambian de nivel o etiqueta, o reciben un enlace más preciso.

La revisión del 2 de octubre de 2026 simplifica el enunciado S0064, mejora los distractores de S0022, S0094 y S0174 y sitúa C0345 y S0064 en el nivel 3. Se conservan 1.000 preguntas y las respuestas correctas. Se han verificado 160 enlaces a entradas concretas del glosario de Google; el inventario general sigue contando páginas, no fragmentos de una misma página. Las fechas de revisión documental solo cambian en las cinco fichas revisadas materialmente.

Las ventanas de reglas, fuentes y referencias comparten una única zona de lectura, incluido el título, y mantienen visible el cierre al ampliar el texto. En móvil se muestra cuántos comodines quedan, con acceso directo a ellos; sus botones aparecen antes de confirmar. La portada condiciona el guardado a la disponibilidad del navegador. La imagen para compartir está en `dist/assets/social-card.png`.

Las partidas iniciadas antes de la revisión del 2 de octubre conservan las versiones anteriores de las cinco preguntas afectadas, sus opciones y su nivel. Esta compatibilidad utiliza variantes canónicas archivadas; las nuevas partidas reciben el banco vigente. Si otra actualización contiene preguntas que ya no pueden recuperarse, el juego informa del cambio y conserva la mejor marca y el número de partidas terminadas.

## Revisión de dificultad del 2 de octubre de 2026

Se han leído las 1.000 preguntas y se han contrastado de forma independiente todas las propuestas de cambio. Se reasignan **396 preguntas** según los conocimientos necesarios y las alternativas de respuesta, pensando en una persona interesada en IA sin formación especializada y antes de utilizar comodines. El vocabulario técnico por sí solo no justifica un nivel alto. Se conservan los enunciados, las opciones, las respuestas y las fuentes.

La escala distingue reconocimiento cotidiano (1), cultura digital básica (2), conocimientos intermedios (3), conocimientos especializados o referencias específicas (4) y detalles muy especializados o discriminaciones exigentes (5). El registro `data/difficulty-review-2026-10-02.json` documenta la cobertura, los motivos, las discrepancias resueltas y las incertidumbres. Es una estimación editorial asistida por IA; no procede de tasas de acierto observadas ni valida una progresión idéntica para todos los jugadores.

Las partidas ya empezadas conservan sus niveles anteriores mediante `dist/legacy-bands.js`; las nuevas utilizan la distribución revisada. En el nivel 5 quedan siete preguntas de conceptos: su variedad es limitada y, cuando se agotan las alternativas nuevas compatibles, la selección puede recurrir a otro ámbito antes de repetir. No se han elevado niveles para cubrir cuotas artificiales. Las pruebas incluyen la recuperación exacta de 1.000 partidas anteriores y el rechazo de guardados manipulados.

## Alcance de la revisión

Las preguntas se han redactado y revisado con asistencia de IA. Se han contrastado referencias y efectuado controles de estructura, mecánica y presentación. La dificultad es una estimación editorial pendiente de calibración con jugadores. La revisión asistida y las pruebas automáticas no equivalen a una validación académica humana, una garantía absoluta de infalibilidad ni una certificación completa de accesibilidad.

El juego admite teclado, movimiento reducido y sonido opcional, apagado por defecto. Los avisos distinguen fallos de carga, copia y guardado. La interfaz permite consultar las fuentes y revisar las respuestas al terminar.

## Atribuciones

Algunas definiciones adaptan el [Machine Learning Glossary de Google Developers](https://developers.google.com/machine-learning/glossary) y otras páginas de Google for Developers identificadas en cada ficha, bajo [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Las adaptaciones incluyen traducción, ejemplos, redacción, alternativas y formato de concurso. Los créditos también figuran en «Preguntas y fuentes».

Las demás referencias documentan hechos; sus textos y marcas conservan sus respectivos derechos. La publicación del repositorio no añade una licencia general al conjunto ni altera las licencias indicadas de los materiales de terceros.
