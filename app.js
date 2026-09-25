import {PocketEngine} from './engine.js';
import {validateRom, romUrl} from './rom-utils.js';
const $ = s => document.querySelector(s);
const engine = new PocketEngine($('#screen'), error => { status(error.message); updatePause(); });
let catalog = [], filter = 'all', current = null, loading = false, brand = 'S² Creations', storageWarned = false;
const held = new Map();
const directPlay = new URL(location.href).searchParams.has('rom');
let autoSoundPending = directPlay;
if (directPlay) {
  document.body.classList.add('direct-play');
  $('.help-link').textContent = '← Biblioteca';
  $('.help-link').href = './';
  const options = document.createElement('button');
  options.id = 'game-options'; options.textContent = 'Partidas y ayuda';
  options.setAttribute('aria-expanded', 'false');
  options.onclick = () => {
    const opened = document.body.classList.toggle('show-game-options');
    options.setAttribute('aria-expanded', String(opened));
    if (opened) { if (engine.running) togglePause(); $('.library').scrollIntoView({behavior:'smooth'}); }
  };
  $('.toolbar').append(options);
}
function syncSound() {
  $('#sound').textContent = engine.muted ? '♪ Activar sonido' : '♪ Silenciar';
  $('#sound').setAttribute('aria-pressed', String(!engine.muted));
}
function unlockGameAudio() {
  if (!autoSoundPending || !engine.audio || loading) return;
  autoSoundPending = false;
  engine.enableAudio().then(() => { engine.setMuted(false); syncSound(); })
    .catch(() => { autoSoundPending = true; });
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
function render() {
  $('#count').textContent = String(catalog.length).padStart(2, '0');
  const games = catalog.filter(g => (filter === 'all' || g.system === filter) && g.title.toLocaleLowerCase().includes($('#search').value.toLocaleLowerCase()));
  $('#games').replaceChildren();
  if (!games.length) {
    const box = document.createElement('div'); box.className = 'empty-library';
    const title = document.createElement('strong'); title.textContent = catalog.length ? 'No encontramos ese cartucho' : 'Una biblioteca por descubrir';
    const p = document.createElement('p'); p.textContent = catalog.length ? 'Prueba otro nombre o cambia el filtro.' : 'Abre una ROM de tu dispositivo para jugar. Los juegos publicados aparecerán aquí.';
    box.append(title,p); $('#games').append(box);
  }
  for (const game of games) {
    const button = document.createElement('button'); button.className = 'game-card'; button.dataset.system = game.system;
    button.classList.toggle('selected', current?.id === game.id); button.setAttribute('aria-label', `Jugar ${game.title}`);
    const art = document.createElement('span'); art.className = 'game-art'; art.textContent = '▦';
    const info = document.createElement('span'); info.className = 'game-info';
    const title = document.createElement('strong'); title.textContent = game.title;
    const meta = document.createElement('small'); meta.textContent = `${game.system === 'gbc' ? 'GAME BOY COLOR' : 'GAME BOY'} · ${Math.round(game.size / 1024)} KB`;
    const arrow = document.createElement('span'); arrow.textContent = '↗'; info.append(title,meta); button.append(art,info,arrow);
    button.onclick = () => loadGame(game); $('#games').append(button);
  }
}
async function loadGame(game, localBytes) {
  if (loading) return;
  loading = true; save(); release(); engine.pause(); updatePause(); controlsEnabled(false); status(`Cargando ${game.title}…`);
  try {
    let bytes = localBytes;
    if (!bytes) { const response = await fetch(romUrl(game.file, document.baseURI)); if (!response.ok) throw new Error(`No se encontró la ROM (${response.status}).`); bytes = new Uint8Array(await response.arrayBuffer()); }
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
    if (!document.hidden) engine.play(); controlsEnabled(true); render();
    status(storageError ? 'No se pudo restaurar el guardado local. Exporta una copia al terminar.' : `${game.title} · ${restored ? 'Partida restaurada' : 'Listo para jugar'}${engine.muted ? (directPlay ? ' · Sonido al tocar un control' : ' · Toca ♪ para activar el sonido') : ''}`);
  } catch (error) {
    document.body.classList.remove('direct-play'); status(error.message || 'No se pudo cargar el juego.');
    if (!engine.e) { current = null; $('#power').classList.remove('on'); $('#screen-empty').hidden = false; }
    controlsEnabled(!!engine.e);
  } finally { loading = false; updatePause(); }
}
$('#search').oninput = render;
document.querySelectorAll('[data-filter]').forEach(button => button.onclick = () => { filter = button.dataset.filter; document.querySelectorAll('[data-filter]').forEach(b => b.setAttribute('aria-pressed',String(b === button))); render(); });
$('#rom-file').onchange = async event => {
  const file = event.target.files[0]; event.target.value = ''; if (!file || loading) return;
  if (!/\.(gb|gbc)$/i.test(file.name) || file.size > 8388608) { status('Elige una ROM .gb o .gbc sin comprimir, de hasta 8 MiB.'); return; }
  await loadGame({title:file.name.replace(/\.(gb|gbc)$/i,''),id:null},new Uint8Array(await file.arrayBuffer()));
};
function togglePause() { if (!engine.e || loading) return; release(); if (engine.running) { engine.pause(); save(); status('Juego en pausa. Tu aventura puede esperar.'); } else { engine.play(); status(`${current.title} · Jugando`); } updatePause(); }
$('#pause').onclick = togglePause;
$('#sound').onclick = async () => {
  autoSoundPending = false;
  if (!engine.audio) { status('Primero carga un juego para activar el sonido.'); return; }
  try { await engine.enableAudio(); engine.setMuted(!engine.muted); syncSound(); }
  catch { status('El navegador no pudo activar el audio. Inténtalo de nuevo.'); }
};
$('#fullscreen').onclick = async () => {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else if ($('.play-area').requestFullscreen) await $('.play-area').requestFullscreen(); else { $('.play-area').scrollIntoView({behavior:'smooth'}); status('Este navegador no permite pantalla completa.'); } } catch { status('Pantalla completa no disponible en este navegador.'); }
};
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
    const responses = await Promise.all([fetch('config.json'),fetch('roms/catalog.json')]);
    if (responses.some(r => !r.ok)) throw new Error('No se pudo leer la configuración o el catálogo.');
    const [config,games] = await Promise.all(responses.map(r => r.json()));
    if (!Array.isArray(games)) throw new Error('El catálogo debe ser una lista JSON.');
    catalog = games; brand = config.brand || brand; $('#description').textContent = config.description || $('#description').textContent;
    render(); const requested = new URL(location.href).searchParams.get('rom');
    if (requested) { const game = catalog.find(g => g.id === requested); if (game) await loadGame(game); else { document.body.classList.remove('direct-play'); status('Ese juego no está en la biblioteca. Elige otro cartucho.'); } }
  } catch(error) { document.body.classList.remove('direct-play'); render(); status(error.message); }
}
boot();

