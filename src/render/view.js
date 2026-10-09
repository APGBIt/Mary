// Motor 3D de Mary: carga el modelo horneado, lo deforma con los huesos calculados a partir de la
// pose, lo compone sobre la foto (silueta, sombra interior) y resuelve qué estructura se toca.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { NB, BIND, frameMatrix, skinPoint } from '../anatomy/canon.js';
import { ATLAS } from '../anatomy/atlas.js';
import { makeShared, makeMaterial, makePickMaterial } from './materials.js';
import { STYLE } from './palette.js';

export const LAYER_KIND = { skin: 'skin', shell: 'shell', musSup: 'muscle', musDeep: 'muscle', bone: 'bone', organ: 'organ', cns: 'cns', art: 'vessel', ven: 'vessel', nerve: 'nerve' };
const ORDER = { bone: 1, organ: 2, cns: 2, art: 3, ven: 3, nerve: 3, shell: 4, musDeep: 5, musSup: 6, skin: 7 };

export async function fetchAnatomy(url, onProgress) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('No se pudo cargar el modelo (' + res.status + ')');
  const total = +res.headers.get('content-length') || 0;
  let buf;
  if (res.body && total && onProgress) {
    const reader = res.body.getReader(); const parts = []; let got = 0;
    for (;;) { const { done, value } = await reader.read(); if (done) break; parts.push(value); got += value.length; onProgress(Math.min(1, got / total)); }
    const all = new Uint8Array(got); let o = 0; for (const p of parts) { all.set(p, o); o += p.length; }
    buf = all.buffer;
  } else buf = await res.arrayBuffer();
  return gunzipIfNeeded(buf);
}
export async function gunzipIfNeeded(buf) {
  const u = new Uint8Array(buf, 0, 2);
  if (u[0] === 0x1f && u[1] === 0x8b) {
    const ds = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
    return await new Response(ds).arrayBuffer();
  }
  return buf;
}

function decodeLayer(all, base, L, H) {
  const src = new Uint8Array(all, base);
  const vb = new Uint8Array(L.nv * H.stride);
  MeshoptDecoder.decodeVertexBuffer(vb, L.nv, H.stride, src.subarray(L.vOff, L.vOff + L.vLen));
  const ib = new Uint8Array(L.ni * 4);
  MeshoptDecoder.decodeIndexBuffer(ib, L.ni, 4, src.subarray(L.iOff, L.iOff + L.iLen));
  const dv = new DataView(vb.buffer);
  const n = L.nv;
  const pos = new Float32Array(n * 3), nrm = new Int8Array(n * 3), uv = new Float32Array(n * 2);
  const si = new Uint8Array(n * 4), sw = new Uint8Array(n * 4), sid = new Uint16Array(n), aux = new Uint8Array(n), side = new Uint8Array(n);
  const pq = 1 / H.posQ, uq = 1 / H.uvQ;
  for (let i = 0; i < n; i++) {
    const o = i * H.stride;
    pos[i * 3] = dv.getInt16(o, true) * pq; pos[i * 3 + 1] = dv.getInt16(o + 2, true) * pq; pos[i * 3 + 2] = dv.getInt16(o + 4, true) * pq;
    nrm[i * 3] = dv.getInt8(o + 8); nrm[i * 3 + 1] = dv.getInt8(o + 9); nrm[i * 3 + 2] = dv.getInt8(o + 10);
    aux[i] = dv.getUint8(o + 11);
    uv[i * 2] = dv.getInt16(o + 12, true) * uq; uv[i * 2 + 1] = dv.getInt16(o + 14, true) * uq;
    si[i * 4] = dv.getUint8(o + 16); si[i * 4 + 1] = dv.getUint8(o + 17);
    const w = dv.getUint8(o + 18); sw[i * 4] = w; sw[i * 4 + 1] = 255 - w;
    side[i] = dv.getUint8(o + 19); sid[i] = dv.getUint16(o + 20, true);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3, true));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4, true));
  g.setAttribute('sid', new THREE.BufferAttribute(sid, 1));
  g.setAttribute('aux', new THREE.BufferAttribute(aux, 1, true));
  g.setAttribute('side', new THREE.BufferAttribute(side, 1));
  g.setIndex(new THREE.BufferAttribute(new Uint32Array(ib.buffer), 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  return g;
}

const COMPOSITE_FS = /* glsl */`
  uniform sampler2D tPhoto; uniform sampler2D tMask; uniform sampler2D tMaskBlur; uniform sampler2D t3D;
  uniform vec4 uImgRect; uniform float uHasPhoto; uniform float uDark; uniform float uClip; uniform float uExposure;
  uniform vec3 uBg1; uniform vec3 uBg2; uniform float uFatRim;
  varying vec2 vUv;
  vec3 aces(vec3 x){ x *= uExposure; return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }
  vec3 toSRGB(vec3 c){ c = clamp(c, 0.0, 1.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
  void main(){
    vec2 iuv = (vUv - uImgRect.xy) / uImgRect.zw;
    float inside = step(0.0, iuv.x) * step(iuv.x, 1.0) * step(0.0, iuv.y) * step(iuv.y, 1.0);
    vec3 bg = mix(uBg1, uBg2, smoothstep(0.0, 1.0, vUv.y));
    vec3 col = bg;
    float m = 0.0, mb = 0.0;
    if (uHasPhoto > 0.5 && inside > 0.5) {
      col = texture2D(tPhoto, iuv).rgb;
      m = texture2D(tMask, iuv).r;
      mb = texture2D(tMaskBlur, iuv).r;
      float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
      vec3 dark = mix(vec3(lum) * 0.16, col * 0.2, 0.5) + vec3(0.012, 0.004, 0.004);
      col = mix(col, dark, uDark * smoothstep(0.2, 0.6, m));
    }
    vec4 a = texture2D(t3D, vUv);
    if (a.a > 0.0) {
      vec3 c3 = aces(a.rgb / max(a.a, 1e-4));
      float clip = mix(1.0, smoothstep(0.25, 0.6, m), uClip);
      float edge = clamp((1.0 - mb) * 1.6, 0.0, 1.0) * smoothstep(0.3, 0.6, m);
      c3 *= 1.0 - 0.7 * smoothstep(0.0, 0.9, edge) * uClip;
      col = mix(col, c3, clamp(a.a, 0.0, 1.0) * clip);
    }
    // borde de piel cortada (capa de grasa) alrededor de la ventana
    if (uFatRim > 0.0 && uHasPhoto > 0.5) {
      float rim = smoothstep(0.35, 0.5, m) * (1.0 - smoothstep(0.5, 0.68, m));
      col = mix(col, vec3(0.62, 0.42, 0.18), rim * uFatRim * 0.55);
    }
    gl_FragColor = vec4(toSRGB(col), 1.0);
  }`;

export class AnatomyView {
  constructor(canvas) {
    this.canvas = canvas;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    r.setClearColor(0x000000, 0);
    r.autoClear = true;
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(0, 1, 0, -1, 1, 40000);
    this.camera.position.set(0, 0, 20000);
    const pm = new THREE.PMREMGenerator(r);
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    pm.dispose();
    this.scene.add(new THREE.HemisphereLight(0xfff1e6, 0x2a3140, 0.35));
    const key = new THREE.DirectionalLight(0xfff4ea, 2.5); key.position.set(-0.55, 0.75, 1.0); this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xd8e6ff, 0.7); fill.position.set(0.8, 0.1, 0.7); this.scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffe2d0, 1.4); rim.position.set(0.2, 0.5, -1.0); this.scene.add(rim);
    const rim2 = new THREE.DirectionalLight(0xc8dcff, 0.9); rim2.position.set(-0.6, -0.2, -0.8); this.scene.add(rim2);
    this.bones = []; for (let i = 0; i < NB; i++) { const b = new THREE.Bone(); b.matrixAutoUpdate = false; b.matrixWorldAutoUpdate = false; this.bones.push(b); }
    this.skeleton = new THREE.Skeleton(this.bones, BIND.map((f) => new THREE.Matrix4().fromArray(frameMatrix(f)).invert()));
    this.layers = {};
    this.shared = makeShared(ATLAS.length);
    this.pickMat = makePickMaterial(this.shared);
    this.anchors = [];
    // composición
    this.rt3d = null;
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.compMat = new THREE.ShaderMaterial({
      uniforms: {
        tPhoto: { value: null }, tMask: { value: null }, tMaskBlur: { value: null }, t3D: { value: null },
        uImgRect: { value: new THREE.Vector4(0, 0, 1, 1) }, uHasPhoto: { value: 0 }, uDark: { value: 0 }, uClip: { value: 0 },
        uExposure: { value: 1.05 }, uBg1: { value: new THREE.Color('#05070b') }, uBg2: { value: new THREE.Color('#1b2230') }, uFatRim: { value: 0 },
      },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: COMPOSITE_FS, depthTest: false, depthWrite: false,
    });
    this.compScene = new THREE.Scene();
    this.compScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.compMat));
    this.blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); this.blank.needsUpdate = true;
    this.compMat.uniforms.tPhoto.value = this.blank; this.compMat.uniforms.tMask.value = this.blank; this.compMat.uniforms.tMaskBlur.value = this.blank;
    this.view = { x0: 0, y0: 0, x1: 1, y1: 1 }; // región visible en coordenadas de imagen (px, y hacia abajo)
    this.imgW = 1; this.imgH = 1;
    this.F = null;
    this.t0 = performance.now();
  }

  build(buf) {
    const dv = new DataView(buf);
    const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
    if (magic !== 'MARY') throw new Error('Archivo de modelo no válido');
    const hl = dv.getUint32(4, true);
    const H = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, hl)).trim());
    const base = 8 + hl;
    for (const L of H.layers) {
      const g = decodeLayer(buf, base, L, H);
      const kind = LAYER_KIND[L.name];
      const mat = makeMaterial(kind, this.shared);
      const mesh = new THREE.SkinnedMesh(g, mat);
      mesh.bind(this.skeleton, new THREE.Matrix4());
      mesh.frustumCulled = false;
      mesh.renderOrder = ORDER[L.name] || 0;
      mesh.name = L.name;
      this.scene.add(mesh);
      this.layers[L.name] = { mesh, mat, opacity: 1, ghost: 0, kind };
    }
    this.anchors = H.anchors;
    this.header = H;
    this.applyPalette();
  }

  applyPalette() {
    const { color } = this.shared;
    for (const e of ATLAS) {
      const st = STYLE(e);
      const c = new THREE.Color(st.color);
      color.set([Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255), st.style || 0], e.sid * 4);
    }
    this.shared.colorTex.needsUpdate = true;
  }

  // Estado por estructura: visible / resaltada / atenuada
  setStructureState(fn) {
    const { state } = this.shared;
    for (const e of ATLAS) { const s = fn(e) || {}; state[e.sid * 4] = s.hi ? 255 : 0; state[e.sid * 4 + 1] = s.hidden ? 0 : 255; }
    this.shared.stateTex.needsUpdate = true;
  }

  setLayer(name, opacity, ghost = 0) {
    const L = this.layers[name]; if (!L) return;
    L.opacity = opacity; L.ghost = ghost;
    const u = L.mat.userData.uniforms;
    u.uOpacity.value = opacity; u.uGhost.value = ghost;
    L.mesh.visible = opacity > 0.01;
    const transp = opacity < 0.999 || ghost > 0.001;
    if (L.mat.transparent !== transp) { L.mat.transparent = transp; L.mat.needsUpdate = true; }
    L.mat.depthWrite = !transp || (ghost < 0.01 && opacity > 0.6);
  }

  setFrames(F, boneVis) {
    this.F = F;
    const m = new Array(16);
    for (let i = 0; i < NB; i++) { this.bones[i].matrixWorld.fromArray(frameMatrix(F[i], m)); }
    const bv = this.shared.uniforms.uBoneVis.value;
    for (let i = 0; i < NB; i++) bv[i] = boneVis ? boneVis[i] : 1;
    // profundidad de referencia: centro del tronco
    const c = F[0].o, s = F[0].sz;
    this.shared.uniforms.uDepth.value.set(c[2] - this.camera.position.z, 22 * s);
  }

  setImageSize(w, h) { this.imgW = w; this.imgH = h; }
  setView(x0, y0, x1, y1) { this.view = { x0, y0, x1, y1 }; }

  setPhoto(tex) { const u = this.compMat.uniforms; u.tPhoto.value = tex || this.blank; u.uHasPhoto.value = tex ? 1 : 0; }
  setMask(tex, blurTex) { const u = this.compMat.uniforms; u.tMask.value = tex || this.blank; u.tMaskBlur.value = blurTex || tex || this.blank; }
  setComposite(o) { const u = this.compMat.uniforms; for (const k in o) if (u[k]) u[k].value = o[k]; }

  resize(w, h, dpr) {
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    const W = Math.round(w * dpr), Hh = Math.round(h * dpr);
    if (!this.rt3d || this.rt3d.width !== W || this.rt3d.height !== Hh) {
      this.rt3d?.dispose();
      const ex = this.renderer.extensions;
      const half = ex.has('EXT_color_buffer_half_float') || ex.has('EXT_color_buffer_float');
      this.rt3d = new THREE.WebGLRenderTarget(W, Hh, { type: half ? THREE.HalfFloatType : THREE.UnsignedByteType, samples: this.samples ?? 4, depthBuffer: true });
    }
    this.cssW = w; this.cssH = h;
  }

  updateCamera() {
    const v = this.view, c = this.camera;
    c.left = v.x0; c.right = v.x1; c.top = -v.y0; c.bottom = -v.y1;
    c.updateProjectionMatrix();
    // rectángulo de la imagen dentro de la pantalla, en uv de pantalla (y hacia arriba)
    const ux0 = (0 - v.x0) / (v.x1 - v.x0), ux1 = (this.imgW - v.x0) / (v.x1 - v.x0);
    const uy0 = 1 - (this.imgH - v.y0) / (v.y1 - v.y0), uy1 = 1 - (0 - v.y0) / (v.y1 - v.y0);
    this.compMat.uniforms.uImgRect.value.set(ux0, uy0, ux1 - ux0, uy1 - uy0);
  }

  render() {
    if (!this.rt3d) return;
    this.shared.uniforms.uTime.value = (performance.now() - this.t0) / 1000;
    this.updateCamera();
    const r = this.renderer;
    r.setRenderTarget(this.rt3d);
    r.setClearColor(0x000000, 0); r.clear();
    if (!this.hide3D) r.render(this.scene, this.camera);
    r.setRenderTarget(null);
    this.compMat.uniforms.t3D.value = this.rt3d.texture;
    r.render(this.compScene, this.quadCam);
  }

  // Devuelve {sid, side} de la estructura bajo el punto (coordenadas CSS del lienzo)
  pick(cx, cy, radiusCss = 14) {
    if (!this.rt3d) return null;
    const r = this.renderer, dpr = r.getPixelRatio();
    const W = Math.round(this.cssW * dpr), H = Math.round(this.cssH * dpr);
    const R = Math.max(4, Math.round(radiusCss * dpr)), S = R * 2 + 1;
    if (!this.pickRT || this.pickRT.width !== S) { this.pickRT?.dispose(); this.pickRT = new THREE.WebGLRenderTarget(S, S); }
    const px = Math.round(cx * dpr), py = Math.round(cy * dpr);
    this.updateCamera();
    this.camera.setViewOffset(W, H, px - R, py - R, S, S);
    const saved = [];
    for (const k in this.layers) { const L = this.layers[k]; saved.push([L.mesh, L.mesh.visible]); L.mesh.visible = L.mesh.visible && L.opacity >= 0.35 && L.ghost < 0.5; }
    this.scene.overrideMaterial = this.pickMat;
    r.setRenderTarget(this.pickRT); r.setClearColor(0x000000, 0); r.clear(); r.render(this.scene, this.camera);
    const buf = new Uint8Array(S * S * 4);
    r.readRenderTargetPixels(this.pickRT, 0, 0, S, S, buf);
    r.setRenderTarget(null);
    this.scene.overrideMaterial = null;
    for (const [m, v] of saved) m.visible = v;
    this.camera.clearViewOffset();
    let best = null, bd = 1e9;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const o = (y * S + x) * 4; if (buf[o + 2] === 0) continue;
      const d = (x - R) ** 2 + (y - R) ** 2;
      if (d < bd) { bd = d; const id = buf[o] + buf[o + 1] * 256; best = { sid: id >> 1, side: id & 1 }; }
    }
    return best;
  }

  // Pase de selección de toda la pantalla a baja resolución (para colocar etiquetas visibles).
  // Devuelve {buf, W, H, scale}; la fila 0 del búfer es la parte de abajo de la pantalla.
  pickAll(scale = 0.33) {
    if (!this.rt3d) return null;
    const r = this.renderer;
    const W = Math.max(8, Math.round(this.cssW * scale)), H = Math.max(8, Math.round(this.cssH * scale));
    if (!this.pickAllRT || this.pickAllRT.width !== W || this.pickAllRT.height !== H) { this.pickAllRT?.dispose(); this.pickAllRT = new THREE.WebGLRenderTarget(W, H); }
    this.updateCamera();
    const saved = [];
    for (const k in this.layers) { const L = this.layers[k]; saved.push([L.mesh, L.mesh.visible]); L.mesh.visible = L.mesh.visible && L.opacity >= 0.35 && L.ghost < 0.5; }
    this.scene.overrideMaterial = this.pickMat;
    r.setRenderTarget(this.pickAllRT); r.setClearColor(0x000000, 0); r.clear(); r.render(this.scene, this.camera);
    const buf = new Uint8Array(W * H * 4);
    r.readRenderTargetPixels(this.pickAllRT, 0, 0, W, H, buf);
    r.setRenderTarget(null);
    this.scene.overrideMaterial = null;
    for (const [m, v] of saved) m.visible = v;
    return { buf, W, H, scale };
  }

  // Proyecta un ancla (punto canónico + pesos) a coordenadas CSS del lienzo
  project(p, w) {
    if (!this.F) return null;
    const q = skinPoint(this.F, p, w);
    const v = this.view;
    return { x: ((q[0] - v.x0) / (v.x1 - v.x0)) * this.cssW, y: ((-q[1] - v.y0) / (v.y1 - v.y0)) * this.cssH, z: q[2] };
  }
}
