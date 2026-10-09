// Mallado de superficies implícitas con "surface nets": muestrea la SDF en una rejilla y crea
// un vértice por celda cortada; las normales salen del gradiente de la SDF.

export function surfaceNets(f, bmin, bmax, h, opts = {}) {
  const nx = Math.max(3, Math.ceil((bmax[0] - bmin[0]) / h) + 1);
  const ny = Math.max(3, Math.ceil((bmax[1] - bmin[1]) / h) + 1);
  const nz = Math.max(3, Math.ceil((bmax[2] - bmin[2]) / h) + 1);
  const field = new Float32Array(nx * ny * nz);
  let q = 0;
  for (let k = 0; k < nz; k++) {
    const z = bmin[2] + k * h;
    for (let j = 0; j < ny; j++) {
      const y = bmin[1] + j * h;
      for (let i = 0; i < nx; i++) field[q++] = f(bmin[0] + i * h, y, z);
    }
  }
  const I = (i, j, k) => i + nx * (j + ny * k);
  const cx = nx - 1, cy = ny - 1, cz = nz - 1;
  const cellVert = new Int32Array(cx * cy * cz).fill(-1);
  const Cc = (i, j, k) => i + cx * (j + cy * k);
  const pos = [];
  const cv = new Float64Array(8);
  const CO = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const ED = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  for (let k = 0; k < cz; k++) for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) {
    let mask = 0;
    for (let c = 0; c < 8; c++) { const o = CO[c]; const val = field[I(i + o[0], j + o[1], k + o[2])]; cv[c] = val; if (val < 0) mask |= 1 << c; }
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of ED) {
      const va = cv[a], vb = cv[b];
      if ((va < 0) === (vb < 0)) continue;
      const t = va / (va - vb);
      const oa = CO[a], ob = CO[b];
      sx += oa[0] + (ob[0] - oa[0]) * t; sy += oa[1] + (ob[1] - oa[1]) * t; sz += oa[2] + (ob[2] - oa[2]) * t; n++;
    }
    cellVert[Cc(i, j, k)] = pos.length / 3;
    pos.push(bmin[0] + (i + sx / n) * h, bmin[1] + (j + sy / n) * h, bmin[2] + (k + sz / n) * h);
  }
  const idx = [];
  const quad = (a, b, c, d) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    // diagonal más corta
    const d1 = dist2(pos, a, c), d2 = dist2(pos, b, d);
    if (d1 <= d2) idx.push(a, b, c, a, c, d); else idx.push(a, b, d, b, c, d);
  };
  for (let k = 1; k < cz; k++) for (let j = 1; j < cy; j++) for (let i = 0; i < cx; i++) {
    const a = field[I(i, j, k)], b = field[I(i + 1, j, k)];
    if ((a < 0) === (b < 0)) continue;
    quad(cellVert[Cc(i, j - 1, k - 1)], cellVert[Cc(i, j, k - 1)], cellVert[Cc(i, j, k)], cellVert[Cc(i, j - 1, k)]);
  }
  for (let k = 1; k < cz; k++) for (let j = 0; j < cy; j++) for (let i = 1; i < cx; i++) {
    const a = field[I(i, j, k)], b = field[I(i, j + 1, k)];
    if ((a < 0) === (b < 0)) continue;
    quad(cellVert[Cc(i - 1, j, k - 1)], cellVert[Cc(i, j, k - 1)], cellVert[Cc(i, j, k)], cellVert[Cc(i - 1, j, k)]);
  }
  for (let k = 0; k < cz; k++) for (let j = 1; j < cy; j++) for (let i = 1; i < cx; i++) {
    const a = field[I(i, j, k)], b = field[I(i, j, k + 1)];
    if ((a < 0) === (b < 0)) continue;
    quad(cellVert[Cc(i - 1, j - 1, k)], cellVert[Cc(i, j - 1, k)], cellVert[Cc(i, j, k)], cellVert[Cc(i - 1, j, k)]);
  }
  // Proyecta los vértices sobre la superficie y calcula normales por gradiente
  const nv = pos.length / 3;
  const P = new Float32Array(pos), N = new Float32Array(nv * 3);
  const e = h * 0.5;
  const proj = opts.project !== false;
  for (let v = 0; v < nv; v++) {
    let x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
    for (let it = 0; it < (proj ? 2 : 1); it++) {
      const gx = f(x + e, y, z) - f(x - e, y, z), gy = f(x, y + e, z) - f(x, y - e, z), gz = f(x, y, z + e) - f(x, y, z - e);
      const gl = Math.hypot(gx, gy, gz) || 1;
      const nx_ = gx / gl, ny_ = gy / gl, nz_ = gz / gl;
      if (proj && it === 0) {
        const d = f(x, y, z);
        if (Math.abs(d) < h) { x -= nx_ * d; y -= ny_ * d; z -= nz_ * d; }
      } else { N[v * 3] = nx_; N[v * 3 + 1] = ny_; N[v * 3 + 2] = nz_; }
    }
    P[v * 3] = x; P[v * 3 + 1] = y; P[v * 3 + 2] = z;
  }
  // Orienta cada triángulo según la normal media de sus vértices
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
    const vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
    const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
    const mx = N[a * 3] + N[b * 3] + N[c * 3], my = N[a * 3 + 1] + N[b * 3 + 1] + N[c * 3 + 1], mz = N[a * 3 + 2] + N[b * 3 + 2] + N[c * 3 + 2];
    if (fx * mx + fy * my + fz * mz < 0) { idx[t + 1] = c; idx[t + 2] = b; }
  }
  return { positions: P, normals: N, indices: new Uint32Array(idx) };
}

function dist2(p, a, b) {
  const dx = p[a * 3] - p[b * 3], dy = p[a * 3 + 1] - p[b * 3 + 1], dz = p[a * 3 + 2] - p[b * 3 + 2];
  return dx * dx + dy * dy + dz * dz;
}
