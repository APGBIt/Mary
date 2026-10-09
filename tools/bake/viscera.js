// Geometría compartida de las vísceras: superficie del diafragma, cavidad del tronco, corazón,
// proyección sobre el cráneo y ayudas para formas orientadas. Lado izquierdo = x > 0.
import { torsoProf } from './body.js';
import { sdEllipsoid, sdRoundCone, sdCapsule, sdSphere, smin, smax, ssub } from './sdf.js';
import { skull, mandible } from './skeleton.js';
import { add, sub, mul, madd, dot, cross, len, norm, clamp, smooth, mix } from '../../src/anatomy/v3.js';

// ---------------- Diafragma ----------------
// Parametrización (a = ángulo alrededor del eje vertical, 0 = adelante; r = 0 centro, 1 borde)
export const rimY = (c) => 24.5 + 2.75 * c + (c > 0 ? 2.5 * c : 0);
// Perfil de las dos cúpulas: la derecha (x < 0, sobre el hígado) más alta que la izquierda,
// y el centro tendinoso algo más bajo, donde se apoya el corazón.
export const cupolaH = (x) => 31.2 + 3.2 * Math.exp(-(((x + 6.2) / 3.8) ** 2)) + 2.4 * Math.exp(-(((x - 6.4) / 3.6) ** 2));
export function diaphXZ(a, r) { const c = Math.cos(a); return [Math.sin(a) * 12.6 * r, 0.5 + c * 9 * r - (c < 0 ? r : 0)]; }
// Altura de la cara superior del diafragma (sobre el plano (a, r))
export function diaphTopAR(a, r) {
  const c = Math.cos(a), x = Math.sin(a) * 12.6 * r, rim = rimY(c);
  if (r <= 1) return rim + (cupolaH(x) - rim) * (1 - r * r * r);
  return rim - (r - 1) * 25;
}
// Inversión numérica (x, z) -> (a, r)
export function diaphInvert(x, z) {
  let a = Math.atan2(x / 12.6, (z - 0.5) / 9), r = Math.hypot(x / 12.6, (z - 0.5) / 9);
  for (let i = 0; i < 8; i++) {
    const c = Math.cos(a), s = Math.sin(a);
    const xp = s * 12.6 * r, zp = 0.5 + c * 9 * r - (c < 0 ? r : 0);
    const ex = x - xp, ez = z - zp;
    if (Math.abs(ex) + Math.abs(ez) < 1e-4) break;
    const dxdr = s * 12.6, dzdr = c * 9 - (c < 0 ? 1 : 0), dxda = c * 12.6 * r, dzda = -s * 9 * r;
    const det = dxdr * dzda - dxda * dzdr;
    if (Math.abs(det) < 1e-7) { r = Math.max(r, 1e-3); a += 0.01; continue; }
    r += (ex * dzda - dxda * ez) / det; a += (dxdr * ez - ex * dzdr) / det;
    if (r < 0) { r = -r; a += Math.PI; }
  }
  return { a, r };
}
export function diaphTop(x, z) { const { a, r } = diaphInvert(x, z); return diaphTopAR(a, r); }

// ---------------- Cavidad del tronco ----------------
// Distancia aproximada al contorno del tronco reducido "inset" cm (negativa adentro)
export function cavity(x, y, z, inset) {
  const P = torsoProf(clamp(y, -10, 61));
  const a = Math.max(P.a - inset, 0.5), zf = Math.max(P.zf - inset, 0.5), zb = Math.max(-P.zb - inset, 0.5);
  const b = z >= 0 ? zf : zb;
  const q = Math.pow(Math.pow(Math.abs(x) / a, P.n) + Math.pow(Math.abs(z) / b, P.n), 1 / P.n);
  return (q - 1) * Math.min(a, b) * 0.95;
}

// ---------------- Formas orientadas ----------------
export function axesFrom(u, hint = [0, 0, 1]) {
  const a = norm(u); let b = cross(hint, a); if (len(b) < 1e-4) b = cross([1, 0, 0], a);
  b = norm(b); const c = cross(a, b); return [a, b, c];
}
// Elipsoide con ejes propios (ax = [u, v, w] unitarios) y radios r
export function sdEllAx(x, y, z, c, ax, r) {
  const px = x - c[0], py = y - c[1], pz = z - c[2];
  return sdEllipsoid(px * ax[0][0] + py * ax[0][1] + pz * ax[0][2], px * ax[1][0] + py * ax[1][1] + pz * ax[1][2], px * ax[2][0] + py * ax[2][1] + pz * ax[2][2], 0, 0, 0, r[0], r[1], r[2]);
}

// ---------------- Corazón ----------------
// Base de los ventrículos (atrás, arriba, a la derecha) y punta (adelante, abajo, a la izquierda)
export const HEART = { base: [0.5, 37.7, 2.4], apex: [7.0, 32.0, 6.3], center: [1.8, 35.6, 3.0] };
const hAx = norm(sub(HEART.apex, HEART.base));
export function heartSDF(x, y, z) {
  // masa ventricular: cono redondeado de la base a la punta
  let d = sdRoundCone(x, y, z, HEART.base, HEART.apex, 4.15, 1.05);
  // ventrículo derecho abombado hacia adelante; ventrículo izquierdo hacia atrás e izquierda
  d = smin(d, sdEllipsoid(x, y, z, 1.9, 35.0, 5.0, 3.3, 2.6, 2.0), 1.3);
  d = smin(d, sdEllipsoid(x, y, z, 4.0, 34.6, 2.2, 2.8, 2.6, 2.6), 1.3);
  // cara diafragmática aplanada sobre el centro tendinoso
  d = smax(d, 31.75 - y, 1.1);
  // aurículas (derecha a la derecha, izquierda atrás) y orejuelas
  d = smin(d, sdEllipsoid(x, y, z, -2.3, 37.4, 2.2, 2.2, 2.9, 2.4), 1.0);
  d = smin(d, sdEllipsoid(x, y, z, 1.6, 38.6, -0.6, 2.8, 1.8, 1.9), 1.1);
  d = smin(d, sdEllipsoid(x, y, z, -0.9, 39.6, 4.2, 1.3, 0.9, 1.3), 0.6);
  d = smin(d, sdEllipsoid(x, y, z, 4.3, 38.8, 3.6, 1.35, 0.75, 1.45), 0.5);
  // tracto de salida del ventrículo derecho (infundíbulo) hacia el tronco pulmonar
  d = smin(d, sdRoundCone(x, y, z, [2.0, 37.4, 5.0], [1.8, 39.6, 4.6], 1.5, 1.2), 0.8);
  // surcos: interventricular anterior y coronario (auriculoventricular)
  const g1 = sdCapsule(x, y, z, [2.4, 38.4, 6.2], [6.4, 32.6, 7.4], 0.22);
  const g2 = sdCapsule(x, y, z, [-3.4, 36.0, 4.4], [0.4, 38.6, 5.6], 0.2);
  d = ssub(d, Math.min(g1, g2) - 0.05, 0.35);
  return d;
}
// Proyecta p sobre la superficie del corazón (desde su centro) y la separa "off" cm
export function onHeart(p, off = 0) {
  const c = HEART.center, dir = norm(sub(p, c));
  let a = 0, b = 12;
  for (let i = 0; i < 30; i++) { const m = (a + b) / 2, q = madd(c, dir, m); if (heartSDF(q[0], q[1], q[2]) < 0) a = m; else b = m; }
  const q = madd(c, dir, b), e = 0.05;
  const n = norm([heartSDF(q[0] + e, q[1], q[2]) - heartSDF(q[0] - e, q[1], q[2]), heartSDF(q[0], q[1] + e, q[2]) - heartSDF(q[0], q[1] - e, q[2]), heartSDF(q[0], q[1], q[2] + e) - heartSDF(q[0], q[1], q[2] - e)]);
  return madd(q, n, off);
}
void hAx;

// ---------------- Cráneo ----------------
const HC = [0, 70.5, 0.5];
const skullF = (x, y, z) => Math.min(skull(x, y, z), mandible(x, y, z));
// Proyecta p sobre la superficie externa del cráneo y la separa "off" cm hacia afuera
export function onSkull(p, off = 0, center = HC) {
  const dir = norm(sub(p, center));
  let a = 0, b = 16;
  for (let i = 0; i < 28; i++) { const m = (a + b) / 2, q = madd(center, dir, m); if (skullF(q[0], q[1], q[2]) < 0) a = m; else b = m; }
  const q = madd(center, dir, b), e = 0.05;
  const n = norm([skullF(q[0] + e, q[1], q[2]) - skullF(q[0] - e, q[1], q[2]), skullF(q[0], q[1] + e, q[2]) - skullF(q[0], q[1] - e, q[2]), skullF(q[0], q[1], q[2] + e) - skullF(q[0], q[1], q[2] - e)]);
  return madd(q, n, off);
}
export { add, sub, mul, madd, dot, cross, len, norm, clamp, smooth, mix, sdSphere };

// ---------------- Recorridos compartidos (órganos, vasos y nervios) ----------------
// Aorta: raíz, ascendente, cayado, descendente torácica y abdominal (hasta la bifurcación en L4)
export const AORTA_ASC = [[0.7, 37.6, 3.2], [-0.1, 39.6, 3.8], [-0.6, 41.8, 3.5], [-0.3, 43.8, 2.6]];
export const AORTA_ARCH = [[-0.3, 43.8, 2.6], [0.5, 44.9, 1.5], [1.9, 45.1, 0.3], [2.8, 44.3, -1.6], [2.9, 42.6, -3.4]];
export const AORTA_DESC = [[2.9, 42.6, -3.4], [2.6, 39.0, -4.3], [2.1, 35.0, -4.0], [1.6, 31.0, -3.3], [1.1, 27.6, -2.4], [0.7, 24.8, -1.5]];
export const AORTA_ABD = [[0.7, 24.8, -1.5], [0.6, 22.0, -0.6], [0.6, 18.8, 0.2], [0.6, 15.8, 0.7], [0.5, 13.2, 0.9]];
export const AORTA = [...AORTA_ASC, ...AORTA_ARCH.slice(1), ...AORTA_DESC.slice(1), ...AORTA_ABD.slice(1)];
// Esófago (de C6 al cardias) y tráquea (del cricoides a la carina)
export const ESOPH = [[0, 53.6, -0.6], [0, 50.0, -2.2], [0.2, 46.5, -3.3], [0.5, 43.0, -3.9], [0.6, 39.5, -3.3], [0.8, 35.5, -2.4], [1.6, 32.0, -1.4], [2.2, 29.6, -0.9], [3.1, 27.6, -0.4]];
export const TRACHEA = [[0, 53.7, 1.45], [0, 50.0, 0.45], [0, 46.6, -0.6], [0.1, 42.3, -2.0]];
// Venas cavas
export const SVC = [[-2.9, 46.2, 2.2], [-3.0, 43.0, 2.0], [-2.8, 40.2, 1.9], [-2.5, 38.6, 1.9]];
export const IVC = [[-2.1, 35.2, 1.2], [-2.3, 32.0, 0.4], [-2.5, 27.6, -1.0], [-2.1, 24.0, -1.3], [-2.0, 20.0, -0.8], [-1.9, 16.0, -0.3], [-1.3, 11.6, -0.1]];
// Riñones: centro, eje largo (polo superior medial y posterior), dirección del hilio, semiejes
export const KIDNEY = {
  L: { c: [5.5, 20.4, -5.4], up: [-0.2, 1, -0.22], hil: [-0.72, 0, 0.69], r: [4.4, 2.6, 1.7] },
  R: { c: [-5.3, 19.2, -5.4], up: [0.2, 1, -0.22], hil: [0.72, 0, 0.69], r: [4.3, 2.55, 1.7] },
};
export const tubeSDF = (x, y, z, P, R, k = 0.3) => {
  let d = 1e9;
  for (let i = 0; i < P.length - 1; i++) {
    const di = sdRoundCone(x, y, z, P[i], P[i + 1], Array.isArray(R) ? R[i] : R, Array.isArray(R) ? R[i + 1] : R);
    d = i ? smin(d, di, k) : di;
  }
  return d;
};
