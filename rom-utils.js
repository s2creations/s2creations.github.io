export function validateRom(bytes) {
  if (bytes.length < 32768 || bytes.length > 8 * 1024 * 1024) throw new Error('La ROM debe tener entre 32 KiB y 8 MiB.');
  let sum = 0; for (let i = 0x134; i <= 0x14c; i++) sum = (sum - bytes[i] - 1) & 255;
  if (sum !== bytes[0x14d]) throw new Error('La cabecera de esta ROM no es válida. Usa un archivo .gb o .gbc sin comprimir.');
  return bytes[0x143] === 0x80 || bytes[0x143] === 0xc0 ? 'gbc' : 'gb';
}
export function romUrl(path, base) {
  if (typeof path !== 'string' || !path.startsWith('roms/') || path.split('/').some(s => s === '..' || s === '.') || path.includes('\\') || !/\.(gb|gbc)$/i.test(path)) throw new Error('Ruta de ROM inválida en el catálogo.');
  return new URL(path.split('/').map(encodeURIComponent).join('/'), base);
}
