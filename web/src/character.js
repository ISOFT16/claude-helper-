// Character customization: body proportions, colours, clothes, face, hair/hats and accessories.
// Everything is built from smooth primitives and procedurally drawn textures.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { material } from './textures.js';

export const OPTIONS = {
  pattern: [['none', 'Однотонная'], ['stripes', 'Полоски'], ['checker', 'Клетка'], ['camo', 'Камуфляж'], ['dots', 'Горошек'], ['sport', 'Спортивная']],
  eyes: [['dots', 'Точки'], ['round', 'Круглые'], ['happy', 'Весёлые'], ['angry', 'Сердитые'], ['sleepy', 'Сонные'], ['wink', 'Подмигивание'], ['visor', 'Визор']],
  mouth: [['smile', 'Улыбка'], ['grin', 'Широкая улыбка'], ['line', 'Спокойный'], ['open', 'Удивление'], ['frown', 'Грусть'], ['none', 'Без рта']],
  hair: [['none', 'Нет'], ['short', 'Короткие'], ['long', 'Длинные'], ['mohawk', 'Ирокез'], ['curly', 'Кудрявые'], ['bun', 'Пучок']],
  hat: [['none', 'Нет'], ['cap', 'Кепка'], ['beanie', 'Шапка'], ['helmet', 'Шлем'], ['tophat', 'Цилиндр'], ['cowboy', 'Ковбойская шляпа'], ['crown', 'Корона'], ['headband', 'Повязка']],
  acc: [['glasses', 'Очки'], ['headphones', 'Наушники'], ['backpack', 'Рюкзак'], ['cape', 'Плащ'], ['tie', 'Галстук'], ['scarf', 'Шарф']],
};
export const SKIN_TONES = ['#f6d7bd', '#eec39a', '#d9a37a', '#b9805a', '#8d5a3b', '#5e3a26', '#e0b84a', '#9aa7b5', '#7fd17a', '#7fb3ff'];
export const PALETTE = ['#f2f2f2', '#2a2a2a', '#d23b33', '#ff8a2a', '#f2c230', '#46b04a', '#2fb5a8', '#3f8fe8', '#3a4fb8', '#8c4fd0', '#e65c9c', '#7a4a2a', '#5a6470', '#c0c6cc'];

export const DEFAULT_AVATAR = {
  v: 1, height: 1, width: 1, head: 1, limbs: 1,
  skin: '#eec39a', shirt: '#3f8fe8', pattern: 'none', pants: '#2d3640', shoes: '#2a2a2a',
  eyes: 'round', mouth: 'smile', cheeks: false,
  hair: 'short', hairColor: '#4a2e18', hat: 'none', hatColor: '#d23b33',
  acc: [], accColor: '#2a2a2a', shirtImg: null,
};

const HEX = /^#[0-9a-f]{6}$/i;
const inList = (v, list, d) => (list.some(o => o[0] === v) ? v : d);
const num = (v, lo, hi, d) => (typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
// Validate data (also used for avatars received from other players)
export function sanitizeAvatar(a) {
  const d = DEFAULT_AVATAR;
  if (!a || typeof a !== 'object') return { ...d };
  const col = (v, dv) => (typeof v === 'string' && HEX.test(v) ? v : dv);
  return {
    v: 1,
    height: num(a.height, 0.8, 1.2, 1), width: num(a.width, 0.8, 1.3, 1), head: num(a.head, 0.8, 1.4, 1), limbs: num(a.limbs, 0.85, 1.2, 1),
    skin: col(a.skin, d.skin), shirt: col(a.shirt, d.shirt), pants: col(a.pants, d.pants), shoes: col(a.shoes, d.shoes),
    pattern: inList(a.pattern, OPTIONS.pattern, 'none'), eyes: inList(a.eyes, OPTIONS.eyes, 'round'), mouth: inList(a.mouth, OPTIONS.mouth, 'smile'),
    cheeks: !!a.cheeks,
    hair: inList(a.hair, OPTIONS.hair, 'short'), hairColor: col(a.hairColor, d.hairColor),
    hat: inList(a.hat, OPTIONS.hat, 'none'), hatColor: col(a.hatColor, d.hatColor),
    acc: Array.isArray(a.acc) ? [...new Set(a.acc.filter(x => OPTIONS.acc.some(o => o[0] === x)))] : [],
    accColor: col(a.accColor, d.accColor),
    shirtImg: typeof a.shirtImg === 'string' && /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(a.shirtImg) && a.shirtImg.length < 90000 ? a.shirtImg : null,
  };
}

export function randomAvatar() {
  const pick = l => l[Math.floor(Math.random() * l.length)];
  const acc = OPTIONS.acc.filter(() => Math.random() < 0.2).map(o => o[0]);
  return sanitizeAvatar({
    height: 0.9 + Math.random() * 0.2, width: 0.9 + Math.random() * 0.25, head: 0.95 + Math.random() * 0.2, limbs: 0.95 + Math.random() * 0.1,
    skin: pick(SKIN_TONES), shirt: pick(PALETTE), pattern: pick(OPTIONS.pattern)[0], pants: pick(PALETTE), shoes: pick(PALETTE),
    eyes: pick(OPTIONS.eyes)[0], mouth: pick(OPTIONS.mouth)[0], cheeks: Math.random() < 0.3,
    hair: pick(OPTIONS.hair)[0], hairColor: pick(['#2a1a10', '#4a2e18', '#8a5a2a', '#d8b060', '#c04020', '#202020', '#e0e0e0', pick(PALETTE)]),
    hat: Math.random() < 0.5 ? 'none' : pick(OPTIONS.hat)[0], hatColor: pick(PALETTE), acc, accColor: pick(PALETTE),
  });
}

// ---------- geometry helpers ----------
const gc = new Map();
const cg = (k, f) => { if (!gc.has(k)) gc.set(k, f()); return gc.get(k); };
const sphereG = (r, ...a) => cg(`s${r}|${a.join()}`, () => new THREE.SphereGeometry(r, 32, 22, ...a));
const capsuleG = (r, l) => cg(`c${r}|${l}`, () => new THREE.CapsuleGeometry(r, l, 8, 20));
const cylG = (rt, rb, h, open = false) => cg(`y${rt}|${rb}|${h}|${open}`, () => new THREE.CylinderGeometry(rt, rb, h, 32, 1, open));
const torusG = (R, r, arc = Math.PI * 2) => cg(`t${R}|${r}|${arc}`, () => new THREE.TorusGeometry(R, r, 12, 40, arc));
const rboxG = (w, h, d, r) => cg(`b${w}|${h}|${d}|${r}`, () => new RoundedBoxGeometry(w, h, d, 3, r));
const coneG = (r, h) => cg(`k${r}|${h}`, () => new THREE.ConeGeometry(r, h, 16));
const latheG = (k, pts) => cg('l' + k, () => new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), 40));

function mesh(geo, mat, pos = [0, 0, 0], rot = null, scale = null) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...pos);
  if (rot) m.rotation.set(...rot);
  if (scale) m.scale.set(...scale);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// ---------- materials & textures ----------
const texCache = new Map();
function canvasTex(key, w, h, draw, repeat = false) {
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  texCache.set(key, t);
  return t;
}

function shade(hex, k) { const c = new THREE.Color(hex); c.multiplyScalar(k); return '#' + c.getHexString(); }

function patternTex(pattern, color) {
  return canvasTex(`pat${pattern}${color}`, 128, 128, (g, w) => {
    g.fillStyle = color; g.fillRect(0, 0, w, w);
    const light = shade(color, 1.45), dark = shade(color, 0.6);
    if (pattern === 'stripes') { g.fillStyle = '#f4f4f4'; for (let y = 0; y < w; y += 32) g.fillRect(0, y, w, 12); }
    else if (pattern === 'checker') { g.fillStyle = dark; for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if ((x + y) % 2) g.fillRect(x * 32, y * 32, 32, 32); g.fillStyle = 'rgba(255,255,255,0.15)'; for (let i = 0; i < 4; i++) { g.fillRect(i * 32 + 14, 0, 4, w); g.fillRect(0, i * 32 + 14, w, 4); } }
    else if (pattern === 'camo') { const cols = [dark, light, shade(color, 0.35)]; for (let i = 0; i < 26; i++) { g.fillStyle = cols[i % 3]; g.beginPath(); const x = (i * 53) % w, y = (i * 37) % w; g.ellipse(x, y, 10 + (i * 7) % 16, 6 + (i * 5) % 10, i, 0, 7); g.fill(); g.beginPath(); g.ellipse(x - w, y, 10 + (i * 7) % 16, 6 + (i * 5) % 10, i, 0, 7); g.fill(); g.beginPath(); g.ellipse(x, y - w, 10 + (i * 7) % 16, 6 + (i * 5) % 10, i, 0, 7); g.fill(); } }
    else if (pattern === 'dots') { g.fillStyle = '#f4f4f4'; for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { g.beginPath(); g.arc(x * 32 + (y % 2 ? 16 : 0) + 8, y * 32 + 16, 6, 0, 7); g.fill(); } }
    else if (pattern === 'sport') { g.fillStyle = '#f4f4f4'; g.fillRect(0, 54, w, 8); g.fillRect(0, 70, w, 8); g.fillStyle = dark; g.fillRect(0, 62, w, 8); }
  }, true);
}

function faceTex(eyes, mouth, cheeks) {
  return canvasTex(`face${eyes}${mouth}${cheeks}`, 256, 256, (g, w) => {
    g.clearRect(0, 0, w, w);
    g.lineCap = 'round'; g.lineJoin = 'round';
    const ex = [96, 160], ey = 108;
    g.fillStyle = '#1b1b1b'; g.strokeStyle = '#1b1b1b'; g.lineWidth = 8;
    if (eyes === 'dots') ex.forEach(x => { g.beginPath(); g.arc(x, ey, 10, 0, 7); g.fill(); });
    else if (eyes === 'round') ex.forEach(x => { g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(x, ey, 18, 22, 0, 0, 7); g.fill(); g.fillStyle = '#2b4a6a'; g.beginPath(); g.arc(x + 2, ey + 3, 10, 0, 7); g.fill(); g.fillStyle = '#111'; g.beginPath(); g.arc(x + 2, ey + 3, 5, 0, 7); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(x + 6, ey - 2, 3, 0, 7); g.fill(); });
    else if (eyes === 'happy') ex.forEach(x => { g.beginPath(); g.arc(x, ey + 8, 14, Math.PI * 1.15, Math.PI * 1.85); g.stroke(); });
    else if (eyes === 'angry') ex.forEach((x, i) => { g.beginPath(); g.arc(x, ey + 4, 9, 0, 7); g.fill(); g.beginPath(); const s = i ? -1 : 1; g.moveTo(x - 18 * s, ey - 22); g.lineTo(x + 14 * s, ey - 10); g.stroke(); });
    else if (eyes === 'sleepy') ex.forEach(x => { g.beginPath(); g.moveTo(x - 15, ey + 2); g.quadraticCurveTo(x, ey + 12, x + 15, ey + 2); g.stroke(); });
    else if (eyes === 'wink') { g.beginPath(); g.arc(ex[0], ey, 10, 0, 7); g.fill(); g.beginPath(); g.moveTo(ex[1] - 14, ey); g.lineTo(ex[1] + 14, ey - 4); g.stroke(); }
    else if (eyes === 'visor') { const gr = g.createLinearGradient(60, 0, 196, 0); gr.addColorStop(0, '#0c6b8a'); gr.addColorStop(0.5, '#4fe0ff'); gr.addColorStop(1, '#0c6b8a'); g.fillStyle = gr; g.beginPath(); g.roundRect ? g.roundRect(62, ey - 16, 132, 32, 14) : g.rect(62, ey - 16, 132, 32); g.fill(); }
    if (cheeks) { g.fillStyle = 'rgba(240,90,90,0.35)'; [[74, 150], [182, 150]].forEach(([x, y]) => { g.beginPath(); g.ellipse(x, y, 18, 11, 0, 0, 7); g.fill(); }); }
    const my = 172;
    g.strokeStyle = '#3a1a14'; g.lineWidth = 7;
    if (mouth === 'smile') { g.beginPath(); g.arc(128, my - 20, 30, Math.PI * 0.2, Math.PI * 0.8); g.stroke(); }
    else if (mouth === 'grin') { g.fillStyle = '#4a1a14'; g.beginPath(); g.moveTo(92, my - 8); g.quadraticCurveTo(128, my + 40, 164, my - 8); g.closePath(); g.fill(); g.fillStyle = '#fff'; g.fillRect(100, my - 8, 56, 9); }
    else if (mouth === 'line') { g.beginPath(); g.moveTo(108, my); g.lineTo(148, my); g.stroke(); }
    else if (mouth === 'open') { g.fillStyle = '#4a1a14'; g.beginPath(); g.ellipse(128, my, 13, 17, 0, 0, 7); g.fill(); }
    else if (mouth === 'frown') { g.beginPath(); g.arc(128, my + 26, 26, Math.PI * 1.25, Math.PI * 1.75); g.stroke(); }
  });
}

const matCache = new Map();
function mat(key, make) { if (!matCache.has(key)) matCache.set(key, make()); return matCache.get(key); }
const skinMat = c => mat('skin' + c, () => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.55, sheen: 0.3, sheenColor: new THREE.Color(0xffd0c0) }));
const fabricNormal = () => material('fabric').normalMap;
function clothMat(color, pattern, img) {
  if (img) return mat('img' + img.length + img.slice(-40), () => {
    const t = new THREE.TextureLoader().load(img); t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.85, normalMap: fabricNormal() });
  });
  return mat(`cloth${color}${pattern}`, () => new THREE.MeshStandardMaterial({ map: patternTex(pattern, color), roughness: 0.88, normalMap: fabricNormal() }));
}
const plainMat = (c, rough = 0.6, metal = 0) => mat(`p${c}${rough}${metal}`, () => new THREE.MeshPhysicalMaterial({ color: c, roughness: rough, metalness: metal, clearcoat: metal ? 0 : 0.2 }));
const hairMat = c => mat('hair' + c, () => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.5, sheen: 1, sheenColor: new THREE.Color(c).lerp(new THREE.Color(0xffffff), 0.4), sheenRoughness: 0.4 }));

// ---------- builder ----------
// Returns { group, head, armL, armR, legL, legR, hand } with front facing +Z, feet at y = 0
export function buildCharacter(cfgIn) {
  const c = sanitizeAvatar(cfgIn);
  const W = c.width, L = c.limbs;
  const root = new THREE.Group();
  const g = new THREE.Group();
  g.scale.setScalar(0.93 * c.height);
  root.add(g);
  const skin = skinMat(c.skin);
  const shirt = clothMat(c.shirt, c.pattern, c.shirtImg);
  const pants = clothMat(c.pants, 'none', null);
  const shoes = plainMat(c.shoes, 0.45);
  const hipY = 0.78 * L;

  // legs
  const leg = (sx) => {
    const piv = new THREE.Group(); piv.position.set(sx * 0.14 * W, hipY, 0);
    const l = new THREE.Group(); l.scale.y = L; piv.add(l);
    l.add(mesh(capsuleG(0.1, 0.24), pants, [0, -0.19, 0]));
    l.add(mesh(sphereG(0.09), pants, [0, -0.39, 0]));
    l.add(mesh(capsuleG(0.08, 0.22), pants, [0, -0.57, 0]));
    const foot = mesh(rboxG(0.16, 0.1, 0.3, 0.045), shoes, [0, -0.74, 0.05]);
    foot.scale.y = 1 / L;
    l.add(foot);
    g.add(piv);
    return piv;
  };
  const legL = leg(-1), legR = leg(1);

  // torso
  const torso = new THREE.Group(); torso.position.y = hipY; torso.scale.x = W; g.add(torso);
  torso.add(mesh(sphereG(0.2), pants, [0, 0.05, 0], null, [1.25, 0.62, 0.85]));
  torso.add(mesh(capsuleG(0.17, 0.12), shirt, [0, 0.27, 0], null, [1.05, 1, 0.8]));
  torso.add(mesh(sphereG(0.3), shirt, [0, 0.5, 0], null, [1.12, 0.88, 0.66]));
  for (const sx of [-1, 1]) torso.add(mesh(sphereG(0.095), shirt, [sx * 0.36, 0.64, 0]));
  torso.add(mesh(cylG(0.065, 0.075, 0.12), skin, [0, 0.79, 0]));

  // arms
  let hand = null;
  const arm = (sx) => {
    const piv = new THREE.Group(); piv.position.set(sx * 0.41 * W, hipY + 0.66, 0);
    const a = new THREE.Group(); a.scale.y = L; piv.add(a);
    a.add(mesh(capsuleG(0.075, 0.2), shirt, [0, -0.15, 0]));
    a.add(mesh(sphereG(0.068), skin, [0, -0.32, 0]));
    a.add(mesh(capsuleG(0.062, 0.2), skin, [0, -0.47, 0]));
    const h = mesh(sphereG(0.066), skin, [0, -0.66, 0.01], null, [0.8, 1.15, 0.6]);
    a.add(h);
    if (sx > 0) hand = h;
    g.add(piv);
    return piv;
  };
  const armL = arm(-1), armR = arm(1);

  // head
  const head = new THREE.Group(); head.position.set(0, hipY + 0.85, 0); g.add(head);
  const hg = new THREE.Group(); hg.scale.setScalar(c.head); head.add(hg);
  const HC = [0, 0.2, 0];
  hg.add(mesh(sphereG(0.2), skin, HC, null, [0.95, 1.08, 1]));
  for (const sx of [-1, 1]) hg.add(mesh(sphereG(0.045), skin, [sx * 0.19, 0.2, 0], null, [0.5, 1, 0.8]));
  hg.add(mesh(sphereG(0.032), skin, [0, 0.18, 0.195], null, [0.9, 1.1, 1]));   // nose
  const face = new THREE.Mesh(
    cg('facegeo', () => new THREE.SphereGeometry(0.2025, 32, 20, Math.PI / 2 - 0.95, 1.9, 0.75, 1.25)),
    new THREE.MeshStandardMaterial({ map: faceTex(c.eyes, c.mouth, c.cheeks), transparent: true, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2 }),
  );
  face.position.set(...HC); face.scale.set(0.95, 1.08, 1);
  hg.add(face);

  // hair
  const hm = hairMat(c.hairColor);
  const cap = (r, thetaLen = Math.PI * 0.45) => cg(`cap${r}|${thetaLen}`, () => new THREE.SphereGeometry(r, 32, 16, 0, Math.PI * 2, 0, thetaLen));
  const hairHidden = c.hat === 'helmet' || c.hat === 'tophat' || c.hat === 'beanie';
  if (!hairHidden) {
    if (c.hair === 'short' || c.hair === 'long' || c.hair === 'bun') {
      hg.add(mesh(cap(0.214), hm, [0, 0.215, -0.012], [-0.25, 0, 0], [0.97, 1.08, 1.02]));
    }
    if (c.hair === 'long') hg.add(mesh(capsuleG(0.15, 0.22), hm, [0, 0.07, -0.1], [0.12, 0, 0], [1.25, 1, 0.55]));
    if (c.hair === 'bun') hg.add(mesh(sphereG(0.085), hm, [0, 0.4, -0.12]));
    if (c.hair === 'mohawk') for (let i = 0; i < 6; i++) hg.add(mesh(coneG(0.04, 0.16), hm, [0, 0.38 - Math.abs(i - 2.5) * 0.015, 0.13 - i * 0.055], [-0.4 + i * 0.16, 0, 0]));
    if (c.hair === 'curly') for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2 * 3, t = 0.15 + (i / 22) * 0.7;
      hg.add(mesh(sphereG(0.06), hm, [Math.cos(a) * 0.19 * Math.sin(t * 1.6), 0.2 + Math.cos(t * 1.6) * 0.21, Math.sin(a) * 0.19 * Math.sin(t * 1.6) - 0.02]));
    }
  }

  // hats
  const hatM = plainMat(c.hatColor, 0.55);
  if (c.hat === 'cap') {
    hg.add(mesh(cap(0.218, Math.PI * 0.5), hatM, [0, 0.215, -0.01], [-0.15, 0, 0]));
    hg.add(mesh(cg('visor', () => new THREE.CylinderGeometry(0.17, 0.17, 0.018, 32, 1, false, -Math.PI / 2 - 0.9, 1.8)), hatM, [0, 0.27, 0.1], [0.12, 0, 0], [1, 1, 1.25]));
  } else if (c.hat === 'beanie') {
    hg.add(mesh(cap(0.222, Math.PI * 0.55), hatM, [0, 0.22, -0.01], [-0.12, 0, 0], [1, 1.12, 1]));
    hg.add(mesh(torusG(0.205, 0.032), hatM, [0, 0.245, 0], [Math.PI / 2 - 0.12, 0, 0]));
    hg.add(mesh(sphereG(0.06), plainMat('#f2f2f2', 0.9), [0, 0.47, -0.03]));
  } else if (c.hat === 'helmet') {
    const hmat = plainMat(c.hatColor, 0.25);
    hg.add(mesh(cap(0.24, Math.PI * 0.55), hmat, [0, 0.2, -0.01], [-0.1, 0, 0], [1, 1.05, 1.05]));
    hg.add(mesh(torusG(0.235, 0.018), hmat, [0, 0.165, -0.01], [Math.PI / 2 - 0.1, 0, 0]));
  } else if (c.hat === 'tophat') {
    hg.add(mesh(cylG(0.17, 0.165, 0.3), hatM, [0, 0.52, 0]));
    hg.add(mesh(cylG(0.29, 0.29, 0.02), hatM, [0, 0.375, 0]));
    hg.add(mesh(cylG(0.172, 0.172, 0.05, true), plainMat('#c8a040', 0.4, 0.6), [0, 0.41, 0]));
  } else if (c.hat === 'cowboy') {
    hg.add(mesh(latheG('cbrim', [[0.0, 0], [0.18, 0], [0.32, 0.03], [0.36, 0.07], [0.35, 0.08], [0.31, 0.045], [0.18, 0.02], [0, 0.02]]), hatM, [0, 0.35, 0]));
    hg.add(mesh(latheG('ccrown', [[0.0, 0], [0.18, 0], [0.17, 0.14], [0.13, 0.19], [0.05, 0.17], [0, 0.18]]), hatM, [0, 0.36, 0]));
  } else if (c.hat === 'crown') {
    const gold = plainMat('#e2b23a', 0.25, 1);
    hg.add(mesh(cylG(0.2, 0.19, 0.08, true), gold, [0, 0.4, 0]));
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2;
      hg.add(mesh(coneG(0.035, 0.11), gold, [Math.cos(a) * 0.195, 0.49, Math.sin(a) * 0.195]));
      hg.add(mesh(sphereG(0.018), plainMat(['#d02040', '#2060e0', '#20b060'][i % 3], 0.1), [Math.cos(a) * 0.205, 0.4, Math.sin(a) * 0.205]));
    }
  } else if (c.hat === 'headband') {
    hg.add(mesh(torusG(0.2, 0.025), hatM, [0, 0.29, 0], [Math.PI / 2 - 0.1, 0, 0], [0.97, 1.02, 1]));
  }

  // accessories
  const am = plainMat(c.accColor, 0.4);
  const has = k => c.acc.includes(k);
  if (has('glasses')) {
    const frame = plainMat('#151515', 0.3);
    for (const sx of [-1, 1]) {
      hg.add(mesh(torusG(0.042, 0.007), frame, [sx * 0.065, 0.225, 0.19]));
      const lens = mesh(cg('lens', () => new THREE.CircleGeometry(0.04, 20)), mat('lens', () => new THREE.MeshPhysicalMaterial({ color: 0x223344, roughness: 0.05, transparent: true, opacity: 0.55 })), [sx * 0.065, 0.225, 0.192]);
      hg.add(lens);
      hg.add(mesh(capsuleG(0.005, 0.16), frame, [sx * 0.17, 0.225, 0.1], [Math.PI / 2, 0, 0]));
    }
    hg.add(mesh(capsuleG(0.006, 0.04), frame, [0, 0.23, 0.195], [0, 0, Math.PI / 2]));
  }
  if (has('headphones')) {
    hg.add(mesh(torusG(0.225, 0.016, Math.PI), am, [0, 0.21, 0], [0, Math.PI / 2, 0]));
    for (const sx of [-1, 1]) hg.add(mesh(cylG(0.065, 0.065, 0.05), am, [sx * 0.215, 0.2, 0], [0, 0, Math.PI / 2]));
  }
  if (has('backpack')) {
    torso.add(mesh(rboxG(0.42, 0.48, 0.2, 0.07), am, [0, 0.45, -0.3]));
    torso.add(mesh(rboxG(0.3, 0.16, 0.08, 0.04), am, [0, 0.3, -0.42]));
    for (const sx of [-1, 1]) torso.add(mesh(torusG(0.2, 0.018, Math.PI), am, [sx * 0.17, 0.5, -0.06], [0, Math.PI / 2, -Math.PI / 2], [1, 1.4, 1]));
  }
  if (has('cape')) {
    const capeGeo = cg('cape', () => { const p = new THREE.PlaneGeometry(0.75, 1.0, 6, 8); const a = p.attributes.position; for (let i = 0; i < a.count; i++) { const x = a.getX(i), y = a.getY(i); a.setZ(i, -Math.cos(x * 3) * 0.06 - (0.5 - y) * 0.15); } p.computeVertexNormals(); return p; });
    const cm = mat('cape' + c.accColor, () => new THREE.MeshStandardMaterial({ color: c.accColor, roughness: 0.75, side: THREE.DoubleSide, normalMap: fabricNormal() }));
    torso.add(mesh(capeGeo, cm, [0, 0.2, -0.24]));
  }
  if (has('tie')) {
    torso.add(mesh(rboxG(0.07, 0.06, 0.03, 0.012), am, [0, 0.7, 0.2]));
    torso.add(mesh(rboxG(0.075, 0.32, 0.02, 0.01), am, [0, 0.52, 0.205], [0.08, 0, 0]));
  }
  if (has('scarf')) {
    torso.add(mesh(torusG(0.1, 0.045), am, [0, 0.76, 0], [Math.PI / 2, 0, 0], [1.2, 1, 1]));
    torso.add(mesh(rboxG(0.09, 0.26, 0.04, 0.02), am, [0.05, 0.62, 0.17], [0.15, 0, 0.1]));
  }

  root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { group: root, head, armL, armR, legL, legR, hand };
}

// Shrink a picture for use as a shirt (small enough to send to other players)
export function shrinkImage(dataUrl, size = 160) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, size / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}
