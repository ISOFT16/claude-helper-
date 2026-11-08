/* ================= map ================= */
// Левая верхняя четверть карты; остальное зеркалится. # стена, b ящик (можно запрыгнуть), B высокий ящик,
// u низкий воздуховод (под ним можно проползти лёжа, наверх — забраться), A/Z спавны, C узел связи
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
const CELL = 2, WALL_H = 4.5, CRATE_H = 1.1, TALL_H = 2.2, STEP = 0.4, GRAV = 21;
// воздуховод: твёрдый от DUCT_B до DUCT_T, снизу свободный проход высотой DUCT_B
const DUCT_B = 0.72, DUCT_T = 1.45;
const MAP = (() => {
  const top = QUAD.map(r => r + r.split('').reverse().map(c => c === 'A' ? 'Z' : c).join(''));
  return [...top, ...top.slice(0, -1).reverse()];
})();
const MW = MAP[0].length, MH = MAP.length;
const heights = new Float32Array(MW * MH), bottoms = new Float32Array(MW * MH);
const spawnCells = [[], []], zoneCells = [];
for (let z = 0; z < MH; z++) for (let x = 0; x < MW; x++) {
  const c = MAP[z][x];
  heights[z * MW + x] = c === '#' ? WALL_H : c === 'b' ? CRATE_H : c === 'B' ? TALL_H : c === 'u' ? DUCT_T : 0;
  if (c === 'u') bottoms[z * MW + x] = DUCT_B;
  if (c === 'A') spawnCells[0].push([x, z]);
  if (c === 'Z') spawnCells[1].push([x, z]);
  if (c === 'C') zoneCells.push([x, z]);
}
const hAt = (cx, cz) => (cx < 0 || cz < 0 || cx >= MW || cz >= MH) ? 99 : heights[cz * MW + cx];
const bAt = (cx, cz) => (cx < 0 || cz < 0 || cx >= MW || cz >= MH) ? 0 : bottoms[cz * MW + cx];
const cellCh = (cx, cz) => (cx < 0 || cz < 0 || cx >= MW || cz >= MH) ? '#' : MAP[cz][cx];
// твёрдо ли в клетке на отрезке высот [y0, y1]
const solidSpan = (cx, cz, y0, y1) => { const h = hAt(cx, cz); if (h <= 0 || y0 >= h - 0.001) return false; const b = bAt(cx, cz); return !(b > 0 && y1 <= b + 0.001); };
// высота пола для падающих предметов: под воздуховодом — земля
const floorAt = (cx, cz, y) => { const h = hAt(cx, cz); if (h >= 90) return 0; const b = bAt(cx, cz); return b > 0 && y < b ? 0 : h; };
const walk = (cx, cz) => hAt(cx, cz) === 0;
const zone = { x0: 1e9, x1: -1e9, z0: 1e9, z1: -1e9 };
for (const [x, z] of zoneCells) { zone.x0 = Math.min(zone.x0, x * CELL); zone.x1 = Math.max(zone.x1, x * CELL + CELL); zone.z0 = Math.min(zone.z0, z * CELL); zone.z1 = Math.max(zone.z1, z * CELL + CELL); }
zone.cx = (zone.x0 + zone.x1) / 2; zone.cz = (zone.z0 + zone.z1) / 2;
const inZone = p => p.x > zone.x0 && p.x < zone.x1 && p.z > zone.z0 && p.z < zone.z1;
const cellCenter = (cx, cz, out = new THREE.Vector3()) => out.set(cx * CELL + CELL / 2, 0, cz * CELL + CELL / 2);
function randomCellIn(x0, x1, z0, z1) {
  const c = [];
  for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) if (walk(x, z)) c.push([x, z]);
  return pick(c);
}

