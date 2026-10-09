// Copia los archivos de MediaPipe Pose (modelo y WebAssembly) a public/mediapipe para usarlos sin internet.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'node_modules/@mediapipe/pose'), dst = path.join(root, 'public/mediapipe');
const files = ['pose.js', 'pose_landmark_full.tflite', 'pose_solution_packed_assets.data', 'pose_solution_packed_assets_loader.js',
  'pose_solution_simd_wasm_bin.js', 'pose_solution_simd_wasm_bin.wasm', 'pose_solution_wasm_bin.js', 'pose_solution_wasm_bin.wasm', 'pose_web.binarypb'];
fs.mkdirSync(dst, { recursive: true });
for (const f of files) { const d = path.join(dst, f); if (!fs.existsSync(d) || fs.statSync(d).size !== fs.statSync(path.join(src, f)).size) fs.copyFileSync(path.join(src, f), d); }
console.log('MediaPipe listo en public/mediapipe');
