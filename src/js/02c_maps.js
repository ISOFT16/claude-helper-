/* ================= карты: конструктор и описания локаций ================= */
// Карта описывается данными: размер, окружение (время суток, погода), зона захвата и функция build(B),
// которая расставляет коробки через конструктор B. Новую карту добавить = дописать запись в MAPS.
const SH = 3.2; // высота этажа
function rectMinus(x0, z0, x1, z1, holes) {
  // прямоугольник минус вырезы → набор прямоугольников (по сетке из границ вырезов, строки склеиваются)
  holes = holes.filter(h => h.x1 > x0 && h.x0 < x1 && h.z1 > z0 && h.z0 < z1);
  if (!holes.length) return [[x0, z0, x1, z1]];
  const xs = [...new Set([x0, x1, ...holes.flatMap(h => [clamp(h.x0, x0, x1), clamp(h.x1, x0, x1)])])].sort((a, b) => a - b);
  const zs = [...new Set([z0, z1, ...holes.flatMap(h => [clamp(h.z0, z0, z1), clamp(h.z1, z0, z1)])])].sort((a, b) => a - b);
  const out = [];
  for (let j = 0; j < zs.length - 1; j++) {
    let run = null;
    for (let i = 0; i < xs.length - 1; i++) {
      const cx = (xs[i] + xs[i + 1]) / 2, cz = (zs[j] + zs[j + 1]) / 2;
      const inHole = holes.some(h => cx > h.x0 && cx < h.x1 && cz > h.z0 && cz < h.z1);
      if (!inHole) { if (run) run[2] = xs[i + 1]; else run = [xs[i], zs[j], xs[i + 1], zs[j + 1]]; }
      else if (run) { out.push(run); run = null; }
    }
    if (run) out.push(run);
  }
  return out;
}
function mapBuilder() {
  const B = {
    box: (x0, y0, z0, x1, y1, z1, m, f) => addBox(x0, y0, z0, x1, y1, z1, m, f),
    // перекрытие с вырезами (лестничные проёмы, люки)
    slab(x0, z0, x1, z1, y, th = 0.25, m = 'concrete', holes = [], f = {}) { for (const r of rectMinus(x0, z0, x1, z1, holes)) addBox(r[0], y - th, r[1], r[2], y, r[3], m, f); },
    // стена вдоль X от x0 до x1 на линии z (толщина th к +z) с проёмами {a,b,y0,y1,glass}
    wallX(x0, x1, z, y0, h, th, m, holes = [], f = {}) {
      holes = holes.filter(o => o.b > x0 && o.a < x1).sort((p, q) => p.a - q.a); let x = x0;
      for (const o of holes) {
        if (o.a > x) addBox(x, y0, z, o.a, y0 + h, z + th, m, f);
        if (o.y0 > 0.01) addBox(o.a, y0, z, o.b, y0 + o.y0, z + th, m, f);
        if (o.y1 < h - 0.01) addBox(o.a, y0 + o.y1, z, o.b, y0 + h, z + th, m, f);
        if (o.glass) addBox(o.a, y0 + o.y0, z + th * 0.4, o.b, y0 + o.y1, z + th * 0.6, 'glass', { glass: true, noNav: true });
        x = Math.max(x, o.b);
      }
      if (x < x1) addBox(x, y0, z, x1, y0 + h, z + th, m, f);
    },
    wallZ(z0, z1, x, y0, h, th, m, holes = [], f = {}) {
      holes = holes.filter(o => o.b > z0 && o.a < z1).sort((p, q) => p.a - q.a); let z = z0;
      for (const o of holes) {
        if (o.a > z) addBox(x, y0, z, x + th, y0 + h, o.a, m, f);
        if (o.y0 > 0.01) addBox(x, y0, o.a, x + th, y0 + o.y0, o.b, m, f);
        if (o.y1 < h - 0.01) addBox(x, y0 + o.y1, o.a, x + th, y0 + h, o.b, m, f);
        if (o.glass) addBox(x + th * 0.4, y0 + o.y0, o.a, x + th * 0.6, y0 + o.y1, o.b, 'glass', { glass: true, noNav: true });
        z = Math.max(z, o.b);
      }
      if (z < z1) addBox(x, y0, z, x + th, y0 + h, z1, m, f);
    },
    // лестница: прямой марш от (x0,z0) шириной w, в направлении dir ('+x','-x','+z','-z'), с высоты y0 до y1
    stairs(x0, z0, w, dir, y0, y1, m = 'concrete') {
      const rise = y1 - y0, n = Math.max(2, Math.ceil(rise / 0.2)), dh = rise / n, dd = 0.3, run = n * dd;
      for (let i = 0; i < n; i++) {
        const a = i * dd, top = y0 + dh * (i + 1);
        if (dir === '+x') addBox(x0 + a, y0, z0, x0 + a + dd, top, z0 + w, m, { stair: true });
        else if (dir === '-x') addBox(x0 - a - dd, y0, z0, x0 - a, top, z0 + w, m, { stair: true });
        else if (dir === '+z') addBox(x0, y0, z0 + a, x0 + w, top, z0 + a + dd, m, { stair: true });
        else addBox(x0, y0, z0 - a - dd, x0 + w, top, z0 - a, m, { stair: true });
      }
      const r = dir === '+x' ? [x0, z0, x0 + run, z0 + w] : dir === '-x' ? [x0 - run, z0, x0, z0 + w] : dir === '+z' ? [x0, z0, x0 + w, z0 + run] : [x0, z0 - run, x0 + w, z0];
      WORLD.stairZones.push({ x0: r[0], z0: r[1], x1: r[2], z1: r[3], axis: dir[1] });
      return { run, rect: r };
    },
    // здание: этажи, лестницы с разворотом, окна со стеклом, двери, перегородка, балкон, крыша с парапетом и выходом
    building(o) {
      const { x, z, w, d } = o, yb = o.y || 0, fl = o.floors || 2, th = 0.25, m = o.m || 'plaster', sh = o.sh || SH, ruin = o.ruin || 0;
      const sw = 1.3, run = Math.ceil(sh / 0.2) * 0.3; // ширина и длина марша
      const sx = x + th + 0.2, sz = z + th + 0.2; // лестничная клетка в углу (две полосы маршей вдоль X)
      const stairX0 = o.stairRight ? x + w - th - 0.2 - run - 1.2 : sx + 1.2;
      for (let f = 0; f <= fl; f++) {
        const y = yb + f * sh, last = f === fl;
        // перекрытие (на крыше — тоже), вырез над маршем, идущим снизу
        if (f > 0) {
          const lane = (f - 1) % 2, lz0 = sz + lane * (sw + 0.1);
          // проём над маршем — до самой верхней ступени, дальше сразу пол площадки
          const holes = [lane === 0 ? { x0: stairX0 - 0.2, z0: lz0 - 0.1, x1: stairX0 + run, z1: lz0 + sw + 0.1 } : { x0: stairX0, z0: lz0 - 0.1, x1: stairX0 + run + 0.2, z1: lz0 + sw + 0.1 }];
          if (last && !o.roofAccess) holes.length = 0;
          if (!(last && o.noRoof)) B.slab(x, z, x + w, z + d, y, 0.25, last ? (o.roofM || 'concrete') : 'concrete', holes);
        }
        if (last) {
          // парапет крыши
          const ph = 1.0, pm = o.trim || 'concrete';
          if (!o.noRoof) { B.wallX(x, x + w, z, y, ph, th, pm); B.wallX(x, x + w, z + d - th, y, ph, th, pm); B.wallZ(z + th, z + d - th, x, y, ph, th, pm); B.wallZ(z + th, z + d - th, x + w - th, y, ph, th, pm); }
          break;
        }
        // стены этажа: окна через ~3 м, двери на первом этаже
        const win = (len, base) => { const hs = []; const n = Math.floor((len - 2) / 3); for (let i = 0; i < n; i++) { const c = base + 1.5 + (i + 0.5) * ((len - 3) / n); hs.push({ a: c - 0.6, b: c + 0.6, y0: 0.95, y1: 2.25, glass: !ruin || Math.random() > ruin }); } return hs; };
        const doorsOn = side => (o.doors || []).filter(dd => dd.side === side && (dd.f || 0) === f).map(dd => ({ a: dd.at - (dd.w || 1.6) / 2, b: dd.at + (dd.w || 1.6) / 2, y0: 0, y1: 2.3 }));
        const holesX = side => { let hs = (f > 0 || o.groundWindows) ? win(w, x) : []; const ds = doorsOn(side); hs = hs.filter(h => !ds.some(q => h.b > q.a - 0.3 && h.a < q.b + 0.3)); return [...hs, ...ds]; };
        const holesZ = side => { let hs = (f > 0 || o.groundWindows) ? win(d, z) : []; const ds = doorsOn(side); hs = hs.filter(h => !ds.some(q => h.b > q.a - 0.3 && h.a < q.b + 0.3)); return [...hs, ...ds]; };
        const nc = { noClimb: true };
        // разрушения: крупные пробоины в стенах верхних этажей
        const breach = side => (ruin && f > 0 && Math.random() < ruin) ? [{ a: (side === 'n' || side === 's' ? x : z) + 1.5 + Math.random() * ((side === 'n' || side === 's' ? w : d) - 5), b: 0, y0: 0.4, y1: sh - 0.3 }].map(h => ({ ...h, b: h.a + 2.2 })) : [];
        B.wallX(x, x + w, z, y, sh, th, m, [...holesX('s'), ...breach('s')], nc);
        B.wallX(x, x + w, z + d - th, y, sh, th, m, [...holesX('n'), ...breach('n')], nc);
        B.wallZ(z + th, z + d - th, x, y, sh, th, m, [...holesZ('w'), ...breach('w')], nc);
        B.wallZ(z + th, z + d - th, x + w - th, y, sh, th, m, [...holesZ('e'), ...breach('e')], nc);
        // марш на следующий этаж (полосы чередуются, направление разворачивается)
        if (f < fl - 1 || o.roofAccess) {
          const lane = f % 2, lz0 = sz + lane * (sw + 0.1), up = lane === 0;
          B.stairs(up ? stairX0 : stairX0 + run, lz0, sw, up ? '+x' : '-x', y, y + sh, 'concrete');
          // площадка у верхнего конца, чтобы сойти с марша
        }
        // перегородка с дверью (не перекрывает лестницу)
        if (w > 9 && d > 7 && !o.open) {
          const px = x + w * 0.62;
          B.wallZ(z + th, z + d - th, px, y, sh - 0.25, 0.15, m, [{ a: z + d * 0.55, b: z + d * 0.55 + 1.2, y0: 0, y1: 2.2 }, { a: sz - 0.2, b: sz + 2 * sw + 0.4, y0: 0, y1: sh }]);
        }
        // балкон
        if (o.balcony && o.balcony.f === f + 1) {
          const bz = z + d, by = y + sh;
          B.slab(x + 2, bz, x + w - 2, bz + 1.6, by, 0.2, 'concrete');
          B.wallX(x + 2, x + w - 2, bz + 1.45, by, 1.0, 0.15, 'metal'); B.wallZ(bz, bz + 1.6, x + 2, by, 1.0, 0.15, 'metal'); B.wallZ(bz, bz + 1.6, x + w - 2.15, by, 1.0, 0.15, 'metal');
        }
      }
      if (o.balcony) {
        // дверь на балкон: проём в северной стене нужного этажа (стена уже построена — вырез через «невидимую» пустоту не нужен, балкон доступен через окно-дверь)
      }
      WORLD.markers.push({ kind: 'bld', x: x + w / 2, z: z + d / 2, floors: fl });
    },
    crate(x, z, s = 1.1, y = 0) { addBox(x - s / 2, y, z - s / 2, x + s / 2, y + s, z + s / 2, 'crate'); },
    container(x, z, len = 6, alongX = true, y = 0, color = 'container') {
      const w = 2.4, h = 2.6; alongX ? addBox(x - len / 2, y, z - w / 2, x + len / 2, y + h, z + w / 2, color) : addBox(x - w / 2, y, z - len / 2, x + w / 2, y + h, z + len / 2, color);
    },
    car(x, z, alongX = true, wreck = false) {
      const L = 4.3, Wd = 1.8; const a = alongX ? [L, Wd] : [Wd, L];
      addBox(x - a[0] / 2, 0.25, z - a[1] / 2, x + a[0] / 2, 1.05, z + a[1] / 2, 'car', { car: true });
      const c = alongX ? [L * 0.5, Wd * 0.9] : [Wd * 0.9, L * 0.5];
      if (!wreck) addBox(x - c[0] / 2, 1.05, z - c[1] / 2, x + c[0] / 2, 1.5, z + c[1] / 2, 'glass', { glass: true, noNav: true });
      else addBox(x - c[0] / 2, 1.05, z - c[1] / 2, x + c[0] / 2, 1.3, z + c[1] / 2, 'car');
      WORLD.props.push({ kind: 'wheels', x, z, alongX });
    },
    barrier(x0, z0, x1, z1, h = 1.0, m = 'concrete') { addBox(x0, 0, z0, x1, h, z1, m); },
    sandbags(x0, z0, x1, z1) { addBox(x0, 0, z0, x1, 1.1, z1, 'sand'); },
    fence(x0, z0, x1, z1, h = 2.6) { addBox(x0, 0, z0, x1, h, z1, 'metal', { noClimb: true, fence: true }); },
    tower(x, z, h = 5) {
      const s = 3.2; for (const [dx, dz] of [[0, 0], [s - 0.3, 0], [0, s - 0.3], [s - 0.3, s - 0.3]]) addBox(x + dx, 0, z + dz, x + dx + 0.3, h, z + dz + 0.3, 'wood');
      B.slab(x - 0.2, z - 0.2, x + s + 0.2, z + s + 0.2, h, 0.2, 'wood');
      B.wallX(x - 0.2, x + s + 0.2, z - 0.2, h, 1.1, 0.12, 'wood'); B.wallZ(z - 0.2, z + s + 0.2, x - 0.2, h, 1.1, 0.12, 'wood'); B.wallZ(z - 0.2, z + s + 0.2, x + s + 0.08, h, 1.1, 0.12, 'wood');
      addBox(x - 0.4, h + 2.4, z - 0.4, x + s + 0.4, h + 2.6, z + s + 0.4, 'roof');
      for (const [dx, dz] of [[0, 0], [s - 0.12, 0], [0, s - 0.12], [s - 0.12, s - 0.12]]) addBox(x + dx, h, z + dz, x + dx + 0.12, h + 2.4, z + dz + 0.12, 'wood');
      B.stairs(x + 0.6, z + s + 0.2 + Math.ceil(h / 0.2) * 0.3, 1.0, '-z', 0, h, 'wood');
    },
    rock(x, z, w, d, h, y = 0) { addBox(x - w / 2, y, z - d / 2, x + w / 2, y + h, z + d / 2, 'stone', { noClimb: h > 2.4 }); },
    tree(x, z, s = 1) { addBox(x - 0.18 * s, 0, z - 0.18 * s, x + 0.18 * s, 3 * s, z + 0.18 * s, 'wood', { noClimb: true, tree: true }); WORLD.props.push({ kind: 'tree', x, z, s }); },
    lamp(x, y, z, color = 0xffc070, intensity = 30, dist = 16) { WORLD.lights.push({ x, y, z, color, intensity, dist }); },
    spawn(team, x, z, y = 0) { WORLD.spawns[team].push([x, z, y]); },
    // видимое ограждение по краю карты (забор, бетонная стена или скалы)
    perimeter(h = 4, m = 'concrete', th = 0.6) {
      const W = WORLD.W, D = WORLD.D, f = { noClimb: true };
      addBox(0, 0, 0, W, h, th, m, f); addBox(0, 0, D - th, W, h, D, m, f); addBox(0, 0, th, th, h, D - th, m, f); addBox(W - th, 0, th, W, h, D - th, m, f);
    },
  };
  return B;
}

/* --- карта 0: «Узел связи» (исходная карта, переведена в 3D-формат без изменений геймплея) --- */
const QUAD = [
  '####################',
  '#.........#.........',
  '#..b......#...b.....',
  '#.........#.........',
  '#...###uuu###..#####',
  '#....b..........#...',
  '#.......b.......#...',
  '###...###...B...#...',
  '#.....#.........b...',
  '#.....#....b........',
  '#AAA..#.......###...',
  '#AAA........B.....CC',
  '#AAA..b.......#...CC',
];
const MAP = (() => { const top = QUAD.map(r => r + r.split('').reverse().map(c => c === 'A' ? 'Z' : c).join('')); return [...top, ...top.slice(0, -1).reverse()]; })();
const MAPS = {
  node: {
    id: 'node', n: ['Узел связи', 'Uplink'], d: ['Исходная карта: коридоры, ящики, лазы', 'The original map: corridors, crates, crawlways'], W: 40 * CELL, D: 25 * CELL,
    zone: [36, 22, 44, 28, 0],
    env: { time: 'dusk', ground: 'tile', weather: null },
    build(B) {
      const zc = [];
      for (let z = 0; z < MAP.length; z++) for (let x = 0; x < MAP[0].length; x++) {
        const c = MAP[z][x], X = x * CELL, Z = z * CELL;
        if (c === '#') B.box(X, 0, Z, X + CELL, WALL_H, Z + CELL, 'panel', { noClimb: true });
        else if (c === 'b') B.box(X + 0.01, 0, Z + 0.01, X + CELL - 0.01, CRATE_H, Z + CELL - 0.01, 'crate');
        else if (c === 'B') B.box(X + 0.01, 0, Z + 0.01, X + CELL - 0.01, TALL_H, Z + CELL - 0.01, 'container');
        else if (c === 'u') B.box(X, DUCT_B, Z + 0.02, X + CELL, DUCT_T, Z + CELL - 0.02, 'duct');
        else if (c === 'A') B.spawn(0, X + 1, Z + 1); else if (c === 'Z') B.spawn(1, X + 1, Z + 1);
        else if (c === 'C') zc.push([X, Z]);
      }
    },
  },
  /* --- карта 1: разрушенный городской квартал --- */
  city: {
    id: 'city', n: ['Разрушенный квартал', 'Ruined district'], d: ['Улицы, 3-этажные дома, крыши, подземный переход', 'Streets, 3-storey buildings, rooftops, an underpass'],
    W: 96, D: 72, zone: [42, 31, 54, 41, 0], groundPlane: false, floorY: -8,
    env: { time: 'overcast', ground: 'asphalt', weather: 'rain' },
    build(B) {
      // земля — плита с проёмами лестниц в подземный переход под улицей (z 34..38, x 30..66)
      const hole1 = { x0: 30, z0: 30.2, x1: 32.8, z1: 35.5 }, hole2 = { x0: 63.2, z0: 36.5, x1: 66, z1: 41.8 };
      B.slab(0, 0, 96, 72, 0, 0.4, 'asphalt', [hole1, hole2]);
      // переход: пол, стены, марши вниз
      const ty = -3.4;
      B.box(29.5, ty - 0.3, 30, 66.5, ty, 42, 'tile');
      B.wallX(29.5, 66.5, 29.8, ty, -ty - 0.4, 0.2, 'tile'); B.wallX(29.5, 66.5, 42, ty, -ty - 0.4, 0.2, 'tile');
      B.wallZ(29.8, 42.2, 29.3, ty, -ty - 0.4, 0.2, 'tile'); B.wallZ(29.8, 42.2, 66.5, ty, -ty - 0.4, 0.2, 'tile');
      // марши: верхний конец у края проёма, спуск под улицу
      B.stairs(30.2, 30.2 + 5.1, 2.4, '-z', ty, 0, 'concrete');
      B.stairs(63.4, 41.8 - 5.1, 2.4, '+z', ty, 0, 'concrete');
      // перила у проёмов (вход — с короткой стороны)
      B.box(32.8, 0, 30.2, 33.0, 1.0, 35.5, 'metal'); B.box(29.8, 0, 35.5, 33.0, 1.0, 35.7, 'metal');
      B.box(63.0, 0, 36.5, 63.2, 1.0, 41.8, 'metal'); B.box(63.0, 0, 36.3, 66.2, 1.0, 36.5, 'metal');
      B.lamp(40, ty + 2.6, 36, 0xbfe0ff, 18, 12); B.lamp(56, ty + 2.6, 36, 0xbfe0ff, 18, 12);
      // тротуары-бордюры
      // кварталы: дома 2–3 этажа, двери с улицы, окна, крыши с выходом, частично разрушены
      const R = 0.35;
      B.building({ x: 4, z: 4, w: 14, d: 11, floors: 3, m: 'brick', doors: [{ side: 'n', at: 11 }, { side: 'e', at: 9 }], roofAccess: true, ruin: R, balcony: { f: 1 } });
      B.building({ x: 22, z: 4, w: 12, d: 10, floors: 2, m: 'plaster', doors: [{ side: 'n', at: 28 }], roofAccess: true, ruin: R });
      B.building({ x: 60, z: 4, w: 13, d: 11, floors: 3, m: 'plaster', doors: [{ side: 'n', at: 66 }, { side: 'w', at: 9 }], roofAccess: true, ruin: R });
      B.building({ x: 78, z: 4, w: 14, d: 12, floors: 2, m: 'brick', doors: [{ side: 'n', at: 85 }], roofAccess: true, ruin: R });
      B.building({ x: 4, z: 52, w: 14, d: 13, floors: 3, m: 'plaster', doors: [{ side: 's', at: 10 }, { side: 'e', at: 58 }], roofAccess: true, ruin: R });
      B.building({ x: 22, z: 54, w: 12, d: 12, floors: 2, m: 'brick', doors: [{ side: 's', at: 27 }], roofAccess: true, ruin: R });
      B.building({ x: 60, z: 53, w: 12, d: 12, floors: 2, m: 'brick', doors: [{ side: 's', at: 66 }], roofAccess: true, ruin: R });
      B.building({ x: 77, z: 51, w: 15, d: 14, floors: 3, m: 'plaster', doors: [{ side: 's', at: 84 }, { side: 'w', at: 58 }], roofAccess: true, ruin: R, stairRight: true });
      // внутренние дворы: заборы и проходы между домами
      B.barrier(18, 18, 22, 18.4, 2.2, 'brick'); B.barrier(73, 18, 78, 18.4, 2.2, 'brick'); B.barrier(18, 53.6, 22, 54, 2.2, 'brick'); B.barrier(72, 53.6, 77, 54, 2.2, 'brick');
      // разрушенные стены и завалы
      B.box(36, 0, 18, 40, 1.6, 19, 'brick'); B.box(56, 0, 52, 60, 1.3, 53.2, 'brick'); B.box(38, 0, 24, 41, 0.7, 26.5, 'concrete'); B.box(55, 0, 45, 57.5, 0.8, 47.5, 'concrete');
      // машины на улицах
      B.car(46, 24, false, true); B.car(50, 47, false); B.car(26, 36, true, true); B.car(71, 34.5, true); B.car(84, 38, true, true); B.car(12, 33, true);
      // баррикады и укрытия на перекрёстке
      B.barrier(41, 28.5, 44, 29.3, 1.0); B.barrier(52, 42.7, 55, 43.5, 1.0); B.sandbags(46.5, 30, 49.5, 30.8); B.sandbags(46.5, 41.2, 49.5, 42);
      B.container(48, 12, 6, true); B.container(48, 60, 6, true);
      for (let i = 0; i < 6; i++) B.lamp(8 + i * 16, 4.5, 29, 0xffcf8a, 22, 16);
      B.perimeter(5, 'brick');
      for (const z of [26, 30, 34, 38, 42, 46]) { B.spawn(0, 3, z); B.spawn(1, 93, z); }
    },
  },
  /* --- карта 2: промышленный комплекс --- */
  factory: {
    id: 'factory', n: ['Промышленный комплекс', 'Industrial complex'], d: ['Цех с мостками, склад, контейнеры, офис', 'Workshop with catwalks, warehouse, containers, office'],
    W: 100, D: 72, zone: [42, 28, 58, 44, 0],
    env: { time: 'night', ground: 'concrete', weather: 'rain' },
    build(B) {
      // главный цех: высокие стены, ворота, мостки по периметру на 4,5 м, лестницы
      const x = 34, z = 20, w = 32, d = 32, h = 9;
      const gate = (c, wd = 5) => ({ a: c - wd / 2, b: c + wd / 2, y0: 0, y1: 4.5 });
      B.wallX(x, x + w, z, 0, h, 0.3, 'metal', [gate(x + 16), { a: x + 4, b: x + 6, y0: 5.5, y1: 7, glass: true }, { a: x + 26, b: x + 28, y0: 5.5, y1: 7, glass: true }], { noClimb: true });
      B.wallX(x, x + w, z + d - 0.3, 0, h, 0.3, 'metal', [gate(x + 16), { a: x + 4, b: x + 6, y0: 5.5, y1: 7, glass: true }], { noClimb: true });
      B.wallZ(z, z + d, x, 0, h, 0.3, 'metal', [gate(z + 16, 3.4), { a: z + 10, b: z + 12.2, y0: 4.6, y1: 6.8 }], { noClimb: true });
      B.wallZ(z, z + d, x + w - 0.3, 0, h, 0.3, 'metal', [gate(z + 16, 3.4), { a: z + 4.4, b: z + 6, y0: 4.6, y1: 6.8 }], { noClimb: true });
      B.box(x - 0.5, h, z - 0.5, x + w + 0.5, h + 0.3, z + d + 0.5, 'roof');
      const cy = 4.5, cw = 2.2;
      B.slab(x + 0.3, z + 0.3, x + w - 0.3, z + 0.3 + cw, cy, 0.15, 'metal'); B.slab(x + 0.3, z + d - 0.3 - cw, x + w - 0.3, z + d - 0.3, cy, 0.15, 'metal');
      B.slab(x + 0.3, z + 0.3 + cw, x + 0.3 + cw, z + d - 0.3 - cw, cy, 0.15, 'metal'); B.slab(x + w - 0.3 - cw, z + 0.3 + cw, x + w - 0.3, z + d - 0.3 - cw, cy, 0.15, 'metal');
      // лестницы на мостки: марш вплотную к мосткам, с верхней ступени — шаг на мостки
      B.stairs(x + 4, z + 0.3 + cw, 1.2, '+x', 0, cy, 'metal'); B.stairs(x + w - 4, z + d - 0.3 - cw - 1.2, 1.2, '-x', 0, cy, 'metal');
      // станки и укрытия в цеху
      for (const [px, pz] of [[x + 9, z + 10], [x + 9, z + 22], [x + 23, z + 10], [x + 23, z + 22]]) B.box(px - 2, 0, pz - 1.2, px + 2, 1.6, pz + 1.2, 'metal');
      B.container(x + 16, z + 16, 6, false); B.crate(x + 13, z + 13); B.crate(x + 19, z + 19); B.crate(x + 19, z + 19, 1.1, 1.1);
      B.lamp(x + 8, 8, z + 16, 0xffb060, 60, 26); B.lamp(x + 24, 8, z + 16, 0xffb060, 60, 26);
      // офис 3 этажа на западе, переход-мостик на мостки цеха
      B.building({ x: 6, z: 26, w: 14, d: 12, floors: 2, sh: 4.5, m: 'concrete', doors: [{ side: 'e', at: 34 }, { side: 's', at: 13 }, { side: 'e', at: 31.1, f: 1, w: 1.8 }], roofAccess: true, groundWindows: true });
      B.slab(20, 30, 34.3, 32.2, 4.5 + 0.0, 0.15, 'metal'); B.box(20, 4.5, 30, 34.3, 5.55, 30.08, 'metal'); B.box(20, 4.5, 32.12, 34.3, 5.55, 32.2, 'metal');
      // склад на востоке со стеллажами
      B.building({ x: 74, z: 8, w: 20, d: 16, floors: 1, m: 'metal', doors: [{ side: 'w', at: 16, w: 4 }, { side: 's', at: 84, w: 4 }], roofAccess: false, open: true, sh: 5 });
      for (let i = 0; i < 3; i++) { B.box(78, 0, 12 + i * 4, 90, 3.2, 12.8 + i * 4, 'metal'); }
      // контейнерный двор: ярусы, лестница на верх
      for (const [cx, cz, along] of [[80, 34, true], [80, 37, true], [86, 46, false], [74, 50, true], [88, 58, true]]) B.container(cx, cz, 6, along);
      B.container(80, 34, 6, true, 2.6); B.stairs(76.5, 31.2, 1.2, '+z', 0, 2.6, 'metal');
      for (const [cx, cz, along] of [[14, 52, true], [20, 58, false], [10, 62, true], [26, 48, true]]) B.container(cx, cz, 6, along);
      // трубы и платформы
      B.box(66, 6, 30, 74, 6.6, 30.6, 'metal'); B.box(66, 6, 41, 74, 6.6, 41.6, 'metal');
      B.tower(88, 64, 4.5); B.tower(8, 8, 4.5);
      for (const [lx, lz] of [[30, 12], [70, 12], [30, 60], [70, 60], [50, 66], [50, 6]]) B.lamp(lx, 6, lz, 0xffa040, 40, 20);
      B.perimeter(4, 'concrete');
      for (const z of [12, 20, 46, 54, 60, 66]) { B.spawn(0, 3, z); B.spawn(1, 97, z); }
    },
  },
  /* --- карта 3: военная база --- */
  base: {
    id: 'base', n: ['Военная база', 'Military base'], d: ['Казармы, штаб с бункером, ангар, вышки', 'Barracks, HQ with bunker, hangar, watchtowers'],
    W: 100, D: 80, zone: [44, 34, 56, 46, 0], groundPlane: false, floorY: -8,
    env: { time: 'day', ground: 'dirt', weather: null },
    build(B) {
      // земля с проёмом лестницы в бункер под штабом
      const bh = { x0: 45, z0: 63.6, x1: 47.6, z1: 68.8 };
      B.slab(0, 0, 100, 80, 0, 0.4, 'dirt', [bh]);
      // бункер: коридор и две комнаты на −3,4 м
      const by = -3.4;
      B.box(40, by - 0.3, 58, 62, by, 72, 'concrete');
      B.wallX(40, 62, 57.8, by, -by - 0.4, 0.2, 'concrete'); B.wallX(40, 62, 72, by, -by - 0.4, 0.2, 'concrete');
      B.wallZ(57.8, 72.2, 39.8, by, -by - 0.4, 0.2, 'concrete'); B.wallZ(57.8, 72.2, 62, by, -by - 0.4, 0.2, 'concrete');
      B.wallX(48.5, 62, 64, by, -by - 0.4, 0.2, 'concrete', [{ a: 54, b: 55.4, y0: 0, y1: 2.2 }]);
      B.stairs(45.1, 63.6 + 5.1, 2.4, '-z', by, 0, 'concrete');
      B.box(47.6, 0, 63.6, 47.8, 1.0, 68.8, 'metal'); B.box(44.8, 0, 68.8, 47.8, 1.0, 69.0, 'metal');
      B.lamp(51, by + 2.5, 68, 0xffe8c0, 20, 12); B.lamp(56, by + 2.5, 61, 0xffe8c0, 20, 12);
      // штаб 3 этажа над бункером
      B.building({ x: 38, z: 60, w: 26, d: 14, floors: 3, m: 'concrete', doors: [{ side: 's', at: 51, w: 2 }, { side: 'w', at: 66 }, { side: 'e', at: 66 }], roofAccess: true, groundWindows: true, balcony: { f: 2 } });
      // казармы (2 этажа)
      B.building({ x: 8, z: 10, w: 22, d: 10, floors: 2, m: 'plaster', doors: [{ side: 'n', at: 14 }, { side: 'n', at: 24 }], roofAccess: true, groundWindows: true });
      B.building({ x: 70, z: 10, w: 22, d: 10, floors: 2, m: 'plaster', doors: [{ side: 'n', at: 76 }, { side: 'n', at: 86 }], roofAccess: true, groundWindows: true });
      // ангар: открытые ворота, внутри техника
      B.building({ x: 38, z: 4, w: 24, d: 18, floors: 1, m: 'metal', sh: 7, doors: [{ side: 'n', at: 50, w: 10 }], open: true, roofM: 'roof' });
      B.box(44, 0, 9, 52, 2.2, 14, 'car'); B.crate(57, 8); B.crate(57, 9.2, 1.1, 0); B.crate(42, 18);
      // вышки по углам
      B.tower(3, 3, 5); B.tower(93.5, 3, 5); B.tower(3, 70, 5); B.tower(93.5, 70, 5);
      // склады
      B.building({ x: 8, z: 50, w: 16, d: 12, floors: 1, m: 'metal', doors: [{ side: 'e', at: 56, w: 3 }, { side: 'n', at: 16 }], open: true, sh: 4.5 });
      B.building({ x: 76, z: 50, w: 16, d: 12, floors: 1, m: 'metal', doors: [{ side: 'w', at: 56, w: 3 }, { side: 'n', at: 84 }], open: true, sh: 4.5 });
      // плац: мешки с песком, блокпост, шлагбаумы
      B.sandbags(46, 31, 49, 32); B.sandbags(51, 48, 54, 49); B.sandbags(40, 38, 41, 41); B.sandbags(59, 39, 60, 42);
      B.barrier(30, 39, 31, 41.5, 1.1); B.barrier(69, 38.5, 70, 41, 1.1);
      B.box(48, 0, 76, 52, 3, 79, 'concrete'); // будка КПП
      B.car(28, 30, false); B.car(72, 46, false); B.car(60, 28, true);
      for (const [cx, cz] of [[22, 30], [78, 30], [22, 44], [78, 44]]) B.container(cx, cz, 6, true);
      B.perimeter(3.2, 'metal', 0.3);
      // больше укрытий на открытом плацу
      for (const [cx, cz] of [[36, 26], [64, 54], [36, 54], [64, 26]]) B.container(cx, cz, 6, false);
      B.sandbags(28, 22, 31, 23); B.sandbags(69, 57, 72, 58); B.sandbags(16, 40, 17, 43); B.sandbags(83, 37, 84, 40);
      for (const z of [26, 31, 36, 41, 46, 51]) { B.spawn(0, 3.5, z); B.spawn(1, 96.5, z); }
    },
  },
  /* --- карта 4: горная деревня --- */
  village: {
    id: 'village', n: ['Горная деревня', 'Mountain village'], d: ['Террасы, каменные дома, мост, пещера, туман', 'Terraces, stone houses, a bridge, a cave, fog'],
    W: 96, D: 80, zone: [42, 34, 54, 46, 2],
    env: { time: 'morning', ground: 'dirt', weather: 'snow' },
    build(B) {
      // террасы: центр приподнят на 2 м, северный склон — 4 и 6 м
      const terr = (x0, z0, x1, z1, h) => B.box(x0, 0, z0, x1, h, z1, 'stone', { noClimb: h > 2.3 });
      terr(30, 26, 66, 54, 2); terr(30, 54, 66, 66, 4); terr(18, 60, 78, 72, 6);
      // подъёмы на террасы — каменные лестницы
      // подъёмы на террасы — каменные лестницы (нижний конец — на нижнем уровне)
      B.stairs(46, 23, 3, '+z', 0, 2, 'stone'); B.stairs(46, 51, 3, '+z', 2, 4, 'stone');
      B.stairs(30.5, 57, 2.4, '+z', 4, 6, 'stone'); B.stairs(61.5, 57, 2.4, '+z', 4, 6, 'stone');
      B.stairs(27, 38, 2.4, '+x', 0, 2, 'stone'); B.stairs(69, 42, 2.4, '-x', 0, 2, 'stone');
      // ущелье на юге и мост через него (насыпи по краям, мост на 3 м)
      terr(0, 10, 40, 18, 3); terr(56, 10, 96, 18, 3);
      B.slab(40, 12.5, 56, 15.5, 3, 0.3, 'wood'); B.box(40, 3, 12.4, 56, 4, 12.55, 'wood'); B.box(40, 3, 15.45, 56, 4, 15.6, 'wood');
      B.stairs(20, 22.5, 2.4, '-z', 0, 3, 'stone'); B.stairs(72, 22.5, 2.4, '-z', 0, 3, 'stone');
      // пещера: большая скала с проходом
      // пещера: две скалы и свод над проходом высотой 2,6 м
      B.rock(12, 35, 10, 4, 6); B.rock(12, 45, 10, 8, 6); B.box(7, 2.6, 37, 17, 6, 41, 'stone', { noClimb: true });
      B.rock(84, 40, 9, 12, 5);
      // каменные дома
      B.building({ x: 34, z: 29, w: 10, d: 8, floors: 2, m: 'stone', doors: [{ side: 'e', at: 33 }], roofAccess: true, sh: 3, y: 2 });
      B.building({ x: 56, z: 44, w: 9, d: 8, floors: 2, m: 'stone', doors: [{ side: 'w', at: 48 }], roofAccess: true, sh: 3, y: 2 });
      B.building({ x: 34, z: 56, w: 11, d: 8, floors: 2, m: 'stone', doors: [{ side: 's', at: 39 }], roofAccess: true, sh: 3, y: 4 });
      B.building({ x: 22, z: 62, w: 9, d: 8, floors: 2, m: 'stone', doors: [{ side: 's', at: 26 }], roofAccess: true, sh: 3, y: 6 });
      B.building({ x: 64, z: 63, w: 10, d: 8, floors: 3, m: 'stone', doors: [{ side: 's', at: 69 }], roofAccess: true, sh: 3, y: 6 });
      B.building({ x: 6, z: 56, w: 10, d: 10, floors: 2, m: 'stone', doors: [{ side: 'e', at: 60 }], roofAccess: true, sh: 3 });
      B.building({ x: 80, z: 54, w: 10, d: 10, floors: 2, m: 'stone', doors: [{ side: 'w', at: 58 }], roofAccess: true, sh: 3 });
      // смотровая площадка
      B.tower(48, 74, 6);
      // деревья, камни, заборы
      for (const [tx, tz, s] of [[8, 24, 1.2], [14, 28, 1], [80, 24, 1.1], [88, 30, 1.3], [26, 44, 1], [72, 30, 1], [90, 70, 1.2], [6, 72, 1.1], [60, 22, 0.9], [36, 22, 1]]) B.tree(tx, tz, s);
      B.rock(24, 34, 3, 2, 1.2); B.rock(70, 50, 2.5, 2, 1.1); B.rock(52, 30, 2, 2, 1.0, 2); B.rock(40, 48, 2.4, 1.6, 1.0, 2);
      B.box(38, 2, 40, 41, 3, 40.4, 'wood'); B.box(55, 2, 38, 58, 3, 38.4, 'wood');
      B.perimeter(7, 'stone', 1.5);
      for (const z of [26, 31, 36, 41, 46, 51]) { B.spawn(0, 3, z); B.spawn(1, 93, z); }
    },
  },
};
const MAP_ORDER = ['node', 'city', 'factory', 'base', 'village'];
const mapName = id => { const m = MAPS[id] || MAPS.node; return LANG === 'ru' || LANG === 'uk' ? m.n[0] : m.n[1]; };
const mapDesc = id => { const m = MAPS[id] || MAPS.node; return LANG === 'ru' || LANG === 'uk' ? m.d[0] : m.d[1]; };
loadWorld(SET.map && MAPS[SET.map] ? SET.map : 'node');
