import {PocketEngine} from './engine.js';
import {validateRom, romUrl} from './rom-utils.js';
const $ = s => document.querySelector(s);
const engine = new PocketEngine($('#screen'), error => { status(error.message); updatePause(); });
let current = null, loading = false, brand = 'S² Creations', storageWarned = false;
const held = new Map();
const directPlay = new URL(location.href).searchParams.has('rom');
let autoSoundPending = directPlay;
if (directPlay) {
  document.body.classList.add('direct-play');
  $('.help-link').remove();
  const options = document.createElement('button');
  options.id = 'game-options'; options.textContent = 'Partidas y ayuda';
  options.setAttribute('aria-expanded', 'false');
  options.onclick = async () => {
    await exitExpanded();
    const opened = document.body.classList.toggle('show-game-options');
    options.setAttribute('aria-expanded', String(opened));
    if (opened) { if (engine.running) togglePause(); $('.library').scrollIntoView({behavior:'smooth'}); }
  };
  $('.toolbar').append(options);
}
let soundAttempt = null;
function syncSound() {
  const active = !engine.muted && engine.audio?.state === 'running';
  $('#sound').textContent = active ? '♪ Silenciar' : '♪ Activar sonido';
  $('#sound').setAttribute('aria-pressed', String(active));
}
engine.onAudioStateChange = syncSound;
function unlockGameAudio() {
  if (loading || !engine.audio || soundAttempt) return soundAttempt;
  if (!autoSoundPending && (engine.muted || engine.audio.state === 'running')) return;
  soundAttempt = engine.enableAudio().then(() => {
    autoSoundPending = false; engine.setMuted(false); syncSound();
  }).catch(error => {
    autoSoundPending = true; syncSound(); status(error.message);
  }).finally(() => { soundAttempt = null; });
  return soundAttempt;
}

function status(message) { $('#status').textContent = message; }
function updatePause() { $('#pause').disabled = !engine.e || loading; $('#pause').textContent = engine.running ? 'Ⅱ Pausar' : '▶ Continuar'; }
function controlsEnabled(enabled) { $('#export').disabled = !enabled; $('#save-file').disabled = !enabled; }
function save() {
  if (!current || !engine.e || !engine.dirty) return;
  try { const ram = engine.ram(); if (ram.length) localStorage.setItem(current.key, JSON.stringify(Array.from(ram))); engine.dirty = false; }
  catch { if (!storageWarned) { status('No se pudo guardar en este navegador. Exporta una copia de tu partida.'); storageWarned = true; } }
}
function release() { padPointers.clear(); held.clear(); engine.release(); document.querySelectorAll('[data-key]').forEach(b => b.classList.remove('pressed')); }
function keyInput(key, down, source) {
  if (down) held.set(source, key); else held.delete(source);
  const active = [...held.values()].includes(key);
  engine.input(key, active); document.querySelector(`[data-key="${key}"]`)?.classList.toggle('pressed', active);
}
async function loadGame(game) {
  if (loading) return;
  loading = true; save(); release(); engine.pause(); updatePause(); controlsEnabled(false); status(`Cargando ${game.title}…`);
  try {
    let bytes;
    { const response = await fetch(romUrl(game.file, document.baseURI)); if (!response.ok) throw new Error(`No se encontró la ROM (${response.status}).`); bytes = new Uint8Array(await response.arrayBuffer()); }
    const system = validateRom(bytes);
    const digest = await crypto.subtle.digest('SHA-256', bytes); const hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2,'0')).join('');
    await engine.load(bytes);
    current = {...game, system, bytes, key:`s2-pocket:ram:${hash}`};
    let restored = false, storageError = false;
    try { const saved = localStorage.getItem(current.key); if (saved) { engine.ram(new Uint8Array(JSON.parse(saved))); restored = true; } } catch { storageError = true; }
    $('#console').classList.toggle('color', system === 'gbc'); $('#model').textContent = system === 'gbc' ? 'GAME BOY COLOR' : 'GAME BOY';
    $('#device-label').textContent = `${brand} - ${game.title}`; document.title = `${brand} - ${game.title}`;
    $('#screen-empty').hidden = true; $('#power').classList.add('on');
    const url = new URL(location.href); if (game.id) url.searchParams.set('rom',game.id); else url.searchParams.delete('rom'); history.replaceState(null,'',url);
    if (!document.hidden) engine.play(); controlsEnabled(true);
    status(storageError ? 'No se pudo restaurar el guardado local. Exporta una copia al terminar.' : `${game.title} · ${restored ? 'Partida restaurada' : 'Listo para jugar'}${engine.muted ? (directPlay ? ' · Sonido al tocar un control' : ' · Toca ♪ para activar el sonido') : ''}`);
  } catch (error) {
    document.body.classList.remove('direct-play'); status(error.message || 'No se pudo cargar el juego.');
    if (!engine.e) { current = null; $('#power').classList.remove('on'); $('#screen-empty').hidden = false; }
    controlsEnabled(!!engine.e);
  } finally { loading = false; updatePause(); }
}
function togglePause() { if (!engine.e || loading) return; release(); if (engine.running) { engine.pause(); save(); status('Juego en pausa. Tu aventura puede esperar.'); } else { unlockGameAudio(); engine.play(); status(`${current.title} · Jugando`); } updatePause(); }
$('#pause').onclick = togglePause;
$('#sound').onclick = () => {
  if (!engine.audio) { status('Primero carga un juego para activar el sonido.'); return; }
  if (soundAttempt) return;
  if (!engine.muted && engine.audio.state === 'running') {
    autoSoundPending = false; engine.setMuted(true); engine.clearAudio(); syncSound();
  } else {
    autoSoundPending = true;
    unlockGameAudio()?.then(() => {
      if (!engine.muted && engine.audio.state === 'running') status('Audio activado. Si no lo escuchas, revisa el volumen multimedia y el modo silencio del iPhone.');
    });
  }
};
// iOS may accept touchend even when pointerdown did not unlock playback.
$('.console').addEventListener('touchend', () => unlockGameAudio(), {passive:true});
let fullscreenBusy = false;
function syncExpanded() {
  const expanded = document.body.classList.contains('expanded-player');
  $('#fullscreen').textContent = expanded ? '⛶ Reducir' : '⛶ Ampliar';
  $('#fullscreen').setAttribute('aria-pressed', String(expanded));
}
async function exitExpanded() {
  if (document.fullscreenElement) {
    try { await document.exitFullscreen(); } catch { return; }
  }
  document.body.classList.remove('expanded-player'); syncExpanded();
}
$('#fullscreen').onclick = async () => {
  if (fullscreenBusy) return;
  fullscreenBusy = true;
  try {
    if (document.body.classList.contains('expanded-player') || document.fullscreenElement) {
      await exitExpanded(); return;
    }
    document.body.classList.remove('show-game-options');
    $('#game-options')?.setAttribute('aria-expanded', 'false');
    // Fullscreen support is detected at runtime; no iOS-version assumptions.
    let native = false;
    if (document.fullscreenEnabled && document.documentElement.requestFullscreen) {
      try { await document.documentElement.requestFullscreen(); native = !!document.fullscreenElement; } catch {}
    }
    document.body.classList.add('expanded-player'); syncExpanded();
    window.scrollTo(0,0);
    status(native ? 'Pantalla completa · Toca Reducir para salir.' : 'Vista ampliada · Toca Reducir para salir.');
  } finally { fullscreenBusy = false; }
};
document.addEventListener('fullscreenchange', () => {
  document.body.classList.toggle('expanded-player', !!document.fullscreenElement); syncExpanded();
});
window.addEventListener('keydown', event => {
  if (event.code === 'Escape' && document.body.classList.contains('expanded-player')) exitExpanded();
});
syncExpanded();
$('#export').onclick = () => {
  try { const ram = engine.ram(); if (!ram.length) { status('Este cartucho no tiene memoria de guardado.'); return; } const url = URL.createObjectURL(new Blob([ram])); const a = document.createElement('a'); a.href = url; a.download = `${current.title.replace(/[^a-z0-9_-]/gi,'_')}.sav`; a.click(); setTimeout(() => URL.revokeObjectURL(url),1000); status('Partida exportada. Conserva esta copia.'); }
  catch(error) { status(error.message); }
};
$('#save-file').onchange = async event => {
  const file = event.target.files[0]; event.target.value = ''; if (!file || !current || loading) return;
  if (file.size > 1024 * 1024) { status('El archivo de partida es demasiado grande.'); return; }
  const target = current;
  const bytes = new Uint8Array(await file.arrayBuffer()); if (target !== current || loading) return;
  if (bytes.length !== engine.ram().length) { status('El tamaño del archivo no corresponde a este cartucho.'); return; }
  if (!confirm(`¿Reemplazar la partida de ${current.title}? Asegúrate de que el archivo pertenece a este juego. Se reiniciará el cartucho.`)) return;
  loading = true; release(); controlsEnabled(false);
  try { engine.pause(); await engine.load(current.bytes); engine.ram(bytes); save(); engine.play(); status('Partida importada. Usa Continuar dentro del juego.'); }
  catch(error) { status(error.message); }
  finally { loading = false; controlsEnabled(!!engine.e); updatePause(); }
};
document.querySelectorAll('[data-key]:not(.dpad button)').forEach(button => {
  button.onpointerdown = event => { event.preventDefault(); if (!engine.e || loading) return; unlockGameAudio(); button.setPointerCapture(event.pointerId); keyInput(button.dataset.key,true,`p${event.pointerId}`); };
  const end = event => keyInput(button.dataset.key,false,`p${event.pointerId}`);
  button.onpointerup = end; button.onpointercancel = end; button.onlostpointercapture = end; button.oncontextmenu = event => event.preventDefault();
});
// The entire pad tracks each finger, allowing slides and diagonal directions.
const pad = $('.dpad');
const padPointers = new Set();
function movePad(event) {
  if (!padPointers.has(event.pointerId)) return;
  const box = pad.getBoundingClientRect();
  const x = (event.clientX - box.left) / box.width * 2 - 1;
  const y = (event.clientY - box.top) / box.height * 2 - 1;
  for (const [key, active] of Object.entries({left:x < -.25,right:x > .25,up:y < -.25,down:y > .25})) {
    keyInput(key, active, `pad${event.pointerId}:${key}`);
  }
}
pad.onpointerdown = event => {
  event.preventDefault(); if (!engine.e || loading || !engine.running) return;
  unlockGameAudio(); padPointers.add(event.pointerId); pad.setPointerCapture(event.pointerId); movePad(event);
};
pad.onpointermove = movePad;
function endPad(event) {
  padPointers.delete(event.pointerId);
  for (const key of ['left','right','up','down']) keyInput(key,false,`pad${event.pointerId}:${key}`);
}
pad.onpointerup = endPad; pad.onpointercancel = endPad; pad.onlostpointercapture = endPad;
pad.oncontextmenu = event => event.preventDefault();
const keys = {ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right',KeyX:'A',KeyZ:'B',Enter:'start',ShiftLeft:'select',ShiftRight:'select'};
window.addEventListener('keydown', event => { if ((['INPUT','TEXTAREA','SUMMARY','A'].includes(event.target.tagName) || (event.target.tagName === 'BUTTON' && ['Enter','Space'].includes(event.code))) || event.ctrlKey || event.metaKey || event.altKey || !engine.e || loading) return; if (keys[event.code]) { event.preventDefault(); unlockGameAudio(); keyInput(keys[event.code],true,event.code); } if (event.code === 'Space') { event.preventDefault(); if (!event.repeat) togglePause(); } });
window.addEventListener('keyup', event => { if (keys[event.code]) keyInput(keys[event.code],false,event.code); });
window.addEventListener('blur', release);
document.addEventListener('visibilitychange', () => { if (document.hidden) { release(); engine.pause(); save(); updatePause(); } });
window.addEventListener('pagehide',save); setInterval(save,2000);
async function boot() {
  try {
    const response = await fetch('config.json');
    if (!response.ok) throw new Error('No se pudo cargar la configuración. Intenta recargar la página.');
    const config = await response.json();
    brand = config.brand || brand;
    $('#description').textContent = config.description || $('#description').textContent;
    const requested = new URL(location.href).searchParams.get('rom');
    if (!requested) { document.body.classList.remove('direct-play'); return; }
    const catalogResponse = await fetch('roms/catalog.json');
    if (!catalogResponse.ok) throw new Error('No se pudo cargar el juego. Vuelve a abrir el enlace de tu etiqueta.');
    const games = await catalogResponse.json();
    if (!Array.isArray(games)) throw new Error('No se pudo leer la información del juego.');
    const game = games.find(g => g.id === requested);
    if (game) await loadGame(game);
    else { document.body.classList.remove('direct-play'); status('Esta etiqueta no corresponde a un juego disponible. Revisa su enlace o contacta a S² Creations.'); }
  } catch(error) { document.body.classList.remove('direct-play'); status(error.message); }
}
boot();
