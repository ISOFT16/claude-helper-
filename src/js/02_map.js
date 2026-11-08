/* ================= мир: 3D-коллайдеры, пространственная сетка, навигация ================= */
// Мир — набор твёрдых коробок (AABB) с материалами: стены, перекрытия, ступени, ящики, машины, стекло.
// Это позволяет строить здания в несколько этажей, лестницы, окна, двери, балконы, подземные переходы.
// Коробки разложены по пространственной сетке с шагом CELL — запросы и лучи проверяют только ближние.
// Навигация ботов — граф узлов на сетке 1 м по всем уровням (земля, этажи, крыши), связи по шагу и лестницам.
const CELL = 2, STEP = 0.42, GRAV = 21, WALL_H = 4.5, CRATE_H = 1.1, TALL_H = 2.2;
const DUCT_B = 0.72, DUCT_T = 1.45; // воздуховод «Узла»: твёрдый от DUCT_B до DUCT_T
const WORLD = { id: '', boxes: [], grid: [], gw: 0, gd: 0, W: 0, D: 0, floorY: 0, groundPlane: true, spawns: [[], []], stairZones: [], nav: null, env: {}, markers: [], stamp: 0, mapDef: null };
let MW = 0, MH = 0; // размер в клетках CELL (для радара и карты)
const zone = { x0: 0, x1: 0, z0: 0, z1: 0, cx: 0, cz: 0, y: 0 };
const WORLD_HOOKS = [];
// подписка систем на загрузку карты: вызывается сразу (если мир есть) и при каждой новой карте
function onWorld(fn) { WORLD_HOOKS.push(fn); if (WORLD.id) fn(); }

/* --- коробки и сетка --- */
function addBox(x0, y0, z0, x1, y1, z1, m = 'concrete', f = {}) {
  const b = { x0: Math.min(x0, x1), y0: Math.min(y0, y1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), y1: Math.max(y0, y1), z1: Math.max(z0, z1), m, alive: true, st: 0, i: WORLD.boxes.length, ...f };
  WORLD.boxes.push(b); return b;
}
function indexBoxes() {
  const W = WORLD; W.gw = Math.ceil(W.W / CELL); W.gd = Math.ceil(W.D / CELL); MW = W.gw; MH = W.gd;
  W.grid = Array.from({ length: W.gw * W.gd }, () => []);
  for (const b of W.boxes) {
    if (b.visual) continue; // только для вида, без столкновений
    const cx0 = clamp(Math.floor(b.x0 / CELL), 0, W.gw - 1), cx1 = clamp(Math.floor((b.x1 - 1e-4) / CELL), 0, W.gw - 1);
    const cz0 = clamp(Math.floor(b.z0 / CELL), 0, W.gd - 1), cz1 = clamp(Math.floor((b.z1 - 1e-4) / CELL), 0, W.gd - 1);
    for (let z = cz0; z <= cz1; z++) for (let x = cx0; x <= cx1; x++) W.grid[z * W.gw + x].push(b);
  }
}
const inWorld = (x, z) => x >= 0 && z >= 0 && x < WORLD.W && z < WORLD.D;
// обход коробок, задевающих прямоугольник [x0,x1]×[z0,z1] (каждая — один раз)
function eachBox(x0, z0, x1, z1, fn) {
  const W = WORLD, st = ++W.stamp;
  const cx0 = Math.max(0, Math.floor(x0 / CELL)), cx1 = Math.min(W.gw - 1, Math.floor(x1 / CELL));
  const cz0 = Math.max(0, Math.floor(z0 / CELL)), cz1 = Math.min(W.gd - 1, Math.floor(z1 / CELL));
  for (let z = cz0; z <= cz1; z++) for (let x = cx0; x <= cx1; x++) for (const b of W.grid[z * W.gw + x]) {
    if (b.st === st || !b.alive) continue; b.st = st;
    if (b.x1 <= x0 || b.x0 >= x1 || b.z1 <= z0 || b.z0 >= z1) continue;
    if (fn(b) === true) return true;
  }
  return false;
}
// твёрдо ли в квадрате вокруг точки (x,z) радиуса r на высотах (y0, y1)
function solidRect(x, z, r, y0, y1) {
  if (!inWorld(x - r, z - r) || !inWorld(x + r, z + r)) return true;
  return eachBox(x - r, z - r, x + r, z + r, b => b.y1 > y0 && b.y0 < y1 && !b.pass);
}
const solidPt = (x, z, y0, y1) => solidRect(x, z, 0.001, y0, y1);
// совместимость со старым кодом: проверка клетки CELL
function solidSpan(cx, cz, y0, y1) { return solidRect(cx * CELL + CELL / 2, cz * CELL + CELL / 2, CELL / 2 - 0.001, y0, y1); }
// высота опоры под точкой: верх ближайшей коробки ниже y (или пол мира)
function floorAt(x, z, y = 99, r = 0.001) {
  let best = WORLD.groundPlane ? 0 : WORLD.floorY;
  if (!WORLD.groundPlane) best = WORLD.floorY;
  eachBox(x - r, z - r, x + r, z + r, b => { if (!b.pass && b.y1 <= y + 0.05 && b.y1 > best) best = b.y1; });
  return best;
}
// материал в точке (для эффектов попаданий и шагов)
function materialAt(x, y, z) {
  let m = null;
  eachBox(x - 0.03, z - 0.03, x + 0.03, z + 0.03, b => { if (y >= b.y0 - 0.03 && y <= b.y1 + 0.03) { m = b.m; return true; } });
  return m || WORLD.env.ground || 'asphalt';
}
const MAT_INFO = {
  concrete: { pen: 0.1, fx: 'concrete', step: 'hard' }, plaster: { pen: 0.45, fx: 'concrete', step: 'hard' }, brick: { pen: 0.15, fx: 'concrete', step: 'hard' },
  stone: { pen: 0.05, fx: 'concrete', step: 'hard' }, metal: { pen: 0.25, fx: 'metal', step: 'metal' }, roof: { pen: 0.35, fx: 'metal', step: 'metal' },
  wood: { pen: 0.6, fx: 'wood', step: 'wood' }, glass: { pen: 0.95, fx: 'glass', step: 'hard' }, asphalt: { pen: 0, fx: 'ground', step: 'hard' },
  dirt: { pen: 0, fx: 'ground', step: 'soft' }, grass: { pen: 0, fx: 'ground', step: 'soft' }, tile: { pen: 0.1, fx: 'concrete', step: 'hard' },
  duct: { pen: 0.4, fx: 'metal', step: 'metal' }, car: { pen: 0.3, fx: 'metal', step: 'metal' }, crate: { pen: 0.6, fx: 'wood', step: 'wood' }, container: { pen: 0.2, fx: 'metal', step: 'metal' },
  sand: { pen: 0.3, fx: 'ground', step: 'soft' }, snow: { pen: 0, fx: 'ground', step: 'soft' },
};
// совместимость: «высота клетки» (максимальный верх препятствий, стоящих на земле) и проход ботов
function hAt(cx, cz) {
  if (cx < 0 || cz < 0 || cx >= WORLD.gw || cz >= WORLD.gd) return 99;
  let h = 0; for (const b of WORLD.grid[cz * WORLD.gw + cx]) if (b.alive && !b.pass && b.y0 < 0.3) h = Math.max(h, b.y1);
  return h;
}
const bAt = () => 0;
const cellCh = () => '.';
const walk = (cx, cz) => hAt(cx, cz) === 0;
const inZone = p => p.x > zone.x0 && p.x < zone.x1 && p.z > zone.z0 && p.z < zone.z1 && p.y > zone.y - 0.6 && p.y < zone.y + 2.5;

/* --- навигация: узлы на сетке 1 м на каждом уровне, A* --- */
const NAV_S = 1;
function standable(x, z, h) {
  // в самой точке сверху 1,75 м свободно; вокруг (радиус бойца) допускаются только перешагиваемые ступени
  if (solidPt(x, z, h + 0.05, h + 1.75)) return false;
  if (solidRect(x, z, 0.22, h + STEP + 0.03, h + 1.75)) return false;
  return true;
}
function buildNav() {
  const W = WORLD, nx = Math.floor(W.W / NAV_S), nz = Math.floor(W.D / NAV_S);
  const nodes = [], col = new Map();
  for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
    const x = ix * NAV_S + NAV_S / 2, z = iz * NAV_S + NAV_S / 2;
    const cand = new Set(); if (W.groundPlane) cand.add(0);
    eachBox(x - 0.01, z - 0.01, x + 0.01, z + 0.01, b => { if (!b.pass && !b.glass && !b.noNav) cand.add(+b.y1.toFixed(3)); });
    const list = [];
    for (const h of cand) {
      // точка опоры не внутри другой коробки и есть место для бойца
      if (!standable(x, z, h)) continue;
      const n = { i: nodes.length, x, z, y: h, nb: [], ix, iz };
      nodes.push(n); list.push(n);
    }
    if (list.length) col.set(ix + iz * 4096, list);
  }
  // на лестнице большой перепад между соседними узлами разрешён только вдоль марша (заходить сбоку нельзя)
  const inStair = (x, z, dx, dz) => W.stairZones.some(s => x >= s.x0 - 0.6 && x <= s.x1 + 0.6 && z >= s.z0 - 0.05 && z <= s.z1 + 0.05 && s.axis === 'x' && dz === 0 || z >= s.z0 - 0.6 && z <= s.z1 + 0.6 && x >= s.x0 - 0.05 && x <= s.x1 + 0.05 && s.axis === 'z' && dx === 0);
  for (const n of nodes) {
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const lst = col.get(n.ix + dx + (n.iz + dz) * 4096); if (!lst) continue;
      const lim = inStair(n.x, n.z, dx, dz) && inStair(n.x + dx, n.z + dz, dx, dz) ? 1.0 : STEP;
      for (const m of lst) {
        if (Math.abs(m.y - n.y) > lim) continue;
        const mx = (n.x + m.x) / 2, mz = (n.z + m.z) / 2, hy = Math.max(n.y, m.y);
        if (solidRect(mx, mz, 0.2, hy + 0.45, hy + 1.6)) continue;
        if (dx && dz) { // диагональ — только если оба боковых шага проходимы
          if (solidRect(n.x + dx, n.z, 0.2, hy + 0.45, hy + 1.6) || solidRect(n.x, n.z + dz, 0.2, hy + 0.45, hy + 1.6)) continue;
        }
        n.nb.push(m.i);
      }
    }
  }
  W.nav = { nodes, col, nx, nz };
}
// ближайший узел к точке (тот же уровень предпочтительнее)
function nearestNode(p, maxR = 3) {
  const N = WORLD.nav; if (!N) return null;
  const ix = Math.floor(p.x / NAV_S), iz = Math.floor(p.z / NAV_S);
  let best = null, bd = 1e9;
  for (let r = 0; r <= maxR; r++) {
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      const lst = N.col.get(ix + dx + (iz + dz) * 4096); if (!lst) continue;
      for (const n of lst) { const d = Math.hypot(n.x - p.x, n.z - p.z) + Math.abs(n.y - p.y) * 3 + (n.y > p.y + 0.6 ? 5 : 0); if (d < bd) { bd = d; best = n; } }
    }
    if (best && r >= 1) break;
  }
  return best;
}
// A* по узлам: возвращает список точек {x,y,z}
const _open = [];
function navPath(from, to) {
  const N = WORLD.nav; if (!N || !from || !to) return [];
  const nodes = N.nodes, g = new Map(), prev = new Map(), closed = new Set();
  const h = n => Math.hypot(n.x - to.x, n.z - to.z) + Math.abs(n.y - to.y);
  _open.length = 0; _open.push([h(from), from.i]); g.set(from.i, 0);
  let it = 0;
  while (_open.length && it++ < 20000) {
    // двоичная куча по f
    let bi = 0; const top = _open[0]; const last = _open.pop();
    if (_open.length) { _open[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < _open.length && _open[l][0] < _open[m][0]) m = l; if (r < _open.length && _open[r][0] < _open[m][0]) m = r; if (m === i) break; [_open[i], _open[m]] = [_open[m], _open[i]]; i = m; } }
    const ci = top[1]; if (closed.has(ci)) continue; closed.add(ci);
    if (ci === to.i) break;
    const c = nodes[ci], gc = g.get(ci);
    for (const ni of c.nb) {
      if (closed.has(ni)) continue;
      const n = nodes[ni], ng = gc + Math.hypot(n.x - c.x, n.z - c.z) + Math.abs(n.y - c.y) * 1.5;
      if (ng < (g.get(ni) ?? 1e9)) {
        g.set(ni, ng); prev.set(ni, ci);
        _open.push([ng + h(n), ni]); let i = _open.length - 1;
        while (i > 0) { const p = (i - 1) >> 1; if (_open[p][0] <= _open[i][0]) break; [_open[i], _open[p]] = [_open[p], _open[i]]; i = p; }
      }
    }
    bi++;
  }
  if (!prev.has(to.i) && from.i !== to.i) return [];
  const out = []; for (let c = to.i; c !== undefined && c !== from.i; c = prev.get(c)) out.push(nodes[c]);
  return out.reverse();
}
// случайный узел в прямоугольнике (с фильтром по высоте)
function randomNodeIn(x0, z0, x1, z1, filt) {
  const N = WORLD.nav, c = [];
  for (const n of N.nodes) if (n.x >= x0 && n.x <= x1 && n.z >= z0 && n.z <= z1 && (!filt || filt(n))) c.push(n);
  return c.length ? pick(c) : null;
}
// прямая проходима (для срезания углов пути) на одной высоте
function lineWalkable(ax, az, bx, bz, y = 0) {
  const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / 0.4);
  for (let i = 0; i <= n; i++) {
    const x = ax + (bx - ax) * i / n, z = az + (bz - az) * i / n;
    if (solidRect(x, z, 0.34, y + 0.3, y + 1.7)) return false;
    if (Math.abs(floorAt(x, z, y + 0.3, 0.2) - y) > 0.3) return false; // не срезаем над обрывом
  }
  return true;
}

/* --- загрузка карты --- */
function loadWorld(id) {
  const def = MAPS[id] || MAPS[MAP_ORDER[0]];
  Object.assign(WORLD, { id: def.id, boxes: [], spawns: [[], []], stairZones: [], markers: [], env: def.env || {}, groundPlane: def.groundPlane !== false, floorY: def.floorY ?? 0, mapDef: def, W: def.W, D: def.D, lights: [], props: [] });
  def.build(mapBuilder());
  // граница мира — невидимые стены
  const H = 40, T = 1;
  addBox(-T, -10, -T, 0, H, WORLD.D + T, 'concrete', { visual: false, hidden: true }); addBox(WORLD.W, -10, -T, WORLD.W + T, H, WORLD.D + T, 'concrete', { hidden: true });
  addBox(0, -10, -T, WORLD.W, H, 0, 'concrete', { hidden: true }); addBox(0, -10, WORLD.D, WORLD.W, H, WORLD.D + T, 'concrete', { hidden: true });
  indexBoxes();
  const z = def.zone; Object.assign(zone, { x0: z[0], z0: z[1], x1: z[2], z1: z[3], y: z[4] || 0 }); zone.cx = (zone.x0 + zone.x1) / 2; zone.cz = (zone.z0 + zone.z1) / 2;
  const t0 = performance.now(); buildNav(); WORLD.navMs = Math.round(performance.now() - t0);
  for (const fn of WORLD_HOOKS) fn();
}
