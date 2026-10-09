// Página de desarrollo: muestra el modelo en pose canónica con parámetros por URL.
import { AnatomyView, fetchAnatomy } from './render/view.js';
import { computeFrames } from './anatomy/canon.js';
import { demoPose, toScreen } from './pose/demo.js';
import { ATLAS, SID } from './anatomy/atlas.js';

const q = new URLSearchParams(location.search);
const canvas = document.getElementById('c');
const view = new AnatomyView(canvas);
window.__view = view;
const buf = await fetchAnatomy('/anatomy.bin');
view.build(buf);
const layers = (q.get('layers') || 'bone').split(',');
const ghost = (q.get('ghost') || '').split(',');
for (const k in view.layers) view.setLayer(k, layers.includes(k) ? 1 : ghost.includes(k) ? 0.6 : 0, ghost.includes(k) ? 1 : 0);
if (q.get('hi')) { const ids = q.get('hi').split(','); view.setStructureState((e) => ({ hi: ids.includes(e.id) })); view.shared.uniforms.uFocus.value = 1; }
if (q.get('only')) { const ids = q.get('only').split(','); view.setStructureState((e) => ({ hidden: !ids.includes(e.id) })); }
const t0 = performance.now();
function frame() {
  const W = innerWidth, H = innerHeight;
  view.resize(W, H, Math.min(2, devicePixelRatio));
  view.setImageSize(W, H);
  const t = q.get('anim') === '1' ? (performance.now() - t0) / 1000 : 0;
  const P = demoPose(t, { animate: q.get('anim') === '1', abd: q.get('abd') ? +q.get('abd') * Math.PI / 180 : undefined, flex: q.get('flex') ? +q.get('flex') * Math.PI / 180 : undefined });
  const { P: S, s } = toScreen(P, W, H, { yaw: (+q.get('yaw') || 0) * Math.PI / 180, pitch: (+q.get('pitch') || 0) * Math.PI / 180, zoom: +q.get('zoom') || 1, centerY: q.get('cy') ? +q.get('cy') : -3, centerX: +q.get('cx') || 0, centerZ: +q.get('cz') || 0 });
  const F = computeFrames(S, s);
  view.setFrames(F);
  view.setView(0, 0, W, H);
  view.render();
  if (q.get('anim') === '1') requestAnimationFrame(frame); else window.__ready = true;
}
frame();
window.__ready2 = true;
