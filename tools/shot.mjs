// Captura de pantalla de la página de desarrollo: node tools/shot.mjs "query" salida.png [ancho alto]
import { createRequire } from 'node:module';
const require = createRequire('/home/claude/.npm-global/lib/node_modules/');
const { chromium } = require('playwright');
const [, , query, out, w = '900', h = '1200'] = process.argv;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
const errs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); });
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
await page.goto('http://127.0.0.1:5173/dev.html?' + query, { waitUntil: 'load' });
try { await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 }); } catch (e) { errs.push('timeout'); }
await page.waitForTimeout(300);
await page.screenshot({ path: out });
if (errs.length) console.log(errs.slice(0, 10).join('\n'));
await browser.close();
