# Criterios de texto e idioma · E25

## Alcance y criterio

La app tiene dos idiomas completos para sus textos propios: español de Colombia e inglés. El español es el idioma inicial; no se infiere del sistema. Ajustes → Idioma cambia la interfaz inmediatamente y guarda la elección en `zoom-l6-idioma`. Cancelar los ajustes MIDI no revierte el idioma. Si el almacenamiento está bloqueado, el idioma elegido funciona durante la sesión.

Se usa tuteo, acciones cortas y consecuencias concretas. Un aviso explica qué pasó y cuál es el siguiente paso. «Conectada» describe la selección de las dos direcciones MIDI; no afirma que el aparato haya respondido. El texto del panel aclara esta diferencia.

No se traducen nombres de puertos, archivos, nombres escritos en cinta, notas de la persona ni datos de protocolo. Las copias nuevas sin nombre reciben un nombre predeterminado en el idioma activo; los nombres ya guardados o importados son datos de la persona. Se conservan la serigrafía, los tecnicismos habituales y los nombres del menú Zoom. Las descripciones y ayudas explican estos nombres en el idioma elegido. Las trazas técnicas y JSON del diagnóstico son datos originales, no textos de navegación; se conservan para no alterar la evidencia. Los errores que orientan al usuario sí se presentan en el idioma elegido.

No se añaden dependencias. `src/i18n/es.ts` y `en.ts` contienen los textos. `t` recibe claves e interpola valores con nombre; Vue escapa el resultado. `language` es una referencia reactiva compartida y actualiza el atributo `lang` del documento. `sourceKeys.ts` adapta etiquetas de la configuración existente al presentar valores. No se traduce la configuración antes de usarla en el protocolo.

`param.<id>.label` y `param.<id>.description` cubren cada parámetro del registro. Se consultan con `paramLabel(id)` y `paramDescription(id)` desde los componentes. `params.ts`, sus identificadores, direcciones, verificación, rangos y codificación permanecen intactos. Los nombres del menú se conservan también en español; cada descripción aclara el uso. Los ajustes no verificados conservan su protección y visibilidad anteriores.

## Inventario antes del cambio, por pantalla

| Archivo o grupo | Textos visibles originales | Idioma original |
| --- | --- | --- |
| `App.vue` · consola e inicio | Mezclador/canales, estado, modulación, ajustes, instrucciones USB y atribución | Español; Debug y Auto-Connect dentro de la ayuda en inglés |
| `App.vue` · avisos | Guardado, error de almacenamiento y adopción de ajustes de la mezcladora | Inglés |
| `App.vue` · compatibilidad | Jazz Plugin/Safari, MIDIWeb Browser/iOS, pasos, descargas y omitir | Inglés |
| `MidiConnection.vue` | Entrada/salida, opciones vacías, actualizar, desconectar, conexión automática, inicio y fallos | Inglés |
| `ChannelStrip.vue` | Canal, opciones, estéreo, envíos, nivel, restablecer y pausar LFO | Español; serigrafía original |
| `MidiControl.vue` | LFO de cada control, estados ON/OFF, etiquetas de la configuración y efectos | Español e inglés; serigrafía original |
| `GlobalControls.vue` | Efecto, tipo de efecto y compresor | Español |
| `SceneControls.vue` | Escena y títulos Scene A/B/C/D con número Program Change | Español e inglés |
| `SoundPads.vue` | Sound pads, sin nota, ayuda de pad sin asignación | Inglés y español |
| `TapeLabel.vue` | Pegar cinta, nombre accesible y selector de color | Español; nombre escrito por la persona |
| `LFOControl.vue` | Rate, Depth, Shape, Mode, formas, polaridad, activar/desactivar y pausa | Inglés |
| `AdvancedSettings.vue` | Título, modelo, secciones, asignaciones CC, advertencias, archivos, modos, guardado/cancelación y confirmaciones | Inglés |
| `DeviceSettingsPanel.vue` | Enlace Editor, estados, permisos, grupos, transferencia USB, avisos y fallos | Inglés |
| `DeviceParamField.vue` | Etiqueta y ayuda del registro, experimental, estado, ON/OFF, opciones y valor manual | Inglés |
| `ParamKnob.vue` | Etiqueta del registro, valores especiales y error | Inglés |
| `EffectParams.vue` | No tiene texto fijo; muestra errores de los parámetros | Inglés procedente del servicio |
| `DeviceNotice.vue` | No tiene texto fijo; recibe avisos del componente padre | Según el padre |
| `DebugDrawer.vue` | Diagnóstico, pestañas, registros, información del sistema y títulos | Inglés |
| `debug/SysexExplorer.vue` | Sesión, lectura/escritura, rango, copias del estado, comparación, importación/exportación y errores | Inglés |
| `components/icons/*.vue` | Solo formas SVG; sin texto de interfaz | No aplica |
| `midi/sysex/zoomL6/params.ts` | Nombres de ajustes, efectos, AUX, Sound Pads y cuatro descripciones existentes | Inglés; registro técnico sin modificar |
| Configuración/servicios/almacenes | Nombres de controles, opciones, estados, confirmaciones y resúmenes técnicos consumidos por los componentes | Inglés; se adapta su presentación sin cambiar su lógica |

El apéndice al final enumera las cadenas originales migradas, con su archivo de origen, para buscar cada caso concreto. También existen datos variables: números CC/nota/canal, versiones, puertos USB, archivos, etiquetas manuscritas, bytes, estados de solicitudes y errores. Se traducen los marcos de estos mensajes; sus valores se conservan.

## Problemas de comprensión y arreglo

| Pantalla | Problema para alguien sin contexto | Arreglo |
| --- | --- | --- |
| Inicio/conexión | «Conectada» se iluminaba con entrada y sin salida. La app no enviaba cambios, pero el estado parecía correcto. | La presentación consulta entrada y salida por separado. Entrada sola: ámbar, «Falta la salida MIDI», con instrucción de elegir Mixer Control. Salida sola: ámbar, falta entrada. Ambas: verde. Ninguna: lámpara apagada. El panel sigue visible mientras falte una dirección. |
| Inicio/conexión | Input y Output no indicaban quién recibe o envía; Editor parecía otra alternativa equivalente. | Se explica que la entrada recibe datos y la salida envía los cambios. Se pide Mixer Control en ambos menús y se explica la detección automática de Editor para SysEx. |
| Inicio/conexión | Auto-Connect parecía garantizar una conexión correcta. | «Conectar Zoom» describe la acción; el estado muestra el resultado por dirección. La ayuda emergente aclara que elegir puertos no confirma respuesta del aparato. |
| Compatibilidad | «Failed to initialize» no distinguía ausencia de API y permisos. | El aviso explica ambas posibilidades y ofrece cambiar de navegador, permitir MIDI y reintentar. Se conservan las condiciones de aparición y los enlaces existentes. |
| Consola | Debug y reset no explicaban el objetivo de la acción; «modulación» era opaco. | «Diagnóstico», «Restablecer», y ayuda de LFO como oscilador que mueve controles automáticamente. Se mantienen EQ, HIGH, MID, LOW, FREQ, AUX, EFX, PAN, MUTE y COMP. |
| Consola | El botón Sound Pad sin nota no decía cómo habilitarlo. | «Sin nota» y ayuda que dirige a Ajustes → Sound Pads para asignarla. |
| Consola | La cinta tenía un marcador de posición español en CSS que no podía cambiar de idioma. | El marcador viene del diccionario mediante un atributo; el CSS solo lo presenta. El nombre escrito permanece vacío inicialmente y nunca se traduce. |
| LFO | Rate, Depth y los modos no aclaraban qué se mueve o en qué dirección. | Velocidad y profundidad, formas de onda en español y ayuda de ciclos por segundo, cantidad y polaridad. Se conservan valores internos de shape/mode/state. |
| Ajustes | «Only modify if you know what you are doing» culpaba a la persona sin explicar el riesgo. | Se explica qué identifica un CC y que repetirlo puede mover varios controles; las confirmaciones describen la consecuencia concreta. |
| Ajustes | «Mixer Type Override» ocultaba cuándo tocarlo; L6 decía ocho canales aunque la configuración renderiza seis tiras. | «Modelo de mezcladora», indicación de usarlo si falla la detección y seis canales para L6. Solo cambia la descripción. |
| Ajustes | No quedaba claro qué guardaba Save ni qué deshacía Cancel. | «Guardar cambios» se refiere a la configuración de la app. Se advierte que los ajustes del aparato se aplican de inmediato y que Cancelar restaura notas de Sound Pads y canal MIDI, sin revertir todos los otros ajustes del aparato. |
| Ajustes de la mezcladora | Open, stale y no-sysex eran estados de implementación. | Abierto/cerrado, sin respuesta reciente, falta puerto Editor y SysEx sin permiso; cada bloqueo ofrece una acción. |
| Ajustes de la mezcladora | Podía mantenerse abierto el Editor oficial a la vez. | La ayuda indica desactivar el enlace antes de abrirlo y explica la interrupción que pueden causar dos sesiones. |
| Ajustes de la mezcladora | Parámetros y opciones de Zoom sin contexto: Pre/Post, Thru, USB Mix Minus, etc. | Se conservan los nombres de menú; cada parámetro tiene una descripción que explica el propósito y cuándo cambiarlo. Disponible como ayuda en la etiqueta o perilla. |
| Transferencia USB | «Command sent» se podía leer como confirmación de que apareció la tarjeta. | «Comando enviado. Comprueba…». Se explica la interrupción MIDI, el cambio de modo y cómo recuperar la conexión. No se afirma que haya funcionado. |
| Diagnóstico | Snapshot, Diff, Sweep y HB misses exigían conocer el código. | Copia del estado, Comparar, Leer un rango, Respuestas de actividad perdidas. Se explican el flujo de comparación y los límites de lectura. Los bytes y números permanecen intactos. |
| Diagnóstico | Un error podía aparecer sin siguiente paso. | Mensajes de lectura agotada, enlace cerrado, importación, hexadecimal y dirección desconocida con acción concreta. Para errores inesperados se ofrece una recuperación general sin inventar una causa. Las trazas originales conservan la evidencia técnica. |

## Glosario y decisiones

| Término o concepto | Español | Inglés | Motivo |
| --- | --- | --- | --- |
| Mixer | Mezcladora | Mixer | Uso del estudio en Colombia; evita alternar mezclador/dispositivo/aparato sin necesidad. |
| Settings | Ajustes | Settings | Acción conocida; se elimina la separación editorial entre Settings y Advanced Settings. |
| Device Settings | Ajustes de la mezcladora | Mixer settings / Device settings | Indica dónde se aplica el cambio. |
| Input / Output | Entrada / Salida MIDI | MIDI Input / MIDI Output | Se explica la dirección desde el punto de vista de la app. |
| Connected | Conectada | Connected | Solo cuando están elegidas ambas direcciones; no prueba de respuesta. |
| Missing output | Falta la salida MIDI | MIDI output missing | Nombra el requisito que impide enviar cambios. |
| Refresh | Actualizar puertos | Refresh devices | Dice qué se vuelve a buscar. |
| Auto-Connect Zoom | Conectar Zoom | Connect Zoom | Acción breve; no promete éxito. |
| Debug | Diagnóstico | Diagnostics | Describe para qué sirve el panel. |
| Reset | Restablecer | Reset | Recupera valores o asignaciones predeterminadas; no reinicia el hardware. |
| Save / Cancel | Guardar cambios / Cancelar | Save changes / Cancel | La ayuda indica alcance y cambios inmediatos. |
| Scene | Escena | Scene | Memoria recuperada con Program Change. |
| Tape | Cinta | Tape | Identificación escrita por la persona, sin nombres inventados. |
| Modulation | Modulación | Modulation | Se acompaña de explicación del LFO. |
| LFO | LFO (oscilador que mueve controles automáticamente) | LFO (oscillator that moves controls automatically) | Tecnicismo compartido, explicado al aparecer. |
| Rate / Depth | Velocidad / Profundidad | Rate / Depth | La ayuda explica Hz y amplitud del movimiento. |
| Shape / Mode | Forma de onda / Modo | Shape / Mode | Se traducen las acciones y conceptos de la app. |
| Sine / Triangle / Square / Saw | Senoidal / Triangular / Cuadrada / Diente de sierra | Sine / Triangle / Square / Saw | Formas de onda; valores internos intactos. |
| Bipolar / Positive / Negative | Bipolar / Positivo / Negativo | Bipolar / Positive / Negative | Se aclaran las direcciones en la ayuda. |
| Snapshot | Copia del estado | Snapshot | Evita confundirlo con una escena o preset que se carga al aparato. |
| Re-read snapshot | Volver a leer el estado | Re-read snapshot | Solicita datos actuales; no equivale a guardar otra copia. |
| Diff | Comparar | Diff | Expresa la acción de ver diferencias. |
| Sweep (GET only) | Leer un rango de parámetros (solo GET) | Sweep (GET only) | Lectura de varias direcciones; se mantiene GET como identificador técnico. |
| Raw SysEx | SysEx en hexadecimal | Raw SysEx | Aclara el formato que se escribe. |
| Registry | Registro de parámetros | Registry | Catálogo de direcciones conocidas, no registro de actividad. |
| Logs | Registros / mensajes | Logs / messages | Se distingue de registro de parámetros. |
| Heartbeat | Señal de actividad | Heartbeat | Explica qué comprueba la sesión. |
| Stale | Sin respuesta reciente | Stale | Nombra la condición observable, sin asegurar desconexión física. |
| Mass storage | Transferencia de archivos por USB | USB mass storage | Explica por qué sirve y qué se desconecta. |
| Not Mapped | Sin nota asignada | Not Mapped | Describe el estado del Sound Pad; conserva el valor 128. |
| On / Off | Activado / Desactivado | On / Off | Estados de controles de la app. |
| Firmware | Versión del firmware (ayuda: programa interno) | Firmware | Permite reconocer el dato al pedir soporte. |
| HIGH, MID, LOW, FREQ, AUX 1/2, EFX, PAN, MUTE, COMP, SUB MIX, MONO x2, USB 1/2 y 3/4 | Igual que la serigrafía | Igual que la serigrafía | Se reconoce el mismo control físico. |
| ROOM, HALL, SPRING, DELAY, ECHO, AI NR | Mismo nombre del efecto | Mismo nombre del efecto | Identidad del efecto; no se modifica la etiqueta usada para resolver sus parámetros. |
| MIDI, USB, CC, SysEx, Program Change, Sound Pads, Mixer Control, Editor | Sin traducir; explicación al lado | Sin traducir | Tecnicismos y nombres de puertos. |
| MIDI Out Mode, Mixer Control via MIDI, MIDI Channel, Battery Type, Auto Power Off, Recorder Mode, Monitor Point, Sub-Out Point, USB Mix Minus, USB Audio Mode | Nombre de menú Zoom + descripción española | Nombre de menú Zoom + descripción inglesa | Facilita encontrar el ajuste en el aparato y el Editor oficial. |
| Decay, Tone, Dwell, Time, Feedback, Repeat | Nombre del parámetro del Editor + descripción española | Nombre del parámetro + descripción inglesa | Se conserva la correspondencia con el Editor; la ayuda explica duración, color o repeticiones. |
| Play mode, MIDI Note, MIDI Clock Sync | Nombre del ajuste Zoom + explicación española | Nombre del ajuste + explicación inglesa | Coincide con las columnas del Editor. |
| Out/Thru, Pre/Post Fader, One-shot/Loop/Hold, Alkaline/Ni-MH/Lithium, 10 Hours/Never, Multi Track/Master Only, Stereo mix | Opción del menú Zoom sin traducir | Opción del menú Zoom | Las descripciones del parámetro explican cada opción. |

## Comportamiento y verificación

No se modificaron `src/midi/`, `src/services/`, `src/config/` ni `src/composables/`. Se mantienen eventos, valores de selectores, bindings numéricos, CC, notas, Program Change, mensajes SysEx y temporización. Se compararon los árboles de las plantillas contra HEAD: los eventos y v-model de los 16 componentes coinciden, con la única adición del selector de idioma. Los cambios de presentación son el idioma, las ayudas, nombres de copias creadas sin nombre y el estado honesto de conexión. El panel permanece visible si falta una dirección; la lógica del servicio que considera conectada una sola dirección permanece intacta para no alterar el transporte.

El selector de la prueba E2E acepta «Conectar Zoom» y «Connect Zoom», además del texto anterior. No se quita ninguna comprobación; `.estado` mantiene SIN CONEXIÓN/CONECTADA en español. No se ejecutó E2E porque este encargo prohíbe abrir cualquier puerto, incluidos los virtuales.

Se ejecutaron:

```sh
npx vue-tsc --build
npx vitest run
npx vite build --base ./
```

Tipos sin errores; 169 pruebas anteriores y 10 nuevas, 179 en total; compilación de producción correcta. Las pruebas nuevas verifican igualdad de claves, ausencia de vacíos, interpolaciones, cobertura por id de todos los parámetros, cambio y persistencia del idioma, adaptación de etiquetas y errores, y las cuatro combinaciones de entrada/salida. Una revisión del árbol de las plantillas impide dejar texto fijo o atributos de texto fuera de los diccionarios. Esa revisión no pretende traducir datos ajenos como nombres de archivos o trazas del navegador.

La primera ejecución de tipos encontró `node_modules` enlazado a una carpeta externa sin permiso de escritura para las cachés de TypeScript/Vue. Se copió ese árbol de dependencias dentro del worktree; no se instalaron ni actualizaron paquetes y no se modificaron los manifiestos.

No se abrió la app con acceso MIDI ni se conectó ningún puerto o aparato. Queda pendiente revisar visualmente ambos idiomas en Electron y navegador, incluidos textos largos, avisos de Safari/iOS y cambios de puertos en caliente. El éxito de las pruebas puras no demuestra comunicación con una L6max real. Tampoco se verificaron en internet la instalación de Jazz Plugin ni la disponibilidad de MIDIWeb Browser; se conservaron las rutas y recomendaciones existentes, sin cambiar su lógica.

## Investigación de Auto-Connect (sin arreglarlo)

`MidiConnection.vue` calcula por separado `targetInput` y `targetOutput`. `pickZoomPreferredPort` filtra nombres con zoom, l-6, l6 o livetrak, luego prefiere «mixer control», después «editor» y finalmente el primer candidato. «L6max» contiene «l6»; no requiere que el nombre incluya Zoom.

Con listas que contienen exactamente estos nombres:

- `L6max MIDI I/O Port`
- `L6max Mixer Control Port`
- `L6max for L6 Editor Port`

se ejecutó exclusivamente la función pura de selección, extraída del componente, con datos en memoria: eligió `L6max Mixer Control Port` tanto para entrada como para salida. Con lista vacía de salidas no elige ninguna. No se cargó ni inicializó el servicio MIDI para esta comprobación.

La causa comprobada del falso estado es otra: `connectInput` actualiza `_isConnected` con `input !== null || output !== null`, y emite `connectionChanged` antes del intento de salida. El encabezado anterior mostraba Conectada a partir de ese booleano. El panel se ocultaba aunque la salida no existiera. Esto explica por qué nadie veía que faltaba salida; no demuestra por qué faltaba en aquella sesión.

Si la lista de salidas estaba vacía al pulsar, `autoConnect` termina con solo entrada. Si había un candidato, `connectOutput` puede devolver false cuando no está inicializado, no hay salidas o ya no encuentra el nombre en la lista actual; la interfaz vacía el selector sin mostrar la causa. Una excepción también puede interrumpir la secuencia. Los nombres dados no permiten distinguir estos casos. Ocultar el panel con `v-show` no destruye el componente ni, por sí mismo, cancela la llamada de salida.

No hay evidencia capturada de la lista de salidas y del resultado de `connectOutput` en el instante del incidente. Por eso no se atribuye el fallo a macOS, WebMIDI, permisos o al nombre L6max como si estuviera probado. Para resolverlo en un encargo futuro haría falta una captura de ambas listas y el resultado/error de cada intento, autorizada por el dueño del aparato. Aquí no se cambió la selección automática ni el servicio.

## Apéndice: cadenas originales migradas

Cada fila indica texto original y sus componentes consumidores. Las etiquetas de serigrafía y marcas también están en los diccionarios, aunque no necesitan traducción. Las cadenas nuevas y variantes completas con valores interpolados se encuentran junto a estas en los diccionarios.

| Texto original | Ubicación | Español elegido |
| --- | --- | --- |
| MEZCLADOR · | `App.vue` | MEZCLADORA · |
| CANALES | `App.vue` | CANALES |
| Mostrar los LFO de cada control | `App.vue` | Muestra los LFO: osciladores que mueven los controles automáticamente |
| Modulación | `App.vue` | Modulación |
| Ajustes | `App.vue` | Ajustes |
| Debug | `App.vue`, `DebugDrawer.vue` | Diagnóstico |
| Canales | `App.vue` | Canales |
| Conecta la Zoom L6 o L6max | `App.vue` | Conecta la Zoom L6 o L6max |
| Conecta el mezclador al Mac por USB y enciéndelo. | `App.vue` | Conecta la mezcladora al Mac por USB y enciéndela. |
| Pulsa «Auto-Connect Zoom», o elige en los dos menús el puerto «Mixer Control». Por ese puerto van niveles, EQ, paneos, mutes, sound pads y escenas. | `App.vue` | Pulsa «Conectar Zoom», o elige «Mixer Control» en Entrada y Salida. Ese puerto lleva niveles, EQ, PAN, MUTE, Sound Pads y escenas. La entrada recibe datos; la salida envía tus cambios. |
| El puerto «Editor» no hay que elegirlo: la app lo detecta sola y lo usa para los parámetros de efecto y los ajustes del aparato. | `App.vue` | La app detecta el puerto «Editor» automáticamente. Lo usa para los parámetros de efecto y los ajustes de la mezcladora mediante SysEx (mensajes MIDI de ajustes del aparato). |
| Basada en | `App.vue` | Basada en |
| de philmillman (MIT). No está afiliada a Zoom Corp. | `App.vue` | de philmillman (MIT). Sin afiliación con Zoom Corp. |
| 🔌 Jazz Plugin Required for Safari | `App.vue` | 🔌 Safari necesita Jazz Plugin para usar MIDI |
| Safari requires the Jazz Plugin to access MIDI devices. Please install it to use this app: | `App.vue` | Este Safari no ofrece acceso MIDI. Instala Jazz Plugin para usar la app: |
| Download the Jazz Plugin from | `App.vue` | Descarga Jazz Plugin desde |
| Run the installer and follow the setup instructions | `App.vue` | Ejecuta el instalador y sigue sus instrucciones |
| Restart Safari after installation | `App.vue` | Reinicia Safari después de instalarlo |
| Reload this page | `App.vue` | Recarga esta página |
| Download Jazz Plugin | `App.vue` | Descargar Jazz Plugin |
| Skip for now | `App.vue` | Omitir por ahora |
| 📱 Use MIDIWeb Browser on iPhone & iPad | `App.vue` | 📱 Usa MIDIWeb Browser en iPhone o iPad |
| Safari on iPhone and iPad doesn't support the Web MIDI API, so it can't control your Zoom L6. | `App.vue` | Este navegador no ofrece Web MIDI y no puede controlar tu Zoom L6. Abre la app en un navegador con acceso MIDI. |
| Install the free | `App.vue` | Instala gratis |
| app, which adds Web MIDI on Apple devices: | `App.vue` | para usar Web MIDI en tu dispositivo Apple: |
| Get MIDIWeb Browser from the App Store | `App.vue` | Descarga MIDIWeb Browser en el App Store |
| Open it and find | `App.vue` | Ábrelo y busca |
| in its MIDIWeb Hub directory, or go to | `App.vue` | en su directorio MIDIWeb Hub, o visita |
| Connect your Zoom L6 over USB and allow MIDI access when asked | `App.vue` | Conecta tu Zoom L6 por USB y permite el acceso MIDI cuando se solicite |
| Get MIDIWeb Browser | `App.vue` | Descargar MIDIWeb Browser |
| Continue anyway | `App.vue` | Continuar de todos modos |
| No LFOs | `App.vue` | Sin LFO |
| Pause LFOs | `App.vue` | Pausar LFO |
| Resume LFOs | `App.vue` | Reanudar LFO |
| ✅ Settings saved successfully! | `App.vue` | ✅ Ajustes guardados en esta app. |
| ❌ Failed to save settings. Please check browser storage permissions. | `App.vue` | ❌ No se pudieron guardar los ajustes. Permite el almacenamiento de la app e intenta guardar de nuevo. |
| CC map | `App.vue` | asignaciones CC |
| MIDI channel | `App.vue` | canal MIDI |
| pad notes | `App.vue` | notas de Sound Pads |
| Ver la conexión MIDI | `App.vue` | Ver entrada y salida MIDI |
| El mezclador no está conectado | `App.vue` | Falta la conexión MIDI. Elige entrada y salida Mixer Control. |
| SIN CONEXIÓN | `App.vue` | SIN CONEXIÓN |
| Pausar LFO | `App.vue` | Pausar LFO |
| Reanudar LFO | `App.vue` | Reanudar LFO |
| Advanced Settings | `AdvancedSettings.vue` | Ajustes |
| Close | `AdvancedSettings.vue`, `debug/SysexExplorer.vue` | Cerrar |
| Changing these settings may cause conflicts. Only modify if you know what you're doing. | `AdvancedSettings.vue` | CC identifica cada control MIDI. Cambia sus asignaciones solo si coinciden con las de tu mezcladora; un CC repetido puede mover varios controles a la vez. |
| Custom settings loaded from browser storage | `AdvancedSettings.vue` | Se cargaron los ajustes guardados en esta app |
| Mixer Type Override | `AdvancedSettings.vue` | Modelo de mezcladora |
| L6 (8 channels, 3 scenes) | `AdvancedSettings.vue` | L6 (6 canales, 3 escenas) |
| L6Max (8 channels: 4 mono + 4 stereo, 4 scenes, subMix sends) | `AdvancedSettings.vue` | L6max (8 canales: 4 mono y 4 estéreo, 4 escenas, envíos SUB MIX) |
| Override the auto-detected mixer type. Changing this will affect available controls. | `AdvancedSettings.vue` | Elige el modelo si la detección automática falla. Cambia los controles disponibles en la app. |
| Device Settings | `AdvancedSettings.vue` | Ajustes de la mezcladora |
| Channel Controls | `AdvancedSettings.vue` | Asignaciones CC por canal |
| Channel | `AdvancedSettings.vue` | Canal |
| Volume (CC) | `AdvancedSettings.vue` | Nivel (CC) |
| Pan (CC) | `AdvancedSettings.vue` | PAN (CC) |
| EQ High (CC) | `AdvancedSettings.vue` | EQ HIGH (CC) |
| EQ Mid (CC) | `AdvancedSettings.vue` | EQ MID (CC) |
| EQ Mid Freq (CC) | `AdvancedSettings.vue` | EQ FREQ (CC) |
| EQ Low (CC) | `AdvancedSettings.vue` | EQ LOW (CC) |
| AUX1 (CC) | `AdvancedSettings.vue` | AUX 1 (CC) |
| AUX2 (CC) | `AdvancedSettings.vue` | AUX 2 (CC) |
| EFX Send (CC) | `AdvancedSettings.vue` | Envío EFX (CC) |
| SUB MIX (CC) | `AdvancedSettings.vue` | SUB MIX (CC) |
| Mute (CC) | `AdvancedSettings.vue` | MUTE (CC) |
| MONO x2 (CC) | `AdvancedSettings.vue` | MONO x2 (CC) |
| USB 1/2 (CC) | `AdvancedSettings.vue` | USB 1/2 (CC) |
| USB 3/4 (CC) | `AdvancedSettings.vue` | USB 3/4 (CC) |
| MIDI Channel | `AdvancedSettings.vue` | MIDI Channel |
| Global Controls | `AdvancedSettings.vue` | Asignaciones CC generales |
| EFX Type (CC) | `AdvancedSettings.vue` | Tipo EFX (CC) |
| Compressor (CC) | `AdvancedSettings.vue` | COMP (CC) |
| Sound Pads | `AdvancedSettings.vue` | Sound Pads |
| apply to the mixer immediately. MIDI Note updates the mixer immediately and this app's pad on Save; Cancel puts the mixer's notes back. | `AdvancedSettings.vue` | se aplican de inmediato en la mezcladora. MIDI Note cambia de inmediato en la mezcladora y en esta app al guardar. Cancelar restaura las notas anteriores de la mezcladora. |
| Editor link isn't open, so pad settings can't be sent to the mixer. Check Device Settings. | `AdvancedSettings.vue` | El enlace Editor está cerrado. Abre Ajustes de la mezcladora y activa el enlace para enviar los ajustes de Sound Pads. |
| File | `AdvancedSettings.vue` | Archivo |
| Play mode | `AdvancedSettings.vue` | Play mode |
| Level | `AdvancedSettings.vue` | Nivel |
| MIDI Note | `AdvancedSettings.vue` | MIDI Note |
| MIDI Clock Sync | `AdvancedSettings.vue` | MIDI Clock Sync |
| Reset to Defaults | `AdvancedSettings.vue` | Restablecer asignaciones |
| Cancel | `AdvancedSettings.vue` | Cancelar |
| Save Changes | `AdvancedSettings.vue` | Guardar cambios |
| Off | `AdvancedSettings.vue` | Desactivado |
| On | `AdvancedSettings.vue` | Activado |
| No file | `AdvancedSettings.vue` | Sin archivo |
| Assigned | `AdvancedSettings.vue` | Archivo asignado |
| Are you sure you want to reset all MIDI mappings to their defaults? This will also clear your saved settings. | `AdvancedSettings.vue` | ¿Restablecer todas las asignaciones MIDI? También se borrarán los ajustes guardados en esta app. |
| duplicate CC assignments | `AdvancedSettings.vue` | asignaciones CC repetidas |
| duplicate note assignments | `AdvancedSettings.vue` | notas MIDI repetidas |
| and | `AdvancedSettings.vue` | y |
| Are you sure? Any unsaved changes will be lost. | `AdvancedSettings.vue` | ¿Descartar los cambios sin guardar? Los ajustes de la mezcladora que se aplicaron de inmediato seguirán vigentes; se restaurarán las notas de Sound Pads y el canal MIDI anteriores. |
| Play mode, level and MIDI clock sync | `AdvancedSettings.vue` | Play mode, nivel y MIDI Clock Sync |
| Play mode and level | `AdvancedSettings.vue` | Play mode y nivel |
| Reiniciar este canal | `ChannelStrip.vue` | Restablecer este canal |
| Reiniciar todos los canales | `ChannelStrip.vue` | Restablecer todos los canales |
| Envíos | `ChannelStrip.vue` | Envíos |
| Nivel | `ChannelStrip.vue` | Nivel |
| Sin LFO en este canal | `ChannelStrip.vue` | Sin LFO en este canal |
| Pausar los LFO | `ChannelStrip.vue` | Pausar los LFO |
| Reanudar los LFO | `ChannelStrip.vue` | Reanudar los LFO |
| Debug Console | `DebugDrawer.vue` | Consola de diagnóstico |
| Clear all logs | `DebugDrawer.vue` | Borrar todos los registros |
| Clear All | `DebugDrawer.vue` | Borrar todo |
| Close debug console | `DebugDrawer.vue` | Cerrar diagnóstico |
| Errors | `DebugDrawer.vue` | Errores |
| Error Logs | `DebugDrawer.vue` | Registro de errores |
| Clear | `DebugDrawer.vue` | Borrar |
| No error logs yet | `DebugDrawer.vue` | Aún no hay errores registrados |
| MIDI Messages | `DebugDrawer.vue` | Mensajes MIDI |
| No MIDI messages yet | `DebugDrawer.vue` | Aún no hay mensajes MIDI |
| System Information | `DebugDrawer.vue` | Información del sistema |
| Refresh | `DebugDrawer.vue` | Actualizar |
| Platform: | `DebugDrawer.vue` | Plataforma: |
| Language: | `DebugDrawer.vue` | Idioma del sistema: |
| Online: | `DebugDrawer.vue` | Acceso a internet: |
| Screen: | `DebugDrawer.vue` | Pantalla: |
| Viewport: | `DebugDrawer.vue` | Área visible: |
| Pixel Ratio: | `DebugDrawer.vue` | Densidad de píxeles: |
| WebMIDI: | `DebugDrawer.vue` | WebMIDI: |
| MIDI Connected: | `DebugDrawer.vue` | Conexión MIDI completa: |
| User Agent: | `DebugDrawer.vue` | Identificación del navegador: |
| Yes | `DebugDrawer.vue` | Sí |
| No | `DebugDrawer.vue` | No |
| Supported | `DebugDrawer.vue` | Disponible |
| Not Supported | `DebugDrawer.vue` | No disponible |
| Not yet verified against real hardware | `DeviceParamField.vue` | Sin verificar con una mezcladora real |
| experimental | `DeviceParamField.vue` | experimental |
| Custom value… | `DeviceParamField.vue` | Otro valor… |
| Error | `DeviceParamField.vue`, `DeviceSettingsPanel.vue`, `MidiConnection.vue`, `ParamKnob.vue` | Error |
| Editor link | `DeviceSettingsPanel.vue` | Enlace Editor |
| · fw | `DeviceSettingsPanel.vue` | · versión |
| Turn off before launching the official ZOOM L6 Editor. | `DeviceSettingsPanel.vue` | Desactiva el enlace antes de abrir el ZOOM L6 Editor oficial. Dos sesiones a la vez pueden interrumpir la comunicación. |
| Changes apply to the mixer immediately; they are not part of Save. | `DeviceSettingsPanel.vue` | Estos cambios se aplican de inmediato en la mezcladora, sin pulsar Guardar. |
| MIDI Channel is shared by the app and the mixer: the mixer updates immediately and all app controls switch on Save. Cancel puts the mixer's channel back. | `DeviceSettingsPanel.vue` | MIDI Channel es compartido por la app y la mezcladora. La mezcladora cambia de inmediato; los controles de la app cambian al guardar. Cancelar restaura el canal anterior de la mezcladora. |
| Power | `DeviceSettingsPanel.vue` | Alimentación |
| Recorder | `DeviceSettingsPanel.vue` | Grabación |
| System info | `DeviceSettingsPanel.vue` | Información del sistema |
| Firmware | `DeviceSettingsPanel.vue` | Versión del firmware |
| L6max routing / USB | `DeviceSettingsPanel.vue` | Rutas de audio y USB de L6max |
| AUX send points | `DeviceSettingsPanel.vue` | Punto de envío AUX |
| USB mass storage | `DeviceSettingsPanel.vue` | Transferencia de archivos por USB |
| Toggle USB file transfer (SD card as a drive). The device will disconnect and re-enumerate on USB when you switch modes. If it gets stuck try ejecting the device on the host or disable from the official Zoom L6 app. | `DeviceSettingsPanel.vue` | Activa la transferencia para abrir la tarjeta SD como una unidad USB. La conexión MIDI se interrumpe mientras cambia de modo. Si no responde, expulsa la unidad desde el Mac o desactiva la transferencia en el ZOOM L6 Editor oficial. |
| SysEx permission was not granted. Reload and approve System Exclusive access for this site. | `DeviceSettingsPanel.vue` | No se permitió SysEx. Recarga la app y permite el acceso System Exclusive cuando se solicite. |
| Connect a MIDI output (Mixer Control) or ensure a Zoom Editor output appears in the list. | `DeviceSettingsPanel.vue` | Elige una salida Mixer Control o comprueba que aparezca una salida Editor de Zoom. |
| SysEx replies won’t be waited on: allow SysEx and connect a MIDI input or ensure an Editor input exists. Commands still send with fixed delays. | `DeviceSettingsPanel.vue` | No se esperarán respuestas SysEx. Para recibirlas, permite SysEx y conecta una entrada MIDI o Editor. Los comandos se envían con pausas fijas. |
| SysEx not allowed | `DeviceSettingsPanel.vue` | SysEx sin permiso |
| No Editor port | `DeviceSettingsPanel.vue` | Falta el puerto Editor |
| Closed | `DeviceSettingsPanel.vue` | Cerrado |
| Opening… | `DeviceSettingsPanel.vue`, `debug/SysexExplorer.vue` | Abriendo… |
| Open | `DeviceSettingsPanel.vue`, `debug/SysexExplorer.vue` | Abrir |
| Stale | `DeviceSettingsPanel.vue` | Sin respuesta reciente |
| Suspended | `DeviceSettingsPanel.vue` | Suspendido |
| Editor link is off. Turn it on above to change device settings. | `DeviceSettingsPanel.vue` | El enlace Editor está apagado. Actívalo arriba para cambiar ajustes de la mezcladora. |
| No Zoom “Editor” MIDI port found. Connect the mixer over USB. | `DeviceSettingsPanel.vue` | No se encontró el puerto MIDI Editor de Zoom. Conecta la mezcladora por USB y actualiza la lista de puertos. |
| The editor link is suspended (USB file transfer). Reconnect the device to resume. | `DeviceSettingsPanel.vue` | El enlace Editor está suspendido por la transferencia USB. Reconecta la mezcladora para reanudarlo. |
| The editor link hit an error. | `DeviceSettingsPanel.vue` | Falló el enlace Editor. Cierra el Editor oficial y vuelve a conectar la mezcladora. |
| No MIDI output available for SysEx. Connect Mixer Control or ensure a Zoom “Editor” output appears in the device list. | `DeviceSettingsPanel.vue` | No hay salida MIDI para SysEx. Elige Mixer Control o comprueba que aparezca una salida Editor de Zoom. |
| System Exclusive is not enabled. Reload the app and allow SysEx when the browser prompts. | `DeviceSettingsPanel.vue` | SysEx no está habilitado. Recarga la app y permite el acceso SysEx cuando se solicite. |
| Command sent. The L6 should appear as a USB drive (SD card access) in the host file manager. | `DeviceSettingsPanel.vue` | Comando enviado. Comprueba que la tarjeta SD aparezca como una unidad USB en el administrador de archivos. |
| Command sent. The L6 USB storage will disconnect. | `DeviceSettingsPanel.vue` | Comando enviado. La unidad USB de la mezcladora se desconectará. |
| Sending… | `DeviceSettingsPanel.vue` | Enviando… |
| Wait… | `DeviceSettingsPanel.vue` | Espera… |
| Enable mass storage | `DeviceSettingsPanel.vue` | Activar transferencia USB |
| Disable mass storage | `DeviceSettingsPanel.vue` | Desactivar transferencia USB |
| Efecto | `GlobalControls.vue` | Efecto |
| Tipo de efecto | `GlobalControls.vue` | Tipo de efecto |
| Compresor | `GlobalControls.vue` | Compresor |
| Rate | `LFOControl.vue` | Velocidad |
| Depth | `LFOControl.vue` | Profundidad |
| Shape | `LFOControl.vue` | Forma de onda |
| Sine | `LFOControl.vue` | Senoidal |
| Triangle | `LFOControl.vue` | Triangular |
| Square | `LFOControl.vue` | Cuadrada |
| Saw | `LFOControl.vue` | Diente de sierra |
| Mode | `LFOControl.vue` | Modo |
| Bipolar | `LFOControl.vue` | Bipolar |
| Positive | `LFOControl.vue` | Positivo |
| Negative | `LFOControl.vue` | Negativo |
| Enable | `LFOControl.vue` | Activar |
| Disable | `LFOControl.vue` | Desactivar |
| Pause | `LFOControl.vue` | Pausar |
| Resume | `LFOControl.vue` | Reanudar |
| MIDI Connection | `MidiConnection.vue` | Conexión MIDI |
| MIDI Input: | `MidiConnection.vue` | Entrada MIDI: |
| Select Input Device | `MidiConnection.vue` | Elige la entrada Mixer Control |
| MIDI Output: | `MidiConnection.vue` | Salida MIDI: |
| Select Output Device | `MidiConnection.vue` | Elige la salida Mixer Control |
| Disconnect | `MidiConnection.vue` | Desconectar |
| Auto-Connect Zoom | `MidiConnection.vue` | Conectar Zoom |
| WebMIDI is not supported in this browser or failed to initialize. | `MidiConnection.vue` | No se pudo iniciar WebMIDI. Este navegador puede no ofrecer acceso MIDI o el permiso fue rechazado. |
| Please use a modern browser like Chrome, Edge, or Firefox. | `MidiConnection.vue` | Usa Chrome, Edge o Firefox con acceso MIDI y permite el acceso cuando se solicite. Luego pulsa Reintentar. |
| Retry | `MidiConnection.vue` | Reintentar |
| Initializing MIDI... | `MidiConnection.vue` | Iniciando MIDI… |
| Refreshing... | `MidiConnection.vue` | Actualizando… |
| Refresh Devices | `MidiConnection.vue` | Actualizar puertos |
| Initializing... | `MidiConnection.vue` | Iniciando… |
| Disconnected | `MidiConnection.vue` | Sin conexión |
| Escena | `SceneControls.vue` | Escena |
| Sound pads | `SoundPads.vue` | Sound Pads |
| sin nota | `SoundPads.vue` | sin nota |
| This pad is Not Mapped. Assign it a MIDI note in Advanced Settings ▸ Sound Pads to enable it. | `SoundPads.vue` | Este Sound Pad no tiene nota MIDI asignada. Elige una nota en Ajustes ▸ Sound Pads para activarlo. |
| Color de la cinta | `TapeLabel.vue` | Color de la cinta |
| Quit ZOOM L6 Editor before opening a session (MIDI Monitor spying is fine). | `debug/SysexExplorer.vue` | Cierra ZOOM L6 Editor antes de abrir una sesión. Puedes observar los mensajes con MIDI Monitor. |
| FW | `debug/SysexExplorer.vue` | Versión |
| HB misses: | `debug/SysexExplorer.vue` | Respuestas de actividad perdidas: |
| Snapshot re-read | `debug/SysexExplorer.vue` | Estado de la mezcladora leído de nuevo |
| Raw SysEx | `debug/SysexExplorer.vue` | SysEx en hexadecimal |
| Send | `debug/SysexExplorer.vue` | Enviar |
| Get param | `debug/SysexExplorer.vue` | Leer parámetro |
| Group | `debug/SysexExplorer.vue` | Grupo |
| Index | `debug/SysexExplorer.vue` | Índice |
| Sweep (GET only) | `debug/SysexExplorer.vue` | Leer un rango de parámetros (solo GET) |
| Group from | `debug/SysexExplorer.vue` | Desde el grupo |
| Group to | `debug/SysexExplorer.vue` | Hasta el grupo |
| Index from | `debug/SysexExplorer.vue` | Desde el índice |
| Index to | `debug/SysexExplorer.vue` | Hasta el índice |
| Interval (ms) | `debug/SysexExplorer.vue` | Intervalo (ms) |
| Timeout (ms) | `debug/SysexExplorer.vue` | Tiempo de espera (ms) |
| Run | `debug/SysexExplorer.vue` | Iniciar |
| Abort | `debug/SysexExplorer.vue` | Detener |
| That range is a large number of requests. | `debug/SysexExplorer.vue` | Ese rango genera muchas solicitudes a la mezcladora. |
| Confirm & run anyway | `debug/SysexExplorer.vue` | Confirmar e iniciar |
| Width | `debug/SysexExplorer.vue` | Cantidad de bytes |
| Values | `debug/SysexExplorer.vue` | Valores |
| Latency | `debug/SysexExplorer.vue` | Tiempo de respuesta |
| Registry | `debug/SysexExplorer.vue` | Registro de parámetros |
| Set param | `debug/SysexExplorer.vue` | Escribir parámetro |
| Values (hex) | `debug/SysexExplorer.vue` | Valores (hexadecimal) |
| I understand this address is not in the registry | `debug/SysexExplorer.vue` | Entiendo que esta dirección no está en el registro de parámetros |
| Set | `debug/SysexExplorer.vue` | Escribir |
| Snapshots | `debug/SysexExplorer.vue` | Copias del estado |
| How to find a setting's byte | `debug/SysexExplorer.vue` | Cómo encontrar el byte de un ajuste |
| To find a setting's byte: Take snapshot → change one setting in Device Settings or Sound Pads → Re-read snapshot → Take snapshot → Diff. | `debug/SysexExplorer.vue` | Guarda una copia del estado → cambia un solo ajuste en Ajustes de la mezcladora o Sound Pads → vuelve a leer el estado → guarda otra copia → compara las copias. |
| Label | `debug/SysexExplorer.vue` | Nombre de la copia |
| Take snapshot | `debug/SysexExplorer.vue` | Guardar copia del estado |
| params — | `debug/SysexExplorer.vue` | parámetros — |
| Choose… | `debug/SysexExplorer.vue` | Elige… |
| Diff | `debug/SysexExplorer.vue` | Comparar |
| — layout | `debug/SysexExplorer.vue` | — formato |
| group:index | `debug/SysexExplorer.vue` | grupo:índice |
| Before | `debug/SysexExplorer.vue` | Antes |
| After | `debug/SysexExplorer.vue` | Después |
| Payload offset | `debug/SysexExplorer.vue` | Posición del byte |
| Field | `debug/SysexExplorer.vue` | Campo |
| unverified | `debug/SysexExplorer.vue` | sin verificar |
| No differences. | `debug/SysexExplorer.vue` | Sin diferencias. |
| Export / import | `debug/SysexExplorer.vue` | Exportar e importar |
| Export JSON | `debug/SysexExplorer.vue` | Exportar JSON |
| Notes | `debug/SysexExplorer.vue` | Notas |
| Reverse-engineering notes… | `debug/SysexExplorer.vue` | Notas sobre el protocolo… |
| Inbound messages | `debug/SysexExplorer.vue` | Mensajes recibidos |
| No inbound messages yet | `debug/SysexExplorer.vue` | Aún no hay mensajes recibidos |
| Re-reading… | `debug/SysexExplorer.vue` | Leyendo de nuevo… |
| Re-read snapshot | `debug/SysexExplorer.vue` | Volver a leer el estado |
| Reading… | `debug/SysexExplorer.vue` | Leyendo… |
| Get | `debug/SysexExplorer.vue` | Leer |
| Copied | `debug/SysexExplorer.vue` | Copiado |
| Copy as registry entry | `debug/SysexExplorer.vue` | Copiar como entrada del registro |
