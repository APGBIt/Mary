// Órganos de Mary (capa "organ"): corazón, pulmones con lóbulos y árbol bronquial, laringe, tiroides,
// tubo digestivo completo, hígado, vesícula, páncreas, bazo, riñones, suprarrenales, vías urinarias y ojos.
// Coordenadas en cm del cuerpo canónico: +X izquierda, +Y arriba, +Z adelante; origen entre las caderas.
import { Geo, addSDF, addTube } from './builder.js';
import { trunkW, rigid } from './body.js';
import { sdSphere, sdEllipsoid, sdCapsule, sdRoundCone, smin, smax, ssub, noise3 } from './sdf.js';
import { diaphTop, cavity, heartSDF, sdEllAx, axesFrom, AORTA_ARCH, AORTA_DESC, ESOPH, TRACHEA, SVC, IVC, KIDNEY, tubeSDF } from './viscera.js';
import { add, sub, mul, madd, dot, cross, len, norm, lerp, clamp, tableAt, catmull } from '../../src/anatomy/v3.js';
import { SID } from '../../src/anatomy/atlas.js';

const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const S = (id) => { const s = SID[id]; if (!s) throw new Error('Falta en el atlas: ' + id); return s; };
const W = (p) => trunkW(p);

// ------------------------------------------------------------ cavidad torácica (cara interna de las costillas)
const THX = [ // y, semiancho, frente, espalda, exponente
  [20, 11.0, 6.2, -7.8, 2.6], [24, 12.3, 7.6, -8.6, 2.6], [28, 13.1, 8.7, -9.0, 2.6], [32, 13.4, 9.1, -9.1, 2.6],
  [36, 13.1, 8.9, -9.0, 2.6], [40, 12.2, 8.1, -8.7, 2.5], [43, 10.9, 6.7, -8.1, 2.4], [46, 8.9, 4.8, -7.0, 2.3],
  [48.5, 6.7, 3.2, -5.4, 2.2], [50.5, 4.6, 1.9, -3.2, 2.1], [52, 2.8, 1.0, -1.4, 2.0],
];
function thoraxIn(x, y, z) {
  const r = tableAt(THX, clamp(y, 20, 52));
  const a = r[0], b = z >= 0 ? r[1] : -r[2], n = r[3];
  const q = Math.pow(Math.pow(Math.abs(x) / a, n) + Math.pow(Math.abs(z) / b, n), 1 / n);
  return smax((q - 1) * Math.min(a, b) * 0.85, y - 51.6, 1.2);
}
// Columna torácica (cuerpos y cuellos costales) como tubo
const SPINE_T = [[0, 53, -2.6], [0, 47, -5.4], [0, 41, -7.2], [0, 35, -7.6], [0, 29, -6.8], [0, 23, -5.5], [0, 18, -4.2]];
const spineBlock = (x, y, z) => tubeSDF(x, y, z, SPINE_T, 2.9, 0.5);

// ------------------------------------------------------------ pulmones
const BR = { // árbol bronquial (lado izquierdo con +x; el derecho se define aparte)
  R: {
    main: [[0.1, 42.3, -2.0], [-1.6, 41.3, -2.3], [-3.4, 40.1, -2.5], [-4.8, 39.3, -2.4]],
    branches: [
      [[-3.0, 40.4, -2.4], [-5.0, 42.4, -2.2], [-6.4, 44.8, -1.8], [-6.4, 48.0, -1.4]],
      [[-6.2, 44.4, -2.0], [-8.4, 43.6, -4.8]], [[-6.0, 43.6, -1.6], [-8.6, 42.4, 2.4]],
      [[-4.8, 39.3, -2.4], [-5.8, 37.2, -2.6], [-7.2, 33.0, -4.0], [-8.4, 28.8, -5.0]],
      [[-5.8, 37.4, -2.4], [-7.4, 35.6, 1.0], [-9.0, 34.6, 4.2]], [[-7.4, 35.6, 1.0], [-6.8, 33.6, 5.0]],
      [[-6.6, 35.0, -3.4], [-8.2, 36.0, -7.0]], [[-8.0, 30.0, -4.6], [-10.6, 27.8, -1.8]], [[-8.0, 30.0, -4.8], [-6.6, 26.8, -6.8]], [[-8.2, 29.4, -5.0], [-10.2, 27.4, -6.4]],
    ],
  },
  L: {
    main: [[0.1, 42.3, -2.0], [1.8, 41.4, -2.4], [3.6, 40.6, -2.9], [5.2, 39.6, -2.8]],
    branches: [
      [[5.2, 39.8, -2.6], [6.6, 42.4, -1.8], [6.8, 45.8, -1.6]], [[6.6, 42.4, -1.8], [8.8, 41.0, 2.6]],
      [[6.0, 40.2, -2.0], [7.6, 37.4, 1.6], [9.2, 34.8, 4.6]],
      [[5.2, 39.6, -2.8], [6.8, 35.0, -4.2], [7.8, 29.6, -5.0]], [[6.6, 36.2, -3.8], [7.8, 36.6, -7.0]],
      [[7.6, 30.4, -4.8], [9.8, 28.6, -2.0]], [[7.6, 30.0, -5.0], [6.8, 27.4, -7.0]], [[7.8, 29.8, -5.0], [10.0, 27.8, -6.2]],
    ],
  },
};
function lungSDF(s) {
  const P1 = [s * 4, 43.6, -8.6], P2 = [s * 13.2, 35.2, -1.0], P3 = [s * 6.0, 30.2, 8.4];
  let n = norm(cross(sub(P2, P1), sub(P3, P1)));
  if (dot(sub([s * 8, 41, 6], P1), n) < 0) n = mul(n, -1);
  const arch = (x, y, z) => tubeSDF(x, y, z, AORTA_ARCH, 1.75, 0.4), desc = (x, y, z) => tubeSDF(x, y, z, AORTA_DESC, 1.45, 0.4);
  const eso = (x, y, z) => tubeSDF(x, y, z, ESOPH, 1.0, 0.4), tra = (x, y, z) => tubeSDF(x, y, z, TRACHEA, 1.25, 0.4);
  const main = s > 0 ? BR.L.main : BR.R.main;
  return (x, y, z) => {
    const X = s * x;
    if (X < -0.5) return 3;
    let d = thoraxIn(x, y, z) + 0.3;
    d = smax(d, diaphTop(x, z) + 0.2 - y, 0.9);
    d = smax(d, (y > 39 ? 1.7 : 1.1) - X, 0.7);
    d = smax(d, 0.55 - heartSDF(x, y, z), 0.9);
    d = smax(d, -spineBlock(x, y, z), 0.6);
    d = smax(d, -Math.min(eso(x, y, z), tra(x, y, z), tubeSDF(x, y, z, main.slice(0, 3), 0.95, 0.3)), 0.5);
    if (s > 0) {
      d = smax(d, -Math.min(arch(x, y, z), desc(x, y, z)), 0.6);
      const notch = 1.1 + 4.6 * smoothstep(29.5, 32.5, y) * (1 - smoothstep(36.0, 39.0, y)) * smoothstep(1.5, 5.5, z);
      d = smax(d, notch - X, 0.8);
    }
    else d = smax(d, -Math.min(tubeSDF(x, y, z, SVC, 1.45, 0.3), tubeSDF(x, y, z, IVC.slice(0, 2), 1.4, 0.3)), 0.6);
    // cisuras: oblicua (ambos) y horizontal (derecho)
    const fo = (x - P1[0]) * n[0] + (y - P1[1]) * n[1] + (z - P1[2]) * n[2];
    d = smax(d, 0.2 - Math.abs(fo), 0.12);
    if (s < 0) { const fh = y - 37.0 - (z - 4) * 0.06; d = smax(d, -Math.max(Math.abs(fh) - 0.2, -fo), 0.12); }
    return d;
  };
}

// ------------------------------------------------------------ abdomen: recorridos
const STOMACH = [[3.0, 27.6, -0.4, 0.8], [4.6, 29.2, -0.8, 2.3], [6.1, 28.9, -0.2, 2.8], [6.7, 26.0, 1.4, 2.95], [6.2, 22.5, 3.4, 2.85], [4.5, 19.5, 4.8, 2.55], [1.9, 18.7, 5.4, 2.1], [-0.4, 19.6, 5.0, 1.65], [-1.8, 20.8, 4.4, 1.25]];
const GALL = [[-5.9, 23.4, 7.2, 1.3], [-4.9, 24.7, 5.2, 1.15], [-3.9, 25.6, 3.4, 0.8], [-3.2, 26.0, 2.3, 0.45]];
const PANC = [[-3.5, 18.2, 2.7, 1.55], [-1.3, 19.4, 3.3, 1.2], [1.8, 20.4, 2.4, 1.1], [4.6, 21.5, 0.6, 0.95], [7.0, 22.8, -1.6, 0.8]];
const DUO = [[-1.8, 20.8, 4.4], [-3.6, 21.4, 3.2], [-5.0, 20.4, 1.9], [-5.6, 17.6, 1.3], [-5.2, 15.0, 1.5], [-3.6, 13.9, 2.3], [-1.0, 13.7, 3.1], [1.6, 14.6, 2.8], [3.0, 16.4, 2.3], [3.0, 18.0, 2.1]];
const COLON = [
  [-8.2, 4.6, 3.6], [-8.8, 7.0, 3.0], [-10.0, 10.5, 1.4], [-10.4, 15.0, 0.4], [-10.1, 18.6, 0.6], [-9.0, 20.6, 2.6],
  [-6.2, 18.6, 6.2], [-2.0, 15.0, 7.0], [2.4, 14.6, 7.0], [6.4, 16.6, 5.6], [9.4, 19.6, 2.2], [10.6, 19.4, -0.8],
  [10.8, 15.6, -1.4], [10.4, 11.0, -0.8], [9.8, 7.6, 0.4], [7.2, 3.8, 2.2], [3.8, 2.6, 1.6], [1.2, 3.2, -2.0], [0.3, 3.8, -5.0],
];
const COLON_R = [2.6, 2.5, 2.4, 2.3, 2.2, 2.1, 2.0, 1.95, 1.95, 1.95, 1.9, 1.85, 1.8, 1.75, 1.7, 1.6, 1.55, 1.55, 1.6];
const RECTUM = [[0.3, 3.8, -5.0], [0.0, 1.6, -7.2], [0.0, -1.2, -7.4], [0.0, -3.6, -6.0], [0.0, -5.8, -6.5], [0.0, -7.6, -7.2]];
const RECTUM_R = [1.6, 1.95, 2.0, 1.3, 0.75, 0.55];
const APPX = [[-7.4, 4.0, 2.4], [-6.6, 2.0, 2.0], [-5.6, 0.6, 2.8], [-5.0, 0.2, 3.6]];

// Asas del intestino delgado: paseo aleatorio (semilla fija) que no se cruza, contenido en el espacio
// infracólico y la pelvis, de la flexura duodenoyeyunal a la unión ileocecal.
function segDist(p, P) {
  let best = 1e9;
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], ab = sub(P[i + 1], a), t = clamp(dot(sub(p, a), ab) / dot(ab, ab), 0, 1);
    best = Math.min(best, len(sub(p, madd(a, ab, t))));
  }
  return best;
}
function smallBowelPath() {
  let seed = 11;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
  const end = [-6.4, 6.2, 2.7];
  const pts = [[3.0, 18.0, 2.1], [4.6, 17.0, 3.0]];
  let dir = norm([-0.2, -0.4, 0.6]);
  const N = 340, step = 0.72;
  const region = (p) => Math.min(
    ((p[0]) / 7.6) ** 2 + ((p[1] - 11.8) / 6.0) ** 2 + ((p[2] - 4.4 + Math.max(0, p[1] - 13) * 0.25) / 2.6) ** 2,
    ((p[0] + 0.4) / 5.0) ** 2 + ((p[1] - 5.0) / 3.0) ** 2 + ((p[2] - 3.4) / 2.4) ** 2);
  for (let i = 0; i < N; i++) {
    const p = pts[pts.length - 1], prog = i / N;
    let f = add(dir, [rnd() * 1.3, rnd() * 1.3, rnd() * 1.1]);
    for (let j = 0; j < pts.length - 5; j++) {
      const dv = sub(p, pts[j]), dd = len(dv);
      if (dd < 2.7) f = madd(f, dv, ((2.7 - dd) * 1.4) / (dd + 0.15));
    }
    const dc = segDist(p, COLON);
    if (dc < 3.6) { const e = 0.05, gx = segDist(add(p, [e, 0, 0]), COLON) - dc, gy = segDist(add(p, [0, e, 0]), COLON) - dc, gz = segDist(add(p, [0, 0, e]), COLON) - dc; f = madd(f, norm([gx, gy, gz]), (3.6 - dc) * 2.2); }
    const r = region(p);
    if (r > 0.75) f = madd(f, norm(sub([0, 10.6, 4.2], p)), (r - 0.75) * 5);
    if (prog > 0.62) f = madd(f, norm(sub(end, p)), (prog - 0.62) * 5);
    dir = norm(add(mul(dir, 0.5), mul(norm(f), 0.5)));
    pts.push(madd(p, dir, step));
  }
  pts.push(end);
  return pts;
}

function stomachSDF(x, y, z) {
  let d = tubeSDF(x, y, z, STOMACH, STOMACH.map((p) => p[3]), 1.2);
  d = smax(d, y - (diaphTop(x, z) - 0.3), 0.6);
  return d;
}
const gallSDF = (x, y, z) => tubeSDF(x, y, z, GALL, GALL.map((p) => p[3]), 0.5);
function kidneySDF(K) {
  const ax = axesFrom(K.up, K.hil);
  const hil = madd(K.c, K.hil, K.r[1] * 0.92);
  return (x, y, z) => {
    let d = sdEllAx(x, y, z, K.c, ax, K.r);
    d = ssub(d, sdSphere(x, y, z, hil[0], hil[1], hil[2], 1.25), 0.6);
    return d;
  };
}
const KL = kidneySDF(KIDNEY.L), KR = kidneySDF(KIDNEY.R);

function liverSDF(x, y, z) {
  let d = smin(sdEllipsoid(x, y, z, -6.0, 27.4, 0.6, 7.7, 6.8, 8.4), sdEllipsoid(x, y, z, 2.6, 29.6, 3.4, 6.8, 2.7, 5.2), 2.6);
  d = smin(d, sdEllipsoid(x, y, z, -1.4, 26.4, -2.0, 2.0, 2.6, 2.0), 1.2); // lóbulo caudado
  d = smax(d, y - (diaphTop(x, z) - 0.3), 0.5);
  d = smax(d, cavity(x, y, z, 2.1), 0.7);
  const yb = 19.4 + (x + 12) * 0.4 + (z - 4) * 0.22;
  d = smax(d, yb - y, 0.6);
  d = smax(d, x - 9.0, 1.2);
  // impresiones de órganos vecinos y surco de la cava
  const nb = Math.min(stomachSDF(x, y, z) - 0.35, gallSDF(x, y, z) - 0.15, KR(x, y, z) - 0.45, tubeSDF(x, y, z, IVC.slice(0, 5), 1.35, 0.3),
    tubeSDF(x, y, z, DUO.slice(0, 4), 1.4, 0.4), tubeSDF(x, y, z, COLON.slice(4, 7), 2.4, 0.5), tubeSDF(x, y, z, ESOPH.slice(-3), 1.0, 0.3));
  d = smax(d, -nb, 0.5);
  // ligamento falciforme y fisura del ligamento redondo
  const groove = Math.max(Math.abs(x - 0.5 - (y - 28) * 0.05) - 0.13, -(d + 0.55));
  d = smax(d, -groove, 0.12);
  return d;
}

// ------------------------------------------------------------ cuello: laringe y tiroides
function larynxSDF(x, y, z) {
  const ax = Math.abs(x);
  // cartílago tiroides: dos láminas en V unidas adelante (prominencia laríngea)
  let shell = Math.abs(sdEllipsoid(x, y, z, 0, 55.9, 2.3, 1.85, 1.3, 1.95)) - 0.17;
  shell = smax(shell, 1.3 - z, 0.2);
  shell = smax(shell, -(sdSphere(x, y, z, 0, 57.5, 4.6, 0.45)), 0.15); // escotadura tiroidea
  // cartílago cricoides: anillo con lámina posterior alta
  let cri = sdTorusY(x, y, z, 0, 54.25, 1.35, 1.12, 0.3);
  cri = smin(cri, sdEllipsoid(x, y, z, 0, 54.7, 0.25, 1.0, 0.8, 0.3), 0.3);
  // epiglotis
  const epi = smax(sdEllipsoid(x, y, z, 0, 58.0, 1.3, 0.85, 1.4, 0.18), -(y - 56.8), 0.2);
  // cartílagos aritenoides
  const ary = sdEllipsoid(ax, y, z, 0.55, 55.2, 0.55, 0.32, 0.5, 0.32);
  return Math.min(shell, cri, epi, ary);
}
function sdTorusY(x, y, z, cx, cy, cz, R, r) { const q = Math.hypot(x - cx, z - cz) - R; return Math.hypot(q, y - cy) - r; }
function thyroidSDF(x, y, z) {
  const ax = Math.abs(x);
  const lobe = sdEllAx(ax, y, z, [1.85, 52.4, 1.75], axesFrom([0.18, 1, 0.12], [1, 0, 0.3]), [2.1, 0.85, 0.95]);
  const isth = sdCapsule(x, y, z, [-1.3, 51.6, 2.55], [1.3, 51.6, 2.55], 0.42);
  return smin(lobe, isth, 0.5) + 0.04 * noise3(x * 3, y * 3, z * 3);
}

// ------------------------------------------------------------ ojos (con iris y pupila en aux)
const EYE = [3.25, 70.1, 8.85];
function eyeSDF(x, y, z) {
  const ax = Math.abs(x);
  return smin(sdSphere(ax, y, z, EYE[0], EYE[1], EYE[2], 1.2), sdSphere(ax, y, z, EYE[0], EYE[1], EYE[2] + 0.72, 0.62), 0.25);
}
function eyeAux(p) {
  const v = norm(sub([Math.abs(p[0]), p[1], p[2]], EYE));
  const c = v[2];
  return c > 0.985 ? 1 : c > 0.9 ? 0.7 : 0;
}

// ------------------------------------------------------------ construcción
const tube = (g, id, P, R, o = {}) => addTube(g, P.map((p, i) => ({ p, r: Array.isArray(R) ? R[i] : R, rz: o.flat ? (Array.isArray(R) ? R[i] : R) * o.flat : undefined })),
  { sid: S(id), sides: o.sides || 12, step: o.step || 0.4, w: o.w || W, radius: o.radius, side: o.side || 0, uvTile: o.uvTile || 2, caps: o.caps });

export function buildOrgans() {
  const g = new Geo();
  // Corazón
  addSDF(g, heartSDF, [-5.6, 30.4, -2.8], [10.6, 42.2, 9.8], 0.15, { w: W, sid: S('corazon'), tris: 14000, label: 'corazon' });
  // Pulmones
  addSDF(g, lungSDF(-1), [-14.2, 20.5, -10.4], [0.6, 52.6, 10.4], 0.26, { w: W, sid: S('pulmon_der'), side: 1, tris: 20000, label: 'pulmon_der' });
  addSDF(g, lungSDF(1), [-0.6, 20.5, -10.4], [14.2, 52.6, 10.4], 0.26, { w: W, sid: S('pulmon_izq'), tris: 20000, label: 'pulmon_izq' });
  // Tráquea y bronquios
  tube(g, 'traquea', TRACHEA, [0.95, 0.95, 0.92, 0.85], { sides: 14, step: 0.3 });
  for (const side of ['R', 'L']) {
    tube(g, 'traquea', BR[side].main, [0.85, 0.75, 0.68, 0.62], { sides: 12, step: 0.3, side: side === 'R' ? 1 : 0 });
    for (const b of BR[side].branches) tube(g, 'traquea', b, b.map((_, i) => Math.max(0.2, 0.48 - i * 0.09)), { sides: 8, step: 0.35, side: side === 'R' ? 1 : 0 });
  }
  // Laringe y tiroides
  addSDF(g, larynxSDF, [-2.4, 53.4, -0.6], [2.4, 59.8, 4.8], 0.07, { w: W, sid: S('laringe'), tris: 6000, label: 'laringe' });
  addSDF(g, thyroidSDF, [-3.6, 49.6, 0.0], [3.6, 55.2, 3.8], 0.08, { w: W, sid: S('tiroides'), tris: 3500, label: 'tiroides' });
  // Esófago
  tube(g, 'esofago', ESOPH, [0.72, 0.75, 0.75, 0.75, 0.75, 0.75, 0.78, 0.8, 0.85], { sides: 12, flat: 0.75 });
  // Estómago, hígado y vesícula
  addSDF(g, (x, y, z) => smax(stomachSDF(x, y, z), cavity(x, y, z, 2.2), 0.6) + 0.035 * noise3(x * 2.2, y * 2.2, z * 2.2), [-3.6, 15.0, -4.4], [10.6, 33.0, 9.0], 0.17, { w: W, sid: S('estomago'), tris: 9000, label: 'estomago' });
  addSDF(g, liverSDF, [-14.6, 15.6, -9.6], [10.8, 35.6, 10.6], 0.26, { w: W, sid: S('higado'), tris: 16000, label: 'higado' });
  addSDF(g, gallSDF, [-7.6, 21.6, 1.4], [-2.4, 27.0, 8.8], 0.09, { w: W, sid: S('vesicula'), tris: 2500, label: 'vesicula' });
  // Bazo (a lo largo de la 10.ª costilla, bajo la cúpula izquierda)
  const spAx = axesFrom([0.16, -0.62, 0.77], [0.95, 0.1, 0.3]);
  addSDF(g, (x, y, z) => {
    let d = sdEllAx(x, y, z, [8.6, 23.0, -3.6], spAx, [4.2, 2.9, 1.55]);
    d = smax(d, y - (diaphTop(x, z) - 0.2), 0.5);
    d = smax(d, -(stomachSDF(x, y, z) - 0.35), 0.5);
    return d + 0.03 * noise3(x * 2, y * 2, z * 2);
  }, [4.0, 17.0, -9.6], [13.4, 28.8, 3.0], 0.12, { w: W, sid: S('bazo'), tris: 5000, label: 'bazo' });
  // Páncreas (lobulado) y duodeno
  addSDF(g, (x, y, z) => tubeSDF(x, y, z, PANC, PANC.map((p) => p[3]), 0.8) * 1 + 0.12 * noise3(x * 1.6, y * 1.6, z * 1.6), [-5.8, 15.8, -3.4], [8.6, 24.8, 5.2], 0.1, { w: W, sid: S('pancreas'), tris: 6000, label: 'pancreas' });
  tube(g, 'duodeno', DUO, [1.25, 1.15, 1.1, 1.1, 1.1, 1.05, 1.0, 1.0, 1.0, 1.0], { sides: 12, step: 0.35 });
  // Intestino delgado, colon con haustras, apéndice y recto
  const sb = smallBowelPath();
  tube(g, 'intestino_delgado', sb, 1.08, { sides: 12, step: 0.35, uvTile: 1.2 });
  const colLen = COLON.reduce((s, p, i) => s + (i ? len(sub(p, COLON[i - 1])) : 0), 0);
  tube(g, 'colon', COLON, COLON_R, { sides: 14, step: 0.3, uvTile: 2.4, radius: (t, r) => r * (1 + 0.1 * Math.sin(t * colLen / 3.2 * Math.PI * 2)) });
  tube(g, 'apendice', APPX, [0.5, 0.42, 0.4, 0.36], { sides: 8, step: 0.3 });
  tube(g, 'recto', RECTUM, RECTUM_R, { sides: 14, step: 0.3 });
  // Riñones, glándulas suprarrenales, uréteres y vejiga
  addSDF(g, KL, [1.0, 13.6, -9.8], [10.0, 27.4, -1.0], 0.1, { w: W, sid: S('rinones'), tris: 5000, label: 'rinon_izq' });
  addSDF(g, KR, [-10.0, 12.4, -9.8], [-1.0, 26.2, -1.0], 0.1, { w: W, sid: S('rinones'), side: 1, tris: 5000, label: 'rinon_der' });
  const adr = (c, up, r) => (x, y, z) => sdEllAx(x, y, z, c, axesFrom(up, [0, 0, 1]), r);
  addSDF(g, adr([4.4, 24.6, -4.6], [-0.3, 1, -0.1], [1.7, 1.1, 0.45]), [2.0, 22.0, -6.4], [6.8, 27.2, -2.8], 0.06, { w: W, sid: S('suprarrenales'), tris: 1200 });
  addSDF(g, adr([-4.0, 23.5, -4.3], [0.2, 1, -0.1], [1.5, 1.05, 0.5]), [-6.4, 21.0, -6.2], [-1.6, 26.0, -2.4], 0.06, { w: W, sid: S('suprarrenales'), side: 1, tris: 1200 });
  const ureter = (s) => [[s * 3.7, 19.4, -3.6], [s * 3.4, 15.0, -2.6], [s * 3.8, 10.6, -2.6], [s * 4.6, 8.2, -3.0], [s * 5.6, 4.0, -4.6], [s * 4.8, 0.4, -1.4], [s * 2.0, -1.0, 2.4]];
  tube(g, 'ureteres', ureter(1), 0.3, { sides: 8, step: 0.4 });
  tube(g, 'ureteres', ureter(-1), 0.3, { sides: 8, step: 0.4, side: 1 });
  addSDF(g, (x, y, z) => {
    let d = sdEllipsoid(x, y, z, 0, -0.5, 3.4, 3.3, 2.6, 2.8);
    d = smax(d, y - 1.5, 1.2);
    d = smin(d, sdRoundCone(x, y, z, [0, -2.2, 3.4], [0, -4.0, 3.9], 0.9, 0.45), 0.6);
    return d;
  }, [-4.0, -4.8, -0.2], [4.0, 2.6, 7.0], 0.1, { w: W, sid: S('vejiga'), tris: 4000, label: 'vejiga' });
  // Ojos
  addSDF(g, eyeSDF, [-4.8, 68.5, 7.2], [4.8, 71.7, 10.4], 0.045, { w: rigid('head'), sid: S('ojos'), aux: eyeAux, tris: 3000, label: 'ojos' });
  return g;
}
