// Piel (maniquí para el modo 3D sin cámara) y "relleno profundo": la masa muscular oscura que
// asoma entre los músculos superficiales.
import { Geo, addSDF } from './builder.js';
import { torsoProf, LIMB, J, trunkW, armW, legW, headW, mirrorW, B } from './body.js';
import { sdSphere, sdEllipsoid, sdCapsule, sdRoundCone, smin, smax } from './sdf.js';
import { skull, mandible, FINGERS } from './skeleton.js';
import { sub, dot, clamp, tableAt, madd, norm, add, mul } from '../../src/anatomy/v3.js';
import { SID } from '../../src/anatomy/atlas.js';

function torsoSDF(x, y, z) {
  const P = torsoProf(clamp(y, -10, 61));
  const ax = Math.abs(x), b = z >= 0 ? P.zf : -P.zb;
  const q = Math.pow(Math.pow(ax / P.a, P.n) + Math.pow(Math.abs(z) / b, P.n), 1 / P.n);
  let d = (q - 1) * Math.min(P.a, b) * 0.95;
  d = smax(d, -9.5 - y, 2.0);
  d = smax(d, y - 62.0, 2.0);
  return d;
}
function segSDF(seg, x, y, z, t0, t1) {
  const dx = x - seg.A[0], dy = y - seg.A[1], dz = z - seg.A[2];
  const t = (dx * seg.Y[0] + dy * seg.Y[1] + dz * seg.Y[2]) / seg.L;
  const tc = clamp(t, t0, t1);
  const r = tableAt(seg.rows, tc);
  const a = dx * seg.ANT[0] + dy * seg.ANT[1] + dz * seg.ANT[2] - r[0];
  const l = dx * seg.LAT[0] + dy * seg.LAT[1] + dz * seg.LAT[2] - r[1];
  const m = Math.min(r[2], r[3]);
  const rho = Math.hypot(a / r[2], l / r[3]);
  const dv = (t < t0 ? t0 - t : t > t1 ? t - t1 : 0) * seg.L;
  return dv > 0 ? Math.hypot(rho * m, dv) - m : (rho - 1) * m;
}
// dedos (como en el esqueleto) para la mano de la piel
const FTIPS = FINGERS.map((fg) => {
  const W0 = J.wrist; const b = add(W0, fg.mc[1]); let p = b; let dir = norm(fg.dir);
  let total = 0; fg.ph.forEach((ln, k) => { if (!ln) return; dir = norm(add(dir, [0, 0, fg === FINGERS[0] ? 0.12 : 0.16 + k * 0.08])); p = madd(p, dir, ln + 0.18); total += ln; });
  return { base: b, tip: p, r: fg.r + 0.42 };
});
function armSDF(x, y, z) {
  let d = segSDF(LIMB.upperArm, x, y, z, 0.1, 1.0);
  d = smin(d, segSDF(LIMB.forearm, x, y, z, 0.0, 1.02), 2.2);
  d = smin(d, segSDF(LIMB.hand, x, y, z, 0.0, 0.92), 1.6);
  for (const f of FTIPS) d = smin(d, sdCapsule(x, y, z, f.base, f.tip, f.r), 0.5);
  return d;
}
function legSDF(x, y, z) {
  let d = segSDF(LIMB.thigh, x, y, z, 0.12, 1.0);
  d = smin(d, segSDF(LIMB.leg, x, y, z, 0.0, 1.0), 2.6);
  d = smin(d, segSDF(LIMB.foot, x, y, z, -0.15, 0.9), 2.0);
  return d;
}
function headSDF(x, y, z) {
  if (y < 56) return 50;
  const ax = Math.abs(x);
  let d = Math.min(skull(x, y, z), mandible(x, y, z)) - 0.55;
  d = smin(d, sdEllipsoid(ax, y, z, 3.25, 70.0, 8.3, 1.75, 1.15, 1.2), 0.5);   // párpados sobre los ojos
  d = smin(d, sdEllipsoid(ax, y, z, 6.4, 71.5, 2.4, 1.4, 2.6, 3.0), 1.2);     // sienes
  d = smin(d, sdEllipsoid(ax, y, z, 4.4, 64.8, 6.6, 1.8, 2.4, 2.2), 1.2);     // mejillas
  d = smin(d, sdRoundCone(x, y, z, [0, 69.4, 10.2], [0, 66.4, 11.8], 0.55, 0.95), 0.5); // nariz
  d = smin(d, sdEllipsoid(ax, y, z, 0.9, 66.0, 11.0, 0.75, 0.55, 0.65), 0.4);
  d = smin(d, sdEllipsoid(x, y, z, 0, 62.6, 10.1, 2.3, 0.85, 0.9), 0.5);      // labios
  d = smin(d, sdEllipsoid(x, y, z, 0, 59.5, 9.2, 2.1, 1.3, 1.1), 0.7);        // mentón
  d = Math.min(d, sdEllipsoid(ax, y, z, 7.5, 68.4, -0.7, 0.55, 2.9, 1.7));     // orejas
  return d;
}
const parts = (x, y, z) => {
  const ax = Math.abs(x);
  return { t: torsoSDF(x, y, z), a: armSDF(ax, y, z), l: legSDF(ax, y, z), h: headSDF(x, y, z) };
};
function skinSDF(x, y, z) {
  const p = parts(x, y, z);
  let d = smin(p.t, p.a, 3.4);
  d = smin(d, p.l, 4.0);
  d = smin(d, p.h, 2.2);
  return d;
}
function regionW(p) {
  const q = parts(p[0], p[1], p[2]);
  const m = Math.min(q.t, q.a, q.l, q.h);
  const L = [Math.abs(p[0]), p[1], p[2]];
  let w;
  if (m === q.h && p[1] > 57) w = p[1] > 61 ? headW() : trunkW(p);
  else if (m === q.a) w = armW(L);
  else if (m === q.l) w = legW(L);
  else w = trunkW(p);
  return p[0] < 0 && (m === q.a || m === q.l) ? mirrorW(w) : w;
}

export function buildSkin() {
  const g = new Geo();
  addSDF(g, skinSDF, [-40, -89.5, -15.5], [40, 83.5, 20.5], 0.42, { w: regionW, sid: SID.piel, tris: 70000, uv: (p) => [p[0] / 4, p[1] / 4] });
  return g;
}
export function buildShell() {
  const g = new Geo();
  const f = (x, y, z) => {
    const ax = Math.abs(x);
    const p = parts(x, y, z);
    const arm = Math.max(p.a, segSDF(LIMB.forearm, ax, y, z, -2, 0.985) > 0 && segSDF(LIMB.upperArm, ax, y, z, -1, 1.2) > 0 ? 50 : -50);
    const leg = Math.max(p.l, segSDF(LIMB.foot, ax, y, z, -0.6, 2) < 0.5 && y < -78.5 ? 50 : -50);
    let d = smin(p.t + 1.9, arm + 1.55, 2.2);
    d = smin(d, leg + 1.6, 2.6);
    d = smax(d, y - 56.5, 1.0);
    return d;
  };
  addSDF(g, f, [-38, -84, -14], [38, 58, 19], 0.5, { w: regionW, sid: SID.tejido_profundo, tris: 36000, uv: (p) => [p[0] / 5, p[1] / 5] });
  return g;
}
