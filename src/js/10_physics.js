/* ================= physics ================= */
// столкновения бойца (цилиндр радиуса r, высота по позе) с коробками мира, по осям отдельно.
// Ступени и пороги до STEP — перешагиваем, если над ними хватает места.
function resolveAxis(a, axis, d) {
  const r = 0.32, H = a.height(), p = a.pos;
  let blocked = false;
  eachBox(p.x - r, p.z - r, p.x + r, p.z + r, b => {
    if (b.pass || b.y1 <= p.y + 0.001 || b.y0 >= p.y + H - 0.001) return;
    if (a.onGround && b.y1 - p.y <= STEP && !solidRect(p.x, p.z, r, b.y1 + 0.01, b.y1 + H)) { p.y = b.y1; return; }
    if (axis === 0) p.x = d > 0 ? b.x0 - r - 1e-4 : b.x1 + r + 1e-4;
    else p.z = d > 0 ? b.z0 - r - 1e-4 : b.z1 + r + 1e-4;
    if (axis === 0) a.vel.x = 0; else a.vel.z = 0;
    blocked = true;
  });
  return blocked;
}
function moveBody(a, dt) {
  const p = a.pos, dx = a.vel.x * dt, dz = a.vel.z * dt;
  let blocked = false;
  // большие смещения дробим, чтобы не проскочить тонкую стену
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) / 0.25));
  for (let i = 0; i < n; i++) {
    if (dx) { p.x += dx / n; blocked = resolveAxis(a, 0, dx) || blocked; }
    if (dz) { p.z += dz / n; blocked = resolveAxis(a, 1, dz) || blocked; }
  }
  // страховка: боец никогда не выходит за пределы карты
  p.x = clamp(p.x, 0.34, WORLD.W - 0.34); p.z = clamp(p.z, 0.34, WORLD.D - 0.34);
  const wasGround = a.onGround, prevY = p.y, H = a.height();
  a.vel.y -= GRAV * dt; p.y += a.vel.y * dt; a.onGround = false;
  const fy = WORLD.groundPlane ? 0 : WORLD.floorY;
  if (p.y <= fy) { p.y = fy; a.vel.y = 0; a.onGround = true; }
  const r = 0.28;
  eachBox(p.x - r, p.z - r, p.x + r, p.z + r, b => {
    if (b.pass) return;
    if (a.vel.y <= 0 && p.y < b.y1 && prevY >= b.y1 - 0.001) { p.y = b.y1; a.vel.y = 0; a.onGround = true; }
    else if (a.vel.y > 0 && p.y + H > b.y0 && prevY + H <= b.y0 + 0.001) { p.y = b.y0 - H; a.vel.y = 0; }
  });
  // спуск по ступеням: прилипаем к опоре, если она чуть ниже (без «подпрыгивания» на лестнице)
  if (!a.onGround && wasGround && a.vel.y <= 0 && a.mstate !== 'dodge') {
    const f = floorAt(p.x, p.z, prevY + 0.01, 0.25);
    if (prevY - f <= 0.45 && prevY - f >= 0) { p.y = f; a.vel.y = 0; a.onGround = true; }
  }
  return blocked;
}
function freeAt(a, x, z, y = a.pos.y, H = a.height()) { return !solidRect(x, z, 0.33, y + 0.01, y + H); }
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

