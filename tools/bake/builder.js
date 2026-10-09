// Constructor de mallas para el horneado: guarda posición, normal, uv, pesos de skinning,
// id de estructura (sid), un valor auxiliar (tendón, etc.) y el lado (0 izq/medio, 1 der).
import { BONE_MIRROR } from '../../src/anatomy/canon.js';
import { add, sub, mul, madd, dot, cross, len, norm, lerp, catmull, orth, clamp } from '../../src/anatomy/v3.js';
import { blendW } from './body.js';
import { surfaceNets } from './nets.js';
import { MeshoptSimplifier } from 'meshoptimizer';

await MeshoptSimplifier.ready;

export class Geo {
  constructor() { this.P = []; this.N = []; this.T = []; this.W = []; this.S = []; this.A = []; this.D = []; this.I = []; }
  get nv() { return this.P.length / 3; }
  get nt() { return this.I.length / 3; }
  v(p, n, uv, w, sid, aux = 0, side = 0) {
    this.P.push(p[0], p[1], p[2]); this.N.push(n[0], n[1], n[2]);
    this.T.push(uv ? uv[0] : 0, uv ? uv[1] : 0); this.W.push(w[0], w[1], w[2]);
    this.S.push(sid); this.A.push(aux); this.D.push(side);
    return this.nv - 1;
  }
  t(a, b, c) { this.I.push(a, b, c); }
  append(g) {
    const off = this.nv;
    for (const k of ['P', 'N', 'T', 'W', 'S', 'A', 'D']) { const src = g[k], dst = this[k]; for (let i = 0; i < src.length; i++) dst.push(src[i]); }
    for (let i = 0; i < g.I.length; i++) this.I.push(g.I[i] + off);
    return this;
  }
  // Copia reflejada en X (lado derecho): invierte el orden de los triángulos y cambia huesos.
  mirrored() {
    const g = new Geo();
    for (let i = 0; i < this.nv; i++) {
      g.P.push(-this.P[i * 3], this.P[i * 3 + 1], this.P[i * 3 + 2]);
      g.N.push(-this.N[i * 3], this.N[i * 3 + 1], this.N[i * 3 + 2]);
      g.T.push(this.T[i * 2], this.T[i * 2 + 1]);
      g.W.push(BONE_MIRROR[this.W[i * 3]], BONE_MIRROR[this.W[i * 3 + 1]], this.W[i * 3 + 2]);
      g.S.push(this.S[i]); g.A.push(this.A[i]); g.D.push(1);
    }
    for (let i = 0; i < this.I.length; i += 3) g.I.push(this.I[i], this.I[i + 2], this.I[i + 1]);
    return g;
  }
  // Añade esta geometría y su reflejo (estructuras pares)
  withMirror() { return new Geo().append(this).append(this.mirrored()); }
}

const wAt = (w, p) => (typeof w === 'function' ? w(p) : w);
const auxAt = (a, p, u, v) => (typeof a === 'function' ? a(p, u, v) : a || 0);

// Superficie por rejilla. fn(u, v) -> punto [x,y,z] o {p, w, aux}
export function addGrid(g, nu, nv, fn, o = {}) {
  const pts = [], ws = [], aux = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const u = i / nu, v = j / nv;
    const r = fn(u, v);
    const p = Array.isArray(r) ? r : r.p;
    pts.push(p);
    ws.push(r.w || wAt(o.w, p));
    aux.push(r.aux !== undefined ? r.aux : auxAt(o.aux, p, u, v));
  }
  const at = (i, j) => {
    if (o.closeU) { i = ((i % nu) + nu) % nu; } else i = clamp(i, 0, nu);
    if (o.closeV) { j = ((j % nv) + nv) % nv; } else j = clamp(j, 0, nv);
    return pts[j * (nu + 1) + i];
  };
  const base = g.nv;
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const du = sub(at(i + 1, j), at(i - 1, j)), dv = sub(at(i, j + 1), at(i, j - 1));
    let n = cross(du, dv);
    if (len(n) < 1e-9) { const du2 = sub(at(i + 1, j + (j < nv ? 1 : -1)), at(i - 1, j + (j < nv ? 1 : -1))); n = cross(du2, dv); }
    n = norm(n); if (o.flip) n = mul(n, -1);
    const k = j * (nu + 1) + i;
    const uv = o.uv ? o.uv(i / nu, j / nv) : [i / nu * (o.uvScale ? o.uvScale[0] : 1), j / nv * (o.uvScale ? o.uvScale[1] : 1)];
    g.v(pts[k], n, uv, ws[k], o.sid, aux[k], o.side || 0);
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = base + j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
    if (o.flip) { g.t(a, c, b); g.t(b, c, d); } else { g.t(a, b, c); g.t(b, d, c); }
  }
  return g;
}

// Elipsoide/esfera paramétrica (para piezas pequeñas). f(p) opcional para deformar.
export function addEllipsoid(g, c, r, o = {}) {
  const nu = o.nu || 24, nv = o.nv || 16;
  const ax = o.axes || [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  return addGrid(g, nu, nv, (u, v) => {
    const th = u * Math.PI * 2, ph = v * Math.PI;
    const lx = Math.sin(ph) * Math.cos(th) * r[0], ly = -Math.cos(ph) * r[1], lz = Math.sin(ph) * Math.sin(th) * r[2];
    let p = [c[0] + ax[0][0] * lx + ax[1][0] * ly + ax[2][0] * lz, c[1] + ax[0][1] * lx + ax[1][1] * ly + ax[2][1] * lz, c[2] + ax[0][2] * lx + ax[1][2] * ly + ax[2][2] * lz];
    if (o.deform) p = o.deform(p, u, v);
    return p;
  }, { ...o, closeU: true, flip: !o.flip });
}

// Tubo a lo largo de una curva. pts: [{p, r, w, rz?}] ; se remuestrea con Catmull-Rom.
export function addTube(g, pts, o = {}) {
  const P = pts.map((q) => q.p);
  let L = 0; for (let i = 1; i < P.length; i++) L += len(sub(P[i], P[i - 1]));
  const ns = o.ns || Math.max(6, Math.min(400, Math.round(L / (o.step || 0.6))));
  const k = o.sides || 8;
  const samples = [];
  for (let i = 0; i <= ns; i++) {
    const t = i / ns; const f = t * (P.length - 1); let a = Math.floor(f); if (a >= P.length - 1) a = P.length - 2; const fr = f - a;
    const p = P.length > 2 ? catmull(P, t) : lerp(P[0], P[1], t);
    const qa = pts[a], qb = pts[a + 1];
    const r = qa.r + (qb.r - qa.r) * fr;
    const rz = (qa.rz ?? qa.r) + ((qb.rz ?? qb.r) - (qa.rz ?? qa.r)) * fr;
    const w = qa.w && qb.w ? blendW(qa.w, qb.w, fr) : wAt(o.w, p);
    const ax = (qa.aux ?? 0) + ((qb.aux ?? 0) - (qa.aux ?? 0)) * fr;
    samples.push({ p, r: o.radius ? o.radius(t, r) : r, rz: o.radius ? o.radius(t, rz) : rz, w, aux: ax });
  }
  // marcos por transporte paralelo
  let T0 = norm(sub(samples[1].p, samples[0].p));
  let Nn = o.up ? norm(orth(o.up, T0)) : norm(orth(Math.abs(T0[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], T0));
  if (len(Nn) < 1e-6) Nn = norm(orth([0, 0, 1], T0));
  const frames = [];
  let s = 0;
  for (let i = 0; i <= ns; i++) {
    const T = norm(sub(samples[Math.min(i + 1, ns)].p, samples[Math.max(i - 1, 0)].p));
    Nn = norm(orth(Nn, T)); if (len(Nn) < 1e-6) Nn = norm(orth([0, 0, 1], T));
    const Bn = cross(T, Nn);
    if (i > 0) s += len(sub(samples[i].p, samples[i - 1].p));
    frames.push({ T, N: Nn, B: Bn, s });
  }
  const base = g.nv;
  const uvL = o.uvTile || 2.0;
  const ring = (i) => {
    const S = samples[i], F = frames[i];
    for (let j = 0; j <= k; j++) {
      const a = (j / k) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      const n = norm(add(mul(F.N, ca * S.rz), mul(F.B, sa * S.r)));
      const p = add(S.p, add(mul(F.N, ca * S.rz), mul(F.B, sa * S.r)));
      g.v(p, norm(add(mul(F.N, ca / Math.max(S.rz, 1e-3)), mul(F.B, sa / Math.max(S.r, 1e-3)))), [j / k, F.s / uvL], S.w, o.sid, S.aux || auxAt(o.aux, p, j / k, i / ns), o.side || 0);
    }
  };
  for (let i = 0; i <= ns; i++) ring(i);
  for (let i = 0; i < ns; i++) for (let j = 0; j < k; j++) {
    const a = base + i * (k + 1) + j, b = a + 1, c = a + k + 1, d = c + 1;
    g.t(a, c, b); g.t(b, c, d);
  }
  // tapas redondeadas
  const cap = (iEnd, dir) => {
    const S = samples[iEnd], F = frames[iEnd];
    const rings = 3; let prev = base + iEnd * (k + 1);
    const R = Math.max(S.r, S.rz);
    for (let q = 1; q <= rings; q++) {
      const ang = (q / rings) * Math.PI * 0.5;
      const sc = Math.cos(ang), off = Math.sin(ang) * R * (o.capScale ?? 0.8) * dir;
      const start = g.nv;
      for (let j = 0; j <= k; j++) {
        const a = (j / k) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
        const radial = add(mul(F.N, ca * S.rz * sc), mul(F.B, sa * S.r * sc));
        const p = madd(add(S.p, radial), F.T, off);
        const n = norm(add(mul(norm(radial.some((x) => x) ? radial : F.N), Math.cos(ang)), mul(F.T, Math.sin(ang) * dir)));
        g.v(p, n, [j / k, (F.s + off) / uvL], S.w, o.sid, S.aux || 0, o.side || 0);
      }
      for (let j = 0; j < k; j++) {
        const a = prev + j, b = a + 1, c = start + j, d = c + 1;
        if (dir > 0) { g.t(a, c, b); g.t(b, c, d); } else { g.t(a, b, c); g.t(b, d, c); }
      }
      prev = start;
    }
  };
  if (o.caps !== false) { cap(ns, 1); cap(0, -1); }
  return g;
}

// Músculo laminar con grosor: at(s,t) -> {p (base), n (hacia afuera, opcional), w}, th(s,t) grosor.
// Las fibras van a lo largo de t. tendon(s,t) da 0..1 (1 = tendón blanco).
export function addMuscle(g, o) {
  const ns = o.ns || 10, nt = o.nt || 24;
  const base = [], ws = [], hint = [];
  for (let j = 0; j <= nt; j++) for (let i = 0; i <= ns; i++) {
    const r = o.at(i / ns, j / nt);
    base.push(r.p); ws.push(r.w); hint.push(r.n || null);
  }
  const at = (i, j) => base[clamp(j, 0, nt) * (ns + 1) + clamp(i, 0, ns)];
  const nrm = [];
  for (let j = 0; j <= nt; j++) for (let i = 0; i <= ns; i++) {
    let n = cross(sub(at(i + 1, j), at(i - 1, j)), sub(at(i, j + 1), at(i, j - 1)));
    n = len(n) > 1e-9 ? norm(n) : [0, 0, 1];
    const h = hint[j * (ns + 1) + i] || (o.out ? o.out(at(i, j)) : null);
    if (h && dot(n, h) < 0) n = mul(n, -1);
    if (!h && o.flip) n = mul(n, -1);
    nrm.push(n);
  }
  // tamaño físico para las uv
  let Ls = 0, Lt = 0;
  for (let i = 0; i < ns; i++) Ls += len(sub(at(i + 1, nt >> 1), at(i, nt >> 1)));
  for (let j = 0; j < nt; j++) Lt += len(sub(at(ns >> 1, j + 1), at(ns >> 1, j)));
  const tile = o.uvTile || 2.6;
  const back = o.back ?? 0.08;
  const top = [], bot = [];
  for (let j = 0; j <= nt; j++) for (let i = 0; i <= ns; i++) {
    const s = i / ns, t = j / nt, k = j * (ns + 1) + i;
    const th = Math.max(o.th(s, t), 0.02);
    top.push(madd(base[k], nrm[k], th));
    bot.push(madd(base[k], nrm[k], -back));
  }
  const tend = (s, t) => (o.tendon ? o.tendon(s, t) : 0);
  const uvOf = (s, t) => [s * Ls / tile, t * Lt / tile];
  const gridNormals = (pts, flip) => {
    const out = [];
    const A = (i, j) => pts[clamp(j, 0, nt) * (ns + 1) + clamp(i, 0, ns)];
    for (let j = 0; j <= nt; j++) for (let i = 0; i <= ns; i++) {
      let n = cross(sub(A(i + 1, j), A(i - 1, j)), sub(A(i, j + 1), A(i, j - 1)));
      n = len(n) > 1e-9 ? norm(n) : nrm[j * (ns + 1) + i];
      if (dot(n, nrm[j * (ns + 1) + i]) < 0) n = mul(n, -1);
      out.push(flip ? mul(n, -1) : n);
    }
    return out;
  };
  const nTop = gridNormals(top, false), nBot = gridNormals(bot, true);
  const b0 = g.nv;
  for (let j = 0; j <= nt; j++) for (let i = 0; i <= ns; i++) { const k = j * (ns + 1) + i; g.v(top[k], nTop[k], uvOf(i / ns, j / nt), ws[k], o.sid, tend(i / ns, j / nt), o.side || 0); }
  const b1 = g.nv;
  for (let j = 0; j <= nt; j++) for (let i = 0; i <= ns; i++) { const k = j * (ns + 1) + i; g.v(bot[k], nBot[k], uvOf(i / ns, j / nt), ws[k], o.sid, tend(i / ns, j / nt), o.side || 0); }
  // orientación: el frente de la cara superior debe mirar hacia nrm
  const orientTop = (() => {
    const a = top[0], b = top[1], c = top[ns + 1];
    return dot(cross(sub(b, a), sub(c, a)), nrm[0]) > 0;
  })();
  for (let j = 0; j < nt; j++) for (let i = 0; i < ns; i++) {
    const a = j * (ns + 1) + i, b = a + 1, c = a + ns + 1, d = c + 1;
    if (orientTop) { g.t(b0 + a, b0 + b, b0 + c); g.t(b0 + b, b0 + d, b0 + c); g.t(b1 + a, b1 + c, b1 + b); g.t(b1 + b, b1 + c, b1 + d); }
    else { g.t(b0 + a, b0 + c, b0 + b); g.t(b0 + b, b0 + c, b0 + d); g.t(b1 + a, b1 + b, b1 + c); g.t(b1 + b, b1 + d, b1 + c); }
  }
  // costados: recorre el borde y une la cara superior con la inferior
  const border = [];
  for (let i = 0; i < ns; i++) border.push([i, 0]);
  for (let j = 0; j < nt; j++) border.push([ns, j]);
  for (let i = ns; i > 0; i--) border.push([i, nt]);
  for (let j = nt; j > 0; j--) border.push([0, j]);
  border.push([0, 0]);
  const sideStart = g.nv;
  for (const [i, j] of border) {
    const k = j * (ns + 1) + i;
    const outward = norm(sub(top[k], base[k]));
    let edgeN = sub(at(i, j), at(clamp(i, 1, ns - 1), clamp(j, 1, nt - 1)));
    edgeN = len(edgeN) > 1e-6 ? norm(orth(edgeN, nrm[k])) : outward;
    g.v(top[k], norm(add(edgeN, mul(nrm[k], 0.3))), uvOf(i / ns, j / nt), ws[k], o.sid, tend(i / ns, j / nt), o.side || 0);
    g.v(bot[k], norm(add(edgeN, mul(nrm[k], -0.3))), uvOf(i / ns, j / nt), ws[k], o.sid, tend(i / ns, j / nt), o.side || 0);
  }
  for (let q = 0; q < border.length - 1; q++) {
    const a = sideStart + q * 2, b = a + 1, c = a + 2, d = a + 3;
    if (orientTop) { g.t(a, c, b); g.t(b, c, d); } else { g.t(a, b, c); g.t(b, d, c); }
  }
  return g;
}

// Malla a partir de una SDF. w: pesos fijos o función del punto. simplify: fracción de triángulos a conservar.
export function addSDF(g, f, bmin, bmax, h, o = {}) {
  let { positions: P, normals: N, indices: I } = surfaceNets(f, bmin, bmax, h, o);
  const tris0 = I.length / 3;
  const wantTris = o.tris || (o.simplify ? tris0 * o.simplify : tris0);
  if (wantTris < tris0 && I.length > 300) {
    const target = Math.max(300, Math.floor(wantTris) * 3);
    const [si] = MeshoptSimplifier.simplify(I, P, 3, target, o.error ?? 0.02, []);
    // compacta
    const map = new Int32Array(P.length / 3).fill(-1); const P2 = [], N2 = [], I2 = new Uint32Array(si.length);
    for (let i = 0; i < si.length; i++) {
      const v = si[i];
      if (map[v] < 0) { map[v] = P2.length / 3; P2.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); N2.push(N[v * 3], N[v * 3 + 1], N[v * 3 + 2]); }
      I2[i] = map[v];
    }
    P = P2; N = N2; I = I2;
  }
  if (globalThis.__bakeLog) globalThis.__bakeLog.push([o.label || o.sid, tris0, I.length / 3]);
  const base = g.nv;
  const nv = P.length / 3;
  for (let i = 0; i < nv; i++) {
    const p = [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]];
    const uv = o.uv ? o.uv(p) : [p[0] / 3, p[1] / 3];
    g.v(p, [N[i * 3], N[i * 3 + 1], N[i * 3 + 2]], uv, wAt(o.w, p), typeof o.sid === 'function' ? o.sid(p) : o.sid, auxAt(o.aux, p), o.side || 0);
  }
  for (let i = 0; i < I.length; i++) g.I.push(I[i] + base);
  return g;
}
