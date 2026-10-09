// Pose sintética para el modo 3D (sin cámara): el cuerpo canónico con una animación suave
// y giro, proyectado al espacio de pantalla (px, y hacia arriba = -y de imagen).
import { CANON_LM } from '../anatomy/canon.js';
import { rotAxis, sub, add } from '../anatomy/v3.js';

const ARM_L = [13, 15, 17, 19, 21], ARM_R = [14, 16, 18, 20, 22];
const FORE_L = [15, 17, 19, 21], FORE_R = [16, 18, 20, 22];
const LEG_L = [25, 27, 29, 31], LEG_R = [26, 28, 30, 32];

function rotIdx(P, idx, pivot, axis, ang) {
  for (const i of idx) P[i] = add(pivot, rotAxis(sub(P[i], pivot), axis, ang));
}

// t en segundos; o = {yaw (rad), pitch (rad), abd (rad), flex (rad), animate}
export function demoPose(t, o = {}) {
  const P = CANON_LM.map((p) => p.slice());
  const anim = o.animate !== false;
  const abd = (o.abd ?? 0.12) + (anim ? 0.1 * (1 - Math.cos(t * 0.6)) : 0);
  const flex = (o.flex ?? 0.08) + (anim ? 0.25 * (1 - Math.cos(t * 0.6 + 0.8)) : 0);
  rotIdx(P, ARM_L, P[11], [0, 0, 1], abd);
  rotIdx(P, ARM_R, P[12], [0, 0, 1], -abd);
  rotIdx(P, FORE_L, P[13], [1, 0, 0], -flex);
  rotIdx(P, FORE_R, P[14], [1, 0, 0], -flex);
  // leve paso: cadera izquierda flexionada
  const step = anim ? 0.06 * Math.sin(t * 0.6) : 0;
  rotIdx(P, LEG_L, P[23], [1, 0, 0], -step);
  rotIdx(P, LEG_R, P[24], [1, 0, 0], step);
  // respiración: hombros suben un poco
  const br = anim ? 0.35 * Math.sin(t * 1.6) : 0;
  for (const i of [11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) P[i] = [P[i][0], P[i][1] + br, P[i][2]];
  return P;
}

// Lleva puntos canónicos (cm) al espacio de pantalla con giro, escala y centro.
export function toScreen(P, W, H, o = {}) {
  const yaw = o.yaw || 0, pitch = o.pitch || 0, zoom = o.zoom || 1;
  const s = (H * 0.88 / 172) * zoom;
  const cx = W / 2 + (o.panX || 0), cy = H / 2 + (o.panY || 0);
  const cy0 = o.centerY ?? -3, cx0 = o.centerX || 0, cz0 = o.centerZ || 0;
  const c = Math.cos(yaw), sn = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const out = P.map(([x0, y, z0]) => {
    const x = x0 - cx0, z = z0 - cz0;
    const X = x * c + z * sn, Z0 = -x * sn + z * c;
    const Y0 = y - cy0;
    const Y = Y0 * cp - Z0 * sp, Z = Y0 * sp + Z0 * cp;
    return [cx + X * s, -(cy - Y * s), Z * s];
  });
  return { P: out, s };
}
