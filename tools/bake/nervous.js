// Inervación de Mary: sistema nervioso central (capa "cns": encéfalo, cerebelo, tronco encefálico,
// médula y cola de caballo) y nervios periféricos (capa "nerve"). Lado izquierdo con +x; los pares se reflejan.
import { Geo, addSDF } from './builder.js';
import { headW, trunkW, VERT, canalAt } from './body.js';
import { sdEllipsoid, sdCapsule, smin, smax, noise3 } from './sdf.js';
import { tubeSDF, ESOPH } from './viscera.js';
import { A, Lg, WT, WH, WHEAD, WA, WL, SK, HE, tube, ribPath, fingerPath, add, madd, clamp } from './paths.js';
import { S } from './paths.js';

const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// ------------------------------------------------------------ encéfalo
function brainFloor(x, z) {
  const ax = Math.abs(x);
  const ant = 71.0 + Math.max(0, z - 3.0) * 0.1;          // fosa anterior: techos de las órbitas
  const mid = 67.9 + Math.max(0, 2.4 - ax) * 0.9;          // fosa media: lóbulos temporales (silla turca al centro)
  const post = 69.2 + Math.max(0, -3.5 - z) * 0.1;         // tienda del cerebelo
  const wa = sm(1.6, 3.4, z), wp = 1 - sm(-3.6, -1.6, z);
  return ant * wa + post * wp + mid * (1 - wa - wp);
}
function brainSDF(x, y, z) {
  const ax = Math.abs(x);
  let d = sdEllipsoid(x, y, z, 0, 73.9, -1.0, 6.05, 7.1, 8.35);
  d = smin(d, sdEllipsoid(ax, y, z, 3.3, 75.6, -2.4, 2.7, 3.0, 3.9), 1.6);
  d = smin(d, sdEllipsoid(ax, y, z, 4.5, 69.8, 0.6, 1.8, 1.7, 3.0), 1.2); // polo temporal
  d = smax(d, brainFloor(x, z) - y, 0.7);
  d = smax(d, -Math.max(ax - 0.13, 71.4 - y), 0.22);                       // cisura longitudinal
  d = smax(d, -sdCapsule(ax, y, z, [6.3, 69.9, 3.0], [5.9, 71.6, -2.6], 0.2), 0.22); // cisura lateral (de Silvio)
  d = smax(d, -sdCapsule(ax, y, z, [0.6, 80.6, 0.6], [5.6, 75.6, 1.6], 0.14), 0.18);  // surco central (de Rolando)
  if (d > -1.2 && d < 1.2) d += 0.24 * (Math.abs(noise3(x * 0.6, y * 0.6, z * 0.6)) - 0.3) + 0.09 * (Math.abs(noise3(x * 1.25 + 7, y * 1.25, z * 1.25)) - 0.3);
  return d;
}
function cerebellumSDF(x, y, z) {
  const ax = Math.abs(x);
  let d = sdEllipsoid(ax, y, z, 2.2, 67.6, -5.6, 2.7, 1.85, 2.5);
  d = smin(d, sdEllipsoid(x, y, z, 0, 67.8, -5.0, 1.4, 1.8, 2.3), 0.6);
  d = smax(d, y - 69.0, 0.5);
  d += 0.055 * Math.sin(Math.hypot(x * 0.55, y - 67.0, z + 3.6) * 9.5);
  return d;
}
const STEM = [[0, 71.8, -1.5], [0, 70.2, -1.2], [0, 69.0, -0.9], [0, 67.6, -1.6], [0, 66.2, -2.4], [0, 64.6, -2.8]];
const stemSDF = (x, y, z) => smin(tubeSDF(x, y, z, STEM, [1.1, 1.0, 1.3, 0.95, 0.75, 0.58], 0.5), sdEllipsoid(x, y, z, 0, 68.9, -0.55, 1.5, 1.15, 1.15), 0.5);

// ------------------------------------------------------------ agujeros de conjunción (salida de los nervios raquídeos)
// Nombre del nervio, y, x, z del agujero. Para C1 a C8, entre vértebras; T, L debajo de su vértebra; S por el sacro.
const FOR = [];
{
  const V = VERT;
  FOR.push(['C1', 65.4, 1.6, -1.6]);
  for (let i = 0; i < V.length - 1; i++) {
    const v = V[i], n = V[i + 1];
    const name = i < 6 ? 'C' + (i + 2) : i === 6 ? 'C8' : v.name;
    FOR.push([name, (v.y + n.y) / 2 - 0.15 * v.h, Math.max(v.rx, n.rx) + 0.85, (v.z + n.z) / 2 - 0.7 * v.rz]);
  }
  FOR.push(['L5', 8.7, 3.0, -3.8]);
  FOR.push(['S1', 7.0, 1.9, -5.6], ['S2', 5.4, 1.8, -6.9], ['S3', 3.8, 1.6, -8.0], ['S4', 2.4, 1.4, -8.8], ['S5', 1.2, 0.9, -9.4]);
}
const F = Object.fromEntries(FOR.map((f) => [f[0], [f[2], f[1], f[3]]]));
const CONUS_Y = 20.8;

// ------------------------------------------------------------ SNC
export function buildCNS() {
  const g = new Geo();
  addSDF(g, brainSDF, [-6.6, 66.6, -9.8], [6.6, 81.4, 7.8], 0.11, { w: () => headW(), sid: S('encefalo'), tris: 34000, label: 'encefalo' });
  addSDF(g, cerebellumSDF, [-5.2, 65.2, -8.6], [5.2, 69.6, -2.6], 0.07, { w: () => headW(), sid: S('cerebelo'), tris: 9000, label: 'cerebelo' });
  addSDF(g, stemSDF, [-2.0, 63.8, -4.2], [2.0, 72.8, 0.8], 0.07, { w: (p) => (p[1] > 62.5 ? headW() : trunkW(p)), sid: S('tronco_encefalico'), tris: 4500, label: 'tronco' });
  // médula espinal: engrosamientos cervical y lumbar, cono medular
  const cord = [], cr = [];
  for (let y = 64.6; y >= CONUS_Y - 0.01; y -= 0.8) {
    const p = y > 64 ? [0, y, -2.8] : canalAt(y);
    cord.push(p);
    cr.push(y > 57.5 ? 0.5 : y > 48.5 ? 0.6 : y > 29 ? 0.45 : y > 22.5 ? 0.53 : 0.53 - (22.5 - y) * 0.2);
  }
  tube(g, 'medula', cord, cr, WT, { sides: 10, step: 0.35, minR: 0.12 });
  // cola de caballo: raíces que bajan por el conducto hasta su agujero
  const L = new Geo();
  const roots = ['L2', 'L3', 'L4', 'L5', 'S1', 'S2', 'S3', 'S4'];
  roots.forEach((nm, i) => {
    const f = F[nm], pts = [];
    const off = 0.12 + i * 0.05;
    for (let y = CONUS_Y; y > f[1] + 1.2; y -= 1.4) { const c = canalAt(y); pts.push([off + (CONUS_Y - y) * 0.004, y, c[2] + (i % 2 ? 0.15 : -0.12)]); }
    const last = pts[pts.length - 1] || canalAt(f[1] + 1.2);
    pts.push([last[0] + 0.3, f[1] + 0.5, (last[2] + f[2]) / 2], f);
    tube(L, 'cola_caballo', pts, 0.1, WT, { sides: 5, step: 0.5, minR: 0.09 });
  });
  g.append(L.withMirror());
  const fil = []; for (let y = CONUS_Y; y > 6; y -= 1.5) fil.push(canalAt(y));
  fil.push([0, 3.0, -8.8], [0, 0.0, -9.6]);
  tube(g, 'cola_caballo', fil, 0.08, WT, { sides: 5, minR: 0.08 });
  return g;
}

// ------------------------------------------------------------ nervios periféricos
export function buildNerves() {
  const g = new Geo(), L = new Geo();
  // ---- nervios raquídeos (31 pares): de la médula al agujero y un poco más allá
  for (const [nm, y, x, z] of FOR) {
    const out = [x + 1.5, y - 0.5, z + 0.5];
    if (y > CONUS_Y + 0.6) {
      const c = canalAt(Math.min(64.2, y + (y < 50 ? 1.6 : 0.6)));
      tube(L, 'nervios_raquideos', [[0.35, c[1], c[2]], [x - 0.6, y + 0.15, z - 0.2], [x, y, z], out], [0.13, 0.2], WT, { sides: 5 });
    } else tube(L, 'nervios_raquideos', [[x - 0.4, y + 0.2, z - 0.2], [x, y, z], out], 0.2, WT, { sides: 5 });
  }
  // ---- tronco simpático con ganglios en cada vértebra
  {
    const P = [], R = [];
    for (const v of VERT.slice(1)) {
      P.push([v.rx + 0.4, v.y + v.h * 0.5, v.z + v.rz * 0.55]); R.push(0.11);
      P.push([v.rx + 0.42, v.y, v.z + v.rz * 0.6]); R.push(v.name === 'C2' ? 0.36 : v.name === 'C7' ? 0.26 : 0.19);
    }
    P.push([2.0, 7.4, -4.8], [1.6, 4.6, -7.2], [0.9, 1.8, -8.6], [0.0, -0.6, -9.2]); R.push(0.15, 0.15, 0.13, 0.15);
    tube(L, 'tronco_simpatico', P, R, WT, { sides: 7, step: 0.3 });
    tube(L, 'tronco_simpatico', [[2.0, 24.0, -3.4], [1.6, 23.2, -1.2], [1.0, 23.4, 1.2]], 0.1, WT); // esplácnico mayor al plexo celíaco
  }
  // ---- pares craneales
  tube(L, 'n_optico', [[3.25, 70.1, 7.62], [2.5, 70.0, 5.7], [1.5, 69.9, 4.0], [0.0, 69.8, 3.1]], 0.21, WHEAD);
  tube(L, 'n_optico', [[0.0, 69.8, 3.1], [1.5, 69.9, 1.8], [2.4, 70.2, 0.2]], 0.17, WHEAD);
  const V5 = [2.6, 69.0, 0.9];
  tube(L, 'n_trigemino', [[1.4, 68.9, -0.9], [2.0, 69.0, 0.1], V5], [0.24, 0.34], WHEAD);
  tube(L, 'n_trigemino', [V5, [2.8, 69.8, 3.0], [2.6, 71.2, 6.0], SK(2.3, 72.2, 9.0, 0.4), SK(2.6, 75.0, 8.2, 0.4), SK(2.4, 77.6, 6.2, 0.4)], [0.17, 0.1], WHEAD);
  tube(L, 'n_trigemino', [V5, [2.6, 68.4, 3.6], [2.2, 68.1, 7.2], SK(2.0, 67.7, 9.2, 0.4), SK(2.8, 66.4, 9.4, 0.4)], [0.17, 0.1], WHEAD);
  tube(L, 'n_trigemino', [SK(2.0, 67.7, 9.2, 0.4), SK(1.5, 66.0, 9.6, 0.4)], 0.09, WHEAD);
  tube(L, 'n_trigemino', [V5, [3.2, 66.8, 1.0], [4.2, 64.6, 2.2], [4.4, 62.2, 4.0], [3.6, 61.6, 6.6], SK(2.3, 61.2, 8.0, 0.4), SK(1.4, 60.6, 8.6, 0.4)], [0.18, 0.1], WH);
  tube(L, 'n_trigemino', [[3.4, 65.8, 1.6], [2.4, 62.6, 3.6], [1.4, 61.9, 6.0]], 0.12, WH); // lingual
  tube(L, 'n_trigemino', [[3.3, 66.6, 0.7], [5.4, 66.8, 0.6], SK(6.6, 69.6, 1.0, 0.4), SK(6.6, 73.4, 0.4, 0.4)], 0.1, WHEAD); // auriculotemporal
  const PES = [5.9, 65.2, 2.6];
  tube(L, 'n_facial', [[1.5, 67.8, -1.0], [3.4, 68.0, -0.6], [4.4, 67.6, -0.8], [5.0, 66.6, -0.6], [5.8, 65.4, 1.8], PES], [0.16, 0.2], WHEAD);
  for (const br of [[SK(6.6, 70.4, 4.0), SK(5.8, 72.6, 6.4)], [SK(5.6, 68.2, 6.2), SK(4.6, 69.0, 8.2)], [SK(5.0, 65.6, 6.6), SK(3.4, 64.6, 9.0)], [SK(5.4, 62.6, 4.6), SK(4.2, 61.0, 7.4), SK(2.6, 60.8, 8.4)]]) tube(L, 'n_facial', [PES, ...br], [0.13, 0.08], WH);
  tube(L, 'n_facial', [PES, [5.6, 63.4, 2.6], [5.4, 60.0, 2.8], [5.0, 57.4, 3.2]], [0.12, 0.08], WH);
  tube(L, 'n_accesorio', [[1.3, 66.2, -1.8], [3.2, 65.2, -0.8], [4.4, 63.0, -1.0], [5.4, 59.6, -1.0], [6.0, 56.0, -2.6], [7.0, 52.4, -4.6], [8.0, 49.6, -6.0]], [0.14, 0.11], WH);
  // vagos (asimétricos en el tórax) y laríngeos recurrentes
  const vagNeck = (s) => [[s * 1.3, 66.4, -1.6], [s * 3.2, 65.2, -0.8], [s * 3.4, 62.0, 0.0], [s * 3.6, 58.0, 0.5], [s * 3.6, 54.0, 0.5], [s * 3.5, 50.0, 0.8]];
  tube(g, 'n_vago', [...vagNeck(-1), [-3.8, 48.0, 1.4], [-2.4, 44.0, -2.6], [-1.6, 40.0, -3.6], [-0.7, 36.0, -3.4], [0.4, 31.0, -2.4], [1.6, 28.6, -1.6], [1.4, 25.0, 0.6], [1.0, 23.6, 1.6]], 0.17, WH, { side: 1 });
  tube(g, 'n_vago', [...vagNeck(1), [2.9, 47.2, 0.8], [3.7, 44.6, 0.5], [2.6, 40.0, -2.4], [1.4, 36.0, -1.6], [2.2, 30.0, -0.1], [3.4, 27.4, 1.4], [5.0, 25.4, 3.6], [6.2, 22.6, 5.0]], 0.17, WH);
  tube(g, 'n_vago', [[3.7, 44.6, 0.5], [3.4, 43.0, -1.4], [2.0, 43.2, -2.4], [1.1, 46.0, -1.4], [1.0, 50.0, -1.0], [0.9, 53.8, 0.3]], 0.1, WT);
  tube(g, 'n_vago', [[-3.7, 48.2, 1.3], [-4.6, 47.6, 0.2], [-3.4, 47.8, -0.6], [-1.2, 49.0, -0.8], [-1.0, 53.6, 0.2]], 0.1, WT, { side: 1 });
  tube(g, 'n_vago', [[0.4, 31.0, -2.4], [0.0, 33.8, -2.2], [1.6, 32.4, -1.2]], 0.09, WT); // plexo esofágico
  // frénicos
  tube(g, 'n_frenico', [[-3.6, 57.2, -1.4], [-3.8, 54.0, 0.0], [-3.6, 50.6, 0.8], [-3.6, 48.4, 1.5], [-4.0, 44.0, 2.4], HE(-4.4, 37.0, 2.4, 0.55), HE(-4.2, 34.0, 1.4, 0.6), [-4.4, 32.6, 1.0]], 0.11, WT, { side: 1 });
  tube(g, 'n_frenico', [[3.6, 57.2, -1.4], [3.8, 54.0, 0.0], [3.6, 50.6, 0.8], [3.6, 48.4, 1.5], [3.6, 45.6, 1.9], HE(5.6, 37.0, 2.6, 0.55), HE(7.4, 33.6, 4.2, 0.55), [7.0, 32.0, 4.6]], 0.11, WT);
  // ---- plexo braquial: raíces C5–T1, troncos y fascículos alrededor de la arteria axilar
  const TR_U = [5.6, 52.4, -1.0], TR_M = [5.8, 50.8, -1.2], TR_L = [5.6, 49.2, -0.8];
  const CORD_L = [12.0, 45.6, 1.7], CORD_P = [12.0, 45.0, -0.3], CORD_M = [12.3, 44.4, 0.7];
  for (const [r, t] of [['C5', TR_U], ['C6', TR_U], ['C7', TR_M], ['C8', TR_L], ['T1', TR_L]]) { const f = F[r]; tube(L, 'plexo_braquial', [f, [f[0] + 1.6, f[1] - 0.3, f[2] + 0.3], t], 0.2, WT); }
  for (const [a, b] of [[TR_U, CORD_L], [TR_U, CORD_P], [TR_M, CORD_L], [TR_M, CORD_P], [TR_L, CORD_P], [TR_L, CORD_M]]) tube(L, 'plexo_braquial', [a, [(a[0] + b[0]) / 2 + 0.6, (a[1] + b[1]) / 2 + 0.6, (a[2] + b[2]) / 2], b], 0.2, WA);
  tube(L, 'n_dorsal_escapula', [add(F.C5, [0.8, -0.3, -0.6]), [4.6, 53.4, -3.4], [6.0, 50.0, -6.4], [6.6, 46.0, -8.6], [7.0, 40.0, -9.2], [8.0, 36.0, -9.4]], 0.1, WT);
  tube(L, 'n_supraescapular', [TR_U, [8.6, 50.4, -3.0], [11.4, 47.6, -4.6], [11.2, 46.4, -7.2], [13.4, 45.6, -6.6], [11.6, 41.0, -8.6]], 0.11, WA);
  tube(L, 'n_toracico_largo', [add(F.C6, [1.0, -0.4, -1.4]), [7.2, 49.6, -2.6], [10.8, 46.4, -2.4], [13.2, 42.0, -1.6], [14.3, 36.0, -1.0], [14.5, 30.0, -0.6]], 0.11, WT);
  tube(L, 'n_toracodorsal', [CORD_P, [12.6, 42.0, -4.4], [12.0, 37.0, -6.8], [11.2, 32.0, -7.6]], 0.11, WA);
  tube(L, 'n_pectorales', [CORD_L, [10.4, 45.8, 4.2], [8.4, 44.6, 6.4]], 0.1, WA);
  tube(L, 'n_pectorales', [CORD_M, [12.0, 42.8, 3.4], [11.0, 41.0, 5.6]], 0.1, WA);
  // ---- miembro superior
  tube(L, 'n_axilar', [CORD_P, [13.4, 44.0, -0.6], A(0.12, -150, 0.55), A(0.16, 175, 0.45), A(0.17, 120, 0.48), A(0.18, 60, 0.6), A(0.2, 25, 0.72)], 0.15, WA);
  tube(L, 'n_musculocutaneo', [CORD_L, [13.6, 44.8, 1.6], A(0.15, -45, 0.6), A(0.4, -10, 0.45), A(0.7, 10, 0.5), A(0.95, 35, 0.75), A(1.1, 50, 0.95), A(1.5, 60, 0.98), A(1.9, 65, 0.98)], [0.16, 0.1], WA);
  const MED = [CORD_L, [13.8, 44.0, 1.2], A(0.14, -66, 0.8), A(0.3, -60, 0.73), A(0.5, -52, 0.67), A(0.75, -38, 0.62), A(1.02, -18, 0.53), A(1.2, -10, 0.45), A(1.5, 0, 0.42), A(1.8, 0, 0.5), A(2.02, 0, 0.55), A(2.2, 8, 0.5)];
  tube(L, 'n_mediano', MED, 0.2, WA);
  tube(L, 'n_mediano', [CORD_M, [13.6, 44.0, 1.0], A(0.14, -66, 0.8)], 0.17, WA);
  tube(L, 'n_mediano', [A(2.2, 8, 0.5), A(2.25, 55, 0.72)], 0.1, WA); // rama tenar
  tube(L, 'n_mediano', [A(2.2, 8, 0.5), ...fingerPath(0, 0.4, 0.3, 0.5)], [0.11, 0.07], WA, { minR: 0.08 });
  for (const [k, dx] of [[1, 0.28], [1, -0.28], [2, 0.28], [2, -0.28], [3, 0.28]]) tube(L, 'n_mediano', [A(2.2, 8, 0.5), ...fingerPath(k, 0.42, dx, 0.6)], [0.1, 0.06], WA, { minR: 0.08 });
  tube(L, 'n_cubital', [CORD_M, [14.0, 43.6, 0.4], A(0.15, -95, 0.75), A(0.4, -100, 0.75), A(0.75, -125, 0.72), A(1.0, -150, 0.7), A(1.1, -125, 0.66), A(1.4, -105, 0.72), A(1.8, -95, 0.78), A(2.03, -85, 0.78), A(2.18, -70, 0.66)], 0.18, WA);
  for (const [k, dx] of [[4, 0.28], [4, -0.28], [3, -0.28]]) tube(L, 'n_cubital', [A(2.18, -70, 0.66), ...fingerPath(k, 0.42, dx, 0.6)], [0.1, 0.06], WA, { minR: 0.08 });
  tube(L, 'n_cubital', [A(2.18, -70, 0.66), A(2.25, -50, 0.35), A(2.28, 0, 0.25), A(2.26, 45, 0.3)], 0.1, WA); // rama profunda
  tube(L, 'n_cubital', [A(1.75, -100, 0.82), A(1.95, -140, 0.97), A(2.3, -150, 1.0), ...fingerPath(4, -0.5, 0, 0.6).slice(0, 3)], 0.09, WA); // rama dorsal
  tube(L, 'n_radial', [CORD_P, [13.6, 44.2, -0.6], A(0.15, -110, 0.62), A(0.3, -170, 0.48), A(0.45, 165, 0.42), A(0.6, 135, 0.45), A(0.8, 90, 0.55), A(0.98, 60, 0.6), A(1.05, 55, 0.58)], 0.2, WA);
  tube(L, 'n_radial', [A(1.05, 55, 0.58), A(1.3, 55, 0.78), A(1.65, 60, 0.85), A(1.85, 95, 0.95), A(2.1, 135, 1.0), A(2.3, 150, 1.0)], 0.12, WA); // superficial
  for (const k of [0, 1, 2]) tube(L, 'n_radial', [A(2.3, 150, 1.0), ...fingerPath(k, -0.5, 0, 0.55).slice(0, 3)], [0.08, 0.06], WA, { minR: 0.08 });
  tube(L, 'n_radial', [A(1.05, 55, 0.58), A(1.1, 100, 0.45), A(1.25, 150, 0.4), A(1.6, 170, 0.35), A(1.9, 175, 0.3)], 0.11, WA); // profunda (interósea posterior)
  // ---- tórax y abdomen: intercostales (bajo los vasos) y toracoabdominales
  for (let k = 1; k <= 12; k++) {
    const nm = k === 12 ? 'T12' : 'T' + k;
    const rp = ribPath(k, 0.14, k > 10 ? 1.0 : 0.95, -0.85, 0.24);
    const f = F[nm];
    const P = [f, [f[0] + 1.6, f[1] - 0.4, f[2] + 0.2], ...rp];
    if (k >= 7) { const e = rp[rp.length - 1]; P.push([Math.max(3.2, e[0] - 3.0), e[1] - 2.2 - (k - 7) * 0.4, 8.4], [2.4, e[1] - 3.6 - (k - 7) * 0.6, 8.9]); }
    tube(L, 'n_intercostales', P, 0.11, WT, { sides: 5 });
  }
  // ---- plexo lumbar y sus ramas
  for (const [r, to] of [['L1', [4.4, 18.6, -2.4]], ['L2', [4.8, 15.4, -2.0]], ['L3', [5.2, 12.2, -1.6]], ['L4', [5.2, 9.2, -1.6]]]) tube(L, 'plexo_lumbar', [F[r], to], 0.17, WT);
  tube(L, 'plexo_lumbar', [[4.4, 18.6, -2.4], [4.6, 17.0, -2.2], [4.8, 15.4, -2.0], [5.0, 13.6, -1.8], [5.2, 12.2, -1.6], [5.4, 10.4, -1.4], [5.2, 9.2, -1.6]], 0.16, WT);
  tube(L, 'n_iliohipogastrico', [[4.4, 18.6, -2.4], [8.6, 17.4, -5.0], [12.6, 13.6, -2.6], [13.0, 11.6, 3.0], [9.6, 8.6, 7.4], [4.0, 4.6, 8.2]], 0.11, WT);
  tube(L, 'n_iliohipogastrico', [[4.6, 17.8, -2.2], [10.8, 12.4, -3.4], [13.0, 10.0, 2.2], [9.0, 5.6, 7.4], [4.6, 1.8, 7.8]], 0.1, WT); // ilioinguinal
  tube(L, 'n_cutaneo_femoral_lateral', [[4.9, 15.2, -2.0], [8.6, 11.0, -0.4], [11.2, 9.4, 4.4], [11.6, 8.4, 6.2], Lg(0.15, 75, 0.98), Lg(0.45, 85, 0.99), Lg(0.75, 90, 0.99)], 0.11, WL);
  const FEM = [7.6, 3.6, 6.2];
  tube(L, 'n_femoral', [[5.2, 12.2, -1.6], [6.0, 10.8, -0.6], [7.0, 7.0, 2.4], FEM, Lg(0.05, -15, 0.86)], 0.24, WL);
  for (const b of [[Lg(0.1, -5, 0.8), Lg(0.3, 0, 0.6), Lg(0.5, 5, 0.55)], [Lg(0.1, 20, 0.78), Lg(0.35, 60, 0.7), Lg(0.6, 70, 0.66)], [Lg(0.1, -30, 0.8), Lg(0.4, -50, 0.66), Lg(0.75, -55, 0.6)], [Lg(0.1, -10, 0.9), Lg(0.5, -20, 0.98), Lg(0.8, -25, 0.99)], [Lg(0.08, 10, 0.88), Lg(0.25, 25, 0.95), Lg(0.6, 20, 0.99)]]) tube(L, 'n_femoral', [Lg(0.05, -15, 0.86), ...b], [0.13, 0.08], WL);
  tube(L, 'n_safeno', [Lg(0.12, -35, 0.79), Lg(0.4, -55, 0.65), Lg(0.65, -85, 0.6), Lg(0.9, -110, 0.92), Lg(1.0, -115, 0.99), Lg(1.3, -100, 1.0), Lg(1.7, -84, 1.0), [7.6, -80.0, 0.4], [7.1, -81.6, 3.6]], 0.11, WL);
  tube(L, 'n_obturador', [[5.0, 13.6, -1.8], [3.8, 10.6, -2.0], [5.4, 5.8, -1.4], [6.0, 0.6, 1.6], [6.2, -3.4, 3.2]], 0.15, WL);
  tube(L, 'n_obturador', [[6.2, -3.4, 3.2], Lg(0.12, -90, 0.6), Lg(0.3, -95, 0.7)], 0.11, WL);
  tube(L, 'n_obturador', [[6.2, -3.4, 3.2], Lg(0.12, -110, 0.5), Lg(0.35, -120, 0.55)], 0.11, WL);
  // ---- plexo sacro y miembro inferior
  const SN = [6.8, 3.0, -7.0];
  tube(L, 'plexo_sacro', [[5.2, 9.2, -1.6], [5.0, 6.4, -4.4], SN], 0.22, WL); // tronco lumbosacro (L4–L5)
  tube(L, 'plexo_sacro', [F.L5, [4.8, 6.4, -4.8], SN], 0.2, WL);
  for (const r of ['S1', 'S2', 'S3', 'S4']) { const f = F[r]; tube(L, 'plexo_sacro', [f, [f[0] + 2.0, f[1] - 0.4, f[2] + 0.4], SN], 0.18, WL); }
  tube(L, 'n_gluteo_superior', [[6.0, 4.4, -6.2], [7.6, 5.2, -7.2], [10.0, 6.4, -7.6], [12.6, 7.4, -4.4], [13.2, 6.2, -1.6]], 0.13, WL);
  tube(L, 'n_gluteo_inferior', [[7.2, 2.2, -7.6], [8.6, 0.4, -10.0], [10.6, -1.0, -11.2]], 0.13, WL);
  tube(L, 'n_gluteo_inferior', [[8.6, 0.4, -10.0], [8.6, -3.2, -11.0]], 0.11, WL);
  const SCI = [SN, [7.8, 1.4, -7.8], [9.2, -2.0, -8.0], [9.8, -5.4, -6.6], Lg(0.2, 175, 0.45), Lg(0.45, 178, 0.42), Lg(0.7, 180, 0.42), Lg(0.8, 180, 0.45)];
  tube(L, 'n_ciatico', SCI, [0.42, 0.45, 0.46, 0.44, 0.42, 0.4, 0.38, 0.36], WL, { sides: 10 });
  tube(L, 'n_tibial', [Lg(0.8, 180, 0.45), Lg(0.95, 180, 0.62), Lg(1.1, 180, 0.56), Lg(1.4, -165, 0.42), Lg(1.7, -150, 0.46), Lg(1.92, -128, 0.62), [7.4, -80.8, -2.9], [7.5, -82.4, -1.6]], 0.28, WL);
  tube(L, 'n_peroneo_comun', [Lg(0.8, 180, 0.45), Lg(0.92, 140, 0.7), Lg(1.04, 120, 0.85), Lg(1.12, 100, 0.95), Lg(1.14, 80, 0.86)], 0.24, WL);
  tube(L, 'n_peroneo_superficial', [Lg(1.14, 80, 0.86), Lg(1.35, 85, 0.8), Lg(1.65, 80, 0.85), Lg(1.75, 60, 0.98), Lg(1.95, 30, 1.0), [9.2, -80.4, 2.6]], 0.13, WL);
  tube(L, 'n_peroneo_superficial', [[9.2, -80.4, 2.6], [8.6, -81.6, 4.4], [8.2, -83.0, 9.0]], 0.1, WL);
  tube(L, 'n_peroneo_superficial', [[9.2, -80.4, 2.6], [10.4, -81.8, 4.4], [11.0, -83.4, 9.6]], 0.1, WL);
  tube(L, 'n_peroneo_profundo', [Lg(1.14, 80, 0.86), Lg(1.2, 55, 0.5), Lg(1.4, 40, 0.44), Lg(1.7, 30, 0.5), Lg(1.93, 16, 0.62), [9.3, -79.2, 1.6], [9.0, -81.2, 5.0], [8.6, -83.2, 9.4]], 0.13, WL);
  tube(L, 'n_sural', [Lg(1.02, 180, 0.6), Lg(1.25, 180, 0.95), Lg(1.55, 170, 1.0), Lg(1.85, 145, 1.0), [10.9, -81.2, -3.7], [12.4, -84.2, 2.0], [13.0, -85.2, 7.2]], 0.11, WL);
  tube(L, 'n_plantares', [[7.5, -82.4, -1.6], [7.8, -85.6, 1.6], [7.8, -86.4, 6.6], [7.6, -86.6, 11.2]], 0.12, WL);
  tube(L, 'n_plantares', [[7.5, -82.4, -1.6], [9.6, -86.0, 2.0], [11.2, -86.2, 6.0], [12.0, -86.4, 10.4]], 0.12, WL);
  for (const x of [8.8, 9.9]) tube(L, 'n_plantares', [[7.8, -86.4, 6.6], [x, -86.8, 11.0]], 0.09, WL);
  g.append(L.withMirror());
  return g;
}
void ESOPH;
