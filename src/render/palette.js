// Colores (sRGB) y estilo de superficie de cada estructura.
// Estilos de órgano: 1 pulmón, 2 hígado/bazo, 3 intestino, 4 corazón, 5 cerebro.
const BY_CAT = {
  hueso: '#dcd0b9', cartilago: '#b5c8d4', musculo: '#a3302a', tendon: '#d9d2c0', organo: '#cf8f7c',
  arteria: '#c8161f', vena: '#2b4fc4', nervio: '#f1cf5e', snc: '#e6b8b0',
};
const BY_ID = {
  // órganos
  corazon: ['#a82a25', 4], pulmon_der: ['#e3a0a0', 1], pulmon_izq: ['#e3a0a0', 1], higado: ['#7b2a22', 2], vesicula: ['#4c7d3c', 0],
  estomago: ['#cf8270', 0], bazo: ['#6a2440', 2], pancreas: ['#e2b38c', 0], rinones: ['#8a3328', 2], suprarrenales: ['#d6a23c', 0],
  vejiga: ['#d6a597', 0], intestino_delgado: ['#d98871', 3], duodeno: ['#d48a70', 3], colon: ['#bf7860', 3], apendice: ['#bf7860', 3],
  recto: ['#c08070', 3], esofago: ['#c27a6b', 0], traquea: ['#e6d9c6', 6], laringe: ['#e0d0b6', 0], tiroides: ['#a8473a', 2],
  ojos: ['#f1ede6', 0], ureteres: ['#d9b0a0', 0], lengua: ['#c9605a', 0], timo: ['#e6c2a0', 0], diafragma: ['#a3362c', 0],
  // sistema nervioso central
  encefalo: ['#e6b5ad', 5], cerebelo: ['#d39b93', 5], tronco_encefalico: ['#e7c3b4', 0], medula: ['#f0dfa8', 0], cola_caballo: ['#f1d98a', 0],
  // vasos con sangre poco oxigenada / muy oxigenada
  a_pulmonar: ['#3557c4', 0], v_pulmonares: ['#c8161f', 0], v_porta: ['#5a45c0', 0],
  // piel y relleno
  piel: ['#c99a7e', 0], tejido_profundo: ['#6a1d18', 0],
};
function hashTint(id) {
  let h = 2166136261; for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 1000) / 1000;
}
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16); const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const c = (x) => Math.max(0, Math.min(255, Math.round(x * f)));
  return '#' + [c(r), c(g), c(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
export function STYLE(e) {
  if (BY_ID[e.id]) return { color: BY_ID[e.id][0], style: BY_ID[e.id][1] };
  let c = BY_CAT[e.cat] || '#cccccc';
  if (e.cat === 'musculo') c = shade(c, 0.9 + hashTint(e.id) * 0.22);
  if (e.deep) c = shade(c, 0.88);
  return { color: c, style: 0 };
}
