# gb


## Navegación individual por NFC

La portada conserva su diseño y solicita escanear una etiqueta; no muestra catálogo, buscador ni carga de ROMs. Los enlaces existentes `?rom=ID` siguen funcionando. El jugador no contiene enlace a la portada o biblioteca, tampoco en el logo. Solo permite controles, audio, pantalla completa, ayuda y partidas del juego actual. Los errores no muestran otros juegos.

Esto limita la navegación de la interfaz, no autentica la posesión de una etiqueta. En GitHub Pages los archivos, el catálogo y la configuración siguen siendo públicos, y una URL puede copiarse o compartirse. Para exigir posesión física y evitar reutilizar enlaces hace falta un diseño distinto, con validación de servidor y etiquetas compatibles. No se han cambiado los IDs de las etiquetas existentes.

## Audio en iPhone

Al tocar Activar sonido o un control se solicita una sesión `playback` cuando el navegador admite Audio Session API (WebKit documenta este ajuste desde iOS 17). El desbloqueo de Web Audio se inicia dentro del gesto, comprueba el estado real y permite reintentar tras una suspensión. El botón no indica activo cuando el contexto está suspendido. En iOS antiguo sin esta API puede ser necesario quitar el modo silencio y subir el volumen multimedia. Las pruebas automatizadas validan la sesión, la recuperación y el envío de buffers, pero la salida audible debe confirmarse en un iPhone físico.
