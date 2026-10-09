// Ayudas para trazar vasos y nervios como tubos: puntos dentro de los miembros, proyecciones sobre el
// cráneo, el encéfalo y el corazón, recorridos por las costillas y los dedos, y pesos por región.
import { addTube } from './builder.js';
import { armIn, legIn, armW, legW, trunkW, headW, rigid, RIBS, ribPoint, VERT, J } from './body.js';
import { onSkull, onHeart } from './viscera.js';
import { FINGERS } from './skeleton.js';
import { add, sub, mul, madd, norm, len, clamp } from '../../src/anatomy/v3.js';
import { SID } from '../../src/anatomy/atlas.js';

export const S = (id) => { const s = SID[id]; if (!s) throw new Error('Falta en el atlas: ' + id); return s; };
export const A = (u, th, rf) => armIn(u, th, rf);   // brazo izquierdo: u 0 hombro, 1 codo, 2 muñeca, 3 nudillos
export const Lg = (u, th, rf) => legIn(u, th, rf);  // pierna izquierda: u 0 cadera, 1 rodilla, 2 tobillo, 3 dedos
export const WT = (p) => trunkW(p);
export const WH = (p) => (p[1] > 61 ? headW() : trunkW(p));
export const WHEAD = () => headW();
export const WA = (p) => armW(p);
export const WL = (p) => legW(p);
export { rigid };

// Superficie de la cara y el cráneo (huesos) con separación "off"
export const SK = (x, y, z, off = 0.45) => onSkull([x, y, z], off);
// Superficie del encéfalo (elipsoide aproximado) con separación "off"
export const BRAIN = { c: [0, 73.9, -1.0], r: [6.05, 7.1, 8.35] };
export function onBrain(p, off = 0.15) {
  const c = BRAIN.c, r = BRAIN.r;
  const q = [(p[0] - c[0]) / r[0], (p[1] - c[1]) / r[1], (p[2] - c[2]) / r[2]];
  const k = Math.hypot(q[0], q[1], q[2]) || 1;
  const s = [c[0] + (p[0] - c[0]) / k, c[1] + (p[1] - c[1]) / k, c[2] + (p[2] - c[2]) / k];
  const n = norm([(s[0] - c[0]) / (r[0] * r[0]), (s[1] - c[1]) / (r[1] * r[1]), (s[2] - c[2]) / (r[2] * r[2])]);
  return madd(s, n, off);
}
export const HE = (x, y, z, off = 0.16) => onHeart([x, y, z], off);

// Radios: número, lista por punto, o [inicio, fin] interpolado
export function radii(R, n) {
  if (!Array.isArray(R)) return new Array(n).fill(R);
  if (R.length === n) return R;
  if (R.length === 2) return Array.from({ length: n }, (_, i) => R[0] + ((R[1] - R[0]) * i) / Math.max(1, n - 1));
  return Array.from({ length: n }, (_, i) => R[Math.min(i, R.length - 1)]);
}
const MIN_R = 0.11;
// Tubo con pesos por región. P: puntos; R: radios; w: función de pesos.
export function tube(g, id, P, R, w, o = {}) {
  const rr = radii(R, P.length).map((r) => Math.max(o.minR ?? MIN_R, r));
  const r0 = Math.max(...rr);
  const pts = P.map((p, i) => ({ p, r: rr[i] }));
  addTube(g, pts, {
    sid: S(id), w, side: o.side || 0,
    sides: o.sides ?? (r0 > 0.7 ? 12 : r0 > 0.4 ? 9 : r0 > 0.2 ? 7 : 5),
    step: o.step ?? clamp(r0 * 1.3, 0.3, 0.75), caps: o.caps, uvTile: o.uvTile || 1.5,
  });
}

// Recorrido a lo largo del borde inferior de una costilla (surco costal), de u0 a u1.
// dy baja el recorrido; din lo mete hacia el interior del tórax.
export function ribPath(k, u0 = 0.12, u1 = 0.95, dy = -0.45, din = 0.3, n = 12) {
  const r = RIBS[k - 1], out = [];
  for (let i = 0; i <= n; i++) {
    const u = u0 + ((u1 - u0) * i) / n, p = ribPoint(r, u);
    const inw = norm([-p[0], 0, -(p[2] - r.zc)]);
    out.push(add(madd(p, inw, din), [0, dy, 0]));
  }
  return out;
}
export const vertebra = (name) => VERT.find((v) => v.name === name);

// Eje de cada dedo de la mano izquierda (de la base del metacarpiano a la punta), con desplazamiento
// palmar (dz > 0) o dorsal (dz < 0) y lateral (dx).
export function fingerPath(k, dz = 0.55, dx = 0, from = 0.45) {
  const W0 = J.wrist, fg = FINGERS[k];
  const b = add(W0, fg.mc[0]), h = add(W0, fg.mc[1]);
  const pts = [madd(b, sub(h, b), from), h];
  let p = madd(h, norm(sub(h, b)), 0.2), dir = norm(fg.dir);
  fg.ph.forEach((ln, i) => {
    if (!ln) return;
    dir = norm(add(dir, [0, 0, k === 0 ? 0.12 : 0.16 + i * 0.08]));
    const q = madd(p, dir, ln * (i === fg.ph.length - 1 ? 0.8 : 1));
    pts.push(madd(p, dir, ln * 0.5), q);
    p = madd(q, dir, 0.18);
  });
  return pts.map((q) => add(q, [dx, 0, dz]));
}
export { add, sub, mul, madd, norm, len, clamp };
