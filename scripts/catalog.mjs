import {readdir, readFile, writeFile} from 'node:fs/promises';
import {resolve, relative, extname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {validateRom} from '../rom-utils.js';
export async function buildCatalog(root = process.cwd()) {
  const config = JSON.parse(await readFile(resolve(root,'config.json'),'utf8'));
  const entries = [], ids = new Set();
  async function walk(dir) {
    for (const entry of await readdir(dir,{withFileTypes:true})) {
      const full = resolve(dir,entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile() && /\.(gb|gbc)$/i.test(entry.name)) {
        const file = relative(root,full).replaceAll('\\','/'), bytes = new Uint8Array(await readFile(full));
        let system; try { system = validateRom(bytes); } catch(error) { throw new Error(`${file}: ${error.message}`); }
        const override = config.games?.[file] || {};
        const id = override.id || file.slice(5,-extname(file).length).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
        if (!id || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) throw new Error(`ID inválido (${JSON.stringify(id)}) para ${file}. Usa letras minúsculas sin acentos, números y guiones en games["${file}"].id de config.json.`);
        if (ids.has(id)) throw new Error(`ID duplicado: ${id}. Define un id diferente en config.json.`);
        ids.add(id);
        entries.push({id,title:override.title || entry.name.slice(0,-extname(file).length).replace(/[_-]/g,' '),file,system,size:bytes.length});
      }
    }
  }
  await walk(resolve(root,'roms')); entries.sort((a,b) => a.title.localeCompare(b.title,'es'));
  await writeFile(resolve(root,'roms/catalog.json'),JSON.stringify(entries,null,2)+'\n'); return entries;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const games = await buildCatalog(); console.log(`Catálogo generado: ${games.length} juegos.`);
}
