/* ================= bots ================= */
const _a = new THREE.Vector3(), _b = new THREE.Vector3();
function canSee(b, t) {
  b.eyePos(_a); const H = t.height();
  if (b.blindT > now) return false;
  _b.set(t.pos.x, t.pos.y + H * 0.65, t.pos.z); if (losClear(_a, _b) && !smokeBlocks(_a, _b)) return true;
  _b.set(t.pos.x, t.pos.y + H - 0.12, t.pos.z); return losClear(_a, _b) && !smokeBlocks(_a, _b);
}
function botSense(b) {
  const ai = b.ai; let best = null, bd = 1e9;
  b.forward(_d, b.yaw, 0);
  for (const e of agents) {
    if (!e.alive || e.team === b.team) continue;
    const dx = e.pos.x - b.pos.x, dz = e.pos.z - b.pos.z, d = Math.hypot(dx, dz);
    if (d > 75) continue;
    const dot = (dx * _d.x + dz * _d.z) / (d || 1);
    if (dot < 0.2 && d > 4 && ai.target !== e) continue;
    if (canSee(b, e)) { const score = d * (ai.target === e ? 0.6 : 1); if (score < bd) { bd = score; best = e; } }
  }
  if (best) {
    if (ai.target !== best) { ai.seen = Math.min(ai.seen, 0); ai.react = rand(...diff.react); }
    ai.target = best; ai.visible = true; ai.invest = best.pos.clone(); ai.investUntil = now + 4;
    best.spot[b.team] = 1.2;
  } else { ai.visible = false; if (ai.target) { ai.target = null; } }
}
function botGoal(b) {
  const ai = b.ai;
  if (ai.invest && now < ai.investUntil) {
    const cx = Math.floor(ai.invest.x / CELL), cz = Math.floor(ai.invest.z / CELL);
    for (const [ox, oz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) if (walk(cx + ox, cz + oz)) return [cx + ox, cz + oz];
  }
  ai.invest = null;
  if (G.liveT > ZONE_OPEN && ai.wps.length && Math.random() < 0.002) ai.wps.length = 0;
  if (ai.wps.length) return ai.wps[0];
  if (!ai.holdCell || ai.holdT <= 0) {
    const zc = pick(zoneCells), r = G.liveT > ZONE_OPEN - 4 ? 0 : 3;
    ai.holdCell = r ? randomCellIn(zc[0] - r - 2, zc[0] + r, zc[1] - r, zc[1] + r) || zc : zc; ai.holdT = rand(2, 5);
  }
  return ai.holdCell;
}
function updateBot(b, dt) {
  const ai = b.ai, M = b.model;
  if (!b.alive) { if (b.rig.deadT < 3) animateSoldier(b, dt); return; }
  b.fireCd -= dt; b.switchT -= dt; ai.holdT -= dt;
  if (b.reloading > 0) { b.reloading -= dt; if (b.reloading <= 0) finishReload(b); }
  let mx = 0, mz = 0, spd = 4.6 * b.w().move;
  if (G.state === 'freeze') { b.vel.x = b.vel.z = 0; }
  else {
    ai.think -= dt; if (ai.think <= 0) { ai.think = rand(0.1, 0.2); botSense(b); }
    if (ai.target && !ai.target.alive) { ai.target = null; ai.visible = false; }
    const t = ai.target;
    if (t && ai.visible) {
      b.eyePos(_a); _b.set(t.pos.x, t.pos.y + t.height() * (diff === DIFF[2] && Math.random() < 0.3 ? 0.9 : 0.68), t.pos.z);
      const dx = _b.x - _a.x, dy = _b.y - _a.y, dz = _b.z - _a.z, hd = Math.hypot(dx, dz);
      const wy = Math.atan2(-dx, -dz), wp = Math.atan2(dy, hd);
      b.yaw = turnTo(b.yaw, wy, diff.turn * dt); b.pitch = turnTo(b.pitch, wp, diff.turn * dt);
      ai.seen += dt;
      const off = Math.abs(angDiff(b.yaw, wy)) + Math.abs(angDiff(b.pitch, wp));
      const g = b.gun(), W = b.w();
      // выбор оружия
      if (g.mag === 0 && b.reloading <= 0 && b.inv[2] && b.slot === 1 && b.inv[2].mag > 0 && hd < 20) switchSlot(b, 2);
      const hasAmmo = s => b.inv[s] && b.inv[s].mag + b.inv[s].res > 0;
      if (!W.melee && g.mag + g.res === 0) switchSlot(b, [1, 2].find(hasAmmo) ?? 3);
      if (b.slot === 3 && (hasAmmo(1) || hasAmmo(2))) switchSlot(b, hasAmmo(1) ? 1 : 2);
      const moving = Math.hypot(b.vel.x, b.vel.z) > 1.5;
      ai.err = diff.err * (moving ? 1.4 : 1) * Math.max(0.35, 1.2 - ai.seen * 0.6) * (W.scope ? 0.5 : 1) * (1 + hd / 60);
      if (b.burstLeft > 0 && b.fireCd <= 0 && b.reloading <= 0) fire(b);
      else if (ai.seen > ai.react && off < 0.25 && b.fireCd <= 0 && b.reloading <= 0 && (!W.melee || hd < 2)) {
        if (W.auto) {
          if (ai.burst > 0) { fire(b); ai.burst--; } else { b.fireCd = rand(0.18, 0.45) * (hd > 25 ? 1.6 : 1); ai.burst = hd > 25 ? randi(2, 4) : randi(4, 9); }
        } else { if (fire(b)) b.fireCd = W.rate * rand(1.1, W.scope ? 1.3 : 2.2); }
      }
      ai.strafeT -= dt;
      if (ai.strafeT <= 0) { ai.strafe = pick([-1, 0, 1, 1, -1]); ai.strafeT = rand(0.35, 1.0); }
      if (W.scope) ai.strafe = 0;
      mx = Math.cos(b.yaw) * ai.strafe; mz = -Math.sin(b.yaw) * ai.strafe; spd = 2.4;
      if (hd > 30 && !W.scope) { mx -= Math.sin(b.yaw) * 0.6; mz -= Math.cos(b.yaw) * 0.6; }
      if (W.melee) { mx = -Math.sin(b.yaw); mz = -Math.cos(b.yaw); spd = 5.5; }
    } else {
      ai.seen = Math.max(0, ai.seen - dt);
      if (b.reloading <= 0 && b.gun().mag < (b.w().mag || 0) * 0.4 && b.gun().res > 0) startReload(b);
      if (b.slot !== 1 && b.inv[1] && b.inv[1].mag + b.inv[1].res > 0) switchSlot(b, 1);
      const goal = botGoal(b), key = goal[1] * MW + goal[0];
      const ccx = Math.floor(b.pos.x / CELL), ccz = Math.floor(b.pos.z / CELL);
      ai.repath -= dt;
      if (ai.pathKey !== key || ai.repath <= 0 || !ai.path) { ai.path = findPath(ccx, ccz, goal[0], goal[1]); ai.pathI = 0; ai.pathKey = key; ai.repath = 3; }
      const P_ = ai.path;
      while (ai.pathI < P_.length) {
        const n = cellCenter(P_[ai.pathI][0], P_[ai.pathI][1], _b);
        if (Math.hypot(n.x - b.pos.x, n.z - b.pos.z) < 0.6) ai.pathI++; else break;
      }
      if (ai.pathI + 1 < P_.length) { const n2 = cellCenter(P_[ai.pathI + 1][0], P_[ai.pathI + 1][1], _b); if (lineWalkable(b.pos.x, b.pos.z, n2.x, n2.z)) ai.pathI++; }
      if (ai.pathI >= P_.length) {
        if (ai.invest && now < ai.investUntil && ccx === goal[0] && ccz === goal[1]) { ai.invest = null; }
        else if (ai.wps.length && ccx === ai.wps[0][0] && ccz === ai.wps[0][1]) ai.wps.shift();
        else if (P_.length === 0 && (ccx !== goal[0] || ccz !== goal[1])) { ai.holdT = 0; ai.wps.shift(); }
        if (ai.investUntil > now) { b.yaw += dt * 1.5; }
      } else {
        const n = cellCenter(P_[ai.pathI][0], P_[ai.pathI][1], _b);
        const dx = n.x - b.pos.x, dz = n.z - b.pos.z, d = Math.hypot(dx, dz) || 1;
        mx = dx / d; mz = dz / d;
        b.yaw = turnTo(b.yaw, Math.atan2(-mx, -mz), 7 * dt);
        if (ai.invest && now < ai.investUntil) spd *= 0.8;
      }
      b.pitch = turnTo(b.pitch, 0, 2 * dt);
    }
    b.vel.x += (mx * spd - b.vel.x) * Math.min(1, 10 * dt); b.vel.z += (mz * spd - b.vel.z) * Math.min(1, 10 * dt);
  }
  const before = b.pos.clone();
  if (moveBody(b, dt)) { ai.stuckT += dt; if (ai.stuckT > 0.8) { ai.path = null; ai.stuckT = 0; ai.holdT = 0; } } else ai.stuckT = Math.max(0, ai.stuckT - dt);
  animateSoldier(b, dt);
}

