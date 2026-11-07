/* ================= weapons ================= */
// cat: pistol | smg | shotgun | rifle | sniper | mg | knife
// act: slide (пистолет), rev (револьвер), pump (помпа), bolt (продольный затвор), break (переломка), mag (обычный магазин)
// model: параметры процедурного генератора модели (см. models)
const W_ = (o) => ({ head: 3, inc: 0.006, moveSpread: 0.03, auto: false, move: 1, kill: 300, act: 'mag', ...o });
const WEAPONS = {
  knife:    { n: ['Коготь', 'Talon'], cat: 'knife', slot: 3, melee: true, dmg: 55, head: 1.5, rate: 0.45, range: 2.3, move: 1.06, kill: 1500, snd: 'knife' },
  // пистолеты
  osa:      W_({ n: ['Оса', 'Wasp'], cat: 'pistol', slot: 2, dmg: 26, head: 3.6, rate: 0.15, mag: 12, res: 48, reload: 1.5, spread: 0.007, inc: 0.012, recoil: 0.018, price: 200, snd: 'pistol', act: 'slide' }),
  shmel:    W_({ n: ['Шмель', 'Bumblebee'], cat: 'pistol', slot: 2, dmg: 22, head: 3.5, rate: 0.12, mag: 20, res: 60, reload: 1.7, spread: 0.009, inc: 0.01, recoil: 0.015, price: 300, snd: 'pistol', act: 'slide', model: { gen: 'pistol', len: 0.16, extMag: 0.04, slide: 'metalLight' } }),
  ten:      W_({ n: ['Тень', 'Shade'], cat: 'pistol', slot: 2, dmg: 30, head: 3.5, rate: 0.16, mag: 12, res: 36, reload: 1.6, spread: 0.006, moveSpread: 0.025, inc: 0.012, recoil: 0.016, price: 400, snd: 'silenced', quiet: true, act: 'slide', model: { gen: 'pistol', len: 0.17, supp: true, frame: 'tan' } }),
  dyatel:   W_({ n: ['Дятел', 'Woodpecker'], cat: 'pistol', slot: 2, dmg: 18, rate: 0.06, auto: true, mag: 20, res: 60, reload: 1.8, spread: 0.02, inc: 0.007, recoil: 0.012, price: 500, snd: 'smgLight', act: 'slide', model: { gen: 'pistol', len: 0.15, extMag: 0.07, comp: true } }),
  gadyuka:  W_({ n: ['Гадюка', 'Viper'], cat: 'pistol', slot: 2, dmg: 54, rate: 0.38, mag: 6, res: 30, reload: 2.1, spread: 0.005, moveSpread: 0.05, inc: 0.03, recoil: 0.05, price: 650, move: 0.97, snd: 'heavy', act: 'rev' }),
  kobra:    W_({ n: ['Кобра', 'Cobra'], cat: 'pistol', slot: 2, dmg: 63, head: 3.2, rate: 0.32, mag: 7, res: 35, reload: 2.0, spread: 0.006, moveSpread: 0.06, inc: 0.035, recoil: 0.06, price: 750, move: 0.97, snd: 'deagle', act: 'slide', model: { gen: 'pistol', len: 0.22, bulky: 1.25, comp: true, slide: 'steel' } }),
  // пистолеты-пулемёты
  pchela:   W_({ n: ['Пчела', 'Bee'], cat: 'smg', slot: 1, dmg: 20, rate: 0.058, auto: true, mag: 30, res: 120, reload: 1.9, spread: 0.018, moveSpread: 0.02, recoil: 0.01, price: 1100, kill: 600, snd: 'smgLight', model: { gen: 'smg', len: 0.2, stock: 'none', magLen: 0.17 } }),
  shershen: W_({ n: ['Шершень', 'Hornet'], cat: 'smg', slot: 1, dmg: 23, rate: 0.072, auto: true, mag: 32, res: 96, reload: 2.0, spread: 0.014, moveSpread: 0.018, inc: 0.005, recoil: 0.011, price: 1300, kill: 600, move: 0.98, snd: 'smg' }),
  sverchok: W_({ n: ['Сверчок', 'Cricket'], cat: 'smg', slot: 1, dmg: 22, rate: 0.075, auto: true, mag: 30, res: 120, reload: 2.1, spread: 0.013, moveSpread: 0.02, inc: 0.005, recoil: 0.01, price: 1400, kill: 600, snd: 'silencedSmg', quiet: true, model: { gen: 'smg', len: 0.24, stock: 'solid', supp: true, optic: 'reflex', body: 'tan' } }),
  vihr:     W_({ n: ['Вихрь', 'Whirlwind'], cat: 'smg', slot: 1, dmg: 21, rate: 0.068, auto: true, mag: 50, res: 100, reload: 2.6, spread: 0.016, moveSpread: 0.02, inc: 0.005, recoil: 0.011, price: 1500, kill: 600, move: 0.97, snd: 'smg', model: { gen: 'smg', len: 0.24, stock: 'bullpup', magLen: 0.15, optic: 'reflex' } }),
  voron:    W_({ n: ['Ворон', 'Raven'], cat: 'smg', slot: 1, dmg: 25, rate: 0.08, auto: true, mag: 30, res: 90, reload: 2.2, spread: 0.009, moveSpread: 0.025, inc: 0.005, recoil: 0.013, price: 1600, kill: 600, move: 0.97, snd: 'smgHeavy', model: { gen: 'smg', len: 0.3, stock: 'solid', foregrip: true, mag: 'curved', optic: 'reddot' } }),
  // дробовики
  taran:    W_({ n: ['Таран', 'Ram'], cat: 'shotgun', slot: 1, dmg: 22, head: 2, pellets: 10, rate: 0.22, mag: 2, res: 24, reload: 2.3, spread: 0.065, moveSpread: 0.015, inc: 0, recoil: 0.09, price: 1200, kill: 900, move: 0.97, snd: 'shotgunHeavy', act: 'break', model: { gen: 'double' } }),
  molot:    W_({ n: ['Молот', 'Hammer'], cat: 'shotgun', slot: 1, dmg: 17, head: 2, pellets: 9, rate: 0.85, mag: 6, res: 24, reload: 2.6, spread: 0.055, moveSpread: 0.015, inc: 0, recoil: 0.07, price: 1600, kill: 900, move: 0.95, snd: 'shotgun', act: 'pump' }),
  burya:    W_({ n: ['Буря', 'Storm'], cat: 'shotgun', slot: 1, dmg: 14, head: 2, pellets: 8, rate: 0.26, mag: 8, res: 32, reload: 2.8, spread: 0.06, moveSpread: 0.015, inc: 0, recoil: 0.06, price: 2600, kill: 900, move: 0.93, snd: 'shotgun', model: { gen: 'rifle', hg: 0.26, barrel: 0.18, barrelR: 0.017, mag: 'box', stock: 'solid', optic: 'holo', furn: 'poly' } }),
  // винтовки
  bars:     W_({ n: ['Барс', 'Leopard'], cat: 'rifle', slot: 1, dmg: 30, head: 4, burst: 3, burstRate: 0.065, rate: 0.32, mag: 30, res: 90, reload: 2.3, spread: 0.003, moveSpread: 0.05, recoil: 0.016, price: 2400, move: 0.92, snd: 'rifle', model: { gen: 'rifle', hg: 0.26, barrel: 0.16, mag: 'straight', stock: 'skeleton', optic: 'holo', furn: 'tan' } }),
  sokol:    W_({ n: ['Сокол', 'Falcon'], cat: 'rifle', slot: 1, dmg: 36, head: 4, rate: 0.1, auto: true, mag: 30, res: 90, reload: 2.5, spread: 0.005, moveSpread: 0.07, inc: 0.01, recoil: 0.026, price: 2700, move: 0.9, snd: 'ak', model: { gen: 'rifle', hg: 0.24, barrel: 0.24, mag: 'curved', stock: 'wood', optic: 'irons', furn: 'wood' } }),
  buran:    W_({ n: ['Буран', 'Blizzard'], cat: 'rifle', slot: 1, dmg: 33, head: 4, rate: 0.098, auto: true, mag: 30, res: 90, reload: 2.4, spread: 0.004, moveSpread: 0.06, inc: 0.008, recoil: 0.02, price: 2900, move: 0.9, snd: 'rifle' }),
  yastreb:  W_({ n: ['Ястреб', 'Hawk'], cat: 'rifle', slot: 1, dmg: 32, head: 4, rate: 0.105, auto: true, mag: 30, res: 90, reload: 2.5, spread: 0.004, moveSpread: 0.06, inc: 0.008, recoil: 0.019, scope: true, zoom: 40, scopeSpread: 0.002, price: 3100, move: 0.89, snd: 'rifle', model: { gen: 'rifle', hg: 0.3, barrel: 0.2, mag: 'curved', stock: 'tube', optic: 'scope', furn: 'poly' } }),
  varyag:   W_({ n: ['Варяг', 'Viking'], cat: 'rifle', slot: 1, dmg: 45, head: 3.5, rate: 0.14, auto: true, mag: 20, res: 80, reload: 2.7, spread: 0.004, moveSpread: 0.07, inc: 0.012, recoil: 0.032, price: 3200, move: 0.88, snd: 'battle', model: { gen: 'rifle', hg: 0.34, barrel: 0.26, mag: 'straight', stock: 'solid', optic: 'reddot', furn: 'tan', barrelR: 0.014 } }),
  rys:      W_({ n: ['Рысь', 'Lynx'], cat: 'rifle', slot: 1, dmg: 70, rate: 0.28, mag: 10, res: 40, reload: 2.6, spread: 0.02, moveSpread: 0.08, inc: 0.02, recoil: 0.045, scope: true, zoom: 30, scopeSpread: 0.001, price: 3800, move: 0.86, snd: 'dmr', model: { gen: 'rifle', hg: 0.38, barrel: 0.3, mag: 'straight', magSize: 0.6, stock: 'skeleton', optic: 'scope', furn: 'poly', bipod: true } }),
  // снайперские
  igla:     W_({ n: ['Игла', 'Needle'], cat: 'sniper', slot: 1, dmg: 115, head: 2.5, rate: 1.4, mag: 5, res: 20, reload: 3.0, spread: 0.07, scopeSpread: 0.0006, moveSpread: 0.12, inc: 0, recoil: 0.08, price: 4500, kill: 100, move: 0.82, snd: 'sniper', scope: true, zoom: 20, act: 'bolt' }),
  pustelga: W_({ n: ['Пустельга', 'Kestrel'], cat: 'sniper', slot: 1, dmg: 85, head: 2.5, rate: 0.32, mag: 15, res: 45, reload: 3.0, spread: 0.06, scopeSpread: 0.0012, moveSpread: 0.12, inc: 0, recoil: 0.05, price: 5000, kill: 200, move: 0.82, snd: 'sniperSemi', scope: true, zoom: 22, model: { gen: 'sniper', semi: true, chassis: 'metal' } }),
  garpun:   W_({ n: ['Гарпун', 'Harpoon'], cat: 'sniper', slot: 1, dmg: 220, head: 2, rate: 1.9, mag: 5, res: 15, reload: 3.6, spread: 0.09, scopeSpread: 0.0004, moveSpread: 0.15, inc: 0, recoil: 0.12, price: 6000, kill: 100, move: 0.75, snd: 'heavySniper', scope: true, zoom: 18, act: 'bolt', model: { gen: 'sniper', heavy: true, chassis: 'tan' } }),
  // пулемёты
  kuvalda:  W_({ n: ['Кувалда', 'Sledge'], cat: 'mg', slot: 1, dmg: 30, head: 3.5, rate: 0.085, auto: true, mag: 100, res: 200, reload: 4.5, spread: 0.01, moveSpread: 0.06, inc: 0.004, recoil: 0.017, price: 5200, move: 0.8, snd: 'mg', model: { gen: 'rifle', hg: 0.3, barrel: 0.3, mag: 'box', stock: 'solid', optic: 'reddot', furn: 'poly', carry: true, bipod: true, shield: true } }),
  medved:   W_({ n: ['Медведь', 'Bear'], cat: 'mg', slot: 1, dmg: 34, head: 3.5, rate: 0.075, auto: true, mag: 150, res: 150, reload: 5.5, spread: 0.014, moveSpread: 0.07, inc: 0.004, recoil: 0.02, price: 5800, move: 0.74, snd: 'mgHeavy', model: { gen: 'rifle', hg: 0.32, barrel: 0.34, mag: 'drum', stock: 'solid', optic: 'irons', furn: 'tan', carry: true, bipod: true, shield: true, barrelR: 0.015 } }),
};
const WIDS = Object.keys(WEAPONS);
const wName = id => { const W = WEAPONS[id]; return W ? W.n[LANG === 'ru' || LANG === 'uk' ? 0 : 1] : id; };
const CATS = [
  ['c_pistol', ['osa', 'shmel', 'ten', 'dyatel', 'gadyuka', 'kobra']],
  ['c_smg', ['pchela', 'shershen', 'sverchok', 'vihr', 'voron']],
  ['c_shotgun', ['taran', 'molot', 'burya']],
  ['c_rifle', ['bars', 'sokol', 'buran', 'yastreb', 'varyag', 'rys']],
  ['c_sniper', ['igla', 'pustelga', 'garpun']],
  ['c_mg', ['kuvalda', 'medved']],
  ['c_gear', ['armor', 'he', 'smoke', 'flash']],
];
const GEAR = { armor: { key: 'armorItem', price: 650 }, he: { key: 'nadeHe', price: 300, max: 2 }, smoke: { key: 'nadeSmoke', price: 300, max: 1 }, flash: { key: 'nadeFlash', price: 200, max: 2 } };
const NADES = ['he', 'smoke', 'flash'];
const newGun = id => ({ id, mag: WEAPONS[id].mag || 0, res: WEAPONS[id].res || 0 });
const isPistolCat = id => WEAPONS[id].cat === 'pistol';
