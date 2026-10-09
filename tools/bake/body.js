// Geometría de referencia del cuerpo canónico para el horneado: contornos del tronco y de los
// miembros, columna, costillas y funciones de pesos de skinning. Todo en cm, lado IZQUIERDO
// (x > 0); el lado derecho se obtiene por espejo.
import { CANON_LM as C, B, BONE_MIRROR, SEG } from '../../src/anatomy/canon.js';
import { add, sub, mul, madd, dot, cross, len, dist, norm, mid, orth, lerp, clamp, smooth, deg, tableAt, catmull } from '../../src/anatomy/v3.js';

export { C, B, SEG };
export const J = {
  hip: C[23], knee: C[25], ankle: C[27], heel: C[29], toe: C[31],
  shoulder: C[11], elbow: C[13], wrist: C[15], pinky: C[17], index: C[19], thumb: C[21],
  knuckles: mid(C[17], C[19]), ear: C[7], eye: C[2], nose: C[0], mouth: C[9],
};

// ---------- Tronco: sección superelíptica por altura ----------
// y, semiancho a, frente zf, espalda zb, exponente n
export const TORSO_ROWS = [
  [-10, 10.5, 4.5, -9.6, 2.2],
  [-6, 15.4, 6.6, -12.0, 2.4],
  [-2, 16.9, 7.9, -12.6, 2.5],
  [2, 17.0, 8.7, -12.2, 2.5],
  [6, 16.4, 9.4, -11.3, 2.5],
  [10, 15.8, 9.9, -10.6, 2.45],
  [14, 14.8, 10.0, -10.2, 2.35],
  [18, 13.9, 10.1, -10.1, 2.25],
  [22, 14.0, 10.3, -10.4, 2.3],
  [26, 14.6, 10.6, -10.9, 2.35],
  [30, 15.3, 11.0, -11.5, 2.4],
  [34, 15.8, 11.4, -12.0, 2.5],
  [38, 16.2, 11.6, -12.3, 2.55],
  [42, 16.6, 11.0, -12.2, 2.6],
  [45, 16.8, 9.8, -11.6, 2.6],
  [48, 15.6, 7.6, -10.3, 2.5],
  [50.5, 12.0, 6.2, -8.7, 2.3],
  [53, 7.6, 5.6, -7.6, 2.1],
  [57, 6.3, 5.6, -6.9, 2.0],
  [61, 6.2, 5.4, -6.9, 2.0],
];
export function torsoProf(y) { const r = tableAt(TORSO_ROWS, y); return { a: r[0], zf: r[1], zb: r[2], n: r[3] }; }
export function torsoPt(y, thDeg, inset = 0) {
  const P = torsoProf(y), t = thDeg * deg, s = Math.sin(t), c = Math.cos(t), e = 2 / P.n;
  const a = Math.max(P.a - inset, 0.3), zf = Math.max(P.zf - inset, 0.3), zb = Math.max(-P.zb - inset, 0.3);
  return [a * Math.sign(s) * Math.pow(Math.abs(s), e), y, (c >= 0 ? zf : -zb) * Math.pow(Math.abs(c), e)];
}
export function torsoN(y, thDeg, inset = 0) {
  const a = torsoPt(y, thDeg - 1.5, inset), b = torsoPt(y, thDeg + 1.5, inset);
  const c = torsoPt(y - 0.4, thDeg, inset), d = torsoPt(y + 0.4, thDeg, inset);
  let n = norm(cross(sub(b, a), sub(d, c)));
  const p = torsoPt(y, thDeg, inset);
  if (n[0] * p[0] + n[2] * p[2] < 0) n = mul(n, -1);
  return n;
}
// Ángulo (grados) del contorno del tronco que pasa más cerca de la coordenada x dada (lado izq.)
export function torsoThetaForX(y, x, front = true, inset = 0) {
  let best = 0, bd = 1e9;
  for (let th = 0; th <= 180; th += 0.5) {
    const p = torsoPt(y, th, inset); const d = Math.abs(p[0] - x) + (front ? (p[2] < 0 ? 100 : 0) : (p[2] > 0 ? 100 : 0));
    if (d < bd) { bd = d; best = th; }
  }
  return best;
}

// ---------- Miembros (lado izquierdo) ----------
// filas: t, centro anterior, centro lateral, radio antero-posterior, radio medio-lateral
function limb(A, Bp, rows, antRef = [0, 0, 1]) {
  const Y = norm(sub(Bp, A)), ANT = norm(orth(antRef, Y)), LAT = norm(cross(ANT, Y));
  return { A, B: Bp, L: dist(A, Bp), Y, ANT, LAT, rows };
}
export const LIMB = {
  upperArm: limb(J.shoulder, J.elbow, [
    [-0.1, 0.0, 1.2, 5.4, 5.9], [0.0, 0.0, 1.1, 5.6, 6.1], [0.12, 0.1, 0.9, 5.1, 5.5], [0.3, 0.2, 0.4, 4.6, 4.8],
    [0.5, 0.5, 0.1, 4.5, 4.5], [0.7, 0.6, 0.0, 4.3, 4.4], [0.88, 0.4, 0.0, 3.8, 4.6], [1.0, 0.2, 0.0, 3.5, 4.8], [1.08, 0.3, 0.1, 3.6, 4.9],
  ]),
  forearm: limb(J.elbow, J.wrist, [
    [-0.06, 0.3, 0.1, 3.5, 4.9], [0.0, 0.4, 0.2, 3.6, 4.9], [0.12, 0.5, 0.3, 3.8, 4.8], [0.3, 0.3, 0.2, 3.3, 4.3],
    [0.55, 0.0, 0.0, 2.6, 3.7], [0.8, 0.0, 0.0, 2.0, 3.2], [1.0, 0.0, 0.0, 1.8, 3.0], [1.06, 0.0, 0.0, 1.6, 3.1],
  ]),
  hand: limb(J.wrist, J.knuckles, [
    [0.0, 0.0, 0.0, 1.6, 3.0], [0.3, 0.1, 0.1, 1.5, 3.6], [0.7, 0.1, 0.2, 1.4, 4.1], [1.0, 0.0, 0.0, 1.2, 4.2],
  ]),
  thigh: limb(J.hip, J.knee, [
    [-0.06, -0.8, 0.9, 8.0, 8.4], [0.0, -0.7, 0.9, 8.0, 8.4], [0.15, -0.3, 0.8, 7.7, 7.9], [0.4, 0.2, 0.4, 6.9, 7.0],
    [0.65, 0.5, 0.2, 6.0, 6.1], [0.85, 0.5, 0.0, 5.2, 5.4], [1.0, 0.3, 0.0, 5.0, 5.3], [1.06, 0.0, 0.0, 4.9, 5.2],
  ]),
  leg: limb(J.knee, J.ankle, [
    [-0.04, -0.2, 0.0, 5.0, 5.2], [0.0, -0.3, 0.0, 5.0, 5.2], [0.12, -0.9, 0.0, 5.3, 5.0], [0.28, -1.4, 0.0, 5.5, 4.8],
    [0.45, -1.2, 0.0, 4.8, 4.3], [0.65, -0.6, 0.0, 3.8, 3.6], [0.85, -0.2, 0.0, 3.0, 3.0], [1.0, 0.0, 0.0, 2.9, 3.3],
  ]),
  foot: limb(J.ankle, J.toe, [
    [-0.25, -1.0, 0.0, 3.4, 3.2], [0.0, -0.6, 0.0, 3.4, 3.6], [0.35, -1.6, 0.2, 2.6, 4.2], [0.7, -2.0, 0.3, 1.8, 4.6], [1.0, -2.3, 0.0, 1.0, 3.6],
  ], [0, 1, 0]),
};
export function limbPt(seg, t, thDeg, inset = 0) {
  const r = tableAt(seg.rows, t), th = thDeg * deg;
  const ra = Math.max(r[2] - inset, 0.05), rl = Math.max(r[3] - inset, 0.05);
  let p = madd(seg.A, seg.Y, t * seg.L);
  p = madd(p, seg.ANT, r[0] + ra * Math.cos(th));
  return madd(p, seg.LAT, r[1] + rl * Math.sin(th));
}
// Punto interior: fracción rf del radio local (0 = eje, 1 = superficie)
export function limbIn(seg, t, thDeg, rf) {
  const r = tableAt(seg.rows, t), th = thDeg * deg;
  let p = madd(seg.A, seg.Y, t * seg.L);
  p = madd(p, seg.ANT, r[0] + r[2] * rf * Math.cos(th));
  return madd(p, seg.LAT, r[1] + r[3] * rf * Math.sin(th));
}
const ARM = [LIMB.upperArm, LIMB.forearm, LIMB.hand], LEG = [LIMB.thigh, LIMB.leg, LIMB.foot];
function chainPt(chain, u, th, inset, fn, blend = 0.06) {
  const n = chain.length;
  let i = Math.floor(u); if (i < 0) i = 0; if (i > n - 1) i = n - 1;
  const t = u - i;
  const here = fn(chain[i], t, th, inset);
  if (i < n - 1 && t > 1 - blend) { const nx = fn(chain[i + 1], t - 1, th, inset); return lerp(here, nx, smooth(1 - blend, 1 + blend, t) - (t > 1 ? 0 : 0)); }
  if (i > 0 && t < blend) { const pv = fn(chain[i - 1], t + 1, th, inset); return lerp(pv, here, smooth(-blend, blend, t)); }
  return here;
}
export const armPt = (u, th, inset = 0) => chainPt(ARM, u, th, inset, limbPt);
// Centro del eje del miembro (para normales hacia afuera)
const axisPt = (seg, t) => { const r = tableAt(seg.rows, t); return madd(madd(madd(seg.A, seg.Y, t * seg.L), seg.ANT, r[0]), seg.LAT, r[1]); };
export const armAxis = (u) => chainPt(ARM, u, 0, 0, (seg, t) => axisPt(seg, t));
export const legAxis = (u) => chainPt(LEG, u, 0, 0, (seg, t) => axisPt(seg, t));
export const legPt = (u, th, inset = 0) => chainPt(LEG, u, th, inset, limbPt);
export const armIn = (u, th, rf) => chainPt(ARM, u, th, rf, limbIn);
export const legIn = (u, th, rf) => chainPt(LEG, u, th, rf, limbIn);

// ---------- Pesos de skinning: [huesoA, huesoB, pesoA] ----------
export function trunkW(p) {
  if (p[1] < 49) { const w = smooth(12, 30, p[1]); return [B.pelvis, B.chest, 1 - w]; }
  const w = smooth(53, 62.5, p[1]); return [B.chest, B.head, 1 - w];
}
export const headW = () => [B.head, B.head, 1];
export const rigid = (name) => [B[name], B[name], 1];
const yU = norm(sub(J.elbow, J.shoulder)), yF = norm(sub(J.wrist, J.elbow)), yH = norm(sub(J.knuckles, J.wrist));
export function armW(p) {
  const du = dot(sub(p, J.shoulder), yU), df = dot(sub(p, J.elbow), yF), dh = dot(sub(p, J.wrist), yH);
  if (df < 0) {
    if (df > -2.5) return [B.upperArmL, B.forearmL, 1 - 0.5 * smooth(-2.5, 0, df)];
    return [B.chest, B.upperArmL, 1 - smooth(-2.5, 4.5, du)];
  }
  if (dh >= -2) { const wh = dh < 0 ? 0.5 * smooth(-2, 0, dh) : 0.5 + 0.5 * smooth(0, 2, dh); return [B.forearmDistL, B.handL, 1 - wh]; }
  if (df < 3) return [B.upperArmL, B.forearmL, 0.5 - 0.5 * smooth(0, 3, df)];
  const t = df / SEG.forearm;
  if (t < 0.5) return [B.forearmL, B.forearmMidL, 1 - smooth(0.12, 0.5, t)];
  return [B.forearmMidL, B.forearmDistL, 1 - smooth(0.5, 0.92, t)];
}
const yT = norm(sub(J.knee, J.hip)), yL = norm(sub(J.ankle, J.knee)), yFo = norm(sub(J.toe, J.ankle));
export function legW(p) {
  const dt = dot(sub(p, J.hip), yT), dk = dot(sub(p, J.knee), yL), da = dot(sub(p, J.ankle), yL), fw = dot(sub(p, J.ankle), yFo);
  const inFoot = da > -2.5 || (fw > 4 && da > -6);
  if (inFoot) { const w = Math.max(da < 0.5 ? smooth(-2.5, 0.5, da) : 1, smooth(3, 7, fw)); return [B.legL, B.footL, 1 - w]; }
  if (dk < 0) {
    if (dk > -3) return [B.thighL, B.legL, 1 - 0.5 * smooth(-3, 0, dk)];
    return [B.pelvis, B.thighL, 1 - smooth(-3, 6, dt)];
  }
  if (dk < 3) return [B.thighL, B.legL, 0.5 - 0.5 * smooth(0, 3, dk)];
  return [B.legL, B.legL, 1];
}
export const mirrorW = (w) => [BONE_MIRROR[w[0]], BONE_MIRROR[w[1]], w[2]];
// Pesos por región para un punto del lado izquierdo (o de la línea media).
export function regionW(p, region) {
  switch (region) {
    case 'arm': return armW(p);
    case 'leg': return legW(p);
    case 'head': return headW();
    case 'trunk': return trunkW(p);
    default: return rigid(region);
  }
}
// Mezcla dos juegos de pesos (t = cuánto de w2). Devuelve dos huesos como máximo.
export function blendW(w1, w2, t) {
  const acc = new Map();
  const put = (b, x) => acc.set(b, (acc.get(b) || 0) + x);
  put(w1[0], w1[2] * (1 - t)); put(w1[1], (1 - w1[2]) * (1 - t));
  put(w2[0], w2[2] * t); put(w2[1], (1 - w2[2]) * t);
  const arr = [...acc.entries()].filter((e) => e[1] > 1e-5).sort((a, b) => b[1] - a[1]);
  if (arr.length === 1) return [arr[0][0], arr[0][0], 1];
  const s = arr[0][1] + arr[1][1];
  return [arr[0][0], arr[1][0], arr[0][1] / s];
}

// ---------- Columna vertebral ----------
// nombre, y, z del centro del cuerpo vertebral, semiancho, semiprofundidad, altura del cuerpo
export const VERT = [
  ['C1', 64.6, 0.6, 0.9, 0.6, 1.0], ['C2', 61.9, 0.2, 1.0, 0.8, 1.6], ['C3', 59.5, -0.3, 1.05, 0.8, 1.3],
  ['C4', 57.4, -0.8, 1.1, 0.8, 1.3], ['C5', 55.4, -1.4, 1.15, 0.82, 1.3], ['C6', 53.5, -2.1, 1.2, 0.85, 1.35],
  ['C7', 51.5, -3.0, 1.3, 0.9, 1.4], ['T1', 49.4, -3.9, 1.35, 0.95, 1.55], ['T2', 47.2, -4.8, 1.38, 1.0, 1.65],
  ['T3', 45.0, -5.5, 1.4, 1.05, 1.75], ['T4', 42.8, -6.0, 1.45, 1.1, 1.8], ['T5', 40.6, -6.35, 1.5, 1.15, 1.85],
  ['T6', 38.4, -6.55, 1.55, 1.2, 1.9], ['T7', 36.2, -6.6, 1.6, 1.25, 1.95], ['T8', 34.0, -6.5, 1.65, 1.3, 2.0],
  ['T9', 31.8, -6.2, 1.72, 1.35, 2.05], ['T10', 29.6, -5.8, 1.8, 1.4, 2.1], ['T11', 27.3, -5.2, 1.88, 1.45, 2.2],
  ['T12', 24.9, -4.5, 1.95, 1.5, 2.3], ['L1', 22.1, -3.6, 2.1, 1.55, 2.45], ['L2', 19.0, -2.8, 2.2, 1.6, 2.55],
  ['L3', 15.9, -2.2, 2.3, 1.65, 2.6], ['L4', 12.85, -2.05, 2.35, 1.65, 2.6], ['L5', 9.9, -2.55, 2.4, 1.6, 2.55],
].map(([name, y, z, rx, rz, h], i) => ({ name, i, y, z, rx, rz, h }));
export const V = Object.fromEntries(VERT.map((v) => [v.name, v]));
// Curva del eje de los cuerpos vertebrales (de arriba abajo, sigue hasta el sacro)
const SPINE_PTS = [[0, 67.5, 1.2], ...VERT.map((v) => [0, v.y, v.z]), [0, 7.4, -4.6], [0, 4.6, -7.6], [0, 1.6, -9.9], [0, -1.2, -10.6]];
export function spineAt(y) {
  // punto del eje a la altura y (interpolación por tramos)
  for (let i = 0; i < SPINE_PTS.length - 1; i++) {
    const a = SPINE_PTS[i], b = SPINE_PTS[i + 1];
    if (y <= a[1] && y >= b[1]) { const t = (a[1] - y) / (a[1] - b[1]); return lerp(a, b, t); }
  }
  return y > SPINE_PTS[0][1] ? SPINE_PTS[0].slice() : SPINE_PTS[SPINE_PTS.length - 1].slice();
}
export function spineTangent(y) { return norm(sub(spineAt(y + 0.5), spineAt(y - 0.5))); }
// Centro del conducto vertebral (médula) a la altura y
export function canalAt(y) {
  const p = spineAt(y), t = spineTangent(y);
  const back = norm(cross([1, 0, 0], t)); // hacia atrás
  const vr = VERT.reduce((best, v) => (Math.abs(v.y - y) < Math.abs(best.y - y) ? v : best), VERT[0]);
  const off = vr.rz + (y > 50 ? 0.95 : y > 24 ? 0.85 : 1.0);
  return madd(p, back, off * (back[2] < 0 ? 1 : -1));
}

// ---------- Costillas (lado izquierdo) ----------
// k, semiancho A, semiprofundidad D, centro z, y posterior (cabeza), y anterior (unión condrocostal),
// ángulo de la unión condrocostal, ángulo final del cartílago (o de la punta si es flotante)
export const RIBS = [
  [1, 6.4, 5.3, -0.3, 49.3, 46.0, 30, 7.5],
  [2, 9.2, 7.0, 0.0, 47.2, 42.8, 34, 8.5],
  [3, 11.2, 8.4, 0.2, 45.0, 39.6, 38, 9.5],
  [4, 12.6, 9.2, 0.3, 42.8, 36.6, 40, 10.5],
  [5, 13.5, 9.7, 0.4, 40.6, 33.8, 42, 11.5],
  [6, 14.0, 10.0, 0.5, 38.4, 31.0, 46, 12.5],
  [7, 14.2, 10.1, 0.5, 36.2, 28.6, 52, 13],
  [8, 14.2, 9.9, 0.4, 34.0, 26.4, 62, 32],
  [9, 13.9, 9.5, 0.2, 31.8, 24.2, 70, 50],
  [10, 13.4, 9.1, 0.0, 29.6, 22.4, 80, 66],
  [11, 12.3, 8.4, -0.4, 27.3, 20.6, 92, 92],
  [12, 10.6, 7.4, -0.9, 24.9, 20.8, 116, 116],
].map(([k, A, D, zc, yP, yA, phA, phE]) => ({ k, A, D, zc, yP, yA, phA, phE, floating: k >= 11 }));

function ringPt(r, ph) {
  const t = ph * deg, s = Math.sin(t), c = Math.cos(t), e = 2 / 2.25;
  return [r.A * Math.sign(s) * Math.pow(Math.abs(s), e), 0, r.zc + r.D * Math.sign(c) * Math.pow(Math.abs(c), e)];
}
function ribY(r, ph) {
  const g = clamp((ph - r.phA) / (172 - r.phA), 0, 1);
  return r.yA + (r.yP - r.yA) * (1 - Math.pow(1 - g, 1.7));
}
// Puntos de control del eje de una costilla, de la cabeza (vértebra) a la punta ósea.
export function ribAxis(r) {
  const vt = VERT[6 + r.k]; // T(k)
  const pts = [];
  pts.push([1.6 + vt.rx * 0.6, r.yP + 0.25, vt.z - 0.2]);                 // cabeza
  pts.push([2.6 + vt.rx * 0.6, r.yP + 0.15, vt.z - 1.6]);                 // cuello
  pts.push([3.4 + vt.rx * 0.5, r.yP - 0.1, vt.z - 2.6]);                  // tubérculo
  const steps = 14;
  for (let i = 0; i <= steps; i++) {
    const ph = 150 - (150 - r.phA) * (i / steps);
    const q = ringPt(r, ph); q[1] = ribY(r, ph); pts.push(q);
  }
  return pts;
}
// Camino del cartílago costal desde la punta ósea hasta el esternón o el cartílago superior.
export function ribCartilage(r) {
  if (r.floating) return null;
  const pts = [];
  const steps = 8;
  for (let i = 0; i <= steps; i++) {
    const ph = r.phA - (r.phA - r.phE) * (i / steps);
    const q = ringPt(r, ph);
    const g = i / steps;
    const rise = [-0.2, 0.1, 0.2, 0.5, 0.8, 1.5, 2.1, 3.6, 4.3, 2.8][r.k - 1];
    q[1] = r.yA + (r.k <= 7 ? rise * Math.sin(g * Math.PI * 0.5) : rise * g);
    if (r.k <= 7) q[2] -= 0.4 * g; // se hunden un poco hacia el esternón
    pts.push(q);
  }
  return pts;
}
// Punto a lo largo de una costilla (u de 0 = cabeza a 1 = punta ósea)
export function ribPoint(r, u) { return catmull(ribAxis(r), u); }

// ---------- Esternón ----------
export const STERNUM = {
  jug: [0, 46.6, 5.4], angle: [0, 42.4, 7.4], xiph: [0, 30.6, 10.0], tip: [0, 27.4, 9.4],
};
export function sternumAt(y) {
  const pts = [STERNUM.jug, STERNUM.angle, STERNUM.xiph, STERNUM.tip];
  for (let i = 0; i < 3; i++) { const a = pts[i], b = pts[i + 1]; if (y <= a[1] && y >= b[1]) return lerp(a, b, (a[1] - y) / (a[1] - b[1])); }
  return y > 46.6 ? pts[0].slice() : pts[3].slice();
}

// ---------- Cintura escapular (izquierda) ----------
export const CLAV = [[2.4, 46.5, 5.0], [6.0, 47.1, 5.8], [10.0, 47.8, 4.5], [13.6, 48.7, 1.3], [16.2, 49.4, -2.4]];
export const SCAP = {
  sup: [7.0, 46.6, -9.0], inf: [9.6, 34.6, -10.6], med: [6.6, 41.0, -10.4], spineRoot: [6.8, 43.6, -10.2],
  glen: [15.4, 46.6, -1.6], acrom: [16.9, 49.6, -2.6], acromTip: [17.6, 49.4, -0.4], coracoid: [13.0, 46.4, 2.6], neck: [14.2, 46.0, -3.0],
};
// ---------- Pelvis (izquierda) ----------
export const PEL = {
  acet: [10, 0, 0], asis: [12.4, 9.2, 6.6], aiis: [11.4, 5.6, 5.0], crestTop: [14.4, 14.2, -1.8], crestPost: [9.0, 12.0, -9.0],
  psis: [4.6, 8.6, -10.0], ischTub: [6.6, -6.8, -4.4], ischSpine: [5.4, -1.8, -6.4], pubTub: [2.6, -2.4, 7.4], sym: [0, -3.6, 7.6],
  obt: [6.4, -4.6, 3.4], sciaticNotch: [7.6, 3.0, -6.8], sacrumTop: [0, 8.4, -4.0], sacrumApex: [0, 0.8, -10.2], si: [5.0, 6.0, -8.2],
};
