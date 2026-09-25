import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {fixture} from './fixtures.mjs';
const {chromium} = createRequire(import.meta.url)('playwright');
const root = resolve('.');
const types = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.svg':'image/svg+xml'};
const catalog = [{id:'test-classic',title:'Classic Test',file:'roms/test.gb',system:'gb',size:32768},{id:'test-color',title:'Color Test',file:'roms/test.gbc',system:'gbc',size:32768}];
const server = createServer(async (req,res) => {
  try {
    const path = decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/project\//,'');
    if (path === 'roms/catalog.json') { res.setHeader('Content-Type','application/json'); res.end(JSON.stringify(catalog)); return; }
    if (/^roms\/test\.gbc?$/.test(path)) { res.end(fixture(path.endsWith('gbc'))); return; }
    const full = resolve(root,path || 'index.html'); if (!full.startsWith(root)) throw Error('path');
    res.setHeader('Content-Type',types[extname(full)] || 'application/octet-stream'); res.end(await readFile(full));
  } catch { res.writeHead(404); res.end('Not found'); }
});
await new Promise(r => server.listen(0,'127.0.0.1',r));
const url = `http://127.0.0.1:${server.address().port}/project/`;
let browser;
try {
  browser = await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL || 'msedge'});
  const page = await browser.newPage(); const errors = []; page.on('pageerror',e => errors.push(e.message));
  await page.goto(url+'?rom=test-classic'); await page.waitForSelector('#power.on');
  assert.equal(await page.locator('.intro').isVisible(),false);
  assert.equal(await page.locator('.library').isVisible(),false);
  await page.locator('[data-key="A"]').click();
  await page.waitForFunction(() => document.querySelector('#sound').getAttribute('aria-pressed') === 'true');
  await mkdir('.test-output',{recursive:true});
  for (const [width,height] of [[320,568],[320,640],[390,844],[768,1024],[844,390]]) {
    await page.setViewportSize({width,height});
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.ok(await page.locator('[data-key="start"]').evaluate(b => b.getBoundingClientRect().bottom <= innerHeight), 'Start visible without scrolling');
    for (const key of ['A','B','start','select','up']) {
      const bounds = await page.locator(`[data-key="${key}"]`).boundingBox();
      assert.ok(bounds.width >= 44 && bounds.height >= 44, `${key} has a 44px touch target at ${width}`);
    }
    assert.ok(await page.locator('.toolbar').evaluate(b => b.getBoundingClientRect().bottom <= innerHeight),'toolbar fits viewport');
    await page.screenshot({path:`.test-output/player-${width}-${height}.png`});
  }
  const padBox = await page.locator('.dpad').boundingBox();
  await page.mouse.move(padBox.x + 10, padBox.y + padBox.height / 2); await page.mouse.down();
  assert.equal(await page.locator('[data-key="left"]').evaluate(b => b.classList.contains('pressed')),true);
  await page.mouse.move(padBox.x + padBox.width - 10,padBox.y + 10);
  assert.equal(await page.locator('[data-key="left"]').evaluate(b => b.classList.contains('pressed')),false);
  assert.equal(await page.locator('[data-key="up"]').evaluate(b => b.classList.contains('pressed')),true);
  assert.equal(await page.locator('[data-key="right"]').evaluate(b => b.classList.contains('pressed')),true);
  await page.mouse.up(); assert.equal(await page.locator('.dpad .pressed').count(),0);
  await page.getByRole('button',{name:'Partidas y ayuda',exact:true}).click();
  assert.equal(await page.locator('.save-panel').isVisible(),true);
  await page.locator('.help-link').click();
  await page.setViewportSize({width:1280,height:900});
  await page.waitForSelector('.game-card');
  assert.equal(await page.locator('.intro').isVisible(),true);
  await page.getByRole('button',{name:'Jugar Classic Test',exact:true}).click();
  await page.waitForSelector('#power.on');
  await page.waitForTimeout(2500);
  assert.match(await page.title(),/Classic Test/);
  const saved = await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('s2-pocket:ram:')).map(k => JSON.parse(localStorage[k])));
  assert.equal(saved.length,1); assert.equal(saved[0][0],0x42);
  const colors = await page.locator('canvas').evaluate(c => new Set(c.getContext('2d').getImageData(0,0,160,144).data).size);
  assert.ok(colors > 2,'emulated frame has drawn pixels');
  await page.getByRole('button',{name:'Ⅱ Pausar',exact:true}).click(); await page.getByRole('button',{name:'▶ Continuar',exact:true}).click();
  await page.getByRole('button',{name:'♪ Activar sonido',exact:true}).click(); await page.waitForFunction(() => document.querySelector('#sound').getAttribute('aria-pressed') === 'true');
  await page.getByRole('button',{name:'Jugar Color Test',exact:true}).click(); await page.waitForSelector('.console.color');
  await page.waitForTimeout(150); assert.ok(await page.locator('canvas').evaluate(c => new Set(c.getContext('2d').getImageData(0,0,160,144).data).size > 2), 'color frame has drawn pixels'); assert.match(page.url(),/rom=test-color/); assert.match(await page.title(),/Color Test/);
  await page.waitForTimeout(2300); assert.equal(await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('s2-pocket:ram:')).length),2);
  await page.reload(); await page.waitForSelector('#power.on'); assert.match(await page.locator('#status').innerText(),/restaurada/);
  await page.goto(url); await page.getByRole('button',{name:'Jugar Color Test',exact:true}).click(); await page.waitForSelector('#power.on');
  await page.locator('#search').fill('nonexistent'); assert.equal(await page.locator('.game-card').count(),0); await page.locator('#search').fill('');
  await mkdir('.test-output',{recursive:true});
  for (const [width,height] of [[320,640],[390,844],[768,1024],[1440,1000],[844,390]]) {
    await page.setViewportSize({width,height});
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),`no overflow at ${width}`);
    await page.screenshot({path:`.test-output/${width}.png`,fullPage:true});
  }
  const downloadPromise = page.waitForEvent('download'); await page.locator('#export').click(); const download = await downloadPromise; await download.saveAs('.test-output/backup.sav');
  page.on('dialog',dialog => dialog.accept()); await page.locator('#save-file').setInputFiles('.test-output/backup.sav'); await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Partida importada'));
  await page.locator('#rom-file').setInputFiles({name:'bad.gb',mimeType:'application/octet-stream',buffer:Buffer.alloc(100)}); await page.waitForFunction(() => document.querySelector('#status').textContent.includes('32 KiB'));
  await page.locator('#rom-file').setInputFiles({name:'local.gb',mimeType:'application/octet-stream',buffer:Buffer.from(fixture())}); await page.waitForFunction(() => document.title.includes('local')); assert.ok(!page.url().includes('?rom='));
  await page.goto(url+'?rom=missing'); await page.waitForFunction(() => document.querySelector('#status').textContent.includes('no está'));
  assert.deepEqual(errors,[]); console.log('PASS: GB/GBC execution, pixels, sound control, saves, reload, import/export, local ROM, invalid ROM, deep links, filters, five responsive viewports.');
} finally { await browser?.close(); server.close(); }



