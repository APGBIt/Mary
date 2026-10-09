// Mary: anatomía humana en realidad aumentada.
// Modos: foto, cámara en vivo, video de la galería y 3D sin cámara. Vistas por sistemas,
// fichas con irrigación e inervación enlazadas, búsqueda, nombres sobre el cuerpo y captura.
import * as THREE from 'three';
import './style.css';
import { AnatomyView, fetchAnatomy } from './render/view.js';
import { computeFrames, NB } from './anatomy/canon.js';
import { ATLAS, SID, BY_SID, CATS, FIELDS } from './anatomy/atlas.js';
import { demoPose, toScreen } from './pose/demo.js';
import { loadPose, toBody } from './pose/pose.js';

const $ = (s, r = document) => r.querySelector(s);
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const short = (name) => name.replace(/\s*\([^)]*\)/g, '').trim();

// ---------------------------------------------------------------- vistas
const VIEWS = [
  { id: 'todo', label: 'Todo', c: '#ffffff', need: [] },
  { id: 'musculos', label: 'Músculos', c: '#c4473a', need: ['musSup'] },
  { id: 'huesos', label: 'Huesos', c: '#e6d8bc', need: ['bone'] },
  { id: 'organos', label: 'Órganos', c: '#d98b7a', need: ['organ', 'cns'] },
  { id: 'irrigacion', label: 'Irrigación', c: '#ef4b4f', need: ['art', 'ven'] },
  { id: 'inervacion', label: 'Inervación', c: '#f2c94c', need: ['nerve', 'cns'] },
];
const CAT_LAYERS = { hueso: ['bone'], cartilago: ['bone'], musculo: ['musSup', 'musDeep', 'shell'], tendon: ['musSup', 'musDeep'], organo: ['organ'], snc: ['cns'], arteria: ['art'], vena: ['ven'], nervio: ['nerve'], piel: ['skin'] };
const CAT_VIEW = { hueso: 'huesos', cartilago: 'huesos', musculo: 'musculos', tendon: 'musculos', organo: 'organos', snc: 'inervacion', arteria: 'irrigacion', vena: 'irrigacion', nervio: 'inervacion', piel: 'todo' };
const MODE_LABEL = { photo: 'Foto', live: 'Cámara en vivo', video: 'Video', demo: 'Modelo 3D', home: '' };

const S = {
  mode: 'home', view: 'todo', depth: 0.2, mdepth: 0, art: true, ven: true, names: false, sel: null,
  hasPhoto: false, hasMask: false, mirror: false, img: { w: 1, h: 1 }, zoom: 1, panX: 0, panY: 0,
  yaw: 0.42, pitch: 0, dzoom: 1, dpanX: 0, dpanY: 0, spin: false, anim: false,
  frames: null, boneVis: null, dirty: true, facing: 'environment', detected: false, iso: null,
};

// ---------------------------------------------------------------- motor 3D
const canvas = $('#gl');
const view = new AnatomyView(canvas);
const photoC = document.createElement('canvas'), photoX = photoC.getContext('2d');
const maskC = document.createElement('canvas'), maskX = maskC.getContext('2d', { willReadFrequently: true });
const tinyC = document.createElement('canvas'), tinyX = tinyC.getContext('2d');
const blurC = document.createElement('canvas'), blurX = blurC.getContext('2d');
const mkTex = (c, srgb) => { const t = new THREE.CanvasTexture(c); t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
const photoTex = mkTex(photoC, true), maskTex = mkTex(maskC, false), blurTex = mkTex(blurC, false);
let maskMode = null;

// ---------------------------------------------------------------- índices del atlas
const REV = new Map(); // id -> [{e, key}] estructuras que enlazan a id
for (const e of ATLAS) for (const key of ['n', 'a', 'v']) for (const t of e[key] || []) { if (!REV.has(t)) REV.set(t, []); REV.get(t).push({ e, key }); }
const LAYER_OF = new Map(); // sid -> capa en el modelo
const LAYERS_OF = new Map(); // sid -> todas las capas donde aparece
let ANCH = new Map();

// ---------------------------------------------------------------- territorios (irrigación e inervación sobre el cuerpo)
// Al elegir un nervio se ve lo que inerva; una arteria, lo que irriga; una vena, lo que drena.
// Al elegir un músculo u órgano se ven sus nervios, arterias y venas.
const TINT = { n: 1, a: 2, v: 3 };
const TERRITORY_CATS = ['musculo', 'tendon', 'organo', 'snc', 'piel'];
function territoryOf(e) {
  const set = new Map();
  let kind;
  if (e.cat === 'nervio' || e.cat === 'arteria' || e.cat === 'vena') {
    kind = { nervio: 'n', arteria: 'a', vena: 'v' }[e.cat];
    // en el sistema nervioso central los nervios figuran como "los que nacen de él", no como inervación
    const cats = kind === 'n' ? TERRITORY_CATS.filter((c) => c !== 'snc') : TERRITORY_CATS;
    for (const x of REV.get(e.id) || []) if (x.key === kind && cats.includes(x.e.cat) && LAYERS_OF.has(x.e.sid)) set.set(x.e.sid, TINT[kind]);
  } else {
    kind = 'm';
    for (const key of ['n', 'a', 'v']) for (const id of e[key] || []) { const s = SID[id]; if (s && LAYERS_OF.has(s)) set.set(s, TINT[key]); }
  }
  if (!set.size) return null;
  set.set(e.sid, 0);
  return { owner: e.sid, kind, set };
}
const ISO_TEXT = {
  n: ['Ver en el cuerpo lo que inerva', 'Músculos y órganos que inerva'],
  a: ['Ver en el cuerpo lo que irriga', 'Músculos y órganos que irriga'],
  v: ['Ver en el cuerpo lo que drena', 'Músculos y órganos que drena'],
  m: ['Ver sus nervios y vasos en el cuerpo', ''],
};
function applyState() {
  const sel = S.sel ? S.sel.sid : 0, iso = S.iso;
  view.setStructureState((e) => {
    const s = { hi: e.sid === sel };
    if (iso) {
      const t = iso.set.get(e.sid);
      if (t === undefined) { if (e.cat !== 'hueso' && e.cat !== 'cartilago') s.hidden = true; } else s.tint = t;
    }
    return s;
  });
  view.shared.uniforms.uFocus.value = sel ? (iso ? 0.3 : 0.5) : 0;
}
function setIso(info) {
  const was = S.iso;
  S.iso = info;
  if (info && !was) S.isoSaved = { zoom: S.zoom, panX: S.panX, panY: S.panY, dzoom: S.dzoom, dpanX: S.dpanX, dpanY: S.dpanY, pitch: S.pitch };
  if (!info && was) restoreFraming();
  applyState(); applyLayers();
  if (S.sel) showCard(BY_SID[S.sel.sid]);
  if (info) S.frameIso = 2; // encuadrar el territorio en cuanto haya un cuadro dibujado
  needLabels = true; S.dirty = true;
}
function restoreFraming() {
  const s = S.isoSaved; S.isoSaved = null; S.frameIso = 0;
  if (!s) return;
  if (S.mode === 'demo') animateTo({ dzoom: s.dzoom, dpanX: s.dpanX, dpanY: s.dpanY });
  else if (S.mode === 'photo') animateTo({ zoom: s.zoom, panX: s.panX, panY: s.panY });
}
// Acerca la vista para que el territorio llene el espacio libre sobre la ficha
function frameTerritory() {
  if (!S.iso || (S.mode !== 'demo' && S.mode !== 'photo')) return;
  const pb = view.pickAll(0.25); if (!pb) return;
  const { buf, W, H, scale } = pb;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, n = 0;
  for (let y = 0, o = 0; y < H; y++) for (let x = 0; x < W; x++, o += 4) {
    if (!buf[o + 2]) continue;
    if (!S.iso.set.has((buf[o] | (buf[o + 1] << 8)) >> 1)) continue;
    const sy = H - 1 - y; n++;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (sy < y0) y0 = sy; if (sy > y1) y1 = sy;
  }
  if (n < 3) return;
  const bx0 = x0 / scale, bx1 = (x1 + 1) / scale, by0 = y0 / scale, by1 = (y1 + 1) / scale;
  const bcx = (bx0 + bx1) / 2, bcy = (by0 + by1) / 2, bw = Math.max(bx1 - bx0, 30), bh = Math.max(by1 - by0, 30);
  const cw = innerWidth, ch = innerHeight, fin = insets(), cur = S.ins || fin;
  const aw = cw - (fin.right || 0), ah = Math.max(80, ch - fin.top - fin.bottom);
  const acx = aw / 2, acy = fin.top + ah / 2;
  let f = Math.min((aw * 0.84) / bw, (ah * 0.84) / bh);
  if (S.mode === 'demo') {
    const ahCur = Math.max(80, ch - cur.top - cur.bottom);
    const dz = clamp((S.dzoom * f * ahCur) / ah, 0.6, 6);
    f = (dz * ah) / (S.dzoom * ahCur);
    const cx = (cw - (cur.right || 0)) / 2 + S.dpanX, cy = ch / 2 + (cur.top - cur.bottom) / 2 + S.dpanY;
    const ncx = acx + (cx - bcx) * f, ncy = acy + (cy - bcy) * f;
    animateTo({ dzoom: dz, dpanX: ncx - aw / 2, dpanY: ncy - ch / 2 - (fin.top - fin.bottom) / 2 });
  } else {
    const v = view.view, sc = S.scale || 1;
    const ix = v.x0 + bcx / sc, iy = v.y0 + bcy / sc, iw = bw / sc, ih = bh / sc;
    const base = Math.min(aw / S.img.w, ah / S.img.h);
    const zoom = clamp(Math.min((aw * 0.84) / iw, (ah * 0.84) / ih) / base, 1, 6);
    animateTo({ zoom, panX: ix - S.img.w / 2, panY: iy - S.img.h / 2 });
  }
}
// Transición suave de encuadre
let tween = null;
function animateTo(target, ms = 420) {
  const from = {}; for (const k in target) from[k] = S[k];
  tween = { from, target, t0: performance.now(), ms };
  S.dirty = true;
}
function stepTween(t) {
  if (!tween) return;
  const u = clamp((t - tween.t0) / tween.ms, 0, 1), e = u * u * (3 - 2 * u);
  for (const k in tween.target) S[k] = tween.from[k] + (tween.target[k] - tween.from[k]) * e;
  S.dirty = true;
  if (u >= 1) { tween = null; needLabels = true; }
}

// ---------------------------------------------------------------- utilidades de interfaz
const toastEl = $('#toast'); let toastT = 0;
function toast(msg, ms = 3200) { toastEl.textContent = msg; toastEl.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { toastEl.hidden = true; }, ms); }
const hintEl = $('#hint'); let hintT = 0;
function hint(msg, ms = 0) { clearTimeout(hintT); if (!msg) { hintEl.hidden = true; return; } hintEl.textContent = msg; hintEl.hidden = false; if (ms) hintT = setTimeout(() => { hintEl.hidden = true; }, ms); }
function setLoading(text, frac) {
  const L = $('#loading'); if (text === null) { L.classList.add('done'); return; }
  L.classList.remove('done'); $('.loading-text', L).textContent = text; $('#bar').style.width = Math.round((frac ?? 0) * 100) + '%';
}
function insets() {
  if (S.mode === 'home') { const h = $('.home-inner').getBoundingClientRect(); return { top: 8, bottom: Math.min(innerHeight * 0.62, innerHeight - h.top + 8) }; }
  const top = $('.topbar').getBoundingClientRect().bottom;
  const card = $('#card'); const wide = innerWidth >= 900 || (innerWidth > innerHeight && innerHeight <= 560);
  let bottom = innerHeight - $('.bottom').getBoundingClientRect().top;
  if (!card.hidden && !wide) bottom = Math.max(bottom, card.getBoundingClientRect().height);
  return { top: Math.max(0, top - 6), bottom: Math.max(0, bottom - 8), right: !card.hidden && wide ? card.getBoundingClientRect().width : 0 };
}

// ---------------------------------------------------------------- capas por vista
function layerPlan() {
  const d = S.depth, L = {};
  for (const k of ['skin', 'shell', 'musSup', 'musDeep', 'bone', 'organ', 'cns', 'art', 'ven', 'nerve']) L[k] = [0, 0];
  const photo = S.hasPhoto;
  if (S.iso) {
    // solo el territorio, con el esqueleto translúcido como referencia
    for (const sid of S.iso.set.keys()) for (const l of LAYERS_OF.get(sid) || []) L[l] = [1, 0];
    // músculos y órganos algo translúcidos para ver el nervio o el vaso que corre por dentro
    for (const l of ['musSup', 'musDeep', 'organ', 'cns']) if (L[l][0] > 0) L[l] = [0.74, 0];
    if (L.bone[0] < 1) L.bone = [photo ? 0.3 : 0.4, 1];
    L.shell = [0, 0]; L.skin = [0, 0];
    return L;
  }
  switch (S.view) {
    case 'todo': {
      // sin foto: la piel es un contorno translúcido que se desvanece al entrar
      if (!photo) L.skin = [0.6 * (1 - smooth(0.04, 0.18, d)), 1];
      const out = 1 - smooth(0.64, 0.8, d), a0 = photo ? smooth(0, 0.08, d) : 1;
      L.musSup = [a0 * (1 - 0.68 * smooth(0.26, 0.42, d)) * out, smooth(0.26, 0.42, d)];
      L.shell = [a0 * (1 - smooth(0.2, 0.34, d)), 0];
      L.musDeep = [smooth(0.14, 0.28, d) * (1 - 0.62 * smooth(0.46, 0.6, d)) * out, smooth(0.46, 0.6, d)];
      L.bone = [1, 0];
      L.organ = [smooth(0.36, 0.5, d), 0];
      L.cns = [smooth(0.36, 0.5, d), 0];
      const v = smooth(0.36, 0.5, d) * (1 - smooth(0.82, 0.96, d));
      L.art = [v, 0]; L.ven = [v, 0]; L.nerve = [v, 0];
      break;
    }
    case 'musculos': {
      const m = S.mdepth;
      L.musSup = [1 - 0.72 * smooth(0.15, 0.6, m), smooth(0.15, 0.6, m)];
      L.shell = [1 - smooth(0.05, 0.3, m), 0];
      L.musDeep = [1, 0];
      L.bone = [1, 0];
      break;
    }
    case 'huesos': L.bone = [1, 0]; break;
    case 'organos': L.organ = [1, 0]; L.cns = [1, 0]; L.bone = [0.5, 1]; break;
    case 'irrigacion': L.art = [S.art ? 1 : 0, 0]; L.ven = [S.ven ? 1 : 0, 0]; L.organ = [0.42, 1]; L.cns = [0.35, 1]; L.bone = [0.3, 1]; break;
    case 'inervacion': L.nerve = [1, 0]; L.cns = [1, 0]; L.bone = [0.3, 1]; L.organ = [0.22, 1]; break;
  }
  return L;
}
function applyLayers() {
  const L = layerPlan();
  for (const k in view.layers) { const [o, g] = L[k] || [0, 0]; view.setLayer(k, o, g); }
  const dark = S.view === 'todo' && !S.iso ? 0.9 * smooth(0, 0.1, S.depth) : 0.9;
  view.setComposite({ uDark: S.hasPhoto ? dark : 0, uClip: S.hasPhoto && S.hasMask ? 1 : 0, uFatRim: S.hasPhoto && S.hasMask && S.view === 'todo' && !S.iso ? 0.55 * smooth(0.02, 0.12, S.depth) * (1 - smooth(0.5, 0.8, S.depth)) : 0 });
  S.dirty = true;
}
function layerShown(layer) { const L = view.layers[layer]; return L && L.opacity >= 0.35 && L.ghost < 0.5; }

// ---------------------------------------------------------------- encuadre
function smoothInsets() {
  const ti = insets();
  if (!S.ins || S.mode === 'home') { S.ins = { top: ti.top || 0, bottom: ti.bottom || 0, right: ti.right || 0 }; return; }
  let moving = false;
  for (const k of ['top', 'bottom', 'right']) {
    const d = (ti[k] || 0) - S.ins[k];
    if (Math.abs(d) > 0.6) { S.ins[k] += d * 0.28; moving = true; } else S.ins[k] = ti[k] || 0;
  }
  if (moving) S.dirty = true;
}
function fitView() {
  const cw = innerWidth, ch = innerHeight;
  if (S.mode === 'home' || S.mode === 'demo') { view.setImageSize(cw, ch); view.setView(0, 0, cw, ch); return; }
  const { w, h } = S.img;
  const cover = S.mode === 'live' || S.mode === 'video';
  const ins = cover ? { top: 0, bottom: 0, right: 0 } : S.ins;
  const aw = cw - (ins.right || 0), ah = Math.max(80, ch - ins.top - ins.bottom);
  const base = cover ? Math.max(cw / w, ch / h) : Math.min(aw / w, ah / h);
  const sc = base * S.zoom;
  const vw = aw / sc, vh = ah / sc;
  const mx = Math.max(0, (w - vw) / 2), my = Math.max(0, (h - vh) / 2);
  S.panX = clamp(S.panX, -mx, mx); S.panY = clamp(S.panY, -my, my);
  const cx = w / 2 + S.panX, cy = h / 2 + S.panY;
  const acx = aw / 2, acy = ins.top + ah / 2;
  const x0 = cx - acx / sc, y0 = cy - acy / sc;
  view.setImageSize(w, h);
  view.setView(x0, y0, x0 + cw / sc, y0 + ch / sc);
  S.scale = sc;
}
// Acerca la foto a la persona detectada (encuadre automático)
function autoFrame() {
  const b = S.box; if (!b) return;
  const ins = insets();
  const aw = innerWidth - (ins.right || 0), ah = Math.max(80, innerHeight - ins.top - ins.bottom);
  const base = Math.min(aw / S.img.w, ah / S.img.h);
  const h = b.y1 - b.y0, top = b.y0 - h * 0.1;
  const bw = (b.x1 - b.x0) * 1.3 + 20, bh = (b.y1 - top) * 1.12 + 20;
  S.zoom = clamp(Math.min(aw / bw, ah / bh) / base, 1, 4);
  S.panX = (b.x0 + b.x1) / 2 - S.img.w / 2; S.panY = (top + b.y1) / 2 - S.img.h / 2;
  S.dirty = true;
}
function demoFrames(t) {
  const cw = innerWidth, ch = innerHeight, ins = S.ins;
  const aw = cw - (ins.right || 0), ah = Math.max(80, ch - ins.top - ins.bottom);
  const P = demoPose(t, { animate: S.anim });
  const { P: Sp, s } = toScreen(P, aw, ch, { yaw: S.yaw, pitch: S.pitch, zoom: S.dzoom * ah / ch, panX: S.dpanX, panY: (ins.top - ins.bottom) / 2 + S.dpanY, centerY: -3 });
  return computeFrames(Sp, s);
}

// ---------------------------------------------------------------- bucle de dibujo
let lastT = 0, lastLabelsT = 0, needLabels = false, lastSize = '', lastHome = 0;
function frame(t) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (t - lastT) / 1000); lastT = t;
  if (S.mode === 'home') { if (t - lastHome < 33) return; lastHome = t; }
  smoothInsets();
  stepTween(t);
  if (S.mode === 'home' || S.mode === 'demo') {
    if (S.mode === 'home' || S.spin) { S.yaw += dt * (S.mode === 'home' ? 0.35 : 0.45); S.dirty = true; }
    if (S.anim) S.dirty = true;
    if (S.dirty) { const F = demoFrames(t / 1000); view.setFrames(F, null); }
  }
  const pulse = S.sel && t - (S.pulseT || 0) > 50;
  if (!S.dirty && !pulse) return;
  if (pulse) S.pulseT = t;
  const moved = S.dirty;
  S.dirty = false;
  const dpr = Math.min(devicePixelRatio || 1, S.mode === 'live' || S.mode === 'video' || S.mode === 'home' ? 1.25 : 2);
  const key = innerWidth + 'x' + innerHeight + '@' + dpr;
  if (key !== lastSize) { lastSize = key; view.resize(innerWidth, innerHeight, dpr); }
  fitView();
  view.hide3D = !S.frames && S.mode !== 'home' && S.mode !== 'demo';
  view.render();
  if (S.frameIso && !tween && (S.frames || S.mode === 'demo')) { if (--S.frameIso === 0) frameTerritory(); else S.dirty = true; }
  if (moved) needLabels = true;
  const live = S.mode === 'live' || S.mode === 'video' || S.spin || S.anim;
  if (needLabels && (!live || t - lastLabelsT > 450) && !gest) { needLabels = false; lastLabelsT = t; queueLabels(); }
}

// ---------------------------------------------------------------- etiquetas
let labelsQueued = false;
function queueLabels() { if (labelsQueued) return; labelsQueued = true; setTimeout(() => { labelsQueued = false; updateLabels(); }, 30); }
const labelsEl = $('#labels');
const NO_LABEL = new Set(['tejido_profundo', 'piel'].map((id) => SID[id]).filter(Boolean));
function updateLabels() {
  labelsEl.textContent = '';
  const names = S.names || !!S.iso;
  if (S.mode === 'home' || (!names && !S.sel) || (!S.frames && S.mode !== 'demo')) return;
  const pb = view.pickAll(0.3);
  if (!pb) return;
  const { buf, W, H, scale } = pb;
  const acc = new Map();
  for (let y = 0, o = 0; y < H; y++) for (let x = 0; x < W; x++, o += 4) {
    if (!buf[o + 2]) continue;
    const id = buf[o] | (buf[o + 1] << 8);
    let a = acc.get(id); if (!a) acc.set(id, (a = { n: 0, sx: 0, sy: 0, bx: 0, by: 0, bd: 1e12 }));
    a.n++; a.sx += x; a.sy += y;
  }
  for (const a of acc.values()) { a.cx = a.sx / a.n; a.cy = a.sy / a.n; }
  for (let y = 0, o = 0; y < H; y++) for (let x = 0; x < W; x++, o += 4) {
    if (!buf[o + 2]) continue;
    const a = acc.get(buf[o] | (buf[o + 1] << 8));
    const d = (x - a.cx) ** 2 + (y - a.cy) ** 2; if (d < a.bd) { a.bd = d; a.bx = x; a.by = y; }
  }
  const cw = innerWidth;
  const items = [];
  for (const [id, a] of acc) {
    let x = (a.bx + 0.5) / scale; const y = (H - 1 - a.by + 0.5) / scale;
    if (S.mirror) x = cw - x;
    items.push({ sid: id >> 1, side: id & 1, n: a.n, x, y });
  }
  const placed = [];
  const fits = (r) => placed.every((q) => r.x1 < q.x0 || r.x0 > q.x1 || r.y1 < q.y0 || r.y0 > q.y1);
  const put = (it, sel) => {
    const e = BY_SID[it.sid]; if (!e) return false;
    const txt = short(e.name);
    const w = txt.length * (sel ? 7.4 : 6.9) + 26, h = sel ? 24 : 22;
    const r = { x0: it.x - w / 2, x1: it.x + w / 2, y0: it.y - h - 4, y1: it.y };
    if (!sel && (!fits(r) || r.y0 < 60 || r.x0 < 2 || r.x1 > cw - 2)) return false;
    placed.push(r);
    const el = document.createElement('div');
    el.className = 'lbl' + (sel ? ' sel' : '');
    el.style.transform = `translate(${Math.round(it.x)}px, ${Math.round(it.y - 5)}px) translate(-50%, -100%)`;
    const dot = document.createElement('span'); dot.className = 'd'; dot.style.background = CATS[e.cat].color;
    if (!sel) el.append(dot);
    el.append(txt);
    el.onclick = (ev) => { ev.stopPropagation(); select(e.sid, it.side); };
    labelsEl.append(el);
    return true;
  };
  if (S.sel) {
    const mine = items.filter((it) => it.sid === S.sel.sid).sort((a, b) => (b.side === S.sel.side) - (a.side === S.sel.side) || b.n - a.n);
    if (mine.length) { put(mine[0], true); keepInView(mine[0]); }
    else {
      const an = ANCH.get(S.sel.sid * 2 + S.sel.side) || ANCH.get(S.sel.sid * 2 + (1 - S.sel.side));
      const q = an && view.project(an.p, an.w);
      if (q) put({ sid: S.sel.sid, side: S.sel.side, x: S.mirror ? cw - q.x : q.x, y: q.y }, true);
    }
  }
  if (!names) return;
  const seen = new Set(S.sel ? [S.sel.sid] : []);
  items.sort((a, b) => b.n - a.n);
  let count = 0;
  for (const it of items) {
    if (count >= 18 || it.n < 30) break;
    if (seen.has(it.sid) || NO_LABEL.has(it.sid)) continue;
    if (put(it, false)) { seen.add(it.sid); count++; }
  }
}

// Desplaza la vista para que la estructura elegida no quede tapada por la ficha
function keepInView(it) {
  if (S.keptSel === S.sel.sid + ':' + S.sel.side) return;
  S.keptSel = S.sel.sid + ':' + S.sel.side;
  const ins = insets(), top = ins.top + 40, bottom = innerHeight - ins.bottom - 16;
  let dy = 0;
  if (it.y > bottom) dy = it.y - bottom + 30; else if (it.y < top) dy = it.y - top - 30;
  if (!dy) return;
  if (S.mode === 'demo') S.dpanY -= dy; else if (S.scale) S.panY += dy / S.scale;
  S.dirty = true; needLabels = true;
}

// ---------------------------------------------------------------- selección y ficha
const card = $('#card');
function select(sid, side = 0, o = {}) {
  S.sel = sid ? { sid, side } : null; S.keptSel = null;
  // dentro de un territorio se puede tocar lo que está a la vista sin salir de él
  if (S.iso && !(sid && S.iso.set.has(sid))) { S.iso = null; restoreFraming(); applyLayers(); }
  applyState();
  if (sid) {
    const e = BY_SID[sid];
    if (o.reveal) reveal(e);
    showCard(e);
    hint(null);
  } else hideCard();
  S.dirty = true; needLabels = true;
}
function reveal(e) {
  const layer = LAYER_OF.get(e.sid);
  if (!layer) return;
  if (e.cat === 'arteria' && !S.art) { S.art = true; syncToggles(); }
  if (e.cat === 'vena' && !S.ven) { S.ven = true; syncToggles(); }
  applyLayers();
  if (!layerShown(layer)) setView(CAT_VIEW[e.cat] || 'todo', true);
}
function chip(target) {
  const t = BY_SID[SID[target]] || target; if (!t || !t.id) return null;
  const b = document.createElement('button'); b.className = 'chip'; b.style.setProperty('--c', CATS[t.cat].color);
  const i = document.createElement('i'); b.append(i, short(t.name));
  b.onclick = () => select(t.sid, 0, { reveal: true });
  return b;
}
function chipRow(ids) {
  const row = document.createElement('div'); row.className = 'chips';
  for (const id of ids) { const c = chip(id); if (c) row.append(c); }
  return row.childNodes.length ? row : null;
}
function showCard(e) {
  card.hidden = false;
  card.classList.remove('expanded');
  const cat = CATS[e.cat];
  $('.dot', card).style.background = cat.color;
  $('.cat', card).textContent = cat.label + (e.deep ? ' · plano profundo' : '');
  $('h2', card).textContent = e.name;
  const body = $('.sheet-body', card); body.textContent = ''; body.scrollTop = 0;
  const p = document.createElement('p'); p.className = 'desc'; p.textContent = e.desc; body.append(p);
  // botón de territorio: lo que inerva, irriga o drena (o sus nervios y vasos)
  const ter = territoryOf(e);
  const on = S.iso && S.iso.owner === e.sid;
  if (ter || on) {
    const k = (on ? S.iso : ter).kind;
    const b = document.createElement('button'); b.className = 'iso-btn ' + k + (on ? ' on' : '');
    b.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/></svg>';
    b.append(on ? 'Volver a la vista completa' : ISO_TEXT[k][0]);
    b.onclick = (ev) => { ev.stopPropagation(); setIso(on ? null : ter); };
    body.append(b);
    if (on) {
      const lg = document.createElement('div'); lg.className = 'iso-legend';
      const item = (c, t) => { const s = document.createElement('span'); const i = document.createElement('i'); i.style.background = c; s.append(i, t); lg.append(s); };
      if (k === 'm') { const ks = new Set([...S.iso.set.values()]); if (ks.has(1)) item('#f2c94c', 'Nervios'); if (ks.has(2)) item('#ef4b4f', 'Arterias'); if (ks.has(3)) item('#5b8ce8', 'Venas'); }
      else item({ n: '#f2c94c', a: '#ef4b4f', v: '#5b8ce8' }[k], ISO_TEXT[k][1] + ' (' + (S.iso.set.size - 1) + ')');
      body.append(lg);
    }
  } else if (S.iso && S.iso.owner !== e.sid) {
    const b = document.createElement('button'); b.className = 'iso-btn on';
    b.append('Volver a la vista completa');
    b.onclick = (ev) => { ev.stopPropagation(); setIso(null); };
    body.append(b);
  }
  const dl = document.createElement('dl'); dl.className = 'fields';
  const inline = { inerv: 'n', irrig: 'a', drenaje: 'v' };
  const used = new Set();
  for (const [k, label] of FIELDS) {
    if (!e[k] || typeof e[k] !== 'string') continue;
    const f = document.createElement('div'); f.className = 'f ' + k;
    const dt = document.createElement('dt'); dt.textContent = label;
    const dd = document.createElement('dd'); dd.textContent = e[k];
    f.append(dt, dd);
    if (inline[k] && e[inline[k]]) { const r = chipRow(e[inline[k]]); if (r) f.append(r); used.add(inline[k]); }
    dl.append(f);
  }
  body.append(dl);
  const group = (title, ids) => {
    if (!ids || !ids.length) return;
    const r = chipRow(ids); if (!r) return;
    const box = document.createElement('div'); box.className = 'rel';
    const h = document.createElement('h3'); h.textContent = title; box.append(h, r); body.append(box);
  };
  const back = (key, cats) => (REV.get(e.id) || []).filter((x) => x.key === key && (!cats || cats.includes(x.e.cat))).map((x) => x.e.id);
  if (e.cat === 'arteria') {
    group('Venas acompañantes', e.v); group('Nervios cercanos', e.n);
    group('Músculos que irriga', back('a', ['musculo'])); group('Órganos y otras estructuras que irriga', back('a', ['organo', 'snc', 'hueso', 'cartilago', 'tendon']));
  } else if (e.cat === 'vena') {
    group('Arterias acompañantes', e.a); group('Estructuras que drena', back('v', ['musculo', 'organo', 'snc', 'hueso', 'cartilago', 'tendon']));
  } else if (e.cat === 'nervio') {
    group('Arterias acompañantes', e.a); group('Músculos que inerva', back('n', ['musculo'])); group('Otras estructuras', back('n', ['organo', 'snc', 'hueso', 'cartilago', 'tendon']));
  } else {
    if (!used.has('n')) group('Inervación', e.n);
    if (!used.has('a')) group('Irrigación', e.a);
    if (!used.has('v')) group('Drenaje venoso', e.v);
  }
  if (!LAYER_OF.has(e.sid)) { const n = document.createElement('p'); n.className = 'view-note'; n.textContent = 'Esta estructura no se dibuja en el modelo 3D; su ficha queda como referencia.'; body.append(n); }
  S.dirty = true;
}
function hideCard() { card.hidden = true; S.dirty = true; }
$('.close', card).onclick = (ev) => { ev.stopPropagation(); select(null); };
$('.sheet-head', card).onclick = () => { card.classList.toggle('expanded'); S.dirty = true; };

// ---------------------------------------------------------------- vistas (botones)
const viewsEl = $('#views');
function buildViews() {
  viewsEl.textContent = '';
  for (const v of VIEWS) {
    if (v.need.length && !v.need.some((l) => view.layers[l])) continue;
    const b = document.createElement('button'); b.setAttribute('role', 'tab'); b.dataset.v = v.id;
    const i = document.createElement('i'); i.style.setProperty('--c', v.c); b.append(i, v.label);
    b.onclick = () => setView(v.id);
    viewsEl.append(b);
  }
}
function setView(id, keepSel = false) {
  S.view = id;
  if (S.iso) { S.iso = null; restoreFraming(); applyState(); if (S.sel) showCard(BY_SID[S.sel.sid]); }
  for (const b of viewsEl.children) b.setAttribute('aria-selected', b.dataset.v === id ? 'true' : 'false');
  const sel = viewsEl.querySelector('[aria-selected="true"]'); sel?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  const depthBox = $('#depthBox'), slider = $('#depth');
  depthBox.hidden = !(id === 'todo' || id === 'musculos');
  if (id === 'todo') { $('#depthA').textContent = S.hasPhoto ? 'Foto' : 'Piel'; $('#depthB').textContent = 'Hueso'; slider.value = S.depth; }
  if (id === 'musculos') { $('#depthA').textContent = 'Superficiales'; $('#depthB').textContent = 'Profundos'; slider.value = S.mdepth; }
  $('#vesselBox').hidden = id !== 'irrigacion';
  const note = $('#viewNote');
  const notes = {
    irrigacion: 'Rojo: arterias · Azul: venas · En los pulmones los colores se invierten.',
    inervacion: 'Amarillo: nervios · Rosado: encéfalo y médula espinal.',
    organos: 'Órganos del tórax, el abdomen y la pelvis, con el encéfalo.',
  };
  note.textContent = notes[id] || ''; note.hidden = !notes[id];
  if (!keepSel && S.sel) { const e = BY_SID[S.sel.sid]; const l = LAYER_OF.get(e.sid); applyLayers(); if (!l || !layerShown(l)) select(null); }
  applyLayers();
  needLabels = true;
}
$('#depth').addEventListener('input', (ev) => { const v = +ev.target.value; if (S.view === 'musculos') S.mdepth = v; else S.depth = v; applyLayers(); });
function syncToggles() { for (const [id, k] of [['#tglArt', 'art'], ['#tglVen', 'ven']]) { const b = $(id); b.classList.toggle('on', S[k]); b.setAttribute('aria-pressed', S[k]); } }
$('#tglArt').onclick = () => { S.art = !S.art; if (!S.art && !S.ven) S.ven = true; syncToggles(); applyLayers(); };
$('#tglVen').onclick = () => { S.ven = !S.ven; if (!S.art && !S.ven) S.art = true; syncToggles(); applyLayers(); };
$('#btnNames').onclick = () => { S.names = !S.names; $('#btnNames').setAttribute('aria-pressed', S.names); needLabels = true; S.dirty = true; if (S.names) hint(null); };

// ---------------------------------------------------------------- gestos
const ptrs = new Map(); let gest = null;
const snap = () => ({ zoom: S.zoom, panX: S.panX, panY: S.panY, yaw: S.yaw, pitch: S.pitch, dzoom: S.dzoom, dpanX: S.dpanX, dpanY: S.dpanY });
canvas.addEventListener('pointerdown', (ev) => {
  if (S.mode === 'home') return;
  tween = null; S.frameIso = 0;
  canvas.setPointerCapture(ev.pointerId);
  ptrs.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  if (ptrs.size === 1) gest = { kind: 'tap', x0: ev.clientX, y0: ev.clientY, t0: performance.now(), s: snap() };
  else if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; gest = { kind: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, s: snap() }; }
});
canvas.addEventListener('pointermove', (ev) => {
  const p = ptrs.get(ev.pointerId); if (!p || !gest) return;
  p.x = ev.clientX; p.y = ev.clientY;
  const sgn = S.mirror ? -1 : 1;
  if (gest.kind === 'tap' && Math.hypot(ev.clientX - gest.x0, ev.clientY - gest.y0) > 9) gest.kind = 'drag';
  if (gest.kind === 'drag') {
    const dx = ev.clientX - gest.x0, dy = ev.clientY - gest.y0;
    if (S.mode === 'demo') { S.yaw = gest.s.yaw + dx * 0.009; S.pitch = clamp(gest.s.pitch + dy * 0.004, -0.6, 0.6); S.spin = false; syncAlt(); }
    else if (S.scale) { S.panX = gest.s.panX - (dx * sgn) / S.scale; S.panY = gest.s.panY - dy / S.scale; }
    S.dirty = true;
  } else if (gest.kind === 'pinch' && ptrs.size >= 2) {
    const [a, b] = [...ptrs.values()];
    const f = Math.hypot(a.x - b.x, a.y - b.y) / gest.d0, mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    if (S.mode === 'demo') { S.dzoom = clamp(gest.s.dzoom * f, 0.6, 6); S.dpanX = gest.s.dpanX + (mx - gest.mx); S.dpanY = gest.s.dpanY + (my - gest.my); }
    else { S.zoom = clamp(gest.s.zoom * f, 1, 6); if (S.scale) { S.panX = gest.s.panX - ((mx - gest.mx) * sgn) / S.scale; S.panY = gest.s.panY - (my - gest.my) / S.scale; } }
    S.dirty = true;
  }
});
const endPtr = (ev) => {
  if (!ptrs.has(ev.pointerId)) return;
  ptrs.delete(ev.pointerId);
  if (gest && gest.kind === 'tap' && ev.type === 'pointerup' && performance.now() - gest.t0 < 600) tap(ev.clientX, ev.clientY);
  if (ptrs.size === 1) { const [p] = [...ptrs.values()]; gest = { kind: 'drag', x0: p.x, y0: p.y, t0: 0, s: snap() }; }
  else if (!ptrs.size) { gest = null; needLabels = true; S.dirty = true; }
};
canvas.addEventListener('pointerup', endPtr);
canvas.addEventListener('pointercancel', endPtr);
canvas.addEventListener('wheel', (ev) => {
  if (S.mode === 'home') return;
  ev.preventDefault();
  const f = Math.exp(-ev.deltaY * 0.0015);
  if (S.mode === 'demo') S.dzoom = clamp(S.dzoom * f, 0.6, 6); else S.zoom = clamp(S.zoom * f, 1, 6);
  S.dirty = true;
}, { passive: false });
canvas.addEventListener('dblclick', () => { S.zoom = 1; S.panX = S.panY = 0; S.dzoom = 1; S.dpanX = S.dpanY = 0; S.pitch = 0; S.dirty = true; });
function tap(x, y) {
  if (!S.frames && S.mode !== 'demo') return;
  const px = S.mirror ? innerWidth - x : x;
  const hit = view.pick(px, y, 16);
  if (hit && BY_SID[hit.sid]) select(hit.sid, hit.side); else select(null);
}

// ---------------------------------------------------------------- modos
const video = $('#video');
let stream = null, runner = null, liveOn = false, wakeLock = null, busy = false;
function showViewer(mode) {
  S.mode = mode;
  $('#home').hidden = true; $('#viewer').hidden = false;
  $('#modeLabel').textContent = MODE_LABEL[mode];
  canvas.style.transform = S.mirror ? 'scaleX(-1)' : '';
  labelsEl.textContent = '';
  S.ins = null; syncAlt(); setView(S.view); S.dirty = true;
}
function goHome() {
  stopMedia(); select(null);
  S.mode = 'home'; S.hasPhoto = false; S.hasMask = false; S.frames = null; S.mirror = false; S.detected = false;
  canvas.style.transform = '';
  view.setPhoto(null); view.setMask(null);
  $('#viewer').hidden = true; $('#home').hidden = false;
  S.view = 'todo'; S.depth = 0.2; S.yaw = 0.42; S.pitch = 0; S.dzoom = 1; S.dpanX = S.dpanY = 0; tween = null;
  applyLayers(); hint(null); labelsEl.textContent = '';
  history.replaceState(null, '', location.pathname);
}
$('#btnHome').onclick = goHome;
function syncAlt() {
  const b = $('#btnAlt');
  b.textContent = { photo: 'Otra foto', live: 'Girar cámara', video: 'Otro video', demo: S.spin ? 'Detener giro' : 'Girar' }[S.mode] || '';
}
$('#btnAlt').onclick = () => {
  if (S.mode === 'photo') $('#filePhoto').click();
  else if (S.mode === 'video') $('#fileGallery').click();
  else if (S.mode === 'live') startLive(S.facing === 'user' ? 'environment' : 'user');
  else if (S.mode === 'demo') { S.spin = !S.spin; syncAlt(); }
};

async function getRunner() {
  if (runner) return runner;
  setLoading('Preparando el detector de cuerpo (solo la primera vez)…', 0.3);
  try { runner = await loadPose(); } finally { setLoading(null); }
  return runner;
}

function drawPhoto(src, w, h, maxSide = 1600) {
  const k = Math.min(1, maxSide / Math.max(w, h));
  const W = Math.max(1, Math.round(w * k)), H = Math.max(1, Math.round(h * k));
  if (photoC.width !== W || photoC.height !== H) { photoC.width = W; photoC.height = H; photoTex.dispose(); }
  photoX.drawImage(src, 0, 0, W, H);
  photoTex.needsUpdate = true;
  S.img = { w: W, h: H };
  return photoC;
}
function updateMask(mask) {
  if (!mask) { S.hasMask = false; view.setMask(null); return; }
  const mw = 320, mh = Math.max(8, Math.round((320 * S.img.h) / S.img.w));
  if (maskC.width !== mw || maskC.height !== mh) { maskC.width = mw; maskC.height = mh; blurC.width = mw; blurC.height = mh; maskTex.dispose(); blurTex.dispose(); }
  maskX.globalCompositeOperation = 'copy';
  maskX.drawImage(mask, 0, 0, mw, mh);
  if (maskMode === null) {
    const d = maskX.getImageData(0, 0, mw, mh).data; let minA = 255;
    for (let i = 3; i < d.length; i += 28) if (d[i] < minA) minA = d[i];
    maskMode = minA < 250 ? 'alpha' : 'red';
  }
  if (maskMode === 'alpha') {
    maskX.globalCompositeOperation = 'source-in'; maskX.fillStyle = '#fff'; maskX.fillRect(0, 0, mw, mh);
    maskX.globalCompositeOperation = 'destination-over'; maskX.fillStyle = '#000'; maskX.fillRect(0, 0, mw, mh);
  }
  maskX.globalCompositeOperation = 'source-over';
  tinyC.width = 40; tinyC.height = Math.max(4, Math.round((40 * mh) / mw));
  tinyX.drawImage(maskC, 0, 0, tinyC.width, tinyC.height);
  blurX.imageSmoothingEnabled = true; blurX.clearRect(0, 0, mw, mh); blurX.drawImage(tinyC, 0, 0, mw, mh);
  maskTex.needsUpdate = true; blurTex.needsUpdate = true;
  view.setMask(maskTex, blurTex);
  S.hasMask = true;
}
function usePose(res, w, h) {
  const body = toBody(res, w, h);
  if (!body) { S.frames = null; return false; }
  const F = computeFrames(body.P, body.s, body.vis);
  S.frames = F; S.boneVis = body.boneVis;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  body.P.forEach((p, i) => { if (body.vis[i] < 0.5) return; x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, -p[1]); y1 = Math.max(y1, -p[1]); });
  S.box = x1 > x0 ? { x0, y0, x1, y1 } : null;
  view.setFrames(F, body.boneVis);
  return true;
}

async function loadImageFile(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.decoding = 'async'; img.src = url;
    await img.decode();
    return img;
  } finally { setTimeout(() => URL.revokeObjectURL(url), 2000); }
}
async function startPhoto(file) {
  stopMedia(); select(null);
  let img;
  try { img = await loadImageFile(file); } catch { toast('No se pudo abrir esa imagen.'); return; }
  S.mirror = false; S.zoom = 1; S.panX = S.panY = 0;
  drawPhoto(img, img.naturalWidth, img.naturalHeight);
  view.setPhoto(photoTex); S.hasPhoto = true; S.frames = null; S.hasMask = false; view.setMask(null);
  if (S.view === 'todo' && S.depth < 0.12) S.depth = 0.2;
  showViewer('photo');
  let r;
  try { r = await getRunner(); } catch { toast('No se pudo cargar el detector de cuerpo. Revisa la conexión y vuelve a intentar.', 5000); return; }
  hint('Buscando a la persona…');
  r.setStill(true); r.reset();
  let ok = false;
  try {
    await r.run(photoC, (res) => { ok = usePose(res, photoC.width, photoC.height); if (ok) updateMask(res.segmentationMask); });
  } catch (e) { console.error(e); }
  S.detected = ok; applyLayers();
  if (ok) autoFrame();
  if (ok) hint('Toca cualquier parte del cuerpo para ver qué es.', 5000);
  else hint('No encontré a una persona de cuerpo entero. Prueba otra foto: a 2–3 metros, con buena luz y de frente.');
  S.dirty = true;
}

function stopMedia() {
  liveOn = false;
  if (stream) { for (const t of stream.getTracks()) t.stop(); stream = null; }
  if (video.src) { video.pause(); URL.revokeObjectURL(video.src); video.removeAttribute('src'); }
  video.srcObject = null;
  if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
}
async function keepAwake() { try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* sin bloqueo */ } }

async function startLive(facing = 'environment') {
  stopMedia(); select(null);
  S.facing = facing;
  if (!navigator.mediaDevices?.getUserMedia) { toast('Este navegador no permite la cámara en vivo aquí. Usa «Tomar foto».', 5000); $('#filePhoto').click(); return; }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
  } catch (e) {
    console.warn(e);
    toast('No se pudo abrir la cámara (permiso denegado o bloqueada). Usa «Tomar foto», que funciona siempre.', 6000);
    if (S.mode !== 'home') goHome();
    return;
  }
  video.srcObject = stream; video.muted = true;
  try { await video.play(); } catch { /* algunos navegadores esperan un gesto */ }
  S.mirror = facing === 'user'; S.hasPhoto = true; S.frames = null; S.zoom = 1; S.panX = S.panY = 0;
  view.setPhoto(photoTex);
  showViewer('live');
  hint('Enfoca a una persona de cuerpo entero, a 2–3 metros.');
  keepAwake();
  await runLoop();
}
async function startVideo(file) {
  stopMedia(); select(null);
  video.srcObject = null; video.src = URL.createObjectURL(file); video.loop = true; video.muted = true;
  try { await video.play(); } catch { toast('No se pudo reproducir ese video.'); return; }
  S.mirror = false; S.hasPhoto = true; S.frames = null; S.zoom = 1; S.panX = S.panY = 0;
  view.setPhoto(photoTex);
  showViewer('video');
  hint('Buscando a la persona…');
  keepAwake();
  await runLoop();
}
async function runLoop() {
  let r;
  try { r = await getRunner(); } catch { toast('No se pudo cargar el detector de cuerpo.', 5000); return; }
  r.setStill(false); r.reset();
  liveOn = true;
  let misses = 0;
  const step = async () => {
    if (!liveOn) return;
    if (video.readyState >= 2 && video.videoWidth && !busy) {
      busy = true;
      try {
        await r.run(video, (res) => {
          const w = video.videoWidth, h = video.videoHeight;
          drawPhoto(res.image || video, w, h, 1280);
          const ok = usePose(res, S.img.w, S.img.h);
          if (ok) updateMask(res.segmentationMask);
          if (ok && !S.detected) { S.detected = true; applyLayers(); hint('Toca una parte del cuerpo para ver qué es.', 4000); }
          if (!ok) { misses++; if (misses > 25 && S.detected) { S.detected = false; hint('Enfoca a una persona de cuerpo entero, a 2–3 metros.'); } } else misses = 0;
          S.dirty = true;
        });
      } catch (e) { console.warn(e); }
      busy = false;
    }
    if (liveOn) (video.requestVideoFrameCallback ? video.requestVideoFrameCallback(() => step()) : requestAnimationFrame(step));
  };
  step();
}
function startDemo() {
  stopMedia(); select(null);
  S.mirror = false; S.hasPhoto = false; S.hasMask = false; S.frames = null;
  view.setPhoto(null); view.setMask(null);
  S.yaw = 0.42; S.pitch = 0; S.dzoom = 1; S.dpanX = S.dpanY = 0; S.spin = false; tween = null;
  if (S.view === 'todo' && S.depth < 0.12) S.depth = 0.2;
  showViewer('demo');
  hint('Arrastra para girar · pellizca para acercar · toca para ver qué es', 5000);
}

$('#btnPhoto').onclick = () => $('#filePhoto').click();
$('#btnGallery').onclick = () => $('#fileGallery').click();
$('#btnLive').onclick = () => startLive('environment');
$('#btnDemo').onclick = () => startDemo();
$('#filePhoto').onchange = (ev) => { const f = ev.target.files[0]; ev.target.value = ''; if (f) startPhoto(f); };
$('#fileGallery').onchange = (ev) => { const f = ev.target.files[0]; ev.target.value = ''; if (!f) return; if (f.type.startsWith('video/')) startVideo(f); else startPhoto(f); };

// ---------------------------------------------------------------- captura
$('#btnShot').onclick = async () => {
  S.dirty = true; view.render();
  const src = view.renderer.domElement;
  const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
  const x = c.getContext('2d');
  if (S.mirror) { x.translate(c.width, 0); x.scale(-1, 1); }
  x.drawImage(src, 0, 0);
  x.setTransform(1, 0, 0, 1, 0, 0);
  const k = c.width / innerWidth;
  // etiquetas visibles
  for (const el of labelsEl.children) {
    const m = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(el.style.transform); if (!m) continue;
    const lx = +m[1] * k, ly = +m[2] * k, txt = el.textContent, sel = el.classList.contains('sel');
    x.font = `600 ${Math.round((sel ? 13 : 12) * k)}px system-ui, sans-serif`;
    const tw = x.measureText(txt).width + 16 * k, th = (sel ? 24 : 22) * k;
    x.fillStyle = sel ? '#3ce6ff' : 'rgba(8,12,18,0.8)';
    x.beginPath(); x.roundRect ? x.roundRect(lx - tw / 2, ly - th, tw, th, 7 * k) : x.rect(lx - tw / 2, ly - th, tw, th); x.fill();
    x.fillStyle = sel ? '#032029' : '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(txt, lx, ly - th / 2);
  }
  x.font = `700 ${Math.round(15 * k)}px system-ui, sans-serif`; x.textAlign = 'right'; x.textBaseline = 'bottom';
  x.fillStyle = 'rgba(255,255,255,0.85)'; x.fillText('Mary · anatomía en realidad aumentada', c.width - 14 * k, c.height - 12 * k);
  const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.92));
  if (!blob) { toast('No se pudo crear la imagen.'); return; }
  const file = new File([blob], 'mary-anatomia.jpg', { type: 'image/jpeg' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Mary' }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  toast('Imagen guardada.');
};

// ---------------------------------------------------------------- búsqueda
const searchEl = $('#search'), qEl = $('#q'), resEl = $('#results'), catsEl = $('#cats');
let catFilter = null;
const INDEX = ATLAS.map((e) => ({ e, k: fold(e.name + ' ' + e.id.replace(/_/g, ' ')) }));
function buildCats() {
  catsEl.textContent = '';
  const mk = (id, label, color) => {
    const b = document.createElement('button'); b.setAttribute('aria-pressed', catFilter === id);
    if (color) { const i = document.createElement('i'); i.style.setProperty('--c', color); b.append(i); }
    b.append(label); b.onclick = () => { catFilter = id; buildCats(); renderResults(); };
    catsEl.append(b);
  };
  mk(null, 'Todas');
  for (const [id, c] of Object.entries(CATS)) if (ATLAS.some((e) => e.cat === id)) mk(id, c.label, c.color);
}
function renderResults() {
  const q = fold(qEl.value.trim());
  const words = q.split(/\s+/).filter(Boolean);
  let list = INDEX.filter((x) => (!catFilter || x.e.cat === catFilter) && words.every((w) => x.k.includes(w)));
  if (q) list.sort((a, b) => (a.k.startsWith(q) ? 0 : 1) - (b.k.startsWith(q) ? 0 : 1) || a.e.name.localeCompare(b.e.name, 'es'));
  else list.sort((a, b) => a.e.name.localeCompare(b.e.name, 'es'));
  resEl.textContent = '';
  for (const { e } of list.slice(0, 200)) {
    const li = document.createElement('li');
    const i = document.createElement('i'); i.style.setProperty('--c', CATS[e.cat].color);
    const b = document.createElement('b'); b.textContent = e.name;
    const s = document.createElement('span'); s.textContent = CATS[e.cat].label;
    li.append(i, b, s);
    li.onclick = () => { closeSearch(); select(e.sid, 0, { reveal: true }); };
    resEl.append(li);
  }
  if (!list.length) { const li = document.createElement('li'); li.className = 'empty'; li.textContent = 'Sin resultados'; resEl.append(li); }
}
function openSearch() { searchEl.hidden = false; buildCats(); renderResults(); setTimeout(() => qEl.focus(), 50); }
function closeSearch() { searchEl.hidden = true; qEl.blur(); }
$('#btnSearch').onclick = openSearch;
$('#btnSearchClose').onclick = closeSearch;
qEl.addEventListener('input', renderResults);
qEl.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') closeSearch(); if (ev.key === 'Enter') resEl.querySelector('li:not(.empty)')?.click(); });

// ---------------------------------------------------------------- arranque
addEventListener('resize', () => { S.dirty = true; needLabels = true; });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && (S.mode === 'live' || S.mode === 'video')) keepAwake(); });
addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { if (!searchEl.hidden) closeSearch(); else if (S.sel) select(null); } });

async function boot() {
  setLoading('Cargando el modelo anatómico…', 0.02);
  let buf;
  try {
    if (window.__MARY_READY) await window.__MARY_READY; // versión de un solo archivo
    const url = (window.__MARY_ASSETS && window.__MARY_ASSETS['anatomy.bin']) || './anatomy.bin';
    buf = await fetchAnatomy(url, (f) => setLoading('Cargando el modelo anatómico…', 0.05 + f * 0.85));
    view.build(buf);
  } catch (e) {
    console.error(e);
    setLoading('No se pudo cargar el modelo. Revisa la conexión y recarga la página.', 0);
    return;
  }
  if (window.__MARY_ASSETS) { const dl = $('#dl'); if (dl) dl.parentNode.removeChild(dl); }
  for (const a of view.anchors) {
    ANCH.set(a.sid * 2 + a.side, a);
    if (!LAYER_OF.has(a.sid)) LAYER_OF.set(a.sid, a.layer);
    if (!LAYERS_OF.has(a.sid)) LAYERS_OF.set(a.sid, new Set());
    LAYERS_OF.get(a.sid).add(a.layer);
  }
  buildViews();
  S.depth = 0.2; applyLayers();
  requestAnimationFrame(frame);
  setLoading(null);
  // parámetros de prueba: ?modo=demo&vista=irrigacion&sel=a_femoral&nombres=1
  const q = new URLSearchParams(location.search);
  if (q.get('modo') === 'demo') {
    if (q.get('vista')) S.view = q.get('vista');
    if (q.get('prof')) S.depth = +q.get('prof');
    startDemo();
    if (q.get('vista')) setView(q.get('vista'));
    if (q.get('yaw')) S.yaw = (+q.get('yaw') * Math.PI) / 180;
    if (q.get('zoom')) S.dzoom = +q.get('zoom');
    if (q.get('cy')) S.dpanY = +q.get('cy');
    if (q.get('nombres') === '1') { S.names = true; $('#btnNames').setAttribute('aria-pressed', 'true'); }
    if (q.get('sel') && SID[q.get('sel')]) select(SID[q.get('sel')], 0, { reveal: true });
    if (q.get('iso') === '1' && S.sel) setIso(territoryOf(BY_SID[S.sel.sid]));
  }
  window.__mary = { S, view, select, setView, setIso, territoryOf, startDemo, applyLayers, startPhoto, ready: true };
  if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !import.meta.env.DEV) navigator.serviceWorker.register('./sw.js').catch(() => {});
}
boot();
