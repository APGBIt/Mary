// Crea docs/mary.html: Mary completa en un solo archivo que se abre sin servidor ni internet.
// Lleva dentro la app, el modelo anatómico y el detector de cuerpo (comprimidos).
// Uso: npm run build && node tools/make-single.mjs
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docs = path.join(root, 'docs');
let html = fs.readFileSync(path.join(docs, 'index.html'), 'utf8');
const js = /<script type="module" crossorigin src="\.\/(assets\/[^"]+\.js)"><\/script>/.exec(html);
const css = /<link rel="stylesheet" crossorigin href="\.\/(assets\/[^"]+\.css)">/.exec(html);
if (!js || !css) throw new Error('No encuentro los archivos compilados en docs/index.html');
const code = fs.readFileSync(path.join(docs, js[1]), 'utf8').replace(/<\/script/g, '<\\/script');
const style = fs.readFileSync(path.join(docs, css[1]), 'utf8');
const assets = [
  ['anatomy.bin', 'application/octet-stream', false],
  ['pose.js', 'text/javascript', true], ['pose_solution_packed_assets_loader.js', 'text/javascript', true],
  ['pose_solution_simd_wasm_bin.js', 'text/javascript', true], ['pose_solution_simd_wasm_bin.wasm', 'application/wasm', true],
  ['pose_solution_packed_assets.data', 'application/octet-stream', true], ['pose_web.binarypb', 'application/octet-stream', true],
  ['pose_landmark_full.tflite', 'application/octet-stream', true],
];
const parts = assets.map(([name, mime, gz]) => {
  const src = name === 'anatomy.bin' ? path.join(docs, name) : path.join(docs, 'mediapipe', name);
  let buf = fs.readFileSync(src);
  if (gz) buf = zlib.gzipSync(buf, { level: 9 });
  return `[${JSON.stringify(name)},${JSON.stringify(mime)},${gz ? 1 : 0},"${buf.toString('base64')}"]`;
});
const loader = `<script>
(function(){
  var L=[${parts.join(',\n')}];
  var A=window.__MARY_ASSETS={};
  function bytes(b){var s=atob(b),n=s.length,u=new Uint8Array(n);for(var i=0;i<n;i++)u[i]=s.charCodeAt(i);return u;}
  window.__MARY_READY=Promise.all(L.map(function(e){
    var blob=new Blob([bytes(e[3])]);
    var p=e[2]?new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer():blob.arrayBuffer();
    return p.then(function(ab){A[e[0]]=URL.createObjectURL(new Blob([ab],{type:e[1]}));});
  })).then(function(){L=null;});
})();
</script>`;
const icon = 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(docs, 'icon.svg')).toString('base64');
html = html
  .replace(js[0], '')
  .replace(css[0], () => `<style>${style}</style>`)
  .replace(/<link rel="manifest"[^>]*>/, '')
  .replace(/<link rel="apple-touch-icon"[^>]*>/, '')
  .replaceAll('./icon.svg', icon)
  .replace('</body>', () => `${loader}\n<script type="module">${code}</script>\n</body>`);
fs.writeFileSync(path.join(docs, 'mary.html'), html);
console.log('docs/mary.html:', (fs.statSync(path.join(docs, 'mary.html')).size / 1048576).toFixed(1), 'MB');
