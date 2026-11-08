/* ================= cosmetics ================= */
// Внешний вид бойцов и оружия: одежда (камуфляж), головные уборы, тон кожи, скины оружия.
// Профиль игрока (монеты, покупки, надетое, ежедневные подарки) хранится в localStorage.
const COIN = '🦊';
const OUTFITS = {
  std:    { n: ['Форма отряда', 'Squad uniform'], price: 0 },
  night:  { n: ['Ночь', 'Night'], price: 600, base: '#1a1c20', cols: ['#0e0f12', '#2a2d33', '#16181c'], vest: '#14161a', vest2: '#22252b' },
  desert: { n: ['Пустыня', 'Desert'], price: 600, base: '#b39a6c', cols: ['#9c8358', '#c9b386', '#8a7048'], vest: '#8a7350', vest2: '#a38b62' },
  forest: { n: ['Лес', 'Forest'], price: 700, base: '#3f5233', cols: ['#2c3a24', '#5b6e3e', '#1f2a19', '#6f7a4a'], vest: '#34432a', vest2: '#47583a' },
  urban:  { n: ['Город', 'Urban'], price: 700, base: '#5c6066', cols: ['#3e4247', '#7a7f86', '#4b4f55'], vest: '#3a3d42', vest2: '#55595f' },
  arctic: { n: ['Арктика', 'Arctic'], price: 800, base: '#d9dee6', cols: ['#b8c0cc', '#eef1f5', '#9aa4b2'], vest: '#c7ced8', vest2: '#e2e6ec' },
  fox:    { n: ['Лис', 'Fox'], price: 1500, base: '#d9661a', cols: ['#f57c1f', '#1a1a1a', '#b04e10', '#fff1e0'], vest: '#161616', vest2: '#2a2a2a' },
  neon:   { n: ['Неон', 'Neon'], price: 2000, base: '#16121f', cols: ['#2a1f3d', '#0f0c16', '#3d2a5c'], vest: '#1b1726', vest2: '#2a2340', glow: '#4fe6ff' },
  gold:   { n: ['Золото', 'Gold'], price: 5000, base: '#8a6a1f', cols: ['#c9a03a', '#e8c766', '#6e5418'], vest: '#b8902e', vest2: '#d4b04a', metal: true },
};
const HATS = {
  helmet:  { n: ['Шлем', 'Helmet'], price: 0 },
  none:    { n: ['Без убора', 'No hat'], price: 0 },
  beret:   { n: ['Берет', 'Beret'], price: 300 },
  cap:     { n: ['Кепка', 'Cap'], price: 300 },
  beanie:  { n: ['Шапка', 'Beanie'], price: 400 },
  bandana: { n: ['Бандана', 'Bandana'], price: 400 },
  panama:  { n: ['Панама', 'Boonie hat'], price: 500 },
  ushanka: { n: ['Ушанка', 'Ushanka'], price: 800 },
  cowboy:  { n: ['Ковбойская шляпа', 'Cowboy hat'], price: 1200 },
  foxears: { n: ['Лисьи ушки', 'Fox ears'], price: 1500 },
  tophat:  { n: ['Цилиндр', 'Top hat'], price: 1800 },
  crown:   { n: ['Корона', 'Crown'], price: 5000 },
};
const SKIN_TONES = ['#e8c4a0', '#c79a76', '#a0704c', '#6e4a30'];
const WSKINS = {
  std:     { n: ['Заводской', 'Factory'], price: 0 },
  black:   { n: ['Чёрная ночь', 'Blackout'], price: 250, metal: ['#141518', 0.6, 0.55], furn: ['#0c0c0d', 0, 0.7] },
  desert:  { n: ['Песок', 'Sand'], price: 300, metal: ['#a8946a', 0.5, 0.5], furn: ['#c7ae7e', 0, 0.7] },
  forest:  { n: ['Лесной камуфляж', 'Woodland'], price: 500, tex: 'forest' },
  digital: { n: ['Цифра', 'Digital'], price: 600, tex: 'digital' },
  fox:     { n: ['Лис', 'Fox'], price: 800, metal: ['#1a1a1a', 0.7, 0.4], furn: ['#f57c1f', 0, 0.5] },
  tiger:   { n: ['Тигр', 'Tiger'], price: 900, tex: 'tiger' },
  ice:     { n: ['Лёд', 'Ice'], price: 1000, metal: ['#a8d8f0', 0.9, 0.15], furn: ['#dff4ff', 0.2, 0.3] },
  carbon:  { n: ['Карбон', 'Carbon'], price: 1200, tex: 'carbon' },
  chrome:  { n: ['Хром', 'Chrome'], price: 1500, metal: ['#e8ecf0', 1, 0.05], furn: ['#cfd5db', 1, 0.08] },
  neon:    { n: ['Неон', 'Neon'], price: 2000, tex: 'neon', emissive: '#4fe6ff' },
  lava:    { n: ['Лава', 'Lava'], price: 2500, tex: 'lava', emissive: '#ff5a1a' },
  gold:    { n: ['Золото', 'Gold'], price: 5000, metal: ['#d4a83a', 1, 0.18], furn: ['#c9982e', 1, 0.22] },
};
const itemN = it => it.n[LANG === 'ru' || LANG === 'uk' ? 0 : 1];

/* --- профиль --- */
const PROF = (() => {
  let p = null;
  try { p = JSON.parse(localStorage.getItem('perehvat-profile') || 'null'); } catch (e) {}
  p = p && typeof p === 'object' ? p : {};
  return {
    coins: +p.coins || 300, owned: p.owned || {}, daily: p.daily || { last: '', streak: 0 },
    equip: Object.assign({ o: 'std', h: 'helmet', s: 1, w: {} }, p.equip || {}), stats: p.stats || { kills: 0, wins: 0, matches: 0 },
  };
})();
function saveProfile() { try { localStorage.setItem('perehvat-profile', JSON.stringify(PROF)); } catch (e) {} }
const isOwned = (kind, id) => { const cat = kind === 'o' ? OUTFITS : kind === 'h' ? HATS : WSKINS; return cat[id] && (cat[id].price === 0 || !!PROF.owned[kind + ':' + id]); };
function myCos() { return { o: PROF.equip.o, h: PROF.equip.h, s: PROF.equip.s, w: { ...PROF.equip.w } }; }
// проверка чужой косметики из сети: только известные id
function cleanCos(c) {
  c = c && typeof c === 'object' ? c : {};
  const w = {};
  if (c.w && typeof c.w === 'object') for (const k of Object.keys(c.w).slice(0, 40)) if (WEAPONS[k] && WSKINS[c.w[k]]) w[k] = c.w[k];
  return { o: OUTFITS[c.o] ? c.o : 'std', h: HATS[c.h] ? c.h : 'helmet', s: clamp(c.s | 0, 0, SKIN_TONES.length - 1), w };
}
// случайная внешность для ботов — чтобы бойцы отличались друг от друга
function randomCos() {
  const o = Math.random() < 0.45 ? 'std' : pick(Object.keys(OUTFITS).filter(k => k !== 'gold' && k !== 'neon'));
  const h = Math.random() < 0.35 ? 'helmet' : pick(Object.keys(HATS).filter(k => k !== 'crown'));
  const w = {}; for (const id of WIDS) if (Math.random() < 0.35) w[id] = pick(Object.keys(WSKINS).filter(k => k !== 'gold'));
  return { o, h, s: randi(0, SKIN_TONES.length - 1), w };
}
/* --- монеты --- */
function earn(n, why) {
  if (!n) return;
  PROF.coins += n; saveProfile(); updateCoins();
  coinPop(`+${n} ${COIN} ${why || ''}`);
}
function coinPop(txt) {
  const el = document.createElement('div'); el.className = 'coinpop'; el.textContent = txt;
  $('coinpops').appendChild(el); setTimeout(() => el.remove(), 2600);
}
function updateCoins() { document.querySelectorAll('.coinv').forEach(e => { e.textContent = `${COIN} ${PROF.coins.toLocaleString()}`; }); }
/* --- ежедневные подарки: 7 дней подряд, на 7-й день ещё и случайный предмет --- */
const DAILY = [100, 150, 200, 250, 300, 400, 500];
const dayStr = (d = new Date()) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const canClaim = () => PROF.daily.last !== dayStr();
function nextStreak() {
  const y = new Date(); y.setDate(y.getDate() - 1);
  return PROF.daily.last === dayStr(y) ? (PROF.daily.streak % 7) + 1 : 1;
}
function claimDaily() {
  if (!canClaim()) return null;
  const day = nextStreak(), coins = DAILY[day - 1];
  PROF.daily = { last: dayStr(), streak: day };
  let item = null;
  if (day === 7) {
    const pool = [];
    for (const [k, cat] of [['o', OUTFITS], ['h', HATS], ['w', WSKINS]]) for (const id in cat) if (!isOwned(k, id) && cat[id].price <= 1500) pool.push([k, id, cat[id]]);
    if (pool.length) { const [k, id, it] = pick(pool); PROF.owned[k + ':' + id] = true; item = itemN(it); }
  }
  PROF.coins += coins; saveProfile(); updateCoins();
  return { day, coins, item };
}

/* --- материалы одежды --- */
const OUT_MATS = {};
function outfitMats(id) {
  if (OUT_MATS[id]) return OUT_MATS[id];
  const o = OUTFITS[id];
  const fabric = std({ map: camoTex(o.base, o.cols), roughness: o.metal ? 0.5 : 0.92, metalness: o.metal ? 0.5 : 0, envMapIntensity: o.metal ? 0.8 : 0.3 });
  const vest = std({ color: o.vest, roughness: o.metal ? 0.3 : 0.82, metalness: o.metal ? 0.8 : 0 });
  const vest2 = std({ color: o.vest2, roughness: o.metal ? 0.3 : 0.82, metalness: o.metal ? 0.8 : 0, emissive: o.glow || 0x000000, emissiveIntensity: o.glow ? 0.35 : 0 });
  return (OUT_MATS[id] = { fabric, vest, vest2 });
}
const SKIN_MATS = SKIN_TONES.map(c => std({ color: c, roughness: 0.65 }));
/* --- головные уборы (координаты головы: центр черепа ~(0, .02, 0), радиус ~.105, перед — -Z) --- */
const HAT_CACHE = {};
const hm = (c, o = {}) => std({ color: c, roughness: 0.8, ...o });
function buildHat(id, team) {
  const key = id === 'helmet' ? id + team : id;
  if (HAT_CACHE[key]) return HAT_CACHE[key];
  const g = new THREE.Group(), T = teamMats[team];
  const dome = (r, mat, y, sy = 1, theta = 0.5) => sc(mesh(new THREE.SphereGeometry(r, 20, 12, 0, Math.PI * 2, 0, Math.PI * theta), mat, 0, y, 0.004), 1, sy, 1.05);
  switch (id) {
    case 'helmet':
      g.add(sc(mesh(new THREE.SphereGeometry(0.135, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), T.helmet, 0, 0.05, 0.005), 1, 0.92, 1.08));
      g.add(mesh(new THREE.TorusGeometry(0.133, 0.011, 6, 28), T.helmet, 0, 0.052, 0.005, Math.PI / 2));
      for (const s of [-1, 1]) g.add(rbox(0.012, 0.025, 0.1, 0.004, MT.black, s * 0.132, 0.08, 0.0));
      g.add(rbox(0.045, 0.035, 0.025, 0.006, MT.black, 0, 0.14, -0.12));
      g.add(rbox(0.05, 0.012, 0.006, 0.003, T.glow, 0, 0.115, -0.142));
      break;
    case 'beret': { const m = hm('#6b1f2a'); const b = sc(ball(0.118, m, 0.02, 0.095, 0.0), 1.12, 0.36, 1.05); b.rotation.z = -0.25; g.add(b); g.add(mesh(new THREE.TorusGeometry(0.106, 0.008, 6, 24), hm('#2a1a12'), 0, 0.07, 0, Math.PI / 2)); g.add(rbox(0.025, 0.03, 0.006, 0.004, MT.brass, -0.03, 0.09, -0.11)); break; }
    case 'cap': { const m = hm('#2b2f36'); g.add(dome(0.112, m, 0.04, 0.85)); g.add(rbox(0.16, 0.012, 0.11, 0.02, m, 0, 0.05, -0.13, 0.12)); g.add(ball(0.012, m, 0, 0.135, 0)); g.add(rbox(0.04, 0.03, 0.006, 0.004, hm('#f57c1f'), 0, 0.09, -0.112, -0.3)); break; }
    case 'beanie': { const m = hm('#c8442a', { roughness: 1 }); g.add(dome(0.118, m, 0.03, 1.05, 0.55)); g.add(mesh(new THREE.TorusGeometry(0.113, 0.022, 8, 26), m, 0, 0.045, 0, Math.PI / 2)); g.add(ball(0.032, hm('#f2e9dc', { roughness: 1 }), 0, 0.165, 0)); break; }
    case 'bandana': { const m = hm('#b0302a'); g.add(mesh(new THREE.TorusGeometry(0.108, 0.02, 8, 26), m, 0, 0.07, 0, Math.PI / 2)); g.add(ball(0.022, m, 0, 0.07, 0.115)); g.add(rbox(0.025, 0.07, 0.008, 0.004, m, 0.015, 0.035, 0.13, 0.3, 0, 0.2)); g.add(rbox(0.025, 0.06, 0.008, 0.004, m, -0.015, 0.04, 0.13, 0.3, 0, -0.25)); break; }
    case 'panama': { const m = hm('#8a8460'); g.add(dome(0.118, m, 0.04, 0.8)); g.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.008, 28), m, 0, 0.05, 0)); g.add(mesh(new THREE.TorusGeometry(0.119, 0.01, 6, 24), hm('#5a5640'), 0, 0.06, 0, Math.PI / 2)); break; }
    case 'ushanka': { const fur = hm('#5a4632', { roughness: 1 }), top = hm('#3a2e24'); g.add(dome(0.125, top, 0.03, 0.95)); g.add(mesh(new THREE.TorusGeometry(0.12, 0.028, 8, 26), fur, 0, 0.04, 0, Math.PI / 2)); for (const s of [-1, 1]) g.add(rbox(0.03, 0.11, 0.09, 0.015, fur, s * 0.125, -0.02, 0.0)); g.add(rbox(0.1, 0.05, 0.03, 0.015, fur, 0, 0.09, -0.12, -0.3)); break; }
    case 'cowboy': { const m = hm('#7a5230', { roughness: 0.7 }); g.add(mesh(new THREE.CylinderGeometry(0.085, 0.105, 0.12, 22), m, 0, 0.135, 0)); g.add(mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.01, 30), m, 0, 0.075, 0)); g.add(mesh(new THREE.TorusGeometry(0.205, 0.013, 6, 30), m, 0, 0.08, 0, Math.PI / 2)); g.add(mesh(new THREE.CylinderGeometry(0.106, 0.106, 0.022, 22), hm('#2a1a10'), 0, 0.09, 0)); break; }
    case 'foxears': {
      const o = hm('#f57c1f', { roughness: 0.6 }), cr = hm('#fff4e8'), band = hm('#141414');
      g.add(mesh(new THREE.TorusGeometry(0.112, 0.008, 6, 24, Math.PI), band, 0, 0.035, 0));
      for (const s of [-1, 1]) { const e = mesh(new THREE.ConeGeometry(0.045, 0.1, 4), o, s * 0.075, 0.16, 0, 0, Math.PI / 4, -s * 0.35); g.add(e); g.add(mesh(new THREE.ConeGeometry(0.025, 0.06, 4), cr, s * 0.072, 0.155, -0.02, 0, Math.PI / 4, -s * 0.35)); }
      break;
    }
    case 'tophat': { const m = hm('#121212', { roughness: 0.5 }); g.add(mesh(new THREE.CylinderGeometry(0.095, 0.1, 0.2, 24), m, 0, 0.18, 0)); g.add(mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.01, 28), m, 0, 0.08, 0)); g.add(mesh(new THREE.CylinderGeometry(0.101, 0.101, 0.03, 24), hm('#8a1f1f'), 0, 0.1, 0)); break; }
    case 'crown': {
      const gold = std({ color: '#e0b23a', metalness: 1, roughness: 0.2, side: THREE.DoubleSide });
      g.add(mesh(new THREE.CylinderGeometry(0.1, 0.095, 0.06, 24, 1, true), gold, 0, 0.12, 0));
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; g.add(mesh(new THREE.ConeGeometry(0.022, 0.06, 4), gold, Math.cos(a) * 0.097, 0.18, Math.sin(a) * 0.097)); g.add(ball(0.012, std({ color: i % 2 ? '#d22' : '#25f', roughness: 0.1, metalness: 0.3 }), Math.cos(a + 0.5) * 0.1, 0.12, Math.sin(a + 0.5) * 0.1)); }
      break;
    }
  }
  const out = bake(g);
  return (HAT_CACHE[key] = out);
}
/* --- скины оружия --- */
function patTex(kind) {
  const draw = {
    forest: (g, w, h) => { g.fillStyle = '#4a5a35'; g.fillRect(0, 0, w, h); for (let i = 0; i < 60; i++) { g.fillStyle = pick(['#2c3a24', '#6f7a4a', '#1f2a19', '#8a7a52']); g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, rand(8, 22), rand(5, 14), Math.random() * 3, 0, 7); g.fill(); } },
    digital: (g, w, h) => { for (let y = 0; y < h; y += 8) for (let x = 0; x < w; x += 8) { g.fillStyle = pick(['#5c6670', '#7d8892', '#3e464e', '#9aa5ae', '#4a6a88']); g.fillRect(x, y, 8, 8); } },
    tiger: (g, w, h) => { g.fillStyle = '#e07a1e'; g.fillRect(0, 0, w, h); g.fillStyle = '#141414'; for (let i = 0; i < 14; i++) { const x = Math.random() * w; g.beginPath(); g.moveTo(x, 0); g.quadraticCurveTo(x + rand(-30, 30), h / 2, x + rand(-10, 10), h); g.lineTo(x + rand(6, 14), h); g.quadraticCurveTo(x + rand(-20, 40), h / 2, x + rand(8, 18), 0); g.fill(); } },
    carbon: (g, w, h) => { for (let y = 0; y < h; y += 8) for (let x = 0; x < w; x += 8) { const gr = g.createLinearGradient(x, y, x + 8, y + 8); const flip = ((x + y) / 8) % 2; gr.addColorStop(0, flip ? '#2a2c30' : '#141518'); gr.addColorStop(1, flip ? '#141518' : '#2a2c30'); g.fillStyle = gr; g.fillRect(x, y, 8, 8); } },
    neon: (g, w, h) => { g.fillStyle = '#101018'; g.fillRect(0, 0, w, h); g.strokeStyle = '#4fe6ff'; g.lineWidth = 3; for (let i = 0; i < 10; i++) { g.beginPath(); g.moveTo(0, i * 26); g.lineTo(w, i * 26 + 40); g.stroke(); } },
    lava: (g, w, h) => { g.fillStyle = '#1a1210'; g.fillRect(0, 0, w, h); g.strokeStyle = '#ff6a1a'; g.lineWidth = 2.5; for (let i = 0; i < 18; i++) { let x = Math.random() * w, y = Math.random() * h; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += rand(-25, 25); y += rand(-25, 25); g.lineTo(x, y); } g.stroke(); } },
  }[kind];
  return canvasTex(128, 128, draw, 6, 6);
}
const WSKIN_MATS = {};
function wskinMats(id) {
  if (WSKIN_MATS[id]) return WSKIN_MATS[id];
  const s = WSKINS[id];
  let metal, furn;
  if (s.tex) {
    const map = patTex(s.tex), em = s.emissive ? { emissive: s.emissive, emissiveMap: map, emissiveIntensity: 0.9 } : {};
    metal = std({ map, metalness: 0.4, roughness: 0.45, ...em }); furn = std({ map, metalness: 0.1, roughness: 0.6, ...em });
  } else {
    metal = std({ color: s.metal[0], metalness: s.metal[1], roughness: s.metal[2] });
    furn = std({ color: s.furn[0], metalness: s.furn[1], roughness: s.furn[2] });
  }
  const metalDS = metal.clone(); metalDS.side = THREE.DoubleSide;
  return (WSKIN_MATS[id] = { metal, metalDS, furn });
}
function skinGun(g, skinId) {
  const S = skinId && skinId !== 'std' && WSKINS[skinId] ? wskinMats(skinId) : null;
  g.traverse(o => {
    if (!o.isMesh) return;
    if (!o.userData.baseMat) o.userData.baseMat = o.material;
    const b = o.userData.baseMat;
    if (!S) { o.material = b; return; }
    o.material = b === MT.metal || b === MT.metalLight ? S.metal : b === MT.metalDS ? S.metalDS : (b === MT.poly || b === MT.tan || b === MT.wood) ? S.furn : b;
  });
}
// применить внешность к бойцу
function applyCos(a, cos) {
  const R = a.rig; if (!R) return;
  cos = cleanCos(cos); R.cos = cos;
  const T = teamMats[a.team], OM = cos.o !== 'std' ? outfitMats(cos.o) : null, skinM = SKIN_MATS[cos.s];
  R.root.traverse(o => {
    if (!o.isMesh || o.userData.isHat) return;
    let p = o, inGun = false; while (p) { if (p === R.gunHolder) { inGun = true; break; } p = p.parent; }
    if (inGun) return;
    if (!o.userData.baseMat) o.userData.baseMat = o.material;
    const b = o.userData.baseMat;
    if (b === T.fabric) o.material = OM ? OM.fabric : b;
    else if (b === T.vest) o.material = OM ? OM.vest : b;
    else if (b === T.vest2) o.material = OM ? OM.vest2 : b;
    else if (b === MT.skin) o.material = skinM;
  });
  if (R.hatObj) R.head.remove(R.hatObj);
  R.hatObj = null;
  if (cos.h !== 'none') {
    const h = buildHat(cos.h, a.team).clone(); h.traverse(o => { if (o.isMesh) { o.userData.isHat = true; o.castShadow = SET.charShadows; } });
    R.head.add(h); R.hatObj = h;
  }
  for (const id in R.guns) skinGun(R.guns[id].g, cos.w[id]);
}
