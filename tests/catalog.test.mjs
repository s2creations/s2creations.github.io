import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildCatalog} from '../scripts/catalog.mjs';
import {validateRom,romUrl} from '../rom-utils.js';
import {fixture} from './fixtures.mjs';
test('detects hardware from cartridge header, validates corrupt input',() => {
  assert.equal(validateRom(fixture()),'gb'); assert.equal(validateRom(fixture(true)),'gbc');
  assert.throws(() => validateRom(new Uint8Array(8))); const bad = fixture(); bad[0x134]++; assert.throws(() => validateRom(bad));
});
test('URLs stay inside project paths and encode filenames',() => {
  assert.equal(romUrl('roms/Mi juego #1.gbc','https://example.org/gb/').href,'https://example.org/gb/roms/Mi%20juego%20%231.gbc');
  for (const path of ['../a.gb','roms/../a.gb','https://evil.test/a.gb','roms/a.zip']) assert.throws(() => romUrl(path,'https://example.org/gb/'));
});
test('catalog scans subfolders, overrides names, detects collisions',async () => {
  const root = await mkdtemp(join(tmpdir(),'s2-gb-'));
  try {
    await mkdir(join(root,'roms','color'),{recursive:true});
    await writeFile(join(root,'config.json'),JSON.stringify({games:{'roms/color/Test.gbc':{id:'color-demo',title:'Mi juego'}}}));
    await writeFile(join(root,'roms','Classic.gb'),fixture()); await writeFile(join(root,'roms','color','Test.gbc'),fixture(true));
    const games = await buildCatalog(root); assert.equal(games.length,2); assert.equal(games[1].id,'color-demo'); assert.equal(games[1].system,'gbc');
    await writeFile(join(root,'roms','Classic.gbc'),fixture()); await assert.rejects(buildCatalog(root),/duplicado/);
  } finally { await rm(root,{recursive:true,force:true}); }
});
