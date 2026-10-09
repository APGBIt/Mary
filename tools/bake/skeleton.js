// Esqueleto detallado (lado izquierdo + línea media; los huesos pares se reflejan).
import { sdSphere, sdEllipsoid, sdCapsule, sdRoundCone, sdBox, sdPolyTube, smin, smax, ssub, fbm3 } from './sdf.js';
import { Geo, addSDF, addTube, addMuscle } from './builder.js';
import { J, B, VERT, spineAt, spineTangent, RIBS, ribAxis, ribCartilage, STERNUM, CLAV, SCAP, PEL, trunkW, armW, rigid, torsoPt, torsoThetaForX } from './body.js';
import { add, sub, mul, madd, dot, cross, len, norm, lerp, mirrorX, orth } from '../../src/anatomy/v3.js';
import { SID } from '../../src/anatomy/atlas.js';

const S = (id) => { const s = SID[id]; if (!s) throw new Error('Falta en el atlas: ' + id); return s; };
const AUX_CART = 1, AUX_TOOTH = 0.5;

// ---------------- Cráneo ----------------
const TEETH_UP = [], TEETH_LO = [];
{
  // arcada dental: 8 piezas por lado (incisivos a molares)
  const arch = (k, y0) => { // k=0..7
    const a = (k + 0.5) / 8; // 0 = línea media, 1 = atrás
    const ang = a * 1.35;
    const x = Math.sin(ang) * 2.75, z = 8.75 - (1 - Math.cos(ang)) * 3.9 - a * 0.6;
    return [x, y0, z];
  };
  for (let k = 0; k < 8; k++) {
    const r = k < 2 ? 0.36 : k < 3 ? 0.4 : k < 5 ? 0.42 : 0.5;
    const pu = arch(k, 62.55), pl = arch(k, 62.05);
    const plx = [pl[0] * 0.93, pl[1], pl[2] - 0.15];
    TEETH_UP.push([pu, r], [mirrorX(pu), r]);
    TEETH_LO.push([plx, r * 0.95], [mirrorX(plx), r * 0.95]);
  }
}
function teeth(list, x, y, z, up) {
  let d = 1e9;
  for (const [c, r] of list) {
    const a = up ? [c[0], c[1] + 0.25, c[2]] : [c[0], c[1] - 0.25, c[2]];
    const b = up ? [c[0], c[1] - 0.3, c[2]] : [c[0], c[1] + 0.3, c[2]];
    d = Math.min(d, sdCapsule(x, y, z, a, b, r));
  }
  return d;
}
export function skull(x, y, z) {
  const ax = Math.abs(x);
  // bóveda: ovoide con frente más plana y eminencias parietales
  let d = sdEllipsoid(x, y, z, 0, 73.6, -0.9, 6.95, 8.2, 9.4);
  d = smin(d, sdEllipsoid(ax, y, z, 3.6, 75.8, -2.4, 3.2, 3.6, 4.6), 2.2);
  d = smax(d, z - 8.9 - Math.max(0, 74 - y) * 0.06, 1.2);
  // frente inferior y arcos superciliares (repisa sobre las órbitas)
  d = smin(d, sdEllipsoid(x, y, z, 0, 71.7, 7.9, 5.6, 1.5, 1.3), 0.9);
  // macizo facial superior (entre órbitas), malares y maxilar
  d = smin(d, sdEllipsoid(x, y, z, 0, 68.9, 6.0, 5.4, 3.4, 3.4), 1.3);
  d = smin(d, sdEllipsoid(ax, y, z, 5.1, 67.5, 6.1, 1.45, 1.35, 1.7), 1.5);
  d = smin(d, sdEllipsoid(ax, y, z, 3.1, 66.4, 7.1, 1.9, 1.7, 1.8), 1.0);
  d = smin(d, sdCapsule(ax, y, z, [5.8, 67.4, 4.2], [6.8, 67.7, -0.2], 0.45), 1.0);
  d = smin(d, sdEllipsoid(x, y, z, 0, 65.0, 6.8, 3.4, 2.6, 2.9), 1.2);
  d = smin(d, sdPolyTube(ax, y, z, [[2.75, 63.1, 4.6], [2.35, 63.0, 7.0], [1.25, 62.95, 8.5], [0, 62.95, 8.9]], [0.62, 0.62, 0.6, 0.6]), 0.7);
  d = smin(d, sdRoundCone(x, y, z, [0, 70.4, 9.0], [0, 68.2, 10.0], 0.75, 0.5), 0.6); // huesos nasales
  d = smin(d, sdRoundCone(ax, y, z, [6.0, 67.4, -1.3], [5.6, 65.0, -1.7], 1.0, 0.4), 0.6); // apófisis mastoides
  d = smin(d, sdEllipsoid(x, y, z, 0, 66.1, -6.2, 4.6, 1.6, 2.8), 1.4); // base del occipital
  // cavidades: órbitas, abertura nasal, agujero magno, fosa temporal, conducto auditivo
  d = ssub(d, Math.min(sdEllipsoid(ax, y, z, 3.3, 70.0, 9.6, 2.1, 1.9, 2.2), sdRoundCone(ax, y, z, [3.3, 70.0, 9.4], [2.6, 70.2, 4.8], 1.95, 0.6)), 0.45);
  d = ssub(d, Math.min(sdEllipsoid(x, y, z, 0, 66.3, 9.9, 1.05, 1.55, 2.4), sdSphere(x, y, z, 0, 65.3, 9.6, 0.95)), 0.3);
  d = ssub(d, sdSphere(x, y, z, 0, 64.3, -2.8, 1.45), 0.3);
  d = ssub(d, sdEllipsoid(ax, y, z, 7.5, 71.6, 2.2, 0.9, 2.6, 3.2), 1.0);
  d = ssub(d, sdCapsule(ax, y, z, [7.4, 68.2, -0.6], [5.6, 68.2, -0.6], 0.42), 0.2);
  d = ssub(d, sdSphere(ax, y, z, 2.0, 67.7, 9.2, 0.28), 0.1); // forámenes infraorbitarios
  d = ssub(d, sdSphere(ax, y, z, 2.3, 72.2, 8.9, 0.22), 0.1); // forámenes supraorbitarios
  // suturas sutiles
  const sut = Math.abs(sdEllipsoid(x, y, z, 0, 73.6, -0.9, 6.95, 8.2, 9.4));
  if (sut < 0.5) {
    const coronal = Math.abs(z - 2.6 + (y - 74) * 0.32), sagittal = Math.abs(x), lambd = Math.abs(z + 6.5 + (y - 74) * 0.5);
    const g = Math.min(coronal, y > 74 ? sagittal : 9, lambd);
    if (g < 0.09 && y > 70) d += (0.09 - g) * 0.5;
  }
  if (y > 61.2 && y < 63.6 && z > 3.6 && ax < 3.5) d = Math.min(d, teeth(TEETH_UP, x, y, z, true));
  return d;
}
// Distancia 2D a una polilínea (en el plano xz) y parámetro a lo largo de ella
function polyXZ(px, pz, pts) {
  let best = 1e9, bs = 0, acc = 0, total = 0;
  for (let i = 0; i < pts.length - 1; i++) total += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const bx = b[0] - a[0], bz = b[1] - a[1], L2 = bx * bx + bz * bz, L = Math.sqrt(L2);
    let h = ((px - a[0]) * bx + (pz - a[1]) * bz) / L2; h = h < 0 ? 0 : h > 1 ? 1 : h;
    const dd = Math.hypot(px - a[0] - bx * h, pz - a[1] - bz * h);
    if (dd < best) { best = dd; bs = (acc + h * L) / total; }
    acc += L;
  }
  return [best, bs];
}
// Polígono convexo 2D (y, z): distancia aproximada con signo
function convex2(py, pz, poly) {
  let d = -1e9;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const ey = b[0] - a[0], ez = b[1] - a[1], L = Math.hypot(ey, ez);
    const ny = ez / L, nz = -ey / L;
    d = Math.max(d, (py - a[0]) * ny + (pz - a[1]) * nz);
  }
  return d;
}
const JAW_ARCH = [[4.95, 0.5], [4.55, 3.0], [3.5, 6.0], [1.9, 7.9], [0, 8.6]];
const RAMUS = [[60.8, 0.1], [66.2, -1.0], [66.4, 2.2], [61.8, 2.8]];
export function mandible(x, y, z) {
  const ax = Math.abs(x);
  const [dxz, s] = polyXZ(ax, z, JAW_ARCH);
  const yc = 60.85 - s * 0.25, hh = 0.95 + s * 0.3, th = 0.5 + s * 0.12;
  let d = (Math.hypot(dxz / th, (y - yc) / hh) - 1) * Math.min(th, hh);
  d = smin(d, sdPolyTube(ax, y, z, JAW_ARCH.map(([a, b], i) => [a * 0.97, 61.7 - i * 0.02, b * 0.985]), [0.42, 0.42, 0.42, 0.4, 0.4]), 0.5); // reborde alveolar
  d = smin(d, sdEllipsoid(x, y, z, 0, 59.6, 8.75, 1.75, 0.95, 0.7), 0.6); // mentón
  // rama: placa con escotadura sigmoidea
  const xr = 4.95 + (y - 60.6) * 0.06;
  let r = Math.max(convex2(y, z, RAMUS) + 0.25, Math.abs(ax - xr) - 0.2) - 0.25;
  r = ssub(r, sdSphere(ax, y, z, xr, 67.0, 0.8, 0.95), 0.25);
  d = smin(d, r, 0.7);
  d = smin(d, sdEllipsoid(ax, y, z, 5.45, 67.0, -1.0, 0.95, 0.5, 0.55), 0.35); // cóndilo
  d = smin(d, sdRoundCone(ax, y, z, [5.15, 65.8, 2.2], [5.25, 67.0, 2.5], 0.32, 0.18), 0.3); // coronoides
  d = smin(d, sdEllipsoid(ax, y, z, 4.95, 60.4, 0.3, 0.55, 0.7, 0.6), 0.5); // ángulo
  if (y > 61.2 && y < 63.2 && z > 3.4 && ax < 3.4) d = Math.min(d, teeth(TEETH_LO, x, y, z, false));
  return d;
}
const toothAux = (p) => {
  if (p[1] > 61.25 && p[1] < 63.15 && p[2] > 3.6 && Math.abs(p[0]) < 3.3) {
    const dU = teeth(TEETH_UP, p[0], p[1], p[2], true), dL = teeth(TEETH_LO, p[0], p[1], p[2], false);
    if (Math.min(dU, dL) < 0.06) return AUX_TOOTH;
  }
  return 0;
};

// ---------------- Vértebras ----------------
function vertebraSDF(v, idx) {
  const c = [0, v.y, v.z];
  const U = spineTangent(v.y);
  const X = [1, 0, 0];
  const K = norm(cross(U, X)); // hacia atrás
  const cerv = v.name[0] === 'C', lumb = v.name[0] === 'L';
  const tIdx = cerv ? 0 : lumb ? 2 : 1;
  const cr = cerv ? [1.15, 0.75] : lumb ? [1.05, 0.8] : [0.75, 0.75];
  const kc = v.rz + cr[1] + 0.05;
  const spAng = cerv ? (v.name === 'C7' ? 18 : 22) : lumb ? 4 : v.name === 'T1' || v.name === 'T2' ? 35 : v.name >= 'T5' && v.name <= 'T9' && v.name.length === 2 ? 58 : 48;
  const spLen = cerv ? (v.name === 'C7' ? 2.9 : v.name === 'C2' ? 2.2 : 1.5) : lumb ? 2.9 : 3.4;
  const spDir = [0, -Math.sin(spAng * Math.PI / 180), Math.cos(spAng * Math.PI / 180)];
  const spBase = [0, 0, kc + cr[1] * 0.9];
  const spTip = madd(spBase, spDir, spLen);
  const tpLen = cerv ? 1.5 : lumb ? 2.1 + (v.name === 'L3' ? 0.35 : 0) : Math.max(2.0, 2.9 - Math.abs(v.y - 38) * 0.02);
  const tpRoot = [cr[0] + 0.3, 0, kc - 0.1];
  const tpTip = cerv ? [v.rx + 1.5, -0.1, 0.1] : lumb ? [v.rx + tpLen, -0.05, v.rz + 0.6] : [3.4 + v.rx * 0.5 - 0.25, 0.05, 2.5];
  const h2 = v.h / 2;
  return (x, y, z) => {
    const dx = x - c[0], dy = y - c[1], dz = z - c[2];
    const lx = dx * X[0] + dy * X[1] + dz * X[2];
    const lu = dx * U[0] + dy * U[1] + dz * U[2];
    const lk = dx * K[0] + dy * K[1] + dz * K[2];
    const ax = Math.abs(lx);
    // cuerpo vertebral (cilindro elíptico redondeado, cintura leve)
    const waist = 1 - 0.06 * Math.max(0, 1 - (lu / h2) * (lu / h2));
    const q = Math.hypot(lx / (v.rx * waist), lk / v.rz);
    const dr = (q - 1) * Math.min(v.rx, v.rz), dv = Math.abs(lu) - h2;
    let d = Math.hypot(Math.max(dr, 0), Math.max(dv, 0)) + Math.min(Math.max(dr, dv), 0) - 0.05;
    if (idx === 0) { // atlas: anillo sin cuerpo
      const ring = Math.hypot(Math.hypot(lx / 1.9, (lk - 1.0) / 1.55) - 1, lu / 0.55) * 1.2 - 0.32;
      d = Math.min(ring, sdEllipsoid(ax, lu, lk, 1.55, 0, 0.7, 0.75, 0.6, 0.85));
      d = smin(d, sdCapsule(ax, lu, lk, [1.6, 0, 0.6], [3.5, 0.1, 0.5], 0.42), 0.4);
      return d;
    }
    // pedículos y láminas
    const ped = sdCapsule(ax, lu, lk, [v.rx * 0.55, 0, v.rz * 0.75], [cr[0] + 0.15, 0, kc - 0.1], cerv ? 0.3 : 0.38);
    const lam = Math.min(
      sdCapsule(ax, lu, lk, [cr[0] + 0.15, h2 * 0.25, kc], [0, h2 * 0.15, kc + cr[1] + 0.2], 0.3),
      sdCapsule(ax, lu, lk, [cr[0] + 0.15, -h2 * 0.45, kc], [0, -h2 * 0.55, kc + cr[1] + 0.2], 0.3));
    let a = smin(ped, lam, 0.35);
    // apófisis espinosa (bífida en cervicales 2-6, en hacha en lumbares)
    let sp;
    if (lumb) sp = Math.min(sdCapsule(lx, lu, lk, [0, 0.45, spBase[2]], [0, 0.4, spTip[2]], 0.3), sdCapsule(lx, lu, lk, [0, -0.55, spBase[2]], [0, -0.6, spTip[2]], 0.3));
    else if (cerv && v.name !== 'C7') sp = sdRoundCone(ax, lu, lk, spBase, [0.35, spTip[1], spTip[2]], 0.32, 0.24);
    else sp = sdRoundCone(lx, lu, lk, spBase, spTip, 0.36, 0.26);
    a = smin(a, sp, 0.4);
    // apófisis transversas
    a = smin(a, sdRoundCone(ax, lu, lk, tpRoot, tpTip, lumb ? 0.5 : 0.36, cerv ? 0.28 : lumb ? 0.36 : 0.3), 0.35);
    // apófisis articulares
    a = smin(a, sdCapsule(ax, lu, lk, [cr[0] + 0.2, 0, kc - 0.05], [cr[0] + 0.25, h2 + 0.45, kc + 0.05], 0.24), 0.2);
    a = smin(a, sdCapsule(ax, lu, lk, [cr[0] + 0.2, 0, kc + 0.1], [cr[0] + 0.2, -h2 - 0.4, kc + 0.25], 0.24), 0.2);
    d = smin(d, a, 0.3);
    if (idx === 1) d = smin(d, sdRoundCone(lx, lu, lk, [0, h2, 0.1], [0, h2 + 1.4, 0.25], 0.48, 0.38), 0.3); // diente del axis
    if (cerv) d = ssub(d, sdCapsule(ax, lu, lk, [v.rx + 0.75, -1, 0.1], [v.rx + 0.75, 1, 0.1], 0.28), 0.1); // agujero transverso
    // conducto vertebral
    d = ssub(d, Math.hypot(lx / cr[0], (lk - kc) / cr[1]) * Math.min(cr[0], cr[1]) - Math.min(cr[0], cr[1]), 0.15);
    return d;
  };
}

// ---------------- Pelvis ----------------
const CREST = [[12.4, 9.2, 6.6], [13.6, 11.6, 4.6], [14.2, 13.4, 1.4], [14.3, 14.2, -1.8], [13.4, 14.1, -4.6], [11.6, 13.2, -7.2], [8.8, 11.6, -9.0], [6.4, 10.0, -9.9], [4.8, 8.6, -10.1]];
const CREST_PHI = CREST.map((p) => Math.atan2(p[0] - 2.5, p[2] - 3.0));
const ILC = [2.5, 13.0, 3.0];
function crestYAt(phi) {
  if (phi <= CREST_PHI[0]) return CREST[0][1];
  for (let i = 0; i < CREST.length - 1; i++) if (phi <= CREST_PHI[i + 1]) { const t = (phi - CREST_PHI[i]) / (CREST_PHI[i + 1] - CREST_PHI[i]); return CREST[i][1] + (CREST[i + 1][1] - CREST[i][1]) * t; }
  return CREST[CREST.length - 1][1];
}
function lowYAt(phi) { // borde inferior del ala: espinas anteriores, acetábulo y escotadura ciática
  const d = phi * 180 / Math.PI;
  if (d < 76) return 6.2 - (d - 68) * 0.35;      // entre EIAS y EIAI
  if (d < 128) return 2.2;                       // techo del acetábulo
  if (d < 158) return 2.2 + (d - 128) * 0.12;    // escotadura ciática mayor
  return 5.8 + (d - 158) * 0.15;                 // hacia la EIPI
}
function hipBone(x, y, z) {
  const ax = Math.abs(x);
  // ala ilíaca: casquete de elipsoide (fosa ilíaca hacia adentro) recortado por la cresta
  const dx = ax - ILC[0], dy = y - ILC[1], dz = z - ILC[2];
  const el = sdEllipsoid(dx, dy, dz, 0, 0, 0, 11.9, 12.5, 13.2);
  const phi = Math.atan2(dx, dz);
  const R = Math.hypot(dx, dz);
  const p0 = 66 * Math.PI / 180, p1 = 172 * Math.PI / 180;
  let clip = Math.max(y - crestYAt(phi), lowYAt(phi) - y - 0.5, (p0 - phi) * R, (phi - p1) * R);
  const thick = 0.32 + 0.25 * Math.max(0, Math.min(1, (6 - y) / 4));
  let d = smax(Math.abs(el) - thick, clip, 0.6);
  d = smin(d, sdPolyTube(ax, y, z, CREST, [0.6, 0.62, 0.66, 0.7, 0.68, 0.66, 0.7, 0.75, 0.8]), 0.7); // cresta ilíaca
  d = smin(d, sdEllipsoid(ax, y, z, 12.3, 9.0, 6.4, 0.75, 0.9, 0.8), 0.5);   // espina ilíaca anterosuperior
  d = smin(d, sdEllipsoid(ax, y, z, 11.2, 5.4, 4.6, 0.7, 0.8, 0.7), 0.6);   // espina ilíaca anteroinferior
  d = smin(d, sdEllipsoid(ax, y, z, 5.2, 7.2, -8.8, 1.5, 2.6, 1.6), 1.2);   // superficie auricular / tuberosidad
  // cuerpo del acetábulo (copa)
  d = smin(d, sdSphere(ax, y, z, 9.0, 0.6, -0.2, 3.2), 1.4);
  // isquion y tuberosidad
  d = smin(d, sdRoundCone(ax, y, z, [8.8, -1.6, -2.2], [6.8, -6.0, -4.0], 1.5, 1.2), 1.0);
  d = smin(d, sdEllipsoid(ax, y, z, 6.6, -6.9, -4.2, 1.35, 1.6, 1.5), 0.6);
  d = smin(d, sdRoundCone(ax, y, z, [6.0, -2.4, -5.6], [5.3, -2.0, -6.8], 0.5, 0.28), 0.4); // espina ciática
  // ramas del pubis
  d = smin(d, sdRoundCone(ax, y, z, [8.6, -0.6, 2.4], [3.0, -2.4, 6.6], 1.1, 0.85), 0.8);
  d = smin(d, sdEllipsoid(ax, y, z, 1.5, -3.6, 7.2, 1.3, 2.2, 1.0), 0.6);
  d = smin(d, sdPolyTube(ax, y, z, [[1.8, -5.4, 6.6], [3.4, -6.8, 3.6], [5.2, -7.4, 0.2], [6.4, -7.2, -3.0]], [0.7, 0.6, 0.6, 0.9]), 0.7);
  // copa del acetábulo, abierta hacia afuera, adelante y abajo
  d = ssub(d, sdSphere(ax, y, z, 10.15, -0.1, 0.25, 2.45), 0.15);
  d = smax(d, -(sdSphere(ax, y, z, 12.6, -0.6, 1.0, 2.6)), 0.3);
  return d;
}
// Ala del ilion como lámina gruesa (rejilla): s de adelante (EIAS) hacia atrás (EIPS), t de la cresta hacia abajo
function iliumAt(s, t) {
  const crest = [PEL.asis, [13.9, 12.6, 3.4], PEL.crestTop, [12.9, 13.8, -5.4], PEL.crestPost, [6.6, 10.6, -9.8], PEL.psis];
  const low = [[11.0, 4.4, 4.0], [10.6, 3.6, 2.4], [10.0, 3.0, 0.4], [9.4, 2.8, -1.6], [8.0, 2.8, -5.2], [6.2, 4.4, -7.4], [5.0, 6.4, -9.2]];
  const ci = s * (crest.length - 1), i0 = Math.min(Math.floor(ci), crest.length - 2), f = ci - i0;
  const top = lerp(crest[i0], crest[i0 + 1], f), bot = lerp(low[i0], low[i0 + 1], f);
  let p = lerp(top, bot, t);
  // la fosa ilíaca es cóncava hacia adentro: abombado lateral
  const bulge = Math.sin(Math.PI * t) * Math.sin(Math.PI * Math.min(1, s * 1.15)) * 1.3;
  p = [p[0] + bulge * 0.55, p[1], p[2] + bulge * 0.15 * (s < 0.5 ? 1 : -1)];
  return { p, w: rigid('pelvis') };
}
function sacrum(x, y, z) {
  const ax = Math.abs(x);
  const lv = [[7.6, -4.4, 2.7, 1.9], [5.8, -6.4, 2.3, 1.5], [4.1, -8.0, 1.85, 1.2], [2.6, -9.2, 1.4, 0.95], [1.3, -9.95, 1.0, 0.75]];
  let d = 1e9;
  for (const [yy, zz, rx, rz] of lv) d = smin(d, sdEllipsoid(x, y, z, 0, yy, zz, rx, 1.05, rz), 0.9);
  d = smin(d, sdEllipsoid(ax, y, z, 3.7, 7.4, -5.8, 2.5, 1.7, 2.2), 1.0); // alas
  d = smin(d, sdEllipsoid(ax, y, z, 3.6, 5.2, -7.8, 1.6, 2.6, 1.3), 1.0);
  d = smin(d, sdPolyTube(x, y, z, [[0, 7.8, -7.6], [0, 5.6, -9.0], [0, 3.6, -10.3], [0, 1.8, -11.0]], [0.4, 0.35, 0.3, 0.28]), 0.5); // cresta sacra
  for (let i = 0; i < 4; i++) { const [yy, zz] = lv[i]; d = ssub(d, sdCapsule(ax, y, z, [1.55 + i * 0.05, yy - 0.75, zz + 3], [1.55 + i * 0.05, yy - 0.75, zz - 3], 0.33 - i * 0.03), 0.12); }
  d = ssub(d, sdPolyTube(x, y, z, [[0, 9.2, -6.6], [0, 6.0, -8.2], [0, 3.0, -9.6]], [0.75, 0.55, 0.35]), 0.2);
  return d;
}
const coccyx = (x, y, z) => sdPolyTube(x, y, z, [[0, 0.6, -10.4], [0, -0.8, -10.1], [0, -2.0, -9.5], [0, -2.9, -8.8]], [0.62, 0.5, 0.4, 0.28]);

// ---------------- Huesos largos ----------------
function humerus(x, y, z) {
  let d = sdSphere(x, y, z, 17.4, 47.4, -1.3, 2.3);
  d = smin(d, sdEllipsoid(x, y, z, 19.3, 47.3, -0.5, 1.3, 1.6, 1.4), 0.6);
  d = smin(d, sdEllipsoid(x, y, z, 18.4, 46.8, 1.1, 0.8, 1.0, 0.75), 0.5);
  d = smin(d, sdPolyTube(x, y, z, [[18.9, 45.2, -0.8], [19.6, 38, -1.4], [20.4, 28, -2.2], [20.9, 22.6, -2.6]], [1.25, 1.05, 1.0, 1.1]), 0.9);
  d = smin(d, sdEllipsoid(x, y, z, 20.6, 35.4, -1.1, 0.8, 2.2, 0.75), 0.6); // tuberosidad deltoidea
  // extremo distal
  d = smin(d, sdEllipsoid(x, y, z, 21.0, 20.4, -2.7, 2.6, 1.6, 0.9), 0.8);
  d = smin(d, sdEllipsoid(x, y, z, 18.0, 19.4, -3.3, 1.05, 0.95, 0.85), 0.5);
  d = smin(d, sdEllipsoid(x, y, z, 24.1, 19.6, -3.0, 0.75, 1.0, 0.75), 0.5);
  d = smin(d, sdEllipsoid(x, y, z, 20.3, 18.5, -2.6, 1.45, 0.95, 1.15), 0.4);
  d = smin(d, sdSphere(x, y, z, 22.9, 18.6, -2.2, 0.95), 0.4);
  d = ssub(d, sdTorusX(x, y, z, 20.3, 18.4, -2.5, 1.05, 0.28), 0.15); // garganta de la tróclea
  d = ssub(d, sdEllipsoid(x, y, z, 21.0, 20.7, -4.1, 1.05, 1.15, 0.55), 0.3); // fosa olecraneana
  d = ssub(d, sdCapsule(x, y, z, [19.2, 46.6, 1.3], [19.4, 43.6, 0.6], 0.35), 0.25); // corredera bicipital
  return d;
}
function sdTorusX(x, y, z, cx, cy, cz, R, r) { // toro con eje X
  const q = Math.hypot(y - cy, z - cz) - R; return Math.hypot(q, x - cx) - r;
}
function ulna(x, y, z) {
  let d = sdEllipsoid(x, y, z, 21.1, 20.1, -4.9, 1.0, 1.7, 0.95);
  d = smin(d, sdEllipsoid(x, y, z, 20.6, 17.4, -1.6, 0.75, 0.6, 0.85), 0.5);
  d = smin(d, sdPolyTube(x, y, z, [[20.9, 18.4, -3.6], [22.6, 6, -2.4], [25.2, -4.0, -1.8]], [0.95, 0.68, 0.55]), 0.8);
  d = smin(d, sdSphere(x, y, z, 25.4, -4.6, -1.7, 0.85), 0.4);
  d = smin(d, sdRoundCone(x, y, z, [25.2, -5.0, -2.2], [25.0, -5.9, -2.5], 0.3, 0.2), 0.2);
  d = ssub(d, sdTorusX(x, y, z, 20.3, 18.45, -2.55, 1.1, 0.95), 0.2); // escotadura troclear
  return d;
}
function radius(x, y, z) {
  const ax = norm(sub([23.3, 15.6, -2.2], [23.1, 18.2, -2.5]));
  let d = sdCapsule(x, y, z, [23.1, 18.0, -2.48], [23.15, 17.1, -2.4], 0.95);
  d = smin(d, sdCapsule(x, y, z, [23.15, 17.1, -2.4], [23.25, 15.8, -2.2], 0.58), 0.3);
  d = smin(d, sdEllipsoid(x, y, z, 22.75, 15.4, -1.65, 0.6, 0.85, 0.5), 0.4);
  d = smin(d, sdPolyTube(x, y, z, [[23.25, 15.6, -2.2], [26.6, 3, -1.4], [29.4, -4.2, -0.9]], [0.62, 0.74, 1.0]), 0.8);
  d = smin(d, sdEllipsoid(x, y, z, 29.3, -5.0, -0.95, 1.7, 0.85, 1.0), 0.6);
  d = smin(d, sdRoundCone(x, y, z, [30.6, -5.2, -0.7], [31.1, -6.4, -0.6], 0.45, 0.28), 0.3);
  d = smin(d, sdEllipsoid(x, y, z, 29.0, -4.2, -2.0, 0.35, 0.6, 0.3), 0.2); // tubérculo dorsal
  void ax;
  return d;
}
function femur(x, y, z) {
  let d = sdSphere(x, y, z, 10.0, 0.0, 0.0, 2.35);
  d = smin(d, sdRoundCone(x, y, z, [10.8, -0.4, 0.1], [14.2, -2.6, -0.6], 1.45, 1.6), 0.7);
  d = smin(d, sdEllipsoid(x, y, z, 15.6, -2.0, -1.2, 1.5, 2.2, 1.9), 0.9);
  d = smin(d, sdEllipsoid(x, y, z, 12.5, -5.6, -1.7, 0.85, 0.9, 0.8), 0.6);
  d = smin(d, sdCapsule(x, y, z, [15.0, -2.6, -2.4], [12.8, -5.4, -2.2], 0.5), 0.5);
  d = smin(d, sdPolyTube(x, y, z, [[14.4, -4.6, -0.6], [13.2, -14, 0.3], [11.6, -27, 0.4], [10.4, -35, 0.0]], [1.6, 1.35, 1.3, 1.5]), 1.2);
  d = smin(d, sdPolyTube(x, y, z, [[13.6, -10, -1.0], [12.3, -22, -1.2], [11.2, -31, -1.4]], [0.45, 0.42, 0.4]), 0.6); // línea áspera
  d = smin(d, sdEllipsoid(x, y, z, 7.4, -40.4, -0.6, 1.5, 2.0, 2.6), 1.0);
  d = smin(d, sdEllipsoid(x, y, z, 11.8, -40.3, -0.5, 1.5, 1.9, 2.5), 1.0);
  d = smin(d, sdEllipsoid(x, y, z, 9.6, -38.4, 1.7, 2.6, 1.7, 1.1), 0.9);
  d = smin(d, sdEllipsoid(x, y, z, 6.3, -39.4, -0.6, 0.6, 0.8, 0.8), 0.5);
  d = smin(d, sdEllipsoid(x, y, z, 13.1, -39.5, -0.6, 0.55, 0.8, 0.8), 0.5);
  d = ssub(d, sdCapsule(x, y, z, [9.6, -41.2, -0.2], [9.6, -41.2, -3.6], 0.95), 0.4); // fosa intercondílea
  d = ssub(d, sdCapsule(x, y, z, [9.6, -37.6, 3.0], [9.6, -40.0, 2.4], 0.55), 0.4); // tróclea femoral
  return d;
}
const patella = (x, y, z) => smin(sdEllipsoid(x, y, z, 9.8, -38.6, 4.0, 2.15, 2.2, 0.95), sdRoundCone(x, y, z, [9.8, -39.4, 4.0], [9.8, -41.0, 3.8], 1.2, 0.45), 0.6);
function tibia(x, y, z) {
  let d = sdEllipsoid(x, y, z, 7.6, -42.4, 0.0, 2.0, 1.1, 2.4);
  d = smin(d, sdEllipsoid(x, y, z, 11.6, -42.5, -0.2, 1.9, 1.0, 2.2), 0.6);
  d = smin(d, sdEllipsoid(x, y, z, 9.6, -41.8, 0.0, 0.5, 0.5, 0.6), 0.3);
  d = smin(d, sdEllipsoid(x, y, z, 9.8, -45.4, 2.8, 0.9, 1.4, 0.7), 0.8);
  d = smin(d, sdPolyTube(x, y, z, [[9.4, -44.4, 0.5], [9.2, -58, 0.4], [8.9, -72, -0.4], [8.8, -77.6, -1.2]], [1.65, 1.25, 1.15, 1.5]), 1.2);
  d = smin(d, sdPolyTube(x, y, z, [[9.5, -46.5, 2.1], [9.3, -60, 1.6], [9.0, -73.5, 0.9]], [0.4, 0.34, 0.3]), 0.7); // borde anterior (canilla)
  d = smin(d, sdRoundCone(x, y, z, [7.6, -77.8, -1.4], [7.3, -80.8, -1.6], 1.0, 0.55), 0.6);
  d = smin(d, sdEllipsoid(x, y, z, 8.8, -79.1, -1.8, 1.9, 0.8, 1.8), 0.6);
  d = ssub(d, sdEllipsoid(x, y, z, 7.6, -41.2, 0.0, 1.6, 0.35, 1.9), 0.3);
  d = ssub(d, sdEllipsoid(x, y, z, 11.6, -41.3, -0.2, 1.5, 0.35, 1.7), 0.3);
  return d;
}
const fibula = (x, y, z) => {
  let d = sdEllipsoid(x, y, z, 12.9, -44.0, -1.8, 0.95, 1.05, 0.95);
  d = smin(d, sdPolyTube(x, y, z, [[12.8, -45, -1.7], [12.4, -60, -1.4], [11.8, -76.5, -2.2]], [0.52, 0.45, 0.5]), 0.6);
  d = smin(d, sdRoundCone(x, y, z, [11.8, -77.4, -2.4], [11.6, -81.7, -2.9], 0.78, 0.45), 0.6);
  return d;
};

// ---------------- Mano y pie (cada hueso por separado) ----------------
const W0 = J.wrist;
const rel = (p) => [W0[0] + p[0], W0[1] + p[1], W0[2] + p[2]];
const CARPALS = [
  ['carpo', [1.8, -1.3, 0.1], [0.9, 0.7, 0.6]], ['carpo', [0.3, -1.2, 0.0], [0.7, 0.6, 0.7]], ['carpo', [-1.2, -1.5, -0.2], [0.6, 0.55, 0.6]],
  ['carpo', [-1.45, -1.6, 0.75], [0.4, 0.45, 0.4]], ['carpo', [2.4, -2.7, 0.4], [0.75, 0.6, 0.6]], ['carpo', [1.2, -2.9, 0.1], [0.55, 0.55, 0.55]],
  ['carpo', [0.0, -3.0, 0.0], [0.65, 0.9, 0.75]], ['carpo', [-1.3, -2.8, -0.1], [0.65, 0.75, 0.65]],
];
// dedos: base del metacarpiano, cabeza, y direcciones/largos de falanges
export const FINGERS = [
  { mc: [[2.9, -3.2, 0.9], [4.4, -6.2, 2.4]], ph: [2.7, 0, 2.1], dir: [0.3, -0.8, 0.5], r: 0.5 },
  { mc: [[1.2, -3.6, 0.1], [1.65, -9.1, 0.3]], ph: [4.0, 2.4, 1.7], dir: [0.06, -1, 0.12], r: 0.43 },
  { mc: [[0.1, -3.8, 0.0], [0.2, -9.4, 0.4]], ph: [4.4, 2.8, 1.9], dir: [0.0, -1, 0.12], r: 0.45 },
  { mc: [[-1.0, -3.6, -0.1], [-1.3, -9.0, 0.2]], ph: [4.1, 2.6, 1.8], dir: [-0.05, -1, 0.12], r: 0.41 },
  { mc: [[-1.9, -3.5, -0.2], [-2.7, -8.4, 0.0]], ph: [3.2, 1.9, 1.6], dir: [-0.12, -1, 0.12], r: 0.37 },
];

export function buildSkeleton() {
  const g = new Geo(); // línea media y piezas simétricas completas
  const L = new Geo(); // lado izquierdo (se refleja)
  // Cráneo y mandíbula
  addSDF(g, skull, [-7.8, 58.6, -11.2], [7.8, 82.4, 11.4], 0.16, { w: rigid('head'), sid: S('craneo'), aux: toothAux, tris: 30000, uv: (p) => [p[0] / 4, p[1] / 4] });
  addSDF(g, mandible, [-6.6, 58.0, -2.6], [6.6, 68.6, 10.0], 0.1, { w: rigid('head'), sid: S('mandibula'), aux: toothAux, tris: 7000 });
  // Hioides
  addSDF(g, (x, y, z) => smin(sdPolyTube(Math.abs(x), y, z, [[0, 57.4, 4.0], [1.0, 57.5, 3.6], [1.9, 57.8, 2.2]], [0.32, 0.28, 0.18]), sdEllipsoid(x, y, z, 0, 57.4, 4.0, 0.9, 0.35, 0.3), 0.2),
    [-2.4, 56.6, 1.4], [2.4, 58.4, 4.6], 0.07, { w: trunkW([0, 57.4, 4]), sid: S('hioides'), tris: 500 });
  // Vértebras y discos
  VERT.forEach((v, i) => {
    const f = vertebraSDF(v, i);
    const ext = 5.6;
    const sid = i === 0 ? S('atlas') : i === 1 ? S('axis') : v.name[0] === 'C' ? S('vert_cervicales') : v.name[0] === 'T' ? S('vert_toracicas') : S('vert_lumbares');
    addSDF(g, f, [-ext, v.y - 4.2, v.z - 3.0], [ext, v.y + 3.2, v.z + 6.5], v.name[0] === 'C' ? 0.075 : 0.09, { w: trunkW([0, v.y, v.z]), sid, tris: v.name[0] === 'L' ? 2200 : 1700 });
    if (i >= 1 && i < VERT.length - 1) {
      const n = VERT[i + 1];
      const top = v.y - v.h / 2, bot = n.y + n.h / 2;
      if (top - bot > 0.15) {
        const c = [0, (top + bot) / 2, (v.z + n.z) / 2];
        const U = norm(sub([0, v.y, v.z], [0, n.y, n.z]));
        const rx = (v.rx + n.rx) / 2 * 0.97, rz = (v.rz + n.rz) / 2 * 0.97, hh = (top - bot) / 2 + 0.04;
        addSDF(g, (x, y, z) => {
          const dx = x - c[0], dy = y - c[1], dz = z - c[2];
          const lu = dy * U[1] + dz * U[2], lk = -dy * U[2] + dz * U[1];
          const q = Math.hypot(dx / rx, lk / rz), dr = (q - 1) * Math.min(rx, rz), dv = Math.abs(lu) - hh;
          return Math.hypot(Math.max(dr, 0), Math.max(dv, 0)) + Math.min(Math.max(dr, dv), 0) - 0.08;
        }, [-rx - 0.4, c[1] - 1.4, c[2] - rz - 0.6], [rx + 0.4, c[1] + 1.4, c[2] + rz + 0.6], 0.08, { w: trunkW(c), sid: S('discos'), aux: AUX_CART, tris: 360 });
      }
    }
  });
  // disco lumbosacro
  addSDF(g, (x, y, z) => sdEllipsoid(x, y, z, 0, 8.55, -3.3, 2.3, 0.45, 1.55), [-2.8, 7.6, -5.2], [2.8, 9.5, -1.4], 0.08, { w: rigid('pelvis'), sid: S('discos'), aux: AUX_CART, tris: 400 });
  // Sacro, cóccix y coxales
  addSDF(g, sacrum, [-6.8, -0.8, -12.2], [6.8, 10.2, -1.8], 0.11, { w: rigid('pelvis'), sid: S('sacro'), tris: 6000 });
  addSDF(g, coccyx, [-1.0, -3.6, -11.2], [1.0, 1.4, -8.0], 0.07, { w: rigid('pelvis'), sid: S('coccix'), tris: 600 });
  addSDF(g, hipBone, [-15.6, -9.0, -11.6], [15.6, 15.6, 9.0], 0.12, { w: rigid('pelvis'), sid: S('coxal'), tris: 16000 });
  addSDF(g, (x, y, z) => sdBox(x, y, z, [0, -3.6, 7.6], [0.28, 1.9, 0.75], 0.25), [-0.8, -6.0, 6.4], [0.8, -1.2, 8.8], 0.07, { w: rigid('pelvis'), sid: S('coxal'), aux: AUX_CART, tris: 300 }); // sínfisis
  // Esternón
  addSDF(g, (x, y, z) => {
    let d = sdPolyTube(x, y, (z - lerpZ(y)) * 2.6 + lerpZ(y), [STERNUM.jug, STERNUM.angle], [2.4, 1.55]);
    d = smin(d, sdPolyTube(x, y, (z - lerpZ(y)) * 2.8 + lerpZ(y), [[0, 42.0, 7.6], [0, 36.5, 8.9], [0, 31.0, 9.95]], [1.5, 1.75, 1.45]), 0.5);
    d = smin(d, sdPolyTube(x, y, (z - lerpZ(y)) * 3.2 + lerpZ(y), [[0, 30.6, 10.0], [0, 27.6, 9.4]], [0.85, 0.45]), 0.4);
    d = ssub(d, sdSphere(x, y, z, 0, 47.4, 5.2, 0.9), 0.3); // escotadura yugular
    return d;
  }, [-3.2, 26.6, 4.0], [3.2, 47.4, 11.6], 0.08, { w: rigid('chest'), sid: S('esternon'), tris: 3000 });
  // Costillas y cartílagos (lado izquierdo)
  for (const r of RIBS) {
    const axis = ribAxis(r);
    const n = axis.length;
    const wc = rigid('chest');
    addTube(L, axis.map((p, i) => {
      const u = i / (n - 1);
      const hgt = r.k === 1 ? 0.75 : 0.45 + 0.35 * Math.sin(Math.PI * Math.min(1, u * 1.2));
      return { p, r: r.k === 1 ? 0.42 : 0.27, rz: hgt + (i < 2 ? 0.1 : 0), w: wc };
    }), { up: [0, 1, 0], sides: 10, step: 0.45, sid: S('costillas'), capScale: 0.5 });
    const cart = ribCartilage(r);
    if (cart) addTube(L, cart.map((p, i) => ({ p, r: 0.32, rz: r.k <= 7 ? 0.5 : 0.42, w: wc })), { up: [0, 1, 0], sides: 8, step: 0.45, sid: S('cartilagos_costales'), aux: AUX_CART, capScale: 0.4 });
  }
  // Clavícula y escápula
  addTube(L, CLAV.map((p, i) => ({ p, r: [0.95, 0.62, 0.55, 0.5, 0.52][i], rz: [0.95, 0.6, 0.55, 0.55, 0.85][i], w: rigid('chest') })), { up: [0, 0, 1], sides: 12, step: 0.3, sid: S('clavicula') });
  buildScapula(L);
  // Miembro superior
  addSDF(L, humerus, [14.6, 16.8, -5.4], [25.6, 50.2, 2.8], 0.1, { w: rigid('upperArmL'), sid: S('humero'), tris: 7000 });
  addSDF(L, ulna, [19.2, -6.6, -6.2], [26.8, 22.4, 0.0], 0.08, { w: armW, sid: S('cubito'), tris: 4000 });
  addSDF(L, radius, [21.4, -7.2, -3.8], [32.2, 19.4, 0.8], 0.08, { w: armW, sid: S('radio'), tris: 4000 });
  for (const [id, c, r] of CARPALS) { const cc = rel(c); addSDF(L, (x, y, z) => sdEllipsoid(x, y, z, cc[0], cc[1], cc[2], r[0], r[1], r[2]), sub(cc, mul(r, 1.4)), add(cc, mul(r, 1.4)), 0.06, { w: rigid('handL'), sid: S(id), tris: 260 }); }
  { const hh = rel([-1.55, -3.1, 0.9]); addSDF(L, (x, y, z) => sdSphere(x, y, z, hh[0], hh[1], hh[2], 0.32), sub(hh, [0.6, 0.6, 0.6]), add(hh, [0.6, 0.6, 0.6]), 0.06, { w: rigid('handL'), sid: S('carpo'), tris: 120 }); }
  FINGERS.forEach((fg, fi) => {
    const a = rel(fg.mc[0]), b = rel(fg.mc[1]);
    addTubeBone(L, a, b, fg.r * 1.05, fg.r * 0.95, 'metacarpianos');
    let p = add(b, mul(norm(sub(b, a)), 0.25)); let dir = norm(fg.dir);
    fg.ph.forEach((ln, k) => {
      if (!ln) return;
      const flex = fi === 0 ? 0.12 : 0.16 + k * 0.08;
      dir = norm(add(dir, [0, 0, flex]));
      const q = madd(p, dir, ln);
      addTubeBone(L, p, q, fg.r * (0.92 - k * 0.12), fg.r * (0.72 - k * 0.12), 'falanges_mano');
      p = madd(q, dir, 0.18);
    });
  });
  // Miembro inferior
  addSDF(L, femur, [5.0, -43.6, -4.4], [18.0, 3.0, 4.6], 0.11, { w: rigid('thighL'), sid: S('femur'), tris: 8000 });
  addSDF(L, patella, [7.0, -42.0, 2.4], [12.6, -35.8, 5.4], 0.07, { w: [B.thighL, B.legL, 0.5], sid: S('rotula'), tris: 900 });
  addSDF(L, tibia, [5.0, -82.0, -3.8], [14.2, -40.4, 4.2], 0.1, { w: rigid('legL'), sid: S('tibia'), tris: 7000 });
  addSDF(L, fibula, [10.4, -83.0, -4.0], [14.4, -42.4, -0.2], 0.08, { w: rigid('legL'), sid: S('perone'), tris: 2500 });
  buildFoot(L);

  g.append(L).append(L.mirrored());
  return g;
}
function lerpZ(y) { // z del plano del esternón a la altura y
  const p = y > STERNUM.angle[1] ? lerp(STERNUM.angle, STERNUM.jug, (y - STERNUM.angle[1]) / (STERNUM.jug[1] - STERNUM.angle[1])) : y > STERNUM.xiph[1] ? lerp(STERNUM.xiph, STERNUM.angle, (y - STERNUM.xiph[1]) / (STERNUM.angle[1] - STERNUM.xiph[1])) : lerp(STERNUM.tip, STERNUM.xiph, (y - STERNUM.tip[1]) / (STERNUM.xiph[1] - STERNUM.tip[1]));
  return p[2];
}
function addTubeBone(g, a, b, r1, r2, id) {
  const d = (x, y, z) => smin(sdRoundCone(x, y, z, a, b, r1, r2), Math.min(sdSphere(x, y, z, a[0], a[1], a[2], r1 * 1.12), sdSphere(x, y, z, b[0], b[1], b[2], r2 * 1.15)), 0.25);
  const mn = [Math.min(a[0], b[0]) - 1, Math.min(a[1], b[1]) - 1, Math.min(a[2], b[2]) - 1], mx = [Math.max(a[0], b[0]) + 1, Math.max(a[1], b[1]) + 1, Math.max(a[2], b[2]) + 1];
  addSDF(g, d, mn, mx, Math.min(0.07, r2 * 0.35), { w: id.endsWith('pie') || id === 'metatarsianos' ? rigid('footL') : rigid('handL'), sid: S(id), tris: 260 });
}
function buildScapula(L) {
  // lámina que se apoya sobre la parrilla costal
  const A = SCAP.sup, Bn = [13.6, 45.2, -4.4], Cc = SCAP.inf, D = SCAP.med;
  addMuscle(L, {
    ns: 14, nt: 18,
    at: (s, t) => {
      const top = lerp(A, Bn, s), bot = lerp(D, Cc, s);
      let p = lerp(lerp(A, D, t), lerp(Bn, Cc, t), s);
      p = lerp(p, lerp(top, bot, t), 0.0);
      // proyecta sobre la espalda (contorno del tronco a 2.2 cm)
      const th = Math.atan2(p[0], p[2]) * 180 / Math.PI;
      const q = torsoPt(p[1], th, 2.15 + 0.6 * s);
      return { p: lerp(q, p, 0.25 * s), w: rigid('chest'), n: norm([q[0] * 0.4, 0, q[2]]) };
    },
    th: (s, t) => 0.18 + 0.35 * Math.pow(s, 5) + 0.15 * Math.pow(1 - t, 8),
    sid: S('escapula'), back: 0.12, uvTile: 4,
  });
  const wc = rigid('chest');
  // espina de la escápula, acromion, coracoides y cavidad glenoidea
  addTube(L, [{ p: SCAP.spineRoot, r: 0.35, rz: 0.5, w: wc }, { p: [10.6, 45.4, -11.2], r: 0.4, rz: 0.75, w: wc }, { p: [14.4, 48.0, -7.8], r: 0.45, rz: 0.85, w: wc }, { p: SCAP.acrom, r: 0.55, rz: 1.1, w: wc }, { p: SCAP.acromTip, r: 0.4, rz: 0.9, w: wc }], { up: [0, 0, -1], sides: 10, step: 0.35, sid: S('escapula') });
  addTube(L, [{ p: [13.8, 46.4, -1.4], r: 0.55, w: wc }, { p: [13.4, 47.3, 0.8], r: 0.45, w: wc }, { p: SCAP.coracoid, r: 0.38, w: wc }], { sides: 10, step: 0.3, sid: S('escapula') });
  addSDF(L, (x, y, z) => ssub(sdEllipsoid(x, y, z, 15.0, 46.6, -1.8, 0.75, 1.95, 1.35), sdSphere(x, y, z, 17.4, 47.0, -1.4, 2.0), 0.2), [13.6, 44.2, -3.6], [16.2, 49.0, 0.0], 0.07, { w: wc, sid: S('escapula'), tris: 700 });
  addSDF(L, (x, y, z) => sdRoundCone(x, y, z, [14.9, 46.4, -2.6], [13.4, 45.4, -4.6], 1.0, 0.7), [11.8, 43.4, -6.2], [16.4, 48.0, -0.8], 0.08, { w: wc, sid: S('escapula'), tris: 700 });
}
function buildFoot(L) {
  const wf = rigid('footL');
  const part = (id, f, mn, mx, h = 0.07) => addSDF(L, f, mn, mx, h, { w: wf, sid: S(id), tris: 1400 });
  part('astragalo', (x, y, z) => smin(sdEllipsoid(x, y, z, 9.0, -81.3, -2.4, 1.6, 1.0, 2.0), sdRoundCone(x, y, z, [9.0, -81.6, -1.0], [8.6, -82.0, 1.4], 1.0, 1.0), 0.6), [6.6, -83.4, -5.0], [11.4, -79.6, 3.0]);
  part('calcaneo', (x, y, z) => smin(smin(sdRoundCone(x, y, z, [9.2, -84.5, -6.4], [9.8, -83.6, -0.4], 1.85, 1.35), sdEllipsoid(x, y, z, 9.2, -85.2, -6.6, 1.5, 1.2, 1.6), 0.6), sdSphere(x, y, z, 7.7, -82.7, -2.4, 0.6), 0.5), [6.0, -87.6, -9.2], [12.4, -81.0, 1.6]);
  part('tarso', (x, y, z) => {
    let d = sdEllipsoid(x, y, z, 8.2, -82.4, 2.5, 1.35, 1.1, 0.6);
    d = Math.min(d, sdBox(x, y, z, [11.0, -84.0, 2.3], [1.0, 0.8, 1.15], 0.35));
    d = Math.min(d, sdEllipsoid(x, y, z, 7.6, -83.4, 3.9, 0.8, 1.2, 0.85));
    d = Math.min(d, sdEllipsoid(x, y, z, 8.85, -83.0, 3.75, 0.58, 0.9, 0.65));
    d = Math.min(d, sdEllipsoid(x, y, z, 10.0, -83.25, 3.85, 0.6, 0.9, 0.75));
    return d;
  }, [6.0, -85.4, 0.8], [12.6, -80.8, 5.2]);
  const MT = [[[7.6, -84.0, 5.0], [7.4, -86.0, 11.0], 0.85], [[9.0, -83.4, 4.8], [9.1, -86.0, 12.0], 0.52], [[10.0, -83.6, 4.8], [10.5, -86.1, 11.6], 0.5], [[11.0, -84.2, 4.4], [11.8, -86.2, 10.9], 0.48], [[12.0, -85.0, 3.6], [13.1, -86.4, 9.8], 0.48]];
  MT.forEach(([a, b, r], i) => {
    addTubeBone(L, a, b, r * 1.1, r * 0.95, 'metatarsianos');
    if (i === 4) part('metatarsianos', (x, y, z) => sdSphere(x, y, z, 12.5, -85.4, 2.9, 0.65), [11.6, -86.4, 2.0], [13.4, -84.4, 3.8], 0.06);
    const toeLens = i === 0 ? [2.6, 0, 2.0] : [2.0 - i * 0.15, 1.1 - i * 0.08, 0.9 - i * 0.05];
    let p = add(b, mul(norm(sub(b, a)), 0.2)); const dir = norm([b[0] - a[0] > 0 ? 0.08 : 0, -0.12, 1]);
    toeLens.forEach((ln, k) => {
      if (!ln) return;
      const d2 = norm(add(dir, [0, -0.05 * k, 0]));
      const q = madd(p, d2, ln);
      addTubeBone(L, p, q, r * (k ? 0.62 : 0.8), r * (k ? 0.5 : 0.65), 'falanges_pie');
      p = madd(q, d2, 0.15);
    });
  });
}
