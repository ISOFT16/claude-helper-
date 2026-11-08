/* ================= передвижение: лёжа, уклонение, захват выступов ================= */
// Модель состояний бойца разделена на слои:
//  - передвижение a.mstate: ground / air / dodge / ledgeGrab / hanging / climbing / climbFinish;
//    переходы только через setMove() и только разрешённые в MOVE_TR;
//  - поза a.posture: стоя / присед / лёжа (3 — висит или лезет), меняется через setPosture()
//    с проверкой места над головой и вокруг тела;
//  - действия (стрельба, перезарядка, гранаты) разрешает canUseWeapon().
// Конфликты исключены: лёжа нельзя уклоняться и хвататься за край, на краю нельзя стрелять,
// уклоняться и ложиться, встать под препятствием нельзя.
function setMove(a, to) {
  if (a.mstate === to) return true;
  if (!(MOVE_TR[a.mstate] || []).includes(to)) return false;
  a.mstate = to; a.mT = 0; return true;
}
const busyMove = a => a.mstate === 'ledgeGrab' || a.mstate === 'hanging' || a.mstate === 'climbing' || a.mstate === 'climbFinish';
function canUseWeapon(a) {
  if (!a.alive || busyMove(a)) return false;
  // посреди перехода «лечь/встать» стрелять нельзя
  return a.posture === 2 ? a.proneK > 0.95 : a.proneK < 0.05;
}
// имя текущего состояния — для HUD отладки и автотестов
function moveStateName(a) {
  if (!a.alive) return 'Dead';
  switch (a.mstate) {
    case 'ledgeGrab': return 'LedgeGrab'; case 'hanging': return 'Hanging';
    case 'climbing': return 'Climbing'; case 'climbFinish': return 'ClimbFinish';
    case 'dodge': return 'Dodging'; case 'air': return a.vel.y > 0 ? 'Jumping' : 'Falling';
  }
  const sp = Math.hypot(a.vel.x, a.vel.z);
  if (a.posture === 2) return sp > 0.3 ? 'Crawling' : 'Prone';
  if (a.posture === 1) return 'Crouching';
  return sp > 4 ? 'Running' : sp > 0.3 ? 'Walking' : 'Idle';
}
const actionStateName = a => a.reloading > 0 ? 'Reloading' : a.fireCd > 0 ? 'Shooting' : 'Ready';

/* --- проверки места --- */
function pointFree(x, z, y, H, r = 0.2) {
  for (const [ox, oz] of [[-r, -r], [r, -r], [-r, r], [r, r]]) if (solidSpan(Math.floor((x + ox) / CELL), Math.floor((z + oz) / CELL), y + 0.01, y + H)) return false;
  return true;
}
// тело лёжа вытянуто вдоль bodyYaw: проверяем центр, голову и ноги
function proneFits(a, yaw, x = a.pos.x, z = a.pos.z) {
  const L = MOVE_CFG.proneLen, dx = -Math.sin(yaw) * L, dz = -Math.cos(yaw) * L, H = POSTURE_H[2];
  return pointFree(x, z, a.pos.y, H, 0.3) && pointFree(x + dx, z + dz, a.pos.y, H) && pointFree(x - dx, z - dz, a.pos.y, H);
}
const fitsHeight = (a, H) => freeAt(a, a.pos.x, a.pos.z, a.pos.y, H);
function setPosture(a, p) {
  if (a.posture === p) return true;
  if (busyMove(a) || a.mstate === 'dodge') return false;
  if (p === 2) {
    if (a.mstate !== 'ground') return false;
    // ищем, как уложить тело: сначала по взгляду, потом с поворотом
    for (const off of [0, 0.4, -0.4, 0.8, -0.8, Math.PI / 2, -Math.PI / 2, Math.PI]) {
      if (proneFits(a, a.yaw + off)) { a.bodyYaw = a.yaw + off; a.posture = 2; return true; }
    }
    return false;
  }
  if (!fitsHeight(a, POSTURE_H[p])) return false;
  a.posture = p; return true;
}
// тело лёжа поворачивается за взглядом, только если не упирается в стены
function updateProneBody(a, dt) {
  if (a.posture !== 2) { a.bodyYaw = a.yaw; return; }
  if (a.bodyYaw === undefined) a.bodyYaw = a.yaw;
  const ny = turnTo(a.bodyYaw, a.yaw, MOVE_CFG.proneTurn * dt);
  if (proneFits(a, ny)) a.bodyYaw = ny;
}

/* --- уклонение --- */
// lx — вправо (+1) / влево (−1), lz — назад (+1) / вперёд (−1) относительно взгляда
function dodge(a, lx, lz) {
  const C = MOVE_CFG.dodge;
  if (!a.alive || a.dodgeCd > 0 || G.state === 'freeze' || G.state === 'over') return false;
  if (a.mstate !== 'ground' || a.posture === 2 || a.proneK > 0.05) return false;
  if (!lx && !lz) lz = 1;
  const l = Math.hypot(lx, lz); lx /= l; lz /= l;
  const s = Math.sin(a.yaw), c = Math.cos(a.yaw), wx = lx * c + lz * s, wz = -lx * s + lz * c;
  const mob = gearMobility(a);
  const dist = C.dist * (1 - mob * 1.6);
  // проверка траектории: рывок обрывается перед препятствием
  let free = 0;
  for (let d = 0.2; d <= dist + 1e-6; d += 0.2) { if (!freeAt(a, a.pos.x + wx * d, a.pos.z + wz * d)) break; free = d; }
  if (free < C.minDist) { if (a === P) showHint(t('dodgeBlocked'), 0.8); return false; }
  a.dodgeDir.set(wx, 0, wz); a.dodgeSpeed = free / C.time; a.dodgeT = C.time; a.dodgeLx = lx; a.dodgeLz = lz;
  a.dodgeCd = C.cd * (1 + mob * 2);
  setMove(a, 'dodge');
  slideNoise(a === P ? null : a.pos, 0.4, 0.2); if (a === P) landSound();
  if (typeof dustFx === 'function') dustFx(a.pos, 6, 0.5);
  return true;
}
function updateDodge(a, dt) {
  if (a.mstate !== 'dodge') return;
  a.dodgeT -= dt; a.mT += dt;
  // скорость спадает к концу рывка; средняя скорость = dodgeSpeed
  const p = clamp(a.mT / MOVE_CFG.dodge.time, 0, 1), v = a.dodgeSpeed * (1.25 - 0.5 * p);
  a.vel.x = a.dodgeDir.x * v; a.vel.z = a.dodgeDir.z * v;
  if (a.dodgeT <= 0) { a.vel.x *= 0.3; a.vel.z *= 0.3; setMove(a, a.onGround ? 'ground' : 'air'); }
}

/* --- захват выступов и подтягивание --- */
// Ищет край в соседней по оси клетке перед бойцом (fx, fz — куда смотрит или движется).
// Проверяет высоту края, расстояние до грани, место для зависания и место наверху.
function findLedge(a, fx, fz) {
  const C = MOVE_CFG.ledge, p = a.pos;
  const ground = floorAt(p.x, p.z, p.y + 0.1, 0.25); // опора под бойцом — от неё считается досягаемость
  const px = p.x + fx * 0.6, pz = p.z + fz * 0.6;
  let best = null;
  eachBox(px - 0.06, pz - 0.06, px + 0.06, pz + 0.06, b => {
    if (b.pass || b.glass || b.noClimb || b.stair) return;
    const rel = b.y1 - ground; if (rel < C.reachMin || rel > C.reachMax || b.y1 < p.y + 0.3) return;
    if (!best || b.y1 > best.y1) best = b;
  });
  if (!best) return null;
  const h = best.y1, alongX = Math.abs(fx) >= Math.abs(fz), dir = alongX ? Math.sign(fx) : Math.sign(fz);
  const face = alongX ? (dir > 0 ? best.x0 : best.x1) : (dir > 0 ? best.z0 : best.z1);
  if (Math.abs(face - (alongX ? p.x : p.z)) > 0.62) return null;
  // точка наверху: за кромкой на inset; поперёк — где боец, но внутри коробки
  const lat = alongX ? clamp(p.z, best.z0 + 0.3, best.z1 - 0.3) : clamp(p.x, best.x0 + 0.3, best.x1 - 0.3);
  const top = alongX ? new THREE.Vector3(face + dir * C.inset, h, lat) : new THREE.Vector3(lat, h, face + dir * C.inset);
  const hangY = Math.max(ground, h - C.hangDrop);
  const hang = alongX ? new THREE.Vector3(face - dir * 0.34, hangY, lat) : new THREE.Vector3(lat, hangY, face - dir * 0.34);
  if (!freeAt(a, top.x, top.z, h, POSTURE_H[1]) || !freeAt(a, hang.x, hang.z, hangY, POSTURE_H[0])) return null;
  // наверху должна быть опора (или это стенка — тогда боец перелезет и спрыгнет дальше)
  return { h, nx: alongX ? -dir : 0, nz: alongX ? 0 : -dir, top, hang, from: p.clone(), auto: false };
}
function startLedge(a, L) {
  if (!L || !setMove(a, 'ledgeGrab')) return false;
  a.ledge = L; a.posture = 3; a.proneK = 0; a.vel.set(0, 0, 0); a.scoped = false;
  if (a === P) { clickAt(null, 900, 0.25); P.scoped = false; }
  return true;
}
function releaseLedge(a) {
  const L = a.ledge;
  if (!setMove(a, 'air')) return;
  a.posture = 0; a.ledgeCd = 0.5; a.ledge = null;
  if (L) a.vel.set(L.nx * 1.6, 0, L.nz * 1.6);
}
const easeIO = x => x * x * (3 - 2 * x);
// input: { climb, drop } — подтянуться или отпустить край
function updateLedge(a, dt, input) {
  const L = a.ledge, C = MOVE_CFG.ledge; if (!L) return;
  a.mT += dt; a.vel.set(0, 0, 0); a.onGround = false;
  if (a.mstate === 'ledgeGrab') {
    const k = Math.min(1, a.mT / C.grabTime);
    a.pos.lerpVectors(L.from, L.hang, easeIO(k));
    if (input.fwd) L.auto = true; // держим «вперёд» — сразу лезем наверх
    if (k >= 1) setMove(a, 'hanging');
  } else if (a.mstate === 'hanging') {
    a.pos.copy(L.hang);
    if (input.drop) releaseLedge(a);
    else if (input.climb || L.auto) { setMove(a, 'climbing'); if (a === P) { slideNoise(null, 0.25, 0.3); } }
  } else if (a.mstate === 'climbing') {
    // сначала тело поднимается вдоль стены, затем переносится на верх
    const k = Math.min(1, a.mT / C.climbTime), up = easeIO(Math.min(1, k / 0.6)), over = easeIO(clamp((k - 0.45) / 0.55, 0, 1));
    a.pos.set(L.hang.x + (L.top.x - L.hang.x) * over, L.hang.y + (L.h - L.hang.y) * up, L.hang.z + (L.top.z - L.hang.z) * over);
    if (k >= 1) { a.pos.copy(L.top); setMove(a, 'climbFinish'); if (a === P) landSound(); }
  } else if (a.mstate === 'climbFinish') {
    a.onGround = true;
    if (a.mT >= C.finishTime) {
      a.posture = fitsHeight(a, POSTURE_H[0]) ? 0 : 1;
      setMove(a, 'ground'); a.ledge = null; a.ledgeCd = 0.3;
    }
  }
}
