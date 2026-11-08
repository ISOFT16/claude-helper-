/* ================= защитное снаряжение ================= */
// Все предметы описаны данными: чтобы добавить новый, достаточно дописать запись в GEAR_ITEMS.
// Характеристики на уровне L считаются как base + per * (L - 1).
//  cls    — класс защиты: пуля оружия с пробитием выше класса проходит сильнее;
//  absorb — доля поглощаемого урона по защищаемым зонам;
//  dur    — прочность (очки), тратится на поглощённый урон с коэффициентом wear;
//  weight — масса, кг; mob — потеря подвижности (доля скорости и дальности уклонения);
//  zones  — защищаемые зоны: head, torso, arms, legs.
const GEAR_SLOTS = ['helmet', 'vest', 'plates', 'arms', 'legs', 'collar'];
const GEAR_MAX_LVL = 5;
const GEAR_ITEMS = {
  helm_basic: { slot: 'helmet', n: ['Каска ТШ-1', 'TSh-1 helmet'], price: 0, zones: ['head'], cls: [1, 0.5], absorb: [0.3, 0.05], dur: [40, 12], wear: 0.9, weight: [1.2, 0], mob: [0.01, 0], look: 'helmet' },
  helm_assault: { slot: 'helmet', n: ['Штурмовой шлем «Сфера»', 'Sfera assault helmet'], price: 900, zones: ['head'], cls: [3, 0.5], absorb: [0.45, 0.05], dur: [65, 15], wear: 0.8, weight: [1.8, -0.1], mob: [0.02, -0.002], look: 'helmet' },
  vest_basic: { slot: 'vest', n: ['Жилет «Кора»', 'Kora vest'], price: 0, zones: ['torso'], cls: [2, 0.5], absorb: [0.35, 0.05], dur: [70, 18], wear: 0.85, weight: [3, 0], mob: [0.02, 0], look: 'vest' },
  vest_heavy: { slot: 'vest', n: ['Бронежилет «Бастион»', 'Bastion heavy vest'], price: 1500, zones: ['torso', 'arms'], cls: [4, 0.5], absorb: [0.5, 0.04], dur: [110, 22], wear: 0.75, weight: [8, -0.4], mob: [0.07, -0.006], look: 'vest' },
  plates_steel: { slot: 'plates', n: ['Стальные пластины', 'Steel plates'], price: 600, zones: ['torso'], cls: [3, 0.5], absorb: [0.25, 0.05], dur: [60, 18], wear: 1.1, weight: [4, -0.2], mob: [0.03, -0.003], look: 'plates' },
  plates_ceramic: { slot: 'plates', n: ['Керамические пластины', 'Ceramic plates'], price: 1400, zones: ['torso'], cls: [5, 0.25], absorb: [0.35, 0.05], dur: [50, 15], wear: 1.6, weight: [2.6, -0.15], mob: [0.02, -0.002], look: 'plates' },
  arms_pads: { slot: 'arms', n: ['Налокотники «Щит»', 'Shield arm guards'], price: 400, zones: ['arms'], cls: [1, 0.5], absorb: [0.3, 0.06], dur: [35, 10], wear: 1, weight: [0.8, 0], mob: [0.01, 0], look: 'arms' },
  legs_pads: { slot: 'legs', n: ['Наколенники и щитки', 'Knee and shin guards'], price: 400, zones: ['legs'], cls: [1, 0.5], absorb: [0.3, 0.06], dur: [40, 10], wear: 1, weight: [1, 0], mob: [0.015, -0.001], look: 'legs' },
  collar: { slot: 'collar', n: ['Защитный воротник', 'Armored collar'], price: 700, zones: ['head', 'torso'], cls: [2, 0.5], absorb: [0.1, 0.03], dur: [30, 10], wear: 1, weight: [0.9, 0], mob: [0.005, 0], look: 'collar' },
};
// стоимость улучшения до уровня L (лисьи монеты)
const GEAR_UP_COST = [0, 0, 250, 600, 1200, 2400];
// пробитие оружия по категориям
const PEN = { pistol: 2, smg: 2, shotgun: 1, rifle: 4, sniper: 5, mg: 4, knife: 1, grenade: 3 };
const ZONE_MULT = { head: 1, torso: 1, arms: 0.8, legs: 0.75 };
const gStat = (it, k, lvl) => { const v = it[k]; return Array.isArray(v) ? v[0] + v[1] * (lvl - 1) : v; };
const gearItemName = id => GEAR_ITEMS[id] ? (LANG === 'ru' || LANG === 'uk' ? GEAR_ITEMS[id].n[0] : GEAR_ITEMS[id].n[1]) : id;

/* --- профиль: какие предметы куплены, их уровни, что надето --- */
function gearProf() {
  const g = PROF.gear = PROF.gear && typeof PROF.gear === 'object' ? PROF.gear : {};
  g.lvl = g.lvl && typeof g.lvl === 'object' ? g.lvl : {};
  g.eq = g.eq && typeof g.eq === 'object' ? g.eq : {};
  for (const id in GEAR_ITEMS) if (!GEAR_ITEMS[id].price && !g.lvl[id]) g.lvl[id] = 1; // базовые вещи есть у всех
  for (const id in g.lvl) if (!GEAR_ITEMS[id]) delete g.lvl[id]; else g.lvl[id] = clamp(g.lvl[id] | 0, 1, GEAR_MAX_LVL);
  if (!g.init) { g.eq.helmet = 'helm_basic'; g.eq.vest = 'vest_basic'; g.init = 1; }
  for (const s of GEAR_SLOTS) if (g.eq[s] && (!g.lvl[g.eq[s]] || GEAR_ITEMS[g.eq[s]].slot !== s)) g.eq[s] = null;
  return g;
}
// снаряжение для боя: { слот: [id, уровень] } — передаётся по сети вместе с внешним видом
function myGearCfg() { const g = gearProf(), out = {}; for (const s of GEAR_SLOTS) if (g.eq[s]) out[s] = [g.eq[s], g.lvl[g.eq[s]]]; return out; }
function cleanGearCfg(c) {
  const out = {}; if (!c || typeof c !== 'object') return out;
  for (const s of GEAR_SLOTS) { const v = c[s]; if (Array.isArray(v) && GEAR_ITEMS[v[0]] && GEAR_ITEMS[v[0]].slot === s) out[s] = [v[0], clamp(v[1] | 0, 1, GEAR_MAX_LVL)]; }
  return out;
}
// боты: качество снаряжения зависит от сложности
function botGearCfg() {
  const L = 1 + (SET.diff | 0) + (Math.random() < 0.4 ? 1 : 0);
  const pickIn = s => pick(Object.keys(GEAR_ITEMS).filter(id => GEAR_ITEMS[id].slot === s));
  const out = { helmet: [pickIn('helmet'), L], vest: [pickIn('vest'), L] };
  if (Math.random() < 0.5) out.plates = [pickIn('plates'), L];
  if (Math.random() < 0.4) out.legs = ['legs_pads', L];
  if (Math.random() < 0.3) out.arms = ['arms_pads', L];
  return out;
}
// выдать снаряжение на раунд: полная прочность у купленной в бою брони
function equipGear(a, cfg) { a.gearCfg = cleanGearCfg(cfg); a.gear = []; refreshArmorValue(a); }
function clearGear(a) { a.gear = []; a.armor = 0; }
function restoreGear(a) {
  a.gear = Object.entries(a.gearCfg || {}).map(([slot, [id, lvl]]) => { const it = GEAR_ITEMS[id], max = gStat(it, 'dur', lvl); return { slot, id, lvl, dur: max, max }; });
  refreshArmorValue(a);
}
// старое поле armor (0–100) — средняя прочность брони корпуса и головы, для HUD и ботов
function refreshArmorValue(a) {
  const main = (a.gear || []).filter(g => g.slot === 'vest' || g.slot === 'helmet' || g.slot === 'plates');
  a.armor = main.length ? Math.round(main.reduce((s, g) => s + g.dur / g.max, 0) / main.length * 100) : 0;
}
function gearMobility(a) {
  let m = 0;
  for (const s in a.gearCfg || {}) { const [id, lvl] = a.gearCfg[s]; m += gStat(GEAR_ITEMS[id], 'mob', lvl); }
  return clamp(m, 0, 0.25);
}
function gearWeight(cfg) { let w = 0; for (const s in cfg || {}) { const [id, lvl] = cfg[s]; w += gStat(GEAR_ITEMS[id], 'weight', lvl); } return w; }
// Поглощение урона: сначала пластины, затем жилет и остальное, что закрывает зону.
// Изношенная броня защищает слабее; класс ниже пробития оружия — вдвое слабее.
function absorbDamage(a, dmg, zone, weaponId) {
  const W = WEAPONS[weaponId], pen = weaponId === 'grenade' ? PEN.grenade : PEN[W ? W.cat : 'rifle'] || 3;
  const order = { plates: 0, vest: 1, helmet: 1, collar: 2, arms: 1, legs: 1 };
  const pieces = (a.gear || []).filter(g => g.dur > 0 && GEAR_ITEMS[g.id].zones.includes(zone)).sort((x, y) => order[x.slot] - order[y.slot]);
  let left = dmg, hit = false;
  for (const g of pieces) {
    const it = GEAR_ITEMS[g.id];
    let k = gStat(it, 'absorb', g.lvl) * (0.5 + 0.5 * g.dur / g.max);
    if (gStat(it, 'cls', g.lvl) < pen) k *= 0.5;
    const ab = Math.min(left * k, g.dur / it.wear);
    left -= ab; g.dur = Math.max(0, g.dur - ab * it.wear); hit = true;
    if (left <= 0.01) break;
  }
  refreshArmorValue(a);
  return { dmg: left, armored: hit };
}
// зона попадания по точке на теле
function hitZone(v, hit) {
  const H = v.height(), y = (hit.y - v.pos.y) / H;
  if (v.posture === 2) return y > 0.6 ? 'torso' : 'legs';
  if (y < 0.47) return 'legs';
  const fx = Math.cos(v.yaw), fz = -Math.sin(v.yaw); // вбок от бойца
  const side = Math.abs((hit.x - v.pos.x) * fx + (hit.z - v.pos.z) * fz);
  return side > 0.2 ? 'arms' : 'torso';
}
// Видимые элементы снаряжения: чем выше уровень, тем «дороже» цвет накладок.
const GEAR_LVL_COL = [0x3b4048, 0x55606d, 0x7a8796, 0x9c7a3a, 0xd2a640];
const gearLookMats = GEAR_LVL_COL.map((c, i) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55 - i * 0.07, metalness: 0.25 + i * 0.15, envMapIntensity: 0.6 }));
const gearGeo = {
  pad: new THREE.SphereGeometry(0.072, 14, 10),
  plate: new RoundedBoxGeometry(0.27, 0.3, 0.035, 2, 0.012),
  shoulder: new THREE.SphereGeometry(0.085, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2),
  collar: new THREE.TorusGeometry(0.1, 0.035, 8, 20),
};
function buildGearLook(a) {
  const R = a.rig; if (!R || !R.chest) return;
  if (R.gearLook) for (const m of R.gearLook) m.parent && m.parent.remove(m);
  R.gearLook = [];
  const add = (parent, geo, lvl, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0) => {
    const m = new THREE.Mesh(geo, gearLookMats[clamp(lvl - 1, 0, 4)]); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.x = rx;
    m.castShadow = false; m.userData.gear = true; parent.add(m); R.gearLook.push(m); R.lodDirty = true;
  };
  const c = a.gearCfg || {};
  if (c.arms) for (let i = 0; i < 2; i++) add(R.elbow[i], gearGeo.pad, c.arms[1], 0, 0, 0, 1.08, 1.08, 1.08);
  if (c.legs) for (let i = 0; i < 2; i++) add(R.knee[i], gearGeo.pad, c.legs[1], 0, 0, 0, 1.15, 1.25, 1.15);
  if (c.plates) { add(R.chest, gearGeo.plate, c.plates[1], 0, 0.27, -0.165); add(R.chest, gearGeo.plate, c.plates[1], 0, 0.27, 0.15); }
  if (c.vest && c.vest[0] === 'vest_heavy') for (const x of [-0.2, 0.2]) add(R.chest, gearGeo.shoulder, c.vest[1], x, 0.42, 0, 1.1, 0.8, 1.1);
  if (c.collar) add(R.chest, gearGeo.collar, c.collar[1], 0, 0.5, 0, 1.2, 1.2, 0.9, Math.PI / 2);
}
