// Músculos de Mary. Cada músculo se define como un haz de fibras que pasa por "estaciones"
// (origen, puntos de paso, inserción). Las estaciones pueden estar sobre el tronco (T: altura, ángulo),
// sobre el brazo (A: u, ángulo) o la pierna (L: u, ángulo), sobre el cráneo (S: punto proyectado)
// o ser puntos fijos de hueso (P). El generador da grosor de vientre, tendones y fibras.
import { Geo, addMuscle, addTube, addGrid } from './builder.js';
import { torsoPt, torsoN, armPt, legPt, armAxis, legAxis, trunkW, armW, legW, headW, rigid, blendW, RIBS, ribPoint, STERNUM, J, B } from './body.js';
import { add, sub, mul, madd, dot, cross, len, norm, lerp, mix, smooth, clamp, deg, catmull } from '../../src/anatomy/v3.js';
import { skull, mandible } from './skeleton.js';
import { SID } from '../../src/anatomy/atlas.js';

const S = (id) => { const s = SID[id]; if (!s) throw new Error('Falta en el atlas: ' + id); return s; };
const GAP = 0.35;

// ---------- estaciones ----------
const T = (y, th, d = 0) => ({ k: 'T', y, th, d });
const A = (u, th, d = 0) => ({ k: 'A', u, th, d });
const L = (u, th, d = 0) => ({ k: 'L', u, th, d });
const P = (p, w, n = null) => ({ k: 'P', p, w, n });
const SK = (p, d = 0) => ({ k: 'S', p, d });
const HC = [0, 70.5, 0.5];
const skullF = (x, y, z) => Math.min(skull(x, y, z), mandible(x, y, z));
function projectSkull(p, off) {
  const dir = norm(sub(p, HC));
  let a = 0, b = 16; // distancia desde el centro
  for (let i = 0; i < 28; i++) { const m = (a + b) / 2; const q = madd(HC, dir, m); if (skullF(q[0], q[1], q[2]) < 0) a = m; else b = m; }
  const q = madd(HC, dir, b);
  const e = 0.05;
  const n = norm([skullF(q[0] + e, q[1], q[2]) - skullF(q[0] - e, q[1], q[2]), skullF(q[0], q[1] + e, q[2]) - skullF(q[0], q[1] - e, q[2]), skullF(q[0], q[1], q[2] + e) - skullF(q[0], q[1], q[2] - e)]);
  return { p: madd(q, n, off), n };
}
function evalSt(st, base) {
  switch (st.k) {
    case 'T': { const p = torsoPt(st.y, st.th, base + st.d); return { p, n: torsoN(st.y, st.th, base + st.d), w: trunkW(p) }; }
    case 'A': { const p = armPt(st.u, st.th, base + st.d); return { p, n: norm(sub(p, armAxis(st.u))), w: armW(p) }; }
    case 'L': { const p = legPt(st.u, st.th, base + st.d); return { p, n: norm(sub(p, legAxis(st.u))), w: legW(p) }; }
    case 'S': { const r = projectSkull(st.p, 0.05 + st.d); return { p: r.p, n: r.n, w: headW() }; }
    default: return { p: st.p, n: st.n, w: typeof st.w === 'function' ? st.w(st.p) : st.w };
  }
}
function interp(a, b, f, base, bulge) {
  if (a.k === b.k && a.k === 'T') return evalSt(T(mix(a.y, b.y, f), mix(a.th, b.th, f), mix(a.d, b.d, f)), base);
  if (a.k === b.k && a.k === 'A') return evalSt(A(mix(a.u, b.u, f), mix(a.th, b.th, f), mix(a.d, b.d, f)), base);
  if (a.k === b.k && a.k === 'L') return evalSt(L(mix(a.u, b.u, f), mix(a.th, b.th, f), mix(a.d, b.d, f)), base);
  const ea = evalSt(a, base), eb = evalSt(b, base);
  let p = lerp(ea.p, eb.p, f);
  if (a.k === 'S' && b.k === 'S') { const r = projectSkull(p, 0.05 + mix(a.d, b.d, f)); return { p: r.p, n: r.n, w: headW() }; }
  // si un extremo está sobre el tronco, la fibra sigue la superficie y solo al final baja al hueso
  if (a.k === 'T' || b.k === 'T') {
    const th = Math.atan2(p[0], p[2]) / deg, dd = a.k === 'T' ? a.d : b.d;
    const ps = torsoPt(p[1], th, base + dd);
    const keep = a.k === 'T' ? 1 - smooth(0.55, 1.0, f) : smooth(0.0, 0.45, f);
    p = lerp(p, ps, keep * (bulge >= 0 ? 1 : 0));
  }
  let n = ea.n && eb.n ? norm(lerp(ea.n, eb.n, f)) : ea.n || eb.n;
  if (n && bulge > 0) p = madd(p, n, bulge * Math.sin(Math.PI * f));
  return { p, n, w: blendW(ea.w, eb.w, f) };
}

// Grosor: vientre carnoso entre belly[0] y belly[1], tendones finos fuera de ese rango.
function thickness(o) {
  const [b0, b1] = o.belly || [0.06, 0.94];
  return (s, t) => {
    const sv = clamp(o.sMap ? o.sMap(s) : s, 0, 1);
    const edge = Math.pow(Math.max(0, Math.sin(Math.PI * sv)), o.edgeExp ?? 0.4);
    let bt = 0;
    if (t > b0 && t < b1) bt = Math.pow(Math.sin(Math.PI * (t - b0) / (b1 - b0)), o.bellyExp ?? 0.5);
    if (o.bias) bt *= o.bias(sv, t);
    let th = Math.max((o.tendonTh ?? 0.14) * edge, o.th * bt * edge);
    if (o.dips) for (const [tc, w, k] of o.dips) th *= 1 - k * Math.exp(-(((t - tc) / w) ** 2));
    if (o.groove) th *= 1 - o.groove(sv, t);
    return th + 0.02;
  };
}
function tendonOf(o) {
  const [b0, b1] = o.belly || [0.06, 0.94];
  return (s, t) => {
    let a = t < b0 ? smooth(b0 + 0.02, b0 - 0.04, t) : t > b1 ? smooth(b1 - 0.02, b1 + 0.04, t) : 0;
    if (o.aux) a = Math.max(a, o.aux(s, t));
    return clamp(a, 0, 1);
  };
}

// Músculo general. o.st = [funciones s -> estación], o.tk = posición en t de cada estación.
export function muscle(g, id, o) {
  const base = (o.depth ?? GAP) + o.th;
  const n = o.st.length;
  const tk = o.tk || o.st.map((_, i) => i / (n - 1));
  let cacheS = -1, cache = null;
  addMuscle(g, {
    ns: o.ns || 8, nt: o.nt || 26, sid: S(id), uvTile: o.uvTile || 2.6, back: o.back ?? 0.1,
    at: (s, t) => {
      if (s !== cacheS) { cacheS = s; cache = o.st.map((f) => f(s)); }
      let k = 0; while (k < n - 2 && t > tk[k + 1]) k++;
      const f = clamp((t - tk[k]) / (tk[k + 1] - tk[k]), 0, 1);
      const r = interp(cache[k], cache[k + 1], f, base, o.bulge ? o.bulge[k] || 0 : 0);
      return { p: r.p, n: r.n, w: r.w };
    },
    th: thickness(o), tendon: tendonOf(o),
  });
}
const mx = (a, b) => (s) => mix(a, b, s);
// Atajo para músculos de miembro: cada estación es [u, θ0, θ1, profundidadExtra?]
function limbMus(g, id, kind, rows, o = {}) {
  const C = kind === 'arm' ? A : L;
  muscle(g, id, { ...o, st: rows.map((r) => (s) => C(r[0], mix(r[1], r[2], s), r[3] || 0)), tk: o.tk });
}

// =================== SUPERFICIALES ===================
function trunkSuperficial(g) {
  const cw = rigid('chest');
  // Pectoral mayor
  muscle(g, 'pectoral_mayor', {
    th: 1.9, ns: 14, nt: 28, belly: [0.0, 0.9], edgeExp: 0.3,
    st: [
      (s) => (s < 0.22 ? T(mix(47.9, 46.9, s / 0.22), mix(36, 9, s / 0.22)) : s < 0.86 ? T(mix(46.2, 30.8, (s - 0.22) / 0.64), mix(5.5, 6.0, (s - 0.22) / 0.64)) : T(mix(30.4, 28.6, (s - 0.86) / 0.14), mix(7, 26, (s - 0.86) / 0.14))),
      (s) => T(mix(45.6, 39.5, s), mix(58, 66, s)),
      (s) => A(mix(0.25, 0.13, s), mix(32, 48, s), 1.2),
    ],
    tk: [0, 0.62, 1], bias: (s, t) => 0.6 + 0.4 * t + 0.25 * Math.sin(Math.PI * s),
  });
  // Deltoides: tres porciones
  const HEAD = [17.4, 47.4, -1.3];
  const delt = (s0, s1, O) => muscle(g, 'deltoides', {
    th: 2.3, ns: 7, nt: 24, belly: [0.04, 0.84], edgeExp: 0.35,
    st: [
      (s) => P(O(mix(s0, s1, s)), trunkW),
      (s) => { const o = O(mix(s0, s1, s)); const ins = armPt(0.42, mix(78, 100, mix(s0, s1, s)), 2.4); const m = lerp(o, ins, 0.33); const d = norm(sub(m, HEAD)); return P(madd(HEAD, d, 4.6), armW, d); },
      (s) => A(0.42, mix(80, 100, mix(s0, s1, s)), 0.8),
    ],
    tk: [0, 0.35, 1],
  });
  const dO = (s) => (s < 0.33 ? lerp([11.6, 48.3, 3.4], [15.8, 49.8, 0.8], s / 0.33) : s < 0.62 ? lerp([16.6, 50.2, 0.2], [17.3, 50.1, -2.8], (s - 0.33) / 0.29) : lerp([16.2, 49.6, -4.8], [10.4, 46.8, -10.9], (s - 0.62) / 0.38));
  delt(0.0, 0.31, dO); delt(0.35, 0.6, dO); delt(0.64, 1.0, dO);
  // Trapecio
  muscle(g, 'trapecio', {
    th: 1.1, ns: 16, nt: 22, belly: [0.04, 0.96], edgeExp: 0.25,
    st: [
      (s) => T(mix(65.2, 25.5, s), 178.5),
      (s) => (s < 0.3 ? T(mix(56, 49.8, s / 0.3), mix(150, 110, s / 0.3)) : s < 0.55 ? T(mix(48.6, 46.2, (s - 0.3) / 0.25), mix(135, 150, (s - 0.3) / 0.25)) : T(mix(43.4, 36.6, (s - 0.55) / 0.45), mix(158, 168, (s - 0.55) / 0.45))),
      (s) => (s < 0.3 ? P(lerp([10.2, 48.6, 3.0], [16.2, 50.0, -1.0], s / 0.3), cw) : s < 0.5 ? P(lerp([16.9, 50.2, -2.6], [13.8, 48.4, -8.4], (s - 0.3) / 0.2), cw) : P(lerp([12.4, 46.8, -10.8], [7.4, 44.0, -11.0], (s - 0.5) / 0.5), cw)),
    ],
    tk: [0, 0.6, 1],
    bias: (s, t) => (s < 0.35 ? 1.25 : 1) * (0.85 + 0.15 * t),
    aux: (s, t) => (s > 0.3 && s < 0.48 && t < 0.18 ? 1 : 0),
  });
  // Dorsal ancho
  muscle(g, 'dorsal_ancho', {
    th: 1.1, ns: 16, nt: 26, belly: [0.0, 0.93], edgeExp: 0.25,
    st: [
      (s) => (s < 0.62 ? T(mix(35.6, 8.6, s / 0.62), 178.5) : T(mix(9.8, 13.8, (s - 0.62) / 0.38), mix(170, 128, (s - 0.62) / 0.38))),
      (s) => T(mix(40.2, 31.0, s), mix(124, 104, s)),
      (s) => T(mix(43.6, 41.6, s), mix(108, 98, s), 0.3),
      (s) => A(0.15, mix(-40, -55, s), 1.6),
    ],
    tk: [0, 0.55, 0.78, 1],
    aux: (s, t) => (s > 0.28 ? smooth(0.32, 0.18, t) * smooth(0.28, 0.4, s) : 0),
    bias: (s, t) => 0.75 + 0.5 * t,
  });
  // Serrato anterior: digitaciones sobre las costillas 4 a 9
  for (let k = 4; k <= 9; k++) {
    const r = RIBS[k - 1];
    const yk = ribPoint(r, 0.78)[1];
    muscle(g, 'serrato_anterior', {
      th: 0.75, ns: 4, nt: 12, belly: [0.0, 1.0], edgeExp: 0.5,
      st: [(s) => T(yk + (s - 0.5) * 1.8, 54 + (9 - k) * 1.5), (s) => T(yk + 4.2 + (s - 0.5) * 2.6 + (9 - k) * 0.4, 112 + (k - 4) * 1.5)],
    });
  }
  // Oblicuo externo (con aponeurosis blanca hacia el recto)
  muscle(g, 'oblicuo_externo', {
    th: 0.9, ns: 16, nt: 24, belly: [0.0, 0.97], edgeExp: 0.2,
    st: [
      (s) => T(mix(33.6, 19.8, s), mix(50, 120, s)),
      (s) => (s < 0.62 ? T(mix(27.5, 8.5, s / 0.62), 23.5) : s < 0.8 ? T(mix(8.5, 9.6, (s - 0.62) / 0.18), mix(30, 50, (s - 0.62) / 0.18)) : T(mix(10.2, 13.6, (s - 0.8) / 0.2), mix(55, 98, (s - 0.8) / 0.2))),
    ],
    aux: (s, t) => (s < 0.66 ? smooth(0.62, 0.78, t) : 0),
  });
  // Recto del abdomen con intersecciones tendinosas
  muscle(g, 'recto_abdominal', {
    th: 1.15, ns: 8, nt: 34, belly: [0.03, 0.985], edgeExp: 0.3,
    st: [(s) => T(-2.2, mix(2.2, 9.5, s)), (s) => T(15.5, mix(2.2, 22.5, s)), (s) => T(31.5, mix(3.0, 29.0, s))],
    tk: [0, 0.54, 1],
    dips: [[0.585, 0.014, 0.65], [0.76, 0.014, 0.65], [0.915, 0.014, 0.6]],
    aux: (s, t) => Math.max(...[0.585, 0.76, 0.915].map((c) => Math.exp(-(((t - c) / 0.012) ** 2)))),
  });
  muscle(g, 'linea_alba', { th: 0.25, depth: GAP + 0.6, ns: 2, nt: 20, belly: [-1, 2], st: [(s) => T(-2.6, mix(0, 2.4, s)), (s) => T(30.4, mix(0, 2.6, s))], aux: () => 1, edgeExp: 0.1 });
  // Esternocleidomastoideo (cabezas esternal y clavicular)
  muscle(g, 'esternocleidomastoideo', {
    th: 1.25, ns: 8, nt: 26, belly: [0.06, 0.9], edgeExp: 0.35,
    st: [
      (s) => P([mix(5.0, 6.7, s), 66.4, mix(-1.0, -2.2, s)], trunkW, [0.8, 0, -0.6]),
      (s) => T(mix(58.6, 57.2, s), mix(98, 112, s)),
      (s) => T(53.2, mix(42, 64, s)),
      (s) => (s < 0.5 ? P(lerp([1.4, 46.9, 6.1], [2.1, 47.0, 6.2], s / 0.5), trunkW) : P(lerp([3.6, 47.3, 6.3], [6.6, 47.6, 6.0], (s - 0.5) / 0.5), trunkW)),
    ],
    tk: [0, 0.3, 0.62, 1],
    groove: (s, t) => 0.45 * Math.exp(-(((s - 0.5) / 0.07) ** 2)) * smooth(0.55, 0.85, t),
  });
  // Infrahioideos (cintas del cuello anterior)
  muscle(g, 'infrahioideos', { th: 0.45, ns: 5, nt: 14, belly: [0.04, 0.95], st: [(s) => T(47.2, mix(3, 12, s)), (s) => T(57.0, mix(3, 9, s))] });
  // Infraespinoso, redondo menor y redondo mayor (espalda, sobre la escápula)
  muscle(g, 'infraespinoso', {
    th: 1.6, ns: 10, nt: 20, belly: [0.0, 0.86],
    st: [(s) => T(mix(43.0, 35.6, s), mix(162, 150, s)), (s) => T(mix(45.4, 43.2, s), mix(132, 128, s)), (s) => A(0.04, mix(130, 150, s), 1.4)],
    tk: [0, 0.55, 1],
  });
  muscle(g, 'redondo_menor', { th: 1.2, ns: 4, nt: 16, belly: [0.0, 0.85], st: [(s) => T(mix(39.5, 38.0, s), mix(132, 128, s)), (s) => A(mix(0.08, 0.12, s), mix(150, 160, s), 1.4)] });
  muscle(g, 'redondo_mayor', { th: 1.8, ns: 6, nt: 18, belly: [0.0, 0.84], st: [(s) => T(mix(37.6, 35.0, s), mix(138, 128, s)), (s) => T(mix(42.4, 40.6, s), mix(112, 106, s)), (s) => A(0.16, mix(-35, -50, s), 1.8)], tk: [0, 0.55, 1] });
}

function armSuperficial(g) {
  const cw = rigid('chest');
  // Bíceps braquial: dos cabezas que se unen en un vientre
  muscle(g, 'biceps_braquial', {
    th: 2.1, ns: 10, nt: 30, belly: [0.2, 0.84], bellyExp: 0.45,
    st: [
      (s) => (s < 0.5 ? P([13.2, 46.2, 2.9], cw) : A(0.02, 25, 1.4)),
      (s) => A(0.3, mix(-30, 28, s), 0.2),
      (s) => A(0.62, mix(-27, 26, s)),
      (s) => A(0.88, mix(-15, 13, s), 0.2),
      (s) => A(1.12, mix(-6, 4, s), 1.3),
    ],
    tk: [0, 0.22, 0.55, 0.83, 1],
    groove: (s, t) => 0.4 * Math.exp(-(((s - 0.5) / 0.08) ** 2)) * (1 - smooth(0.4, 0.62, t)),
  });
  muscle(g, 'braquial', { th: 1.6, depth: GAP + 0.6, ns: 10, nt: 18, belly: [0.0, 0.85], st: [(s) => A(0.45, mix(-78, 80, s)), (s) => A(0.95, mix(-62, 62, s)), (s) => A(1.1, mix(-14, 14, s), 1.2)], tk: [0, 0.75, 1] });
  muscle(g, 'coracobraquial', { th: 1.0, ns: 4, nt: 14, belly: [0.05, 0.85], st: [(s) => P([13.0, 46.0, 2.4], cw), (s) => A(0.2, mix(-55, -40, s), 0.6), (s) => A(0.48, mix(-62, -52, s), 1.0)], tk: [0, 0.4, 1] });
  // Tríceps: cabeza lateral, cabeza larga y tendón común hacia el olécranon
  muscle(g, 'triceps_braquial', {
    th: 2.2, ns: 14, nt: 28, belly: [0.03, 1.0],
    st: [(s) => A(0.06, mix(98, 252, s), 0.5), (s) => A(0.4, mix(100, 258, s)), (s) => A(0.72, mix(110, 250, s)), (s) => A(1.04, mix(150, 205, s), 0.2)],
    groove: (s, t) => 0.4 * Math.exp(-(((s - 0.47) / 0.05) ** 2)) * (1 - smooth(0.45, 0.65, t)),
    aux: (s, t) => smooth(0.58, 0.72, t) * (1 - smooth(0.22, 0.05, Math.abs(s - 0.5)) * 0) * smooth(0.36, 0.2, Math.abs(s - 0.5)) + smooth(0.86, 0.95, t),
    bias: (s, t) => 1 - 0.55 * smooth(0.6, 1, t),
  });
  muscle(g, 'anconeo', { th: 0.8, ns: 4, nt: 10, st: [(s) => A(0.96, mix(105, 120, s)), (s) => A(1.2, mix(150, 185, s))] });
  // Antebrazo, compartimento lateral y posterior
  limbMus(g, 'braquiorradial', 'arm', [[0.66, 92, 104], [1.0, 52, 86], [1.45, 46, 80], [1.97, 68, 86, 0.4]], { th: 1.6, ns: 6, nt: 26, belly: [0.03, 0.66] });
  limbMus(g, 'extensores_radiales_carpo', 'arm', [[0.84, 104, 118], [1.25, 88, 128], [1.6, 100, 135], [2.08, 128, 150, 0.4]], { th: 1.3, ns: 6, nt: 24, belly: [0.03, 0.62] });
  limbMus(g, 'extensor_dedos', 'arm', [[0.98, 132, 150], [1.35, 130, 172], [1.78, 140, 178], [2.0, 150, 182, 0.2]], { th: 1.3, ns: 7, nt: 22, belly: [0.03, 0.8] });
  limbMus(g, 'extensor_cubital_carpo', 'arm', [[1.0, 172, 192], [1.5, 182, 212], [2.06, 215, 232, 0.3]], { th: 1.1, ns: 5, nt: 20, belly: [0.03, 0.72] });
  limbMus(g, 'abductor_largo_pulgar', 'arm', [[1.42, 150, 172], [1.72, 112, 140], [2.08, 72, 88, 0.2]], { th: 0.9, ns: 5, nt: 18, belly: [0.03, 0.62] });
  // tendones extensores sobre el dorso de la mano
  for (const [th0, th1] of [[150, 140], [172, 168], [190, 196], [208, 222]]) limbMus(g, 'extensor_dedos', 'arm', [[1.96, th0 - 3, th0 + 3], [2.5, mix(th0, th1, 0.5) - 3, mix(th0, th1, 0.5) + 3], [3.0, th1 - 2.5, th1 + 2.5]], { th: 0.22, depth: GAP - 0.1, ns: 2, nt: 14, belly: [-1, -0.5], tendonTh: 0.25, edgeExp: 0.15 });
  // Compartimento anterior (flexores)
  limbMus(g, 'pronador_redondo', 'arm', [[0.94, -86, -70], [1.2, -40, -10], [1.48, 50, 72, 0.3]], { th: 1.3, ns: 6, nt: 18, belly: [0.03, 0.85] });
  limbMus(g, 'flexor_radial_carpo', 'arm', [[0.98, -70, -56], [1.45, -32, -10], [2.03, -10, 2, 0.3]], { th: 1.2, ns: 5, nt: 22, belly: [0.03, 0.58] });
  limbMus(g, 'palmar_largo', 'arm', [[0.99, -54, -44], [1.4, -14, -4], [2.04, 0, 6]], { th: 0.9, ns: 4, nt: 22, belly: [0.03, 0.42] });
  limbMus(g, 'flexor_cubital_carpo', 'arm', [[0.97, -118, -98], [1.5, -112, -80], [2.02, -96, -82, 0.2]], { th: 1.3, ns: 6, nt: 22, belly: [0.03, 0.78] });
  limbMus(g, 'flexor_superficial_dedos', 'arm', [[1.04, -64, -28], [1.6, -58, -8], [2.0, -46, -10, 0.4]], { th: 1.3, depth: GAP + 0.35, ns: 7, nt: 18, belly: [0.03, 0.8] });
  // Mano: aponeurosis palmar, eminencias tenar e hipotenar, interóseos dorsales
  limbMus(g, 'aponeurosis_palmar', 'arm', [[2.05, -6, 6], [2.5, -40, 40], [2.88, -72, 64]], { th: 0.2, ns: 6, nt: 12, belly: [-1, -0.5], tendonTh: 0.22, edgeExp: 0.2 });
  muscle(g, 'eminencia_tenar', { th: 1.4, ns: 6, nt: 14, belly: [0.02, 0.92], st: [(s) => A(2.12, mix(18, 62, s)), (s) => A(2.4, mix(40, 82, s)), (s) => P(lerp([31.6, -11.4, 2.0], [32.2, -11.8, 1.0], s), rigid('handL'))], tk: [0, 0.5, 1] });
  limbMus(g, 'eminencia_hipotenar', 'arm', [[2.12, -98, -66], [2.5, -100, -70], [2.88, -96, -76]], { th: 1.0, ns: 5, nt: 12, belly: [0.03, 0.9] });
  for (const th of [160, 182, 202]) limbMus(g, 'interoseos', 'arm', [[2.25, th - 7, th + 7], [2.6, th - 8, th + 8], [2.88, th - 6, th + 6]], { th: 0.45, depth: GAP + 0.1, ns: 3, nt: 10, belly: [0.05, 0.95] });
}

function legSuperficial(g) {
  const pw = rigid('pelvis');
  // Glúteo mayor
  muscle(g, 'gluteo_mayor', {
    th: 3.0, ns: 14, nt: 24, belly: [0.0, 0.86], edgeExp: 0.3,
    st: [
      (s) => (s < 0.35 ? T(mix(12.8, 8.6, s / 0.35), mix(146, 171, s / 0.35)) : s < 0.75 ? T(mix(8.0, 0.5, (s - 0.35) / 0.4), mix(172, 177, (s - 0.35) / 0.4)) : T(mix(0.0, -4.0, (s - 0.75) / 0.25), 177.5)),
      (s) => T(mix(5.4, -6.6, s), mix(132, 152, s)),
      (s) => (s < 0.6 ? L(mix(0.07, 0.2, s / 0.6), mix(112, 104, s / 0.6), 0.2) : L(mix(0.21, 0.3, (s - 0.6) / 0.4), mix(125, 140, (s - 0.6) / 0.4), 1.4)),
    ],
    tk: [0, 0.45, 1],
  });
  // Glúteo medio (porción visible por encima del glúteo mayor)
  muscle(g, 'gluteo_medio', { th: 2.0, depth: GAP + 0.3, ns: 10, nt: 18, belly: [0.0, 0.85], st: [(s) => T(mix(13.2, 12.6, s), mix(70, 148, s)), (s) => T(mix(5.0, 3.6, s), mix(88, 118, s)), (s) => L(0.03, mix(86, 112, s), 0.8)], tk: [0, 0.6, 1] });
  // Tensor de la fascia lata y tracto iliotibial
  muscle(g, 'tensor_fascia_lata', { th: 1.6, ns: 6, nt: 18, belly: [0.02, 0.95], st: [(s) => T(mix(9.4, 11.6, s), mix(47, 60, s)), (s) => L(0.08, mix(60, 76, s)), (s) => L(0.24, mix(72, 88, s), 0.2)], tk: [0, 0.4, 1] });
  limbMus(g, 'tracto_iliotibial', 'leg', [[0.14, 80, 114], [0.55, 84, 102], [1.04, 66, 84, 0.2]], { th: 0.28, depth: GAP - 0.05, ns: 5, nt: 22, belly: [-1, -0.5], tendonTh: 0.3, edgeExp: 0.15 });
  // Sartorio (espiral de la EIAS a la cara medial de la rodilla)
  muscle(g, 'sartorio', {
    th: 1.1, ns: 5, nt: 32, belly: [0.03, 0.9], edgeExp: 0.35,
    st: [(s) => T(9.2, mix(44, 50, s)), (s) => L(0.15, mix(28, 46, s)), (s) => L(0.45, mix(-6, -22, s)), (s) => L(0.8, mix(-72, -88, s)), (s) => L(1.05, mix(-98, -112, s)), (s) => L(1.13, mix(-58, -70, s), 0.3)],
    tk: [0, 0.14, 0.4, 0.7, 0.9, 1],
  });
  // Cuádriceps: recto femoral, vasto lateral, vasto medial; tendón rotuliano
  muscle(g, 'recto_femoral', { th: 2.0, ns: 8, nt: 26, belly: [0.1, 0.86], st: [(s) => P([11.0 + s * 0.4, 5.2, 4.4], pw), (s) => L(0.12, mix(-6, 14, s), 0.6), (s) => L(0.5, mix(-15, 18, s)), (s) => L(0.86, mix(-10, 13, s)), (s) => L(0.965, mix(-9, 9, s), 0.2)], tk: [0, 0.12, 0.5, 0.86, 1], groove: (s, t) => 0.25 * Math.exp(-(((s - 0.5) / 0.05) ** 2)) * smooth(0.2, 0.3, t) * (1 - smooth(0.75, 0.85, t)), aux: (s, t) => Math.exp(-(((s - 0.5) / 0.04) ** 2)) * smooth(0.25, 0.35, t) * 0.8 });
  limbMus(g, 'vasto_lateral', 'leg', [[0.06, 22, 104, 0.4], [0.5, 18, 110, 0.25], [0.86, 14, 70], [0.97, 10, 38, 0.2]], { th: 2.6, depth: GAP + 0.25, ns: 10, nt: 24, belly: [0.0, 0.88] });
  limbMus(g, 'vasto_medial', 'leg', [[0.36, -18, -52], [0.74, -14, -86], [0.93, -8, -62], [0.985, -4, -26, 0.2]], { th: 2.5, ns: 9, nt: 20, belly: [0.0, 0.92] });
  limbMus(g, 'tendon_rotuliano', 'leg', [[1.02, -9, 9, 0.6], [1.08, -8, 8, 0.4], [1.12, -7, 7, 0.4]], { th: 0.5, ns: 4, nt: 8, belly: [-1, -0.5], tendonTh: 0.55 });
  // Aductores y grácil
  muscle(g, 'pectineo', { th: 1.2, ns: 5, nt: 12, belly: [0.03, 0.9], st: [(s) => P(lerp([4.0, -1.4, 6.6], [6.4, -0.6, 5.4], s), pw), (s) => L(0.12, mix(-30, -48, s), 0.6), (s) => L(0.17, mix(-72, -84, s), 1.4)], tk: [0, 0.6, 1] });
  muscle(g, 'aductor_largo', { th: 1.7, ns: 6, nt: 18, belly: [0.08, 0.9], st: [(s) => P([2.6 + s * 0.6, -3.2, 6.6], pw), (s) => L(0.2, mix(-50, -66, s)), (s) => L(0.5, mix(-100, -112, s), 1.4)], tk: [0, 0.4, 1] });
  muscle(g, 'gracil', { th: 1.0, ns: 4, nt: 30, belly: [0.04, 0.78], st: [(s) => P([2.0 + s * 0.6, -6.0, 4.6], pw), (s) => L(0.12, mix(-98, -114, s)), (s) => L(0.9, mix(-104, -118, s)), (s) => L(1.13, mix(-66, -74, s), 0.3)], tk: [0, 0.12, 0.8, 1] });
  limbMus(g, 'aductor_mayor', 'leg', [[0.12, -128, -168, 0.6], [0.5, -126, -160, 0.4], [0.86, -116, -134, 0.5], [0.94, -104, -112, 0.8]], { th: 2.2, depth: GAP + 0.3, ns: 8, nt: 20, belly: [0.0, 0.9] });
  // Isquiotibiales
  muscle(g, 'biceps_femoral', { th: 2.2, ns: 7, nt: 26, belly: [0.06, 0.86], st: [(s) => P([6.8, -7.0, -4.8], pw), (s) => L(0.15, mix(162, 192, s)), (s) => L(0.5, mix(142, 176, s)), (s) => L(0.86, mix(114, 142, s)), (s) => L(1.07, mix(98, 114, s), 0.3)], tk: [0, 0.12, 0.45, 0.82, 1] });
  muscle(g, 'semitendinoso', { th: 1.8, ns: 6, nt: 28, belly: [0.05, 0.56], st: [(s) => P([6.2, -7.2, -4.9], pw), (s) => L(0.15, mix(196, 214, s)), (s) => L(0.5, mix(204, 224, s)), (s) => L(0.88, mix(220, 232, s), 0.3), (s) => L(1.13, mix(292, 300, s), 0.3)], tk: [0, 0.12, 0.45, 0.8, 1] });
  limbMus(g, 'semimembranoso', 'leg', [[0.25, 214, 238, 0.6], [0.7, 222, 252, 0.3], [0.95, 236, 258], [1.04, 246, 262, 0.6]], { th: 2.0, depth: GAP + 0.4, ns: 6, nt: 18, belly: [0.03, 0.88] });
  // Pierna: gemelos, sóleo, tendón de Aquiles
  limbMus(g, 'gastrocnemio', 'leg', [[0.93, 200, 224, 1.0], [1.14, 186, 250], [1.42, 190, 240], [1.56, 184, 204, 0.3]], { th: 2.6, ns: 8, nt: 22, belly: [0.04, 0.88], aux: (s, t) => smooth(0.8, 0.95, t) });
  limbMus(g, 'gastrocnemio', 'leg', [[0.93, 136, 160, 1.0], [1.14, 112, 176], [1.4, 124, 174], [1.53, 160, 180, 0.3]], { th: 2.2, ns: 8, nt: 22, belly: [0.04, 0.86], aux: (s, t) => smooth(0.8, 0.95, t) });
  limbMus(g, 'soleo', 'leg', [[1.1, 108, 252, 0.4], [1.5, 102, 258], [1.74, 150, 210, 0.3]], { th: 1.8, depth: GAP + 0.7, ns: 12, nt: 18, belly: [0.0, 0.88] });
  muscle(g, 'tendon_calcaneo', { th: 0.65, ns: 4, nt: 18, belly: [-1, -0.5], tendonTh: 0.7, edgeExp: 0.3, st: [(s) => L(1.55, mix(166, 194, s)), (s) => L(1.86, mix(170, 190, s)), (s) => L(1.98, mix(172, 188, s), 0.1), (s) => P([9.2 + (s - 0.5) * 1.2, -84.4, -8.6], rigid('footL'))], tk: [0, 0.55, 0.85, 1] });
  // Compartimento anterior y lateral de la pierna
  muscle(g, 'tibial_anterior', { th: 2.0, ns: 6, nt: 26, belly: [0.03, 0.62], st: [(s) => L(1.06, mix(22, 54, s)), (s) => L(1.5, mix(14, 48, s)), (s) => L(1.8, mix(6, 30, s)), (s) => L(1.97, mix(-6, 8, s), 0.1), (s) => P([7.8 + s * 0.4, -83.0, 4.4], rigid('footL'))], tk: [0, 0.4, 0.62, 0.8, 1] });
  limbMus(g, 'extensor_largo_dedos', 'leg', [[1.08, 58, 84], [1.6, 46, 74], [1.94, 26, 48, 0.1]], { th: 1.4, ns: 5, nt: 22, belly: [0.03, 0.8] });
  for (const toe of [[9.2, -86.3, 12.2], [10.4, -86.4, 11.8], [11.6, -86.5, 11.0], [12.8, -86.6, 10.0]]) muscle(g, 'extensor_largo_dedos', { th: 0.2, depth: 0.1, ns: 2, nt: 12, belly: [-1, -0.5], tendonTh: 0.22, st: [(s) => P([10.0 + (s - 0.5) * 0.4, -80.2, 2.6], rigid('footL')), (s) => P([toe[0] - 0.2 + s * 0.4, toe[1] + 1.2, (toe[2] + 4) / 2], rigid('footL')), (s) => P([toe[0] - 0.2 + s * 0.4, toe[1] + 0.9, toe[2]], rigid('footL'))], bulge: [0.3, 0.2] });
  muscle(g, 'extensor_largo_hallux', { th: 0.25, depth: 0.1, ns: 2, nt: 14, belly: [-1, -0.5], tendonTh: 0.28, st: [(s) => L(1.86, mix(10, 18, s)), (s) => P([8.4 + s * 0.3, -80.6, 3.0], rigid('footL')), (s) => P([7.4 + s * 0.4, -84.6, 9.0], rigid('footL')), (s) => P([7.6 + s * 0.4, -85.4, 14.8], rigid('footL'))], tk: [0, 0.25, 0.65, 1], bulge: [0.2, 0.3, 0.2] });
  muscle(g, 'peroneo_largo', { th: 1.6, ns: 5, nt: 24, belly: [0.03, 0.6], st: [(s) => L(1.05, mix(90, 122, s)), (s) => L(1.45, mix(90, 126, s)), (s) => L(1.86, mix(112, 130, s), 0.2), (s) => P([12.1 + s * 0.3, -82.8, -4.6], rigid('footL'))], tk: [0, 0.4, 0.8, 1] });
  muscle(g, 'peroneo_corto', { th: 1.2, depth: GAP + 0.2, ns: 5, nt: 18, belly: [0.03, 0.62], st: [(s) => L(1.42, mix(96, 136, s)), (s) => L(1.84, mix(114, 140, s)), (s) => P([11.9 + s * 0.3, -82.9, -4.2], rigid('footL')), (s) => P([12.5 + s * 0.2, -85.4, 2.6], rigid('footL'))], tk: [0, 0.5, 0.75, 1], bulge: [0, 0, 0.3] });
  // Pie: extensor corto y abductor del dedo gordo
  muscle(g, 'extensor_corto_dedos', { th: 0.8, depth: 0.1, ns: 5, nt: 12, belly: [0.05, 0.75], st: [(s) => P([11.4 + s * 0.6, -84.0, 1.0], rigid('footL')), (s) => P([mix(8.6, 11.6, s), -85.4, mix(9.6, 8.8, s)], rigid('footL'))], bulge: [0.5] });
  muscle(g, 'abductor_hallux', { th: 1.2, depth: 0.1, ns: 4, nt: 14, belly: [0.05, 0.8], st: [(s) => P([7.5, -85.6 + s * 1.0, -5.2], rigid('footL')), (s) => P([6.4, -86.0 + s * 0.8, 3.0], rigid('footL'), [-1, 0, 0]), (s) => P([6.9, -86.4 + s * 0.6, 10.6], rigid('footL'))], tk: [0, 0.5, 1], bulge: [0.4, 0.3] });
}

function headSuperficial(g) {
  const hw = headW();
  muscle(g, 'temporal', { th: 1.0, depth: 0.05, ns: 10, nt: 18, belly: [0.0, 0.7], st: [(s) => SK([mix(6.4, 6.5, s), 75.6 + Math.sin(s * Math.PI) * 1.4, mix(5.0, -5.4, s)]), (s) => SK([7.2, 71.6, mix(3.4, -1.2, s)]), (s) => P([5.25, 66.6, 2.4], hw)], tk: [0, 0.6, 1], bulge: [0, 0.5] });
  muscle(g, 'masetero', { th: 1.3, depth: 0.05, ns: 7, nt: 14, belly: [0.08, 0.92], st: [(s) => P(lerp([4.6, 66.7, 4.4], [6.7, 66.9, 0.4], s), hw), (s) => P(add(lerp([5.0, 63.6, 3.4], [5.9, 63.8, 0.4], s), [0.6, 0, 0]), hw, [1, 0, 0]), (s) => P(lerp([4.9, 60.2, 2.8], [5.4, 60.6, -0.2], s), hw)], tk: [0, 0.5, 1] });
  muscle(g, 'frontal', { th: 0.35, depth: 0.05, ns: 8, nt: 14, belly: [0.0, 0.82], st: [(s) => SK([mix(0.3, 5.0, s), 72.3, 9]), (s) => SK([mix(0.3, 4.6, s), 76.4, 8]), (s) => SK([mix(0.3, 4.0, s), 79.2, 5])], tk: [0, 0.6, 1], edgeExp: 0.2 });
  // orbicular del ojo (anillo alrededor de la órbita)
  muscle(g, 'orbicular_ojo', {
    th: 0.32, depth: 0.0, ns: 5, nt: 32, belly: [-1, 2], edgeExp: 0.3,
    st: Array.from({ length: 9 }, (_, i) => (s) => { const a = (i / 8) * Math.PI * 2; const r = mix(1.55, 2.9, s); const x = 3.3 + r * Math.cos(a) * 1.08, y = 70.0 + r * Math.sin(a) * 0.86; return P([x, y, 10.25 - 0.13 * r * r - 0.06 * (x - 3.3) * (x - 3.3)], hw, [0, 0, 1]); }),
  });
  muscle(g, 'orbicular_boca', {
    th: 0.45, depth: 0.0, ns: 4, nt: 16, belly: [-1, 2], edgeExp: 0.4,
    st: Array.from({ length: 5 }, (_, i) => (s) => { const a = -Math.PI / 2 + (i / 4) * Math.PI; const rx = mix(1.9, 3.2, s), ry = mix(0.42, 1.5, s); const x = rx * Math.cos(a), y = 62.6 + ry * Math.sin(a); return P([x, y, 10.15 - 0.11 * x * x], hw, [0, 0, 1]); }),
  });
  muscle(g, 'cigomatico_mayor', { th: 0.45, depth: 0.0, ns: 3, nt: 12, belly: [0.04, 0.92], st: [(s) => P([4.9 + s * 0.5, 67.0 - s * 0.5, 7.4], hw), (s) => P([3.9 + s * 0.4, 64.8, 9.0], hw, [0.3, 0, 1]), (s) => P([2.85 + s * 0.2, 62.9, 9.55], hw)], tk: [0, 0.5, 1], bulge: [0.2, 0.1] });
}

// =================== PROFUNDOS ===================
function trunkDeep(g) {
  const cw = rigid('chest');
  muscle(g, 'pectoral_menor', { th: 1.0, depth: GAP + 1.9, ns: 7, nt: 14, belly: [0.05, 0.85], st: [(s) => T(mix(42, 34.5, s), mix(28, 46, s)), (s) => P([13.0, 46.2, 2.6], cw)], bulge: [0.4] });
  muscle(g, 'supraespinoso', { th: 1.4, depth: GAP + 1.0, ns: 6, nt: 16, belly: [0.0, 0.8], st: [(s) => T(mix(47.6, 45.4, s), mix(160, 150, s)), (s) => P([16.4, 48.8, -1.6 + s * 0.6], cw), (s) => A(0.0, mix(70, 95, s), 1.6)], tk: [0, 0.6, 1], bulge: [0.4, 0.2] });
  muscle(g, 'romboides', { th: 0.9, depth: GAP + 1.1, ns: 10, nt: 14, belly: [0.04, 0.96], st: [(s) => T(mix(51.5, 39.6, s), 178.5), (s) => P(lerp([7.0, 46.4, -9.6], [9.4, 35.2, -11.0], s), cw)] });
  muscle(g, 'elevador_escapula', { th: 1.0, depth: GAP + 1.0, ns: 4, nt: 14, belly: [0.08, 0.9], st: [(s) => P([3.4 + s * 0.4, 63.4 - s * 4.5, -0.6], rigid('head')), (s) => T(54, mix(118, 128, s)), (s) => P([7.0, 46.8, -9.4], cw)], tk: [0, 0.5, 1] });
  // erector de la columna: iliocostal (lateral) y longísimo/espinoso (medial)
  muscle(g, 'erector_columna', { th: 2.6, depth: GAP + 0.9, ns: 6, nt: 30, belly: [0.04, 0.98], st: [(s) => T(4.0, mix(166, 177, s)), (s) => T(14, mix(160, 176, s)), (s) => T(34, mix(162, 177, s)), (s) => T(56, mix(166, 177, s))], tk: [0, 0.2, 0.6, 1], bias: (s, t) => 1 - 0.55 * smooth(0.25, 1, t), aux: (s, t) => smooth(0.12, 0.0, t) });
  muscle(g, 'erector_columna', { th: 2.0, depth: GAP + 0.9, ns: 5, nt: 26, belly: [0.04, 0.97], st: [(s) => T(6.0, mix(150, 164, s)), (s) => T(20, mix(146, 160, s)), (s) => T(44, mix(148, 162, s))], tk: [0, 0.35, 1], bias: (s, t) => 1 - 0.5 * smooth(0.3, 1, t) });
  muscle(g, 'esplenio', { th: 1.2, depth: GAP + 1.0, ns: 6, nt: 14, belly: [0.05, 0.92], st: [(s) => T(mix(49, 53, s), 177.5), (s) => P(lerp([4.6, 64.6, -4.0], [6.0, 65.8, -2.4], s), rigid('head'))], bulge: [0.4] });
  muscle(g, 'oblicuo_interno', { th: 0.9, depth: GAP + 0.95, ns: 12, nt: 18, belly: [0.0, 0.8], st: [(s) => T(mix(8.0, 12.8, s), mix(36, 120, s)), (s) => T(mix(14.0, 25.0, s), mix(23, 92, s))], aux: (s, t) => smooth(0.7, 0.85, t) * smooth(0.5, 0.2, s) });
  // intercostales: láminas entre costillas vecinas
  for (let k = 1; k < 11; k++) {
    const r1 = RIBS[k - 1], r2 = RIBS[k];
    addMuscle(g, {
      ns: 2, nt: 20, sid: S('intercostales'), back: 0.05,
      at: (s, t) => { const u = mix(0.18, 0.97, t); const a = ribPoint(r1, u), b = ribPoint(r2, u); const p = lerp(a, b, mix(0.15, 0.85, s)); return { p: madd(p, norm([p[0], 0, p[2]]), -0.15), w: cw, n: norm([p[0], 0, p[2]]) }; },
      th: (s, t) => 0.18 + 0.12 * Math.sin(Math.PI * s), tendon: () => 0,
    });
  }
  // Diafragma: cúpula con centro tendinoso
  addMuscle(g, {
    ns: 36, nt: 14, sid: S('diafragma'), back: 0.1,
    at: (s, t) => {
      const a = s * Math.PI * 2; const r = 1 - t;
      const rimY = 24.5 + 5.5 * Math.cos(a) * 0.5 + (Math.cos(a) > 0 ? 2.5 * Math.cos(a) : 0);
      const ex = 12.6 * r, ez = 9.0 * r;
      const x = Math.sin(a) * ex, z = 0.5 + Math.cos(a) * ez - (Math.cos(a) < 0 ? 1.0 * r : 0);
      const dome = 31.6 + (x < 0 ? 1.4 : 0.6) * (1 - Math.pow(Math.abs(x) / 12.6 - 0.5, 2) * 4) * 0.5;
      const y = mix(rimY, dome + 0.8, 1 - Math.pow(r, 2.2));
      const p = [x, y, z];
      return { p, w: trunkW(p), n: norm([x * 0.3, 1, (z - 0.5) * 0.3]) };
    },
    th: () => 0.35, tendon: (s, t) => smooth(0.55, 0.75, t),
  });
  // Psoas mayor e ilíaco
  addTube(g, [
    { p: [2.6, 24.2, -1.6], r: 0.6, w: trunkW([2.6, 24, -1]) }, { p: [3.7, 16.2, -0.6], r: 1.6, w: rigid('pelvis') }, { p: [5.4, 8.6, 0.6], r: 2.0, w: rigid('pelvis') },
    { p: [7.6, 2.0, 2.6], r: 1.6, w: rigid('pelvis') }, { p: [9.4, -2.4, 2.6], r: 1.2, w: [B.pelvis, B.thighL, 0.5] }, { p: [11.8, -5.4, 0.2], r: 0.6, w: rigid('thighL'), aux: 1 },
  ], { sid: S('psoas_mayor'), sides: 12, step: 0.6, uvTile: 2.5 });
  muscle(g, 'iliaco', { th: 1.2, depth: 0, ns: 8, nt: 14, belly: [0.0, 0.85], st: [(s) => P(lerp([12.6, 13.0, 2.2], [8.4, 12.2, -4.6], s), rigid('pelvis'), [-1, 0.3, 0.3]), (s) => P(lerp([10.4, 7.6, 2.6], [7.8, 6.6, -1.0], s), rigid('pelvis'), [-1, 0.2, 0.6]), (s) => P([9.0 + s * 0.4, 0.8, 3.4], rigid('pelvis'))], tk: [0, 0.5, 1] });
  addTube(g, [{ p: [2.8, 4.0, -7.0], r: 0.9, w: rigid('pelvis') }, { p: [8.0, 1.8, -5.2], r: 1.1, w: rigid('pelvis') }, { p: [13.0, 0.0, -3.0], r: 0.7, w: [B.pelvis, B.thighL, 0.4] }, { p: [15.0, -0.8, -2.2], r: 0.35, w: rigid('thighL'), aux: 1 }], { sid: S('piriforme'), sides: 10, step: 0.5 });
  // Escalenos
  addTube(g, [{ p: [2.4, 58.4, -0.2], r: 0.35, w: trunkW([2, 58, 0]) }, { p: [3.6, 53.6, 0.4], r: 0.8, w: trunkW([3, 53, 0]) }, { p: [5.2, 49.2, 1.2], r: 0.5, w: rigid('chest'), aux: 0.6 }], { sid: S('escalenos'), sides: 10, step: 0.5 });
}
function limbDeep(g) {
  limbMus(g, 'vasto_intermedio', 'leg', [[0.14, -30, 44], [0.55, -26, 40], [0.92, -16, 24]], { th: 1.8, depth: GAP + 2.1, ns: 8, nt: 16, belly: [0.0, 0.92] });
  limbMus(g, 'tibial_posterior', 'leg', [[1.15, 196, 248, 0.4], [1.6, 200, 250, 0.4], [1.9, 230, 256, 0.3]], { th: 1.4, depth: GAP + 2.3, ns: 7, nt: 16, belly: [0.03, 0.7] });
  limbMus(g, 'flexor_profundo_dedos', 'arm', [[1.06, -120, -40], [1.6, -110, -30], [1.98, -80, -30, 0.2]], { th: 1.4, depth: GAP + 1.5, ns: 8, nt: 16, belly: [0.03, 0.75] });
  limbMus(g, 'supinador', 'arm', [[1.0, 90, 140], [1.25, 40, 120]], { th: 0.8, depth: GAP + 1.4, ns: 5, nt: 10, belly: [0.05, 0.95] });
  limbMus(g, 'pronador_cuadrado', 'arm', [[1.84, -100, 80], [1.94, -100, 80]], { th: 0.6, depth: GAP + 1.0, ns: 8, nt: 4, belly: [-1, 2] });
}

export function buildMuscles(which) {
  const g = new Geo();
  if (which === 'sup') { trunkSuperficial(g); armSuperficial(g); legSuperficial(g); headSuperficial(g); }
  else { trunkDeep(g); limbDeep(g); }
  const out = g.withMirror();
  if (which === 'sup') { // línea alba: un único eje medio (las dos mitades ya se tocan en θ = 0)
  }
  return out;
}
