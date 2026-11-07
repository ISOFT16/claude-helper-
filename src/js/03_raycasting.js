/* ================= raycasting ================= */
const RB = { t: 0, ax: 0 };
function rayBox(ox, oy, oz, dx, dy, dz, x0, y0, z0, x1, y1, z1) {
  let tmin = -Infinity, tmax = Infinity, ax = -1;
  if (Math.abs(dx) < 1e-9) { if (ox < x0 || ox > x1) return false; }
  else { let a = (x0 - ox) / dx, b = (x1 - ox) / dx; if (a > b) { const t = a; a = b; b = t; } if (a > tmin) { tmin = a; ax = 0; } if (b < tmax) tmax = b; }
  if (Math.abs(dy) < 1e-9) { if (oy < y0 || oy > y1) return false; }
  else { let a = (y0 - oy) / dy, b = (y1 - oy) / dy; if (a > b) { const t = a; a = b; b = t; } if (a > tmin) { tmin = a; ax = 1; } if (b < tmax) tmax = b; }
  if (Math.abs(dz) < 1e-9) { if (oz < z0 || oz > z1) return false; }
  else { let a = (z0 - oz) / dz, b = (z1 - oz) / dz; if (a > b) { const t = a; a = b; b = t; } if (a > tmin) { tmin = a; ax = 2; } if (b < tmax) tmax = b; }
  if (tmax < tmin || tmin < 0) return false;
  RB.t = tmin; RB.ax = ax; return true;
}
const RW = { t: 0, nx: 0, ny: 0, nz: 0, hit: false };
function rayWorld(ox, oy, oz, dx, dy, dz, maxT) {
  let best = maxT, nx = 0, ny = 0, nz = 0;
  if (dy < 0) { const t = -oy / dy; if (t < best) { best = t; ny = 1; } }
  let cx = Math.floor(ox / CELL), cz = Math.floor(oz / CELL);
  const sx = dx > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
  const tdx = Math.abs(dx) > 1e-9 ? Math.abs(CELL / dx) : Infinity, tdz = Math.abs(dz) > 1e-9 ? Math.abs(CELL / dz) : Infinity;
  let tmx = Math.abs(dx) > 1e-9 ? (dx > 0 ? (cx + 1) * CELL - ox : ox - cx * CELL) / Math.abs(dx) : Infinity;
  let tmz = Math.abs(dz) > 1e-9 ? (dz > 0 ? (cz + 1) * CELL - oz : oz - cz * CELL) / Math.abs(dz) : Infinity;
  for (let i = 0; i < 200; i++) {
    const h = hAt(cx, cz);
    if (h > 0 && rayBox(ox, oy, oz, dx, dy, dz, cx * CELL, 0, cz * CELL, cx * CELL + CELL, h, cz * CELL + CELL) && RB.t < best) {
      best = RB.t; nx = ny = nz = 0;
      if (RB.ax === 0) nx = -Math.sign(dx); else if (RB.ax === 1) ny = -Math.sign(dy); else nz = -Math.sign(dz);
      break;
    }
    const tn = Math.min(tmx, tmz);
    if (tn > best || h === 99) break;
    if (tmx < tmz) { cx += sx; tmx += tdx; } else { cz += sz; tmz += tdz; }
  }
  RW.t = best; RW.nx = nx; RW.ny = ny; RW.nz = nz; RW.hit = best < maxT; return RW;
}
const RA = { t: 0, head: false };
function rayAgent(ox, oy, oz, dx, dy, dz, a) {
  const H = a.height(), hh = 0.34, p = a.pos;
  let best = Infinity, head = false;
  if (rayBox(ox, oy, oz, dx, dy, dz, p.x - 0.19, p.y + H - hh, p.z - 0.19, p.x + 0.19, p.y + H + 0.02, p.z + 0.19)) { best = RB.t; head = true; }
  if (rayBox(ox, oy, oz, dx, dy, dz, p.x - 0.32, p.y, p.z - 0.32, p.x + 0.32, p.y + H - hh, p.z + 0.32) && RB.t < best) { best = RB.t; head = false; }
  RA.t = best; RA.head = head; return best < Infinity;
}
function losClear(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, d = Math.hypot(dx, dy, dz);
  if (d < 1e-4) return true;
  rayWorld(a.x, a.y, a.z, dx / d, dy / d, dz / d, d);
  return !RW.hit;
}

