/* ================= physics ================= */
function resolveAxis(a, axis, d) {
  const r = 0.32, H = a.height(), p = a.pos;
  const x0 = Math.floor((p.x - r) / CELL), x1 = Math.floor((p.x + r) / CELL), z0 = Math.floor((p.z - r) / CELL), z1 = Math.floor((p.z + r) / CELL);
  for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
    const h = hAt(cx, cz); if (!solidSpan(cx, cz, p.y, p.y + H)) continue;
    if (a.onGround && h - p.y <= STEP && h < 90 && bAt(cx, cz) === 0) { p.y = h; continue; }
    if (axis === 0) p.x = d > 0 ? cx * CELL - r - 1e-4 : (cx + 1) * CELL + r + 1e-4;
    else p.z = d > 0 ? cz * CELL - r - 1e-4 : (cz + 1) * CELL + r + 1e-4;
    if (axis === 0) a.vel.x = 0; else a.vel.z = 0;
    return true;
  }
  return false;
}
function moveBody(a, dt) {
  const p = a.pos, dx = a.vel.x * dt, dz = a.vel.z * dt;
  let blocked = false;
  if (dx) { p.x += dx; blocked = resolveAxis(a, 0, dx) || blocked; }
  if (dz) { p.z += dz; blocked = resolveAxis(a, 1, dz) || blocked; }
  const prevY = p.y; a.vel.y -= GRAV * dt; p.y += a.vel.y * dt; a.onGround = false;
  if (p.y <= 0) { p.y = 0; a.vel.y = 0; a.onGround = true; }
  const r = 0.28, x0 = Math.floor((p.x - r) / CELL), x1 = Math.floor((p.x + r) / CELL), z0 = Math.floor((p.z - r) / CELL), z1 = Math.floor((p.z + r) / CELL);
  const H = a.height();
  for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
    const h = hAt(cx, cz); if (h <= 0 || h > 90) continue;
    if (p.y < h && prevY >= h - 0.001 && a.vel.y <= 0) { p.y = h; a.vel.y = 0; a.onGround = true; }
    // удар головой о низ воздуховода при прыжке
    const b = bAt(cx, cz);
    if (b > 0 && a.vel.y > 0 && p.y + H > b && prevY + H <= b + 0.001) { p.y = b - H; a.vel.y = 0; }
  }
  return blocked;
}
function freeAt(a, x, z, y = a.pos.y, H = a.height()) {
  const r = 0.33;
  for (const [ox, oz] of [[-r, -r], [r, -r], [-r, r], [r, r]]) if (solidSpan(Math.floor((x + ox) / CELL), Math.floor((z + oz) / CELL), y + 0.01, y + H)) return false;
  return true;
}
function separate() {
  for (let i = 0; i < agents.length; i++) for (let j = i + 1; j < agents.length; j++) {
    const a = agents[i], b = agents[j]; if (!a.alive || !b.alive || a.net === 'remote' || b.net === 'remote' || a.net === 'proxy' || b.net === 'proxy') continue;
    const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d = Math.hypot(dx, dz);
    if (d > 0.01 && d < 0.65 && Math.abs(a.pos.y - b.pos.y) < 1.5) {
      const push = (0.65 - d) / 2, nx = dx / d * push, nz = dz / d * push;
      if (freeAt(a, a.pos.x - nx, a.pos.z - nz)) { a.pos.x -= nx; a.pos.z -= nz; }
      if (freeAt(b, b.pos.x + nx, b.pos.z + nz)) { b.pos.x += nx; b.pos.z += nz; }
    }
  }
}

