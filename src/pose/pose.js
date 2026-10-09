// Carga local de MediaPipe Pose (sin internet) y conversión de sus resultados al cuerpo de Mary.
import { BONE_LANDMARKS, NB, B } from '../anatomy/canon.js';

const asset = (f, base) => (window.__MARY_ASSETS && window.__MARY_ASSETS[f]) || base + f;
let posePromise = null;

export function loadPose(base = './mediapipe/') {
  if (posePromise) return posePromise;
  posePromise = new Promise((resolve, reject) => {
    const ready = async () => {
      try {
        const pose = new window.Pose({ locateFile: (f) => asset(f, base) });
        pose.setOptions({
          modelComplexity: 1, smoothLandmarks: true, enableSegmentation: true, smoothSegmentation: true,
          minDetectionConfidence: 0.5, minTrackingConfidence: 0.5,
        });
        await pose.initialize();
        resolve(new PoseRunner(pose));
      } catch (e) { reject(e); }
    };
    if (window.Pose) { ready(); return; }
    const s = document.createElement('script');
    s.src = asset('pose.js', base);
    s.onload = ready;
    s.onerror = () => reject(new Error('No se pudo cargar el detector de cuerpo.'));
    document.head.appendChild(s);
  });
  posePromise.catch(() => { posePromise = null; });
  return posePromise;
}

// Envía una imagen y llama a handler(resultados) dentro del callback de MediaPipe
// (sus imágenes solo son válidas en ese momento).
export class PoseRunner {
  constructor(pose) {
    this.pose = pose; this.cb = null; this.still = true;
    pose.onResults((r) => { const cb = this.cb; this.cb = null; if (cb) cb(r); });
  }
  setStill(still) {
    if (still === this.still) return;
    this.still = still;
    this.pose.setOptions({ smoothLandmarks: !still, smoothSegmentation: !still });
  }
  reset() { try { this.pose.reset(); } catch { /* sin estado */ } }
  run(image, handler) {
    return new Promise((resolve, reject) => {
      this.cb = (r) => { try { handler(r); resolve(true); } catch (e) { reject(e); } };
      this.pose.send({ image }).catch((e) => { this.cb = null; reject(e); });
    });
  }
}

// Convierte los 33 puntos de MediaPipe a coordenadas de imagen (px, y hacia arriba = -y)
// con profundidad en píxeles. Devuelve {P, s (px por cm), vis, boneVis}.
export function toBody(res, W, H) {
  const lm = res.poseLandmarks, wl = res.poseWorldLandmarks;
  if (!lm || lm.length < 33) return null;
  const V = (i) => (lm[i].visibility ?? 1);
  // Escala: compara distancias 2D (px) con las del esqueleto 3D (m) en puntos confiables.
  const ids = [11, 12, 23, 24, 13, 14, 25, 26, 0];
  let num = 0, den = 0;
  if (wl && wl.length >= 33) {
    for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) {
      const i = ids[a], j = ids[b];
      const w = Math.min(V(i), V(j)); if (w < 0.5) continue;
      num += Math.hypot((lm[i].x - lm[j].x) * W, (lm[i].y - lm[j].y) * H) * w;
      den += Math.hypot(wl[i].x - wl[j].x, wl[i].y - wl[j].y) * w;
    }
  }
  let k = den > 1e-6 ? num / den : 0;
  if (!(k > 0) || !isFinite(k)) {
    const sx = (lm[11].x + lm[12].x - lm[23].x - lm[24].x) / 2 * W, sy = (lm[11].y + lm[12].y - lm[23].y - lm[24].y) / 2 * H;
    k = Math.hypot(sx, sy) / 0.5;
  }
  const useW = wl && wl.length >= 33;
  const zh = useW ? (wl[23].z + wl[24].z) / 2 : 0;
  const P = new Array(33), vis = new Array(33);
  for (let i = 0; i < 33; i++) {
    const u = lm[i].x * W, v = lm[i].y * H;
    const z = useW ? -(wl[i].z - zh) * k : -lm[i].z * W;
    P[i] = [u, -v, z];
    // un punto fuera de la imagen no se considera visible
    const inside = lm[i].x > -0.02 && lm[i].x < 1.02 && lm[i].y > -0.02 && lm[i].y < 1.02;
    vis[i] = inside ? V(i) : Math.min(V(i), 0.2);
  }
  return { P, s: k / 100, vis, boneVis: boneVisibility(vis) };
}

// Muestra cada hueso solo si sus puntos se ven; un hueso oculto oculta los que cuelgan de él.
export function boneVisibility(vis) {
  const out = new Array(NB).fill(1);
  for (let b = 0; b < NB; b++) {
    const ids = BONE_LANDMARKS[b];
    let m = 1; for (const i of ids) m = Math.min(m, vis[i]);
    out[b] = m > 0.35 ? 1 : 0;
  }
  // el tronco siempre se muestra si se ven hombros o caderas
  out[B.chest] = Math.max(vis[11], vis[12]) > 0.3 ? 1 : out[B.chest];
  out[B.pelvis] = Math.max(vis[23], vis[24]) > 0.3 ? 1 : out[B.pelvis];
  const chain = (ids) => { for (let i = 1; i < ids.length; i++) if (!out[ids[i - 1]]) out[ids[i]] = 0; };
  chain([B.upperArmL, B.forearmL, B.forearmMidL, B.forearmDistL, B.handL]);
  chain([B.upperArmR, B.forearmR, B.forearmMidR, B.forearmDistR, B.handR]);
  chain([B.thighL, B.legL, B.footL]);
  chain([B.thighR, B.legR, B.footR]);
  // las sub-piezas del antebrazo dependen de los mismos puntos
  for (const s of ['L', 'R']) { const f = out[B['forearm' + s]]; out[B['forearmMid' + s]] = f; out[B['forearmDist' + s]] = f; }
  return out;
}
