// Prueba de la interfaz en modo teléfono con Chromium: node tools/ui.mjs <url> <prefijo> [pasos...]
// Pasos: home | demo | tap:x,y | view:<id> | names | photo:<archivo> | wait:ms | shot:<nombre> | eval:<js> | size:WxH
import { createRequire } from 'node:module';
const require = createRequire('/home/claude/.npm-global/lib/node_modules/');
const { chromium } = require('playwright');
const [, , base, prefix, ...steps] = process.argv;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
let W = 390, H = 844;
const sz = steps.find((s) => s.startsWith('size:')); if (sz) [W, H] = sz.slice(5).split('x').map(Number);
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errs = [];
page.on('console', (m) => { if (m.type() === 'error' || (m.type() === 'warning' && !/Clock|GPU stall|swiftshader|WebGL/i.test(m.text()))) errs.push(m.type() + ': ' + m.text()); });
page.on('pageerror', (e) => errs.push('pageerror: ' + e));
const t0 = Date.now();
await page.goto(base);
await page.waitForFunction(() => window.__mary && window.__mary.ready, null, { timeout: 90000 });
console.log('cargada en', Date.now() - t0, 'ms');
let n = 0;
for (const st of steps) {
  const [k, ...rest] = st.split(':'); const arg = rest.join(':');
  if (k === 'size') continue;
  if (k === 'demo') { await page.click('#btnDemo'); await page.waitForTimeout(600); }
  else if (k === 'tap') { const [x, y] = arg.split(',').map(Number); await page.touchscreen.tap(x, y); await page.waitForTimeout(500); }
  else if (k === 'click') { await page.click(arg); await page.waitForTimeout(400); }
  else if (k === 'view') { await page.click(`#views [data-v="${arg}"]`); await page.waitForTimeout(500); }
  else if (k === 'names') { await page.click('#btnNames'); await page.waitForTimeout(700); }
  else if (k === 'photo') {
    const t1 = Date.now();
    await page.setInputFiles('#filePhoto', arg);
    await page.waitForFunction(() => window.__mary.S.mode === 'photo' && !document.querySelector('#hint').hidden && !/Buscando/.test(document.querySelector('#hint').textContent), null, { timeout: 120000 });
    console.log('foto procesada en', Date.now() - t1, 'ms; detectada:', await page.evaluate(() => window.__mary.S.detected));
    await page.waitForTimeout(500);
  }
  else if (k === 'wait') await page.waitForTimeout(+arg);
  else if (k === 'eval') console.log('eval:', JSON.stringify(await page.evaluate(arg)));
  else if (k === 'shot') { await page.waitForTimeout(250); await page.screenshot({ path: `${prefix}_${arg || n++}.png`, timeout: 180000 }); }
  else console.log('paso desconocido', st);
}
console.log(errs.length ? 'ERRORES:\n' + errs.slice(0, 20).join('\n') : 'sin errores');
await browser.close();
