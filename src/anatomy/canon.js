// Cuerpo canónico de Mary (posición anatómica), en centímetros.
// Ejes: +X = IZQUIERDA de la persona, +Y = arriba, +Z = adelante. Origen: punto medio entre las caderas.
// Lo usan tanto el horneado de la geometría (Node) como la app (navegador), para que el
// esqueleto de animación (huesos de skinning) sea idéntico en ambos lados.
import { add, sub, mul, dot, cross, len, dist, norm, mid, orth, rotAxis, rotBetween, mix, smooth } from './v3.js';

// 33 puntos de MediaPipe Pose en posición anatómica (palmas al frente).
const L = {
  1: [1.6, 70, 9.2], 2: [3.2, 70, 8.8], 3: [4.7, 70, 8.0], 7: [7.4, 68.5, 0], 9: [2.4, 62.5, 9.6],
  11: [17.5, 47.5, -1], 13: [21.5, 18.5, -3], 15: [28, -5.5, -1],
  17: [25.4, -13.9, -1.1], 19: [29.8, -14.6, -0.6], 21: [32.8, -10.8, 3.2],
  23: [10, 0, 0], 25: [9.5, -41, 0.5], 27: [9, -80, -2], 29: [9, -86.2, -8.0], 31: [9.6, -87, 15.4],
};
const PAIRS = [[1, 4], [2, 5], [3, 6], [7, 8], [9, 10], [11, 12], [13, 14], [15, 16], [17, 18], [19, 20], [21, 22], [23, 24], [25, 26], [27, 28], [29, 30], [31, 32]];
export const CANON_LM = new Array(33);
CANON_LM[0] = [0, 66, 11.5];
for (const [l, r] of PAIRS) { CANON_LM[l] = L[l]; CANON_LM[r] = [-L[l][0], L[l][1], L[l][2]]; }

export const LM_MIRROR = new Array(33).fill(0).map((_, i) => i);
for (const [l, r] of PAIRS) { LM_MIRROR[l] = r; LM_MIRROR[r] = l; }

export const BONES = [
  'pelvis', 'chest', 'head',
  'upperArmL', 'forearmL', 'forearmMidL', 'forearmDistL', 'handL',
  'upperArmR', 'forearmR', 'forearmMidR', 'forearmDistR', 'handR',
  'thighL', 'legL', 'footL', 'thighR', 'legR', 'footR',
];
export const NB = BONES.length;
export const B = Object.fromEntries(BONES.map((n, i) => [n, i]));
export const BONE_MIRROR = BONES.map((n) => B[n.endsWith('L') ? n.slice(0, -1) + 'R' : n.endsWith('R') ? n.slice(0, -1) + 'L' : n]);

// Puntos que definen cada hueso (para saber si está a la vista).
export const BONE_LANDMARKS = [
  [23, 24], [11, 12, 23, 24], [0, 7, 8],
  [11, 13], [13, 15], [13, 15], [13, 15], [15, 17, 19],
  [12, 14], [14, 16], [14, 16], [14, 16], [16, 18, 20],
  [23, 25], [25, 27], [27, 29, 31], [24, 26], [26, 28], [28, 30, 32],
];

const C = CANON_LM;
export const SEG = {
  hipW: dist(C[23], C[24]), shW: dist(C[11], C[12]), earW: dist(C[7], C[8]),
  torso: dist(mid(C[11], C[12]), mid(C[23], C[24])),
  upperArm: dist(C[11], C[13]), forearm: dist(C[13], C[15]), hand: dist(C[15], mid(C[17], C[19])),
  thigh: dist(C[23], C[25]), leg: dist(C[25], C[27]), foot: dist(C[27], C[31]),
};

const safeNorm = (a, fb) => (len(a) > 1e-6 ? norm(a) : fb.slice());

// Calcula el marco (origen, ejes y escalas) de cada hueso a partir de 33 puntos 3D.
// s = escala global (unidades por centímetro): 1 para el cuerpo canónico, píxeles/cm en la cámara.
// vis (opcional) = visibilidad de cada punto (0..1), para decidir si confiar en manos y pies.
export function computeFrames(P, s = 1, vis = null) {
  const F = new Array(NB);
  const V = (i) => (vis ? vis[i] : 1);
  const hipMid = mid(P[23], P[24]), shMid = mid(P[11], P[12]);
  const upv = sub(shMid, hipMid);
  const u = safeNorm(upv, [0, 1, 0]);
  const syT = len(upv) / SEG.torso;

  const xp = safeNorm(orth(sub(P[23], P[24]), u), [1, 0, 0]);
  const zp = cross(xp, u);
  F[B.pelvis] = { o: hipMid, x: xp, y: u, z: zp, sx: mix(s, dist(P[23], P[24]) / SEG.hipW, 0.35), sy: syT, sz: s };

  const xc = safeNorm(orth(sub(P[11], P[12]), u), xp);
  const zc = cross(xc, u);
  F[B.chest] = { o: shMid, x: xc, y: u, z: zc, sx: mix(s, dist(P[11], P[12]) / SEG.shW, 0.75), sy: syT, sz: s };

  // Cabeza: eje X entre orejas, Z hacia la cara (nariz y ojos).
  const earMid = mid(P[7], P[8]);
  const xh = safeNorm(sub(P[7], P[8]), xc);
  let fw = add(sub(P[0], earMid), sub(mid(P[2], P[5]), earMid));
  if (V(0) < 0.2 && V(2) < 0.2 && V(5) < 0.2) fw = zc;
  const zh = safeNorm(orth(fw, xh), zc);
  const yh = cross(zh, xh);
  const sh = mix(s, dist(P[7], P[8]) / SEG.earW, 0.3);
  F[B.head] = { o: earMid, x: xh, y: yh, z: zh, sx: sh, sy: sh, sz: sh };

  for (const side of [0, 1]) {
    const iS = side ? 12 : 11, iE = side ? 14 : 13, iW = side ? 16 : 15, iP = side ? 18 : 17, iI = side ? 20 : 19;
    const S = P[iS], E = P[iE], W = P[iW];
    const bU = side ? B.upperArmR : B.upperArmL;
    const yu = safeNorm(sub(E, S), [0, -1, 0]);
    let front = safeNorm(orth(zc, yu), [0, 0, 1]);
    const fore = sub(W, E); const foreLen = len(fore) || 1;
    const bend = orth(fore, yu); const k = len(bend) / foreLen;
    if (k > 0.08) {
      const bf = norm(bend); const a = smooth(0.12, 0.5, k);
      const m = add(mul(front, 1 - a), mul(bf, a));
      front = len(m) > 0.2 ? norm(m) : bf;
    }
    front = safeNorm(orth(front, yu), [0, 0, 1]);
    F[bU] = { o: S, x: cross(yu, front), y: yu, z: front, sx: s, sy: dist(S, E) / SEG.upperArm, sz: s };

    const yf = safeNorm(fore, yu);
    const ff = safeNorm(orth(rotBetween(front, yu, yf), yf), front);
    const syF = foreLen / SEG.forearm;
    F[bU + 1] = { o: E, x: cross(yf, ff), y: yf, z: ff, sx: s, sy: syF, sz: s };

    // Normal palmar: hacia adelante en la mano izquierda canónica.
    const pw = sub(P[iP], W), iw = sub(P[iI], W);
    const palm = side ? cross(iw, pw) : cross(pw, iw);
    const handOk = Math.min(V(iP), V(iI), V(iW)) > 0.3 && len(palm) > 1e-6;
    let fd = handOk ? orth(palm, yf) : ff;
    fd = safeNorm(fd, ff);
    let ang = Math.atan2(dot(cross(ff, fd), yf), dot(ff, fd));
    ang = Math.max(-2.6, Math.min(2.6, ang));
    const fdc = rotAxis(ff, yf, ang), fm = rotAxis(ff, yf, ang * 0.5);
    F[bU + 2] = { o: E, x: cross(yf, fm), y: yf, z: fm, sx: s, sy: syF, sz: s };
    F[bU + 3] = { o: E, x: cross(yf, fdc), y: yf, z: fdc, sx: s, sy: syF, sz: s };

    const kn = mid(P[iP], P[iI]);
    const yhd = safeNorm(sub(kn, W), yf);
    const zhd = safeNorm(orth(handOk ? palm : fdc, yhd), fdc);
    F[bU + 4] = { o: W, x: cross(yhd, zhd), y: yhd, z: zhd, sx: s, sy: mix(s, dist(W, kn) / SEG.hand, 0.3), sz: s };
  }

  for (const side of [0, 1]) {
    const iH = side ? 24 : 23, iK = side ? 26 : 25, iA = side ? 28 : 27, iHe = side ? 30 : 29, iT = side ? 32 : 31;
    const H = P[iH], K = P[iK], A = P[iA], He = P[iHe], T = P[iT];
    const bT = side ? B.thighR : B.thighL;
    const yt = safeNorm(sub(K, H), [0, -1, 0]);
    const footOk = Math.min(V(iHe), V(iT)) > 0.3;
    const footDir = sub(T, He);
    const pf = safeNorm(orth(zp, yt), [0, 0, 1]);
    let front = pf;
    if (footOk) { const fo = orth(footDir, yt); if (len(fo) > 0.25 * len(footDir)) front = norm(add(mul(norm(fo), 0.6), mul(pf, 0.4))); }
    const leg = sub(A, K); const legLen = len(leg) || 1;
    const lb = orth(leg, yt); const k = len(lb) / legLen;
    if (k > 0.08) {
      const bb = mul(norm(lb), -1); const a = smooth(0.12, 0.5, k);
      const m = add(mul(front, 1 - a), mul(bb, a));
      front = len(m) > 0.2 ? norm(m) : bb;
    }
    front = safeNorm(orth(front, yt), [0, 0, 1]);
    F[bT] = { o: H, x: cross(yt, front), y: yt, z: front, sx: s, sy: dist(H, K) / SEG.thigh, sz: s };

    const yl = safeNorm(leg, yt);
    let fl = safeNorm(orth(rotBetween(front, yt, yl), yl), front);
    if (footOk) { const fo = orth(footDir, yl); if (len(fo) > 0.25 * len(footDir)) fl = norm(add(mul(fl, 0.5), mul(norm(fo), 0.5))); }
    fl = safeNorm(orth(fl, yl), front);
    F[bT + 1] = { o: K, x: cross(yl, fl), y: yl, z: fl, sx: s, sy: legLen / SEG.leg, sz: s };

    const yfo = safeNorm(sub(T, A), fl);
    const zfo = safeNorm(orth(sub(K, A), yfo), yl.map((c) => -c));
    F[bT + 2] = { o: A, x: cross(yfo, zfo), y: yfo, z: zfo, sx: s, sy: mix(s, dist(A, T) / SEG.foot, 0.3), sz: s };
  }
  return F;
}

// Matriz 4x4 (orden por columnas, como Three.js) que lleva coordenadas locales del hueso al espacio.
export function frameMatrix(f, out = new Array(16)) {
  out[0] = f.x[0] * f.sx; out[1] = f.x[1] * f.sx; out[2] = f.x[2] * f.sx; out[3] = 0;
  out[4] = f.y[0] * f.sy; out[5] = f.y[1] * f.sy; out[6] = f.y[2] * f.sy; out[7] = 0;
  out[8] = f.z[0] * f.sz; out[9] = f.z[1] * f.sz; out[10] = f.z[2] * f.sz; out[11] = 0;
  out[12] = f.o[0]; out[13] = f.o[1]; out[14] = f.o[2]; out[15] = 1;
  return out;
}

// Marcos del cuerpo canónico (pose de referencia del skinning).
export const BIND = computeFrames(CANON_LM, 1);

// Lleva un punto canónico p al espacio actual usando el hueso b (skinning de un hueso).
export function applyBone(F, b, p) {
  const fb = BIND[b], fc = F[b];
  const d = sub(p, fb.o);
  const lx = dot(d, fb.x), ly = dot(d, fb.y), lz = dot(d, fb.z);
  return [
    fc.o[0] + fc.x[0] * fc.sx * lx + fc.y[0] * fc.sy * ly + fc.z[0] * fc.sz * lz,
    fc.o[1] + fc.x[1] * fc.sx * lx + fc.y[1] * fc.sy * ly + fc.z[1] * fc.sz * lz,
    fc.o[2] + fc.x[2] * fc.sx * lx + fc.y[2] * fc.sy * ly + fc.z[2] * fc.sz * lz,
  ];
}

// Skinning de un punto con dos huesos [a, b, peso de a].
export function skinPoint(F, p, w) {
  const pa = applyBone(F, w[0], p);
  if (w[2] >= 0.999 || w[0] === w[1]) return pa;
  const pb = applyBone(F, w[1], p);
  const t = w[2];
  return [pa[0] * t + pb[0] * (1 - t), pa[1] * t + pb[1] * (1 - t), pa[2] * t + pb[2] * (1 - t)];
}
