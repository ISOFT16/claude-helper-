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
    // координация: союзники рядом без цели получают «доклад» о противнике (с задержкой реакции)
    if (!ai.calledT || now > ai.calledT) {
      ai.calledT = now + 3;
      for (const m of agents) if (m !== b && m.alive && m.team === b.team && m.net === 'bot' && !m.ai.target && m.pos.distanceTo(b.pos) < 35) { m.ai.invest = best.pos.clone(); m.ai.investUntil = now + 5 + Math.random() * 2; }
    }
  } else { ai.visible = false; if (ai.target) { ai.target = null; } }
}
// цель бота — узел навигации: укрытие при отступлении, место шума/выстрела, точки маршрута, удержание узла связи
function botGoal(b) {
  const ai = b.ai;
  if (ai.cover && now < ai.coverT) return ai.cover;
  ai.cover = null;
  if (ai.invest && now < ai.investUntil) { const n = nearestNode(ai.invest, 4); if (n) return n; }
  ai.invest = null;
  if (G.liveT > ZONE_OPEN && ai.wps.length && Math.random() < 0.002) ai.wps.length = 0;
  if (ai.wps.length) return ai.wps[0];
  if (!ai.holdNode || ai.holdT <= 0) {
    const r = G.liveT > ZONE_OPEN - 4 ? 0 : 3;
    ai.holdNode = randomNodeIn(zone.x0 - r, zone.z0 - r, zone.x1 + r, zone.z1 + r, n => Math.abs(n.y - zone.y) < 1.5) || nearestNode({ x: zone.cx, y: zone.y, z: zone.cz }, 6);
    ai.holdT = rand(2, 5);
  }
  return ai.holdNode;
}
// укрытие: ближайший узел, с которого не видно угрозу (по лучу на уровне груди)
function findCover(b, threat) {
  const N = WORLD.nav; if (!N) return null;
  let best = null, bd = 1e9; const t = new THREE.Vector3(threat.x, threat.y + 1.4, threat.z), p = new THREE.Vector3();
  for (let k = 0; k < 40; k++) {
    const n = N.nodes[(Math.random() * N.nodes.length) | 0];
    const d = Math.hypot(n.x - b.pos.x, n.z - b.pos.z); if (d > 14 || d < 2 || Math.abs(n.y - b.pos.y) > 3.5) continue;
    p.set(n.x, n.y + 1.2, n.z); if (losClear(p, t)) continue;
    const score = d - Math.hypot(n.x - threat.x, n.z - threat.z) * 0.4; if (score < bd) { bd = score; best = n; }
  }
  return best;
}
// движение по пути к цели (узлы навигации: этажи, лестницы, крыши); возвращает направление или null
function followPath(b, dt) {
  const ai = b.ai;
  const goal = botGoal(b), key = goal ? goal.i : -1;
  ai.repath -= dt;
  if (goal && (ai.pathKey !== key || ai.repath <= 0 || !ai.path)) { const from = nearestNode(b.pos); ai.path = navPath(from, goal); ai.pathI = 0; ai.pathKey = key; ai.repath = 3 + Math.random(); }
  const P_ = ai.path || [];
  while (ai.pathI < P_.length) {
    const n = P_[ai.pathI];
    if (Math.hypot(n.x - b.pos.x, n.z - b.pos.z) < 0.55 && Math.abs(n.y - b.pos.y) < 1.3) ai.pathI++; else break;
  }
  // срезаем углы только на одной высоте
  if (ai.pathI + 1 < P_.length) { const n2 = P_[ai.pathI + 1]; if (Math.abs(n2.y - b.pos.y) < 0.3 && Math.abs(P_[ai.pathI].y - b.pos.y) < 0.3 && lineWalkable(b.pos.x, b.pos.z, n2.x, n2.z, b.pos.y)) ai.pathI++; }
  const atGoal = goal && Math.hypot(goal.x - b.pos.x, goal.z - b.pos.z) < 0.8 && Math.abs(goal.y - b.pos.y) < 1.3;
  if (ai.pathI >= P_.length) {
    if (atGoal && ai.cover) { ai.cover = null; ai.coverT = 0; }
    else if (atGoal && ai.invest) { ai.invest = null; }
    else if (atGoal && ai.wps.length && ai.wps[0] === goal) ai.wps.shift();
    else if (!P_.length && goal && !atGoal) { ai.holdT = 0; if (ai.wps[0] === goal) ai.wps.shift(); ai.invest = null; }
    return null;
  }
  const n = P_[ai.pathI], dx = n.x - b.pos.x, dz = n.z - b.pos.z, d = Math.hypot(dx, dz) || 1;
  return [dx / d, dz / d];
}
function updateBot(b, dt) {
  const ai = b.ai, M = b.model;
  if (!b.alive) { if (b.rig.deadT < 3) animateSoldier(b, dt); return; }
  b.fireCd -= dt; b.switchT -= dt; ai.holdT -= dt; b.dodgeCd = Math.max(0, b.dodgeCd - dt);
  if (b.reloading > 0) { b.reloading -= dt; if (b.reloading <= 0) finishReload(b); }
  let mx = 0, mz = 0, spd = 4.6 * b.w().move;
  if (G.state === 'freeze') { b.vel.x = b.vel.z = 0; }
  else {
    // частота решений: вдали от игрока реже
    ai.think -= dt; if (ai.think <= 0) { ai.think = rand(0.1, 0.2) * (b.pos.distanceTo(P.pos) > 45 ? 2 : 1); botSense(b); }
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
      // отступление к укрытию под огнём (стреляет на ходу)
      if (ai.cover && now < ai.coverT) { const dx = ai.cover.x - b.pos.x, dz = ai.cover.z - b.pos.z, d = Math.hypot(dx, dz); if (d > 0.6) { mx = dx / d; mz = dz / d; spd = 4.6; } else { ai.cover = null; } }
      // дальний бой: продолжаем свой маршрут (этажи, обход) и стреляем на ходу
      if (hd > 22 && !W.scope && !(ai.cover && now < ai.coverT)) { const pd = followPath(b, dt); if (pd) { mx = pd[0] * 0.9 + mx * 0.3; mz = pd[1] * 0.9 + mz * 0.3; spd = 3.4; } }
      if (W.melee) { mx = -Math.sin(b.yaw); mz = -Math.cos(b.yaw); spd = 5.5; }
    } else {
      ai.seen = Math.max(0, ai.seen - dt);
      if (b.reloading <= 0 && b.gun().mag < (b.w().mag || 0) * 0.4 && b.gun().res > 0) startReload(b);
      if (b.slot !== 1 && b.inv[1] && b.inv[1].mag + b.inv[1].res > 0) switchSlot(b, 1);
      const pd = followPath(b, dt); if (pd) { mx = pd[0]; mz = pd[1]; b.yaw = turnTo(b.yaw, Math.atan2(-mx, -mz), 7 * dt); if (ai.invest && now < ai.investUntil) spd *= 0.8; if (ai.cover) spd = 5.2; }
      else if (ai.investUntil > now) b.yaw += dt * 1.5;
      b.pitch = turnTo(b.pitch, 0, 2 * dt);
    }
    if (b.mstate === 'dodge') updateDodge(b, dt);
    else { spd *= 1 - gearMobility(b); b.vel.x += (mx * spd - b.vel.x) * Math.min(1, 10 * dt); b.vel.z += (mz * spd - b.vel.z) * Math.min(1, 10 * dt); }
  }
  const before = b.pos.clone();
  if (moveBody(b, dt)) { ai.stuckT += dt; if (ai.stuckT > 0.8) { ai.path = null; ai.stuckT = 0; ai.holdT = 0; } } else ai.stuckT = Math.max(0, ai.stuckT - dt);
  animateSoldier(b, dt);
}

