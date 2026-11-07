/* ================= pathfinding ================= */
const prevArr = new Int32Array(MW * MH);
function findPath(sx, sz, gx, gz) {
  if (!walk(gx, gz)) return [];
  prevArr.fill(-2); const start = sz * MW + sx, goal = gz * MW + gx;
  const q = [start]; prevArr[start] = -1; let head = 0;
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  while (head < q.length) {
    const c = q[head++]; if (c === goal) break;
    const cx = c % MW, cz = (c / MW) | 0;
    for (const [ddx, ddz] of dirs) {
      const nx = cx + ddx, nz = cz + ddz; if (!walk(nx, nz)) continue;
      if (ddx && ddz && (!walk(cx + ddx, cz) || !walk(cx, cz + ddz))) continue;
      const n = nz * MW + nx; if (prevArr[n] !== -2) continue;
      prevArr[n] = c; q.push(n);
    }
  }
  if (prevArr[goal] === -2) return [];
  const path = []; for (let c = goal; c !== start && c !== -1; c = prevArr[c]) path.push([c % MW, (c / MW) | 0]);
  return path.reverse();
}
function lineWalkable(ax, az, bx, bz) {
  const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / 0.4);
  const px = -(bz - az) / (d || 1) * 0.38, pz = (bx - ax) / (d || 1) * 0.38;
  for (let i = 0; i <= n; i++) {
    const x = ax + (bx - ax) * i / n, z = az + (bz - az) * i / n;
    if (!walk(Math.floor((x + px) / CELL), Math.floor((z + pz) / CELL)) || !walk(Math.floor((x - px) / CELL), Math.floor((z - pz) / CELL))) return false;
  }
  return true;
}

