// Funciones de distancia con signo (SDF) para modelar huesos y órganos con formas orgánicas.
// Todas reciben coordenadas escalares para evitar crear objetos en los bucles de muestreo.

export const sdSphere = (x, y, z, cx, cy, cz, r) => Math.hypot(x - cx, y - cy, z - cz) - r;

export function sdEllipsoid(x, y, z, cx, cy, cz, rx, ry, rz) {
  const px = x - cx, py = y - cy, pz = z - cz;
  const k0 = Math.hypot(px / rx, py / ry, pz / rz);
  const k1 = Math.hypot(px / (rx * rx), py / (ry * ry), pz / (rz * rz));
  return k1 < 1e-9 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1;
}

// Cápsula entre a y b con radio r
export function sdCapsule(x, y, z, a, b, r) {
  const pax = x - a[0], pay = y - a[1], paz = z - a[2];
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  let h = (pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz);
  h = h < 0 ? 0 : h > 1 ? 1 : h;
  return Math.hypot(pax - bax * h, pay - bay * h, paz - baz * h) - r;
}

// Cono redondeado (radio r1 en a, r2 en b) — de Inigo Quilez
export function sdRoundCone(x, y, z, a, b, r1, r2) {
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  const l2 = bax * bax + bay * bay + baz * baz;
  const rr = r1 - r2, a2 = l2 - rr * rr, il2 = 1 / l2;
  const pax = x - a[0], pay = y - a[1], paz = z - a[2];
  const yy = pax * bax + pay * bay + paz * baz;
  const z0 = yy - l2;
  const qx = pax * l2 - bax * yy, qy = pay * l2 - bay * yy, qz = paz * l2 - baz * yy;
  const x2 = qx * qx + qy * qy + qz * qz;
  const y2 = yy * yy * l2, z2 = z0 * z0 * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(z0) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
  if (Math.sign(yy) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
  return (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - r1;
}

// Caja redondeada centrada en c con semilados h y redondeo r, con ejes locales (ux, uy, uz) opcionales
export function sdBox(x, y, z, c, h, r = 0, ax = null) {
  let px = x - c[0], py = y - c[1], pz = z - c[2];
  if (ax) { const lx = px * ax[0][0] + py * ax[0][1] + pz * ax[0][2], ly = px * ax[1][0] + py * ax[1][1] + pz * ax[1][2], lz = px * ax[2][0] + py * ax[2][1] + pz * ax[2][2]; px = lx; py = ly; pz = lz; }
  const qx = Math.abs(px) - h[0] + r, qy = Math.abs(py) - h[1] + r, qz = Math.abs(pz) - h[2] + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r;
}

// Toro: centro c, eje (unitario) n, radios R (mayor) y r (menor)
export function sdTorus(x, y, z, c, n, R, r) {
  const px = x - c[0], py = y - c[1], pz = z - c[2];
  const h = px * n[0] + py * n[1] + pz * n[2];
  const rx = px - n[0] * h, ry = py - n[1] * h, rz = pz - n[2] * h;
  const q = Math.hypot(rx, ry, rz) - R;
  return Math.hypot(q, h) - r;
}

// Tubo a lo largo de una polilínea con radio variable (radios por vértice), unión de conos redondeados
export function sdPolyTube(x, y, z, pts, radii) {
  let d = 1e9;
  for (let i = 0; i < pts.length - 1; i++) {
    const di = sdRoundCone(x, y, z, pts[i], pts[i + 1], radii[i], radii[i + 1]);
    if (di < d) d = di;
  }
  return d;
}

export const smin = (a, b, k) => { if (k <= 0) return Math.min(a, b); const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
export const smax = (a, b, k) => -smin(-a, -b, k);
// Resta suave: a menos b
export const ssub = (a, b, k) => smax(a, -b, k);

// Ruido de valor 3D suave y determinista (para texturas de superficie en SDF)
function hash3(i, j, k) {
  let h = (i * 374761393 + j * 668265263 + k * 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
export function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  let r = 0;
  for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let c = 0; c < 2; c++) {
    const wt = (a ? u : 1 - u) * (b ? v : 1 - v) * (c ? w : 1 - w);
    r += wt * hash3(xi + a, yi + b, zi + c);
  }
  return r * 2 - 1;
}
export function fbm3(x, y, z, oct = 3) {
  let a = 0.5, f = 1, s = 0;
  for (let i = 0; i < oct; i++) { s += a * noise3(x * f, y * f, z * f); f *= 2.03; a *= 0.5; }
  return s;
}
