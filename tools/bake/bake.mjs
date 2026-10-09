// Hornea el modelo anatómico de Mary: genera todas las capas, las comprime con meshoptimizer
// y escribe public/anatomy.bin (gzip). Uso: node tools/bake/bake.mjs [capa ...]
// Si se indican capas, solo esas se regeneran; las demás se toman de la caché.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { MeshoptEncoder } from 'meshoptimizer';
import { ATLAS } from '../../src/anatomy/atlas.js';

await MeshoptEncoder.ready;
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const cacheDir = path.join(here, 'cache');
fs.mkdirSync(cacheDir, { recursive: true });

export const LAYERS = ['skin', 'shell', 'musSup', 'musDeep', 'bone', 'organ', 'cns', 'art', 'ven', 'nerve'];
const builders = {
  bone: async () => (await import('./skeleton.js')).buildSkeleton(),
  skin: async () => (await import('./skin.js')).buildSkin(),
  shell: async () => (await import('./skin.js')).buildShell(),
  musSup: async () => (await import('./muscles.js')).buildMuscles('sup'),
  musDeep: async () => (await import('./muscles.js')).buildMuscles('deep'),
  organ: async () => (await import('./organs.js')).buildOrgans(),
  cns: async () => (await import('./nervous.js')).buildCNS(),
  art: async () => (await import('./vessels.js')).buildArteries(),
  ven: async () => (await import('./vessels.js')).buildVeins(),
  nerve: async () => (await import('./nervous.js')).buildNerves(),
};

const POS_Q = 200, UV_Q = 256, STRIDE = 24;

function encode(g) {
  const nv0 = g.nv;
  const idx = Uint32Array.from(g.I);
  const [remap, nv] = MeshoptEncoder.reorderMesh(idx, true, false);
  const buf = new ArrayBuffer(nv * STRIDE), dv = new DataView(buf);
  const q16 = (x) => Math.max(-32767, Math.min(32767, Math.round(x)));
  const q8 = (x) => Math.max(-127, Math.min(127, Math.round(x * 127)));
  // anclas por estructura (centroide de sus vértices, con los pesos del vértice más cercano)
  const acc = new Map();
  for (let i = 0; i < nv0; i++) {
    const j = remap[i];
    if (j === 0xffffffff) continue;
    const o = j * STRIDE;
    dv.setInt16(o, q16(g.P[i * 3] * POS_Q), true); dv.setInt16(o + 2, q16(g.P[i * 3 + 1] * POS_Q), true); dv.setInt16(o + 4, q16(g.P[i * 3 + 2] * POS_Q), true);
    dv.setInt8(o + 8, q8(g.N[i * 3])); dv.setInt8(o + 9, q8(g.N[i * 3 + 1])); dv.setInt8(o + 10, q8(g.N[i * 3 + 2]));
    dv.setUint8(o + 11, Math.round(Math.max(0, Math.min(1, g.A[i])) * 255));
    dv.setInt16(o + 12, q16(g.T[i * 2] * UV_Q), true); dv.setInt16(o + 14, q16(g.T[i * 2 + 1] * UV_Q), true);
    dv.setUint8(o + 16, g.W[i * 3]); dv.setUint8(o + 17, g.W[i * 3 + 1]); dv.setUint8(o + 18, Math.round(g.W[i * 3 + 2] * 255));
    dv.setUint8(o + 19, g.D[i]);
    dv.setUint16(o + 20, g.S[i], true);
    const key = g.S[i] * 2 + g.D[i];
    let a = acc.get(key); if (!a) { a = { n: 0, x: 0, y: 0, z: 0, pts: [] }; acc.set(key, a); }
    a.n++; a.x += g.P[i * 3]; a.y += g.P[i * 3 + 1]; a.z += g.P[i * 3 + 2];
    if (a.pts.length < 400 || Math.random() < 0.02) a.pts.push(i);
  }
  const anchors = [];
  for (const [key, a] of acc) {
    const c = [a.x / a.n, a.y / a.n, a.z / a.n];
    // vértice real más cercano al centroide (para que la etiqueta caiga sobre la estructura)
    let best = a.pts[0], bd = 1e9;
    for (const i of a.pts) { const d = (g.P[i * 3] - c[0]) ** 2 + (g.P[i * 3 + 1] - c[1]) ** 2 + (g.P[i * 3 + 2] - c[2]) ** 2; if (d < bd) { bd = d; best = i; } }
    anchors.push({ sid: key >> 1, side: key & 1, n: a.n, p: [g.P[best * 3], g.P[best * 3 + 1], g.P[best * 3 + 2]].map((x) => Math.round(x * 100) / 100), w: [g.W[best * 3], g.W[best * 3 + 1], Math.round(g.W[best * 3 + 2] * 1000) / 1000] });
  }
  const venc = MeshoptEncoder.encodeVertexBuffer(new Uint8Array(buf), nv, STRIDE);
  const ienc = MeshoptEncoder.encodeIndexBuffer(new Uint8Array(idx.buffer), idx.length, 4);
  return { nv, ni: idx.length, venc, ienc, anchors };
}

const want = process.argv.slice(2);
const todo = want.length ? want : LAYERS;
for (const name of todo) {
  if (!builders[name]) { console.error('Capa desconocida:', name); process.exit(1); }
  const t0 = Date.now();
  globalThis.__bakeLog = [];
  let g;
  try { g = await builders[name](); } catch (e) {
    if (e.code === 'ERR_MODULE_NOT_FOUND' && !want.length) { console.log(`- ${name}: (sin módulo todavía)`); continue; }
    throw e;
  }
  const enc = encode(g);
  const meta = { nv: enc.nv, ni: enc.ni, vlen: enc.venc.length, ilen: enc.ienc.length, anchors: enc.anchors };
  fs.writeFileSync(path.join(cacheDir, name + '.json'), JSON.stringify(meta));
  fs.writeFileSync(path.join(cacheDir, name + '.bin'), Buffer.concat([Buffer.from(enc.venc), Buffer.from(enc.ienc)]));
  if (process.env.BAKE_VERBOSE) { const lg = globalThis.__bakeLog.slice().sort((a, b) => b[2] - a[2]).slice(0, 12); for (const [l, a, b] of lg) console.log(`    ${l}: ${a} -> ${b}`); }
  console.log(`- ${name}: ${enc.nv} vértices, ${enc.ni / 3} triángulos, ${((enc.venc.length + enc.ienc.length) / 1024).toFixed(0)} KB (${Date.now() - t0} ms)`);
}

// Ensambla el archivo final con las capas disponibles en caché
const header = { v: 4, posQ: POS_Q, uvQ: UV_Q, stride: STRIDE, structures: ATLAS.length, layers: [], anchors: [] };
const chunks = [];
let off = 0;
for (const name of LAYERS) {
  const mp = path.join(cacheDir, name + '.json');
  if (!fs.existsSync(mp)) continue;
  const meta = JSON.parse(fs.readFileSync(mp, 'utf8'));
  const bin = fs.readFileSync(path.join(cacheDir, name + '.bin'));
  header.layers.push({ name, nv: meta.nv, ni: meta.ni, vOff: off, vLen: meta.vlen, iOff: off + meta.vlen, iLen: meta.ilen });
  for (const a of meta.anchors) header.anchors.push({ ...a, layer: name });
  chunks.push(bin); off += bin.length;
}
const hj = Buffer.from(JSON.stringify(header));
const pad = (4 - ((8 + hj.length) % 4)) % 4;
const head = Buffer.alloc(8); head.write('MARY', 0); head.writeUInt32LE(hj.length + pad, 4);
const all = Buffer.concat([head, hj, Buffer.alloc(pad, 32), ...chunks]);
const gz = zlib.gzipSync(all, { level: 9 });
fs.writeFileSync(path.join(root, 'public', 'anatomy.bin'), gz);
console.log(`anatomy.bin: ${(all.length / 1048576).toFixed(2)} MB sin comprimir, ${(gz.length / 1048576).toFixed(2)} MB gzip — capas: ${header.layers.map((l) => l.name).join(', ')}`);
