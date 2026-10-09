// Operaciones mínimas con vectores [x, y, z] (sin dependencias, sirven en el navegador y en Node).
export const v = (x = 0, y = 0, z = 0) => [x, y, z];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const madd = (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a) => Math.hypot(a[0], a[1], a[2]);
export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const mid = (a, b) => lerp(a, b, 0.5);
export const neg = (a) => [-a[0], -a[1], -a[2]];
export const mirrorX = (a) => [-a[0], a[1], a[2]];
// Componente de a perpendicular al vector unitario n.
export const orth = (a, n) => { const d = dot(a, n); return [a[0] - n[0] * d, a[1] - n[1] * d, a[2] - n[2] * d]; };
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
export const mix = (a, b, t) => a + (b - a) * t;
export const deg = Math.PI / 180;

// Rota el vector p alrededor del eje unitario k un ángulo a (Rodrigues).
export function rotAxis(p, k, a) {
  const c = Math.cos(a), s = Math.sin(a), d = dot(k, p), cr = cross(k, p);
  return [p[0] * c + cr[0] * s + k[0] * d * (1 - c), p[1] * c + cr[1] * s + k[1] * d * (1 - c), p[2] * c + cr[2] * s + k[2] * d * (1 - c)];
}

// Rotación mínima que lleva el unitario a al unitario b, aplicada a p.
export function rotBetween(p, a, b) {
  const c = dot(a, b);
  if (c > 0.999999) return p.slice();
  let k = cross(a, b); const s = len(k);
  if (s < 1e-6) { k = norm(orth([0, 0, 1], a)); if (len(k) < 1e-3) k = norm(orth([1, 0, 0], a)); return rotAxis(p, k, Math.PI); }
  return rotAxis(p, mul(k, 1 / s), Math.atan2(s, c));
}

// Curva Catmull-Rom (centrípeta simplificada: uniforme) por una lista de puntos.
export function catmull(pts, t) {
  const n = pts.length - 1;
  const f = clamp(t, 0, 1) * n; let i = Math.floor(f); if (i >= n) i = n - 1; const u = f - i;
  const p0 = pts[Math.max(i - 1, 0)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, n)];
  const u2 = u * u, u3 = u2 * u;
  const r = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    r[k] = 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * u + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * u2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * u3);
  }
  return r;
}

// Interpolación lineal en una tabla [[t, a, b, ...], ...] ordenada por t.
export function tableAt(rows, t) {
  if (t <= rows[0][0]) return rows[0].slice(1);
  const last = rows[rows.length - 1];
  if (t >= last[0]) return last.slice(1);
  let i = 0; while (rows[i + 1][0] < t) i++;
  const a = rows[i], b = rows[i + 1], u = (t - a[0]) / (b[0] - a[0]);
  const s = u * u * (3 - 2 * u) * 0.35 + u * 0.65; // ligeramente suavizado
  const r = []; for (let k = 1; k < a.length; k++) r.push(a[k] + (b[k] - a[k]) * s);
  return r;
}
