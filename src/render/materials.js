// Materiales de Mary: PBR de Three.js con inyección de shader para skinning con visibilidad por
// hueso, color por estructura, relieve procedural (fibras, poros, pliegues), resaltado,
// modo rayos X (fantasma) y oscurecimiento por profundidad.
import * as THREE from 'three';
import { NB } from '../anatomy/canon.js';

const NOISE = /* glsl */`
vec3 m289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 m289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 perm(vec4 x){return m289(((x*34.0)+10.0)*x);}
vec4 tis(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
  i=m289(i);
  vec4 p=perm(perm(perm(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 nr=tis(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=nr.x; p1*=nr.y; p2*=nr.z; p3*=nr.w;
  vec4 m=max(0.5-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
  return 105.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
vec3 mPerturb(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection){
  vec3 vSigmaX=normalize(dFdx(surf_pos)); vec3 vSigmaY=normalize(dFdy(surf_pos)); vec3 vN=surf_norm;
  vec3 R1=cross(vSigmaY,vN); vec3 R2=cross(vN,vSigmaX);
  float fDet=dot(vSigmaX,R1)*faceDirection;
  vec3 vGrad=sign(fDet)*(dHdxy.x*R1+dHdxy.y*R2);
  return normalize(abs(fDet)*surf_norm-vGrad);
}
`;

// Uniformes compartidos por todos los materiales
export function makeShared(sidCount) {
  const n = Math.max(2, sidCount + 2);
  const state = new Uint8Array(n * 4);   // r = resaltado, g = visible, b = atenuado, a = libre
  const color = new Uint8Array(n * 4);   // rgb = color, a = estilo de superficie
  for (let i = 0; i < n; i++) { state[i * 4 + 1] = 255; color.set([200, 200, 200, 0], i * 4); }
  const stateTex = new THREE.DataTexture(state, n, 1, THREE.RGBAFormat);
  const colorTex = new THREE.DataTexture(color, n, 1, THREE.RGBAFormat);
  colorTex.colorSpace = THREE.SRGBColorSpace;
  for (const t of [stateTex, colorTex]) { t.magFilter = t.minFilter = THREE.NearestFilter; t.needsUpdate = true; }
  return {
    n, state, color, stateTex, colorTex,
    uniforms: {
      uBoneVis: { value: new Array(NB).fill(1) },
      uSidState: { value: stateTex }, uSidColor: { value: colorTex }, uSidCount: { value: n },
      uTime: { value: 0 }, uHiColor: { value: new THREE.Color('#3ce6ff') }, uFocus: { value: 0 },
      uDepth: { value: new THREE.Vector2(0, 600) }, uBump: { value: 1 },
    },
  };
}

const KINDS = { muscle: 1, bone: 2, organ: 3, vessel: 4, nerve: 5, cns: 6, skin: 7, shell: 8 };

export function makeMaterial(kind, shared, opts = {}) {
  const K = KINDS[kind];
  const params = {
    muscle: { roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.35, sheen: 0.4, sheenRoughness: 0.5, sheenColor: new THREE.Color('#ff9a8a') },
    bone: { roughness: 0.62, clearcoat: 0.1, clearcoatRoughness: 0.6 },
    organ: { roughness: 0.5, clearcoat: 0.22, clearcoatRoughness: 0.4, envMapIntensity: 0.38 },
    vessel: { roughness: 0.46, clearcoat: 0.12, clearcoatRoughness: 0.35, specularIntensity: 0.35, envMapIntensity: 0.3 },
    nerve: { roughness: 0.48, clearcoat: 0.1, clearcoatRoughness: 0.4, specularIntensity: 0.4, envMapIntensity: 0.3, sheen: 0.35, sheenColor: new THREE.Color('#fff4b0') },
    cns: { roughness: 0.45, clearcoat: 0.45, clearcoatRoughness: 0.3 },
    skin: { roughness: 0.55, clearcoat: 0.15, clearcoatRoughness: 0.5, sheen: 0.6, sheenRoughness: 0.6, sheenColor: new THREE.Color('#ffd9c4') },
    shell: { roughness: 0.5, clearcoat: 0.2, clearcoatRoughness: 0.4 },
  }[kind];
  const m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, envMapIntensity: 0.5, ...params });
  const own = { uOpacity: { value: 1 }, uGhost: { value: 0 }, uTint: { value: new THREE.Color(1, 1, 1) } };
  m.userData.uniforms = own;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, shared.uniforms, own);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float sid; attribute float aux; attribute float side;
        uniform float uBoneVis[${NB}];
        uniform sampler2D uSidState; uniform float uSidCount;
        varying float vSid; varying float vAux; varying float vVis; varying vec4 vState; varying vec3 vObj; varying vec2 vUvA; varying float vViewZ;`)
      .replace('#include <uv_vertex>', `#include <uv_vertex>
        vSid = sid; vAux = aux; vObj = position; vUvA = uv;
        vVis = uBoneVis[int(skinIndex.x + 0.5)] * skinWeight.x + uBoneVis[int(skinIndex.y + 0.5)] * skinWeight.y;
        vState = texture2D(uSidState, vec2((sid + 0.5) / uSidCount, 0.5));`)
      .replace('#include <project_vertex>', `#include <project_vertex>
        vViewZ = mvPosition.z;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        #define KIND ${K}
        uniform sampler2D uSidColor; uniform float uSidCount; uniform float uTime; uniform vec3 uHiColor; uniform float uFocus;
        uniform vec2 uDepth; uniform float uOpacity; uniform float uGhost; uniform vec3 uTint; uniform float uBump;
        varying float vSid; varying float vAux; varying float vVis; varying vec4 vState; varying vec3 vObj; varying vec2 vUvA; varying float vViewZ;
        ${NOISE}
        float hField(float style){
          #if KIND == 1
            float tend = smoothstep(0.2, 0.8, vAux);
            float fx = vUvA.x * 7.0;
            float aa = clamp(1.4 - fwidth(fx) * 3.0, 0.0, 1.0);
            float f = sin(fx * 6.2832 + snoise(vec3(vUvA.x * 4.0, vUvA.y * 0.8, 0.0)) * 2.0) * aa;
            float g = snoise(vec3(vUvA * vec2(3.0, 0.6), 1.7));
            return mix(f * 0.35 + g * 0.35, g * 0.12, tend);
          #elif KIND == 2
            return snoise(vObj * 1.6) * 0.35 + snoise(vObj * 5.5) * 0.18 + snoise(vObj * 14.0) * 0.06;
          #elif KIND == 4
            return sin(vUvA.y * 6.2832 * 2.0) * 0.06 + snoise(vObj * 3.0) * 0.12;
          #elif KIND == 5
            return sin(vUvA.x * 6.2832 * 6.0) * 0.5 + snoise(vec3(vUvA * vec2(6.0, 2.0), 0.0)) * 0.2;
          #elif KIND == 6
            float r = 1.0 - abs(snoise(vObj * 0.85 + vec3(3.1)));
            return r * r * 0.9 + snoise(vObj * 3.0) * 0.08;
          #elif KIND == 7
            return snoise(vObj * 2.5) * 0.1 + snoise(vObj * 9.0) * 0.04;
          #elif KIND == 8
            return snoise(vObj * 0.35) * 0.5 + snoise(vObj * 1.1) * 0.15;
          #else
            if (style > 0.5 && style < 1.5) return snoise(vObj * 2.2) * 0.35 + snoise(vObj * 7.0) * 0.15;   // pulmón
            if (style > 1.5 && style < 2.5) return snoise(vObj * 1.2) * 0.12 + snoise(vObj * 6.0) * 0.05;  // hígado, bazo
            if (style > 2.5 && style < 3.5) return sin(vUvA.y * 6.2832 * 1.3) * 0.12 + snoise(vObj * 4.0) * 0.06; // intestino
            if (style > 3.5 && style < 4.5) return snoise(vObj * 1.5) * 0.18 + snoise(vObj * 5.0) * 0.06; // corazón
            if (style > 4.5 && style < 5.5) { float r2 = 1.0 - abs(snoise(vObj * 0.85)); return r2 * r2 * 0.9; } // cerebro
            if (style > 5.5 && style < 6.5) return sin(vUvA.y * 6.2832 * 4.5) * 0.4; // anillos de la tráquea
            return snoise(vObj * 2.0) * 0.18 + snoise(vObj * 6.0) * 0.06;
          #endif
        }`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        if (vVis < 0.5 || vState.g < 0.5) discard;
        vec4 sc = texture2D(uSidColor, vec2((vSid + 0.5) / uSidCount, 0.5));
        float style = floor(sc.a * 255.0 + 0.5);
        float hh = hField(style);`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 base = sc.rgb * uTint;
        #if KIND == 1
          base = mix(base, vec3(0.5, 0.46, 0.41), smoothstep(0.2, 0.8, vAux) * 0.88);
          base *= 0.9 + 0.12 * clamp(hh + 0.5, 0.0, 1.0);
        #elif KIND == 2
          base = mix(base, vec3(0.50, 0.60, 0.68), step(0.75, vAux));
          base = mix(base, vec3(0.93, 0.91, 0.84), step(0.25, vAux) * step(vAux, 0.75));
          base *= 0.93 + 0.1 * hh;
        #elif KIND == 6
          base *= 0.78 + 0.3 * hh;
        #elif KIND == 3
          if (style > 4.5 && style < 5.5) base *= 0.78 + 0.3 * hh;
          if (style > 0.5 && style < 1.5) base *= 0.85 + 0.25 * (snoise(vObj * 1.3) * 0.5 + 0.5);
          if (style > 5.5 && style < 6.5) base *= 0.92 + 0.12 * hh;
          base = mix(base, vec3(0.17, 0.30, 0.40), step(0.6, vAux) * (1.0 - step(0.95, vAux)));
          base = mix(base, vec3(0.015), step(0.95, vAux));
        #endif
        // territorio: lo que inerva un nervio (amarillo), irriga una arteria (rojo) o drena una vena (azul)
        float tcode = floor(vState.b * 3.0 + 0.5);
        float tw = step(0.5, tcode);
        vec3 tcol = tcode < 1.5 ? vec3(1.0, 0.78, 0.2) : tcode < 2.5 ? vec3(1.0, 0.16, 0.2) : vec3(0.28, 0.5, 1.0);
        base = mix(base, tcol, tw * ${kind === 'muscle' || kind === 'organ' || kind === 'cns' ? '0.5' : '0.2'});
        diffuseColor.rgb = base;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        #if KIND == 1
          roughnessFactor = mix(roughnessFactor, 0.28, smoothstep(0.2, 0.8, vAux));
        #elif KIND == 2
          roughnessFactor = mix(roughnessFactor, 0.3, step(0.25, vAux));
        #endif`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          float bs = uBump * ${kind === 'muscle' ? '0.9' : kind === 'nerve' ? '0.7' : kind === 'cns' ? '1.3' : '0.6'};
          vec2 dh = vec2(dFdx(hh), dFdy(hh)) * bs;
          normal = mPerturb(-vViewPosition, normal, dh, faceDirection);
        }`)
      .replace('#include <opaque_fragment>', `
        float hi = vState.r;
        float fres = 1.0 - abs(normal.z);
        outgoingLight *= mix(1.0, 0.42, uFocus * (1.0 - step(0.02, hi)) * (1.0 - tw));
        outgoingLight += tcol * tw * (0.07 + 0.05 * sin(uTime * 3.0)) * (0.7 + 0.6 * fres);
        float dzz = clamp((uDepth.x - vViewZ) / uDepth.y, -1.0, 1.5);
        outgoingLight *= 1.0 - 0.5 * smoothstep(-0.2, 1.1, dzz);
        outgoingLight += uHiColor * hi * (0.32 + 0.18 * sin(uTime * 5.0)) * (0.6 + 0.8 * fres);
        float ga = mix(1.0, 0.05 + 0.95 * pow(fres, 1.7), uGhost);
        outgoingLight = mix(outgoingLight, outgoingLight * 0.7 + vec3(0.5, 0.6, 0.72) * 0.45 * pow(fres, 1.5), uGhost * 0.7);
        diffuseColor.a = uOpacity * ga;
        #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'mary-' + kind;
  return m;
}

// Material para el pase de selección (elige qué estructura se tocó)
export function makePickMaterial(shared) {
  return new THREE.ShaderMaterial({
    uniforms: { uBoneVis: shared.uniforms.uBoneVis, uSidState: shared.uniforms.uSidState, uSidCount: shared.uniforms.uSidCount },
    vertexShader: /* glsl */`
      #include <common>
      #include <skinning_pars_vertex>
      attribute float sid; attribute float side;
      uniform float uBoneVis[${NB}]; uniform sampler2D uSidState; uniform float uSidCount;
      varying float vId; varying float vOk;
      void main() {
        vId = sid * 2.0 + side;
        float vis = uBoneVis[int(skinIndex.x + 0.5)] * skinWeight.x + uBoneVis[int(skinIndex.y + 0.5)] * skinWeight.y;
        vec4 st = texture2D(uSidState, vec2((sid + 0.5) / uSidCount, 0.5));
        vOk = step(0.5, vis) * step(0.5, st.g);
        #include <skinbase_vertex>
        #include <begin_vertex>
        #include <skinning_vertex>
        #include <project_vertex>
      }`,
    fragmentShader: /* glsl */`
      varying float vId; varying float vOk;
      void main() {
        if (vOk < 0.5) discard;
        float id = floor(vId + 0.5);
        gl_FragColor = vec4(mod(id, 256.0) / 255.0, floor(id / 256.0) / 255.0, 1.0, 1.0);
      }`,
  });
}
