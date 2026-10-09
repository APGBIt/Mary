// Genera icon-192.png e icon-512.png a partir de public/icon.svg con Chromium.
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire('/home/claude/.npm-global/lib/node_modules/');
const { chromium } = require('playwright');
const svg = fs.readFileSync(new URL('../public/icon.svg', import.meta.url), 'utf8');
const browser = await chromium.launch();
for (const n of [192, 512]) {
  const page = await browser.newPage({ viewport: { width: n, height: n } });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${n}" height="${n}" `)}</body></html>`);
  await page.screenshot({ path: new URL(`../public/icon-${n}.png`, import.meta.url).pathname, omitBackground: true });
  await page.close();
}
await browser.close();
console.log('iconos listos');
