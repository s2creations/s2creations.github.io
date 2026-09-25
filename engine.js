// Adapter for binjgb (MIT). See vendor/LICENSE.binjgb.
export class PocketEngine {
  static modulePromise;
  constructor(canvas, onError) { this.ctx = canvas.getContext('2d'); this.onError = onError; this.running = false; this.e = 0; this.sources = new Set(); this.muted = true; }
  async load(bytes) {
    this.destroy();
    PocketEngine.modulePromise ||= Binjgb({locateFile: name => new URL(`vendor/${name}`, import.meta.url).href});
    try { this.m = await PocketEngine.modulePromise; } catch (error) { PocketEngine.modulePromise = null; throw error; }
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    this.audio ||= AudioCtor ? new AudioCtor() : null;
    if (this.audio && !this.gain) { this.gain = this.audio.createGain(); this.gain.connect(this.audio.destination); }
    const size = (bytes.length + 32767) & ~32767;
    this.ptr = this.m._malloc(size);
    if (!this.ptr) throw new Error('No hay memoria suficiente para esta ROM.');
    this.m.HEAPU8.fill(0, this.ptr, this.ptr + size); this.m.HEAPU8.set(bytes, this.ptr);
    this.e = this.m._emulator_new_simple(this.ptr, size, this.audio?.sampleRate || 44100, 2048, 2);
    if (!this.e) { this.m._free(this.ptr); this.ptr = 0; throw new Error('ROM incompatible o dañada.'); }
    this.joy = this.m._joypad_new(); this.m._emulator_set_default_joypad_callback(this.e, this.joy);
    this.m._emulator_set_builtin_palette(this.e, 79);
    this.image = this.ctx.createImageData(160, 144); this.audioTime = 0; this.setMuted(this.muted); this.draw();
  }
  input(key, pressed) { if (this.e) this.m[`_set_joyp_${key}`](this.e, Number(pressed)); }
  release() { for (const key of ['up','down','left','right','A','B','start','select']) this.input(key, false); }
  draw() { const ptr = this.m._get_frame_buffer_ptr(this.e); this.image.data.set(this.m.HEAPU8.subarray(ptr, ptr + 160 * 144 * 4)); this.ctx.putImageData(this.image, 0, 0); }
  play() { if (!this.e || this.running) return; this.running = true; this.last = 0; this.raf = requestAnimationFrame(t => this.tick(t)); }
  pause() { this.running = false; cancelAnimationFrame(this.raf); this.release(); this.clearAudio(); }
  tick(now) {
    if (!this.running) return;
    try {
      const dt = this.last ? Math.min((now - this.last) / 1000, 0.05) : 1 / 60; this.last = now;
      const target = this.m._emulator_get_ticks_f64(this.e) + dt * 4194304;
      let event = 0;
      while (!(event & 4)) { event = this.m._emulator_run_until_f64(this.e, target); if (event & 1) this.draw(); if (event & 2) this.pushAudio(); }
      this.dirty ||= !!this.m._emulator_was_ext_ram_updated(this.e);
      this.raf = requestAnimationFrame(t => this.tick(t));
    } catch (error) { this.pause(); this.onError(error); }
  }
  async enableAudio() { if (this.audio) await this.audio.resume(); }
  setMuted(muted) { this.muted = muted; if (this.gain) this.gain.gain.value = muted ? 0 : 0.65; }
  clearAudio() { for (const source of this.sources) { try { source.stop(); } catch {} } this.sources.clear(); this.audioTime = 0; }
  pushAudio() {
    if (!this.audio || this.muted || this.audio.state !== 'running') return;
    const now = this.audio.currentTime; if (this.audioTime > now + 0.3) return;
    this.audioTime = Math.max(this.audioTime, now + 0.035);
    const buffer = this.audio.createBuffer(2, 2048, this.audio.sampleRate), ptr = this.m._get_audio_buffer_ptr(this.e);
    for (let ch = 0; ch < 2; ch++) { const data = buffer.getChannelData(ch); for (let i = 0; i < 2048; i++) data[i] = this.m.HEAPU8[ptr + i * 2 + ch] / 255; }
    const source = this.audio.createBufferSource(); source.buffer = buffer; source.connect(this.gain); this.sources.add(source); source.onended = () => this.sources.delete(source);
    source.start(this.audioTime); this.audioTime += 2048 / this.audio.sampleRate;
  }
  ram(data) {
    if (!this.e) return new Uint8Array();
    const file = this.m._ext_ram_file_data_new(this.e);
    try {
      const size = this.m._get_file_data_size(file), ptr = this.m._get_file_data_ptr(file);
      if (data) { if (data.length !== size) throw new Error('La partida no corresponde al tamaño de memoria de este juego.'); this.m.HEAPU8.set(data, ptr); if (this.m._emulator_read_ext_ram(this.e, file) !== 0) throw new Error('No se pudo restaurar la partida.'); this.dirty = true; }
      else { if (this.m._emulator_write_ext_ram(this.e, file) !== 0) throw new Error('No se pudo leer la partida.'); return this.m.HEAPU8.slice(ptr, ptr + size); }
    } finally { this.m._file_data_delete(file); }
  }
  destroy() { this.pause(); if (this.e) { this.m._emulator_delete(this.e); this.m._joypad_delete(this.joy); this.m._free(this.ptr); } this.e = 0; this.ptr = 0; this.dirty = false; }
}
