/* ================= player ================= */
const keys = {};
let mouseDown = false, locked = false, reScopeT = 0, shake = 0, bobT = 0, lastStep = 0, specTarget = null, crouchToggled = false, wasGround = true;
let lookDX = 0, lookDY = 0;
let wantProne = false, postureHintT = 0;
function updatePlayer(dt) {
  P.fireCd -= dt; P.switchT -= dt; P.dodgeCd = Math.max(0, P.dodgeCd - dt); P.ledgeCd = Math.max(0, (P.ledgeCd || 0) - dt);
  if (P.reloading > 0) { P.reloading -= dt; if (P.reloading <= 0) finishReload(P); }
  // плавный возврат после отдачи: тяжёлое оружие возвращается медленнее; при стрельбе — медленнее
  const rk = P.recoverK || 7; P.punchP *= Math.exp(-(mouseDown ? rk * 0.42 : rk) * dt); P.punchY *= Math.exp(-rk * 0.85 * dt);
  P.spreadAcc *= Math.exp(-(mouseDown ? 2 : 6) * dt);
  if (reScopeT > 0) { reScopeT -= dt; if (reScopeT <= 0 && rmbHeldScope && P.alive && P.w().scope) P.scoped = true; }
  postureHintT -= dt;
  if (!P.alive) return;
  const W = P.w(), typing = chatOpen;
  const walking = !typing && bindDown('walk');
  updateStamina(P, dt);
  let fx = 0, fz = 0;
  if (!typing) { if (bindDown('fwd')) fz -= 1; if (bindDown('back')) fz += 1; if (bindDown('left')) fx -= 1; if (bindDown('right')) fx += 1; }
  if (TOUCH) { fx += joy.x; fz += joy.y; }
  if (G.state === 'freeze') fx = fz = 0;
  const len = Math.hypot(fx, fz); if (len > 1) { fx /= len; fz /= len; }
  const jumpHeld = !typing && (bindDown('jump') || keys.TouchJump);
  const crouchHeld = !typing && (SET.toggleCrouch ? crouchToggled : bindDown('crouch')) || touchCrouch;
  // висим на краю или лезем: управление только «подтянуться» и «отпустить»
  const jumpPressed = jumpHeld && !prevJump; prevJump = jumpHeld;
  if (busyMove(P)) {
    // на краю: новое нажатие прыжка или «вперёд» — подтянуться, присесть или «назад» — отпустить
    updateLedge(P, dt, { climb: jumpPressed || fz < -0.5, fwd: fz < -0.5, drop: crouchHeld || fz > 0.5 });
    const et = P.mstate === 'climbing' ? 1.0 : P.mstate === 'climbFinish' ? POSTURE_EYE[0] : 1.72;
    P.eye += (et - P.eye) * Math.min(1, 10 * dt); P.eyeOff.set(0, 0, 0);
    wasGround = false; return;
  }
  // поза: лёжа (переключатель) важнее приседа
  const wantP = wantProne ? 2 : crouchHeld ? 1 : 0;
  if (wantP !== P.posture && P.mstate !== 'dodge') {
    if (!setPosture(P, wantP)) {
      // встать не даёт препятствие: пробуем хотя бы присесть
      if (P.posture === 2 && wantP === 0 && setPosture(P, 1)) {}
      else if (postureHintT <= 0 && (P.posture === 2 || wantP === 2)) { showHint(t(wantP === 2 ? 'proneBlocked' : 'standBlocked'), 1.2); postureHintT = 1.5; }
    }
  }
  P.proneK = clamp(P.proneK + (P.posture === 2 ? 1 : -1) * dt / MOVE_CFG.proneTime, 0, 1);
  updateProneBody(P, dt);
  if (P.posture === 2) { // лёжа обзор ограничен положением тела
    P.yaw = P.bodyYaw + clamp(angDiff(P.bodyYaw, P.yaw), -1.25, 1.25);
    P.pitch = clamp(P.pitch, -0.45, 0.9);
  }
  const s = Math.sin(P.yaw), c = Math.cos(P.yaw);
  const wx = fx * c + fz * s, wz = -fx * s + fz * c;
  const S = MOVE_CFG.speed, trans = P.proneK > 0.02 && P.proneK < 0.98;
  // спринт: вперёд, стоя, не целясь; на телефоне — джойстик до упора
  const wantSprint = !typing && (bindDown('sprint') || (TOUCH && Math.hypot(joy.x, joy.y) > 0.96)) && fz < -0.5 && P.posture === 0 && !P.scoped && P.onGround && G.state !== 'freeze';
  P.sprinting = wantSprint && (P.stam > 1) && P.reloading <= 0;
  if (P.sprinting) { P.stam -= MOVE_CFG.stamina.sprint * dt; P.stamT = MOVE_CFG.stamina.delay * 0.5; mouseDown = mouseDown && !P.sprinting ? mouseDown : mouseDown; }
  const base = P.sprinting ? S.sprint : P.posture === 2 ? S.prone : P.posture === 1 ? S.crouch : walking ? S.walk : S.stand;
  const speed = base * W.move * (P.scoped ? 0.55 : 1) * (1 - gearMobility(P)) * (trans ? 0.25 : 1);
  if (P.mstate === 'dodge') updateDodge(P, dt);
  else {
    // плавный разгон и торможение; в воздухе управление слабее
    const acc = P.onGround ? (Math.hypot(wx, wz) > 0.1 ? 12 : 16) : 2.5;
    P.vel.x += (wx * speed - P.vel.x) * Math.min(1, acc * dt);
    P.vel.z += (wz * speed - P.vel.z) * Math.min(1, acc * dt);
  }
  if (jumpHeld && P.onGround && G.state !== 'freeze' && P.mstate === 'ground') {
    if (P.posture === 2) { if (!jumpLatch) { wantProne = false; jumpLatch = true; } }
    else if (!jumpLatch) { P.vel.y = 7.4; P.onGround = false; setMove(P, 'air'); }
  }
  if (!jumpHeld) jumpLatch = false;
  const vy = P.vel.y, ox = P.pos.x, oz = P.pos.z;
  moveBody(P, dt);
  // лёжа тело длинное: не даём голове и ногам войти в стену
  if (P.posture === 2 && !proneFits(P, P.bodyYaw)) { P.pos.x = ox; P.pos.z = oz; P.vel.x = P.vel.z = 0; }
  if (P.mstate === 'ground' && !P.onGround) setMove(P, 'air');
  else if (P.mstate === 'air' && P.onGround) setMove(P, 'ground');
  if (P.onGround && !wasGround) { landKick = clamp(-vy / 9, 0, 1); if (vy < -6) { landSound(); dustFx(P.pos, 8, 0.6); } }
  wasGround = P.onGround;
  // захват края: в воздухе, если жмём вперёд или держим прыжок
  P.autoClimbT = Math.max(0, (P.autoClimbT || 0) - dt); if (P.autoClimbT > 0) fz = Math.min(fz, -1);
  if (P.mstate === 'air' && P.ledgeCd <= 0 && (fz < -0.3 || jumpHeld)) {
    const hx = Math.hypot(P.vel.x, P.vel.z) > 1.5 && fz >= -0.3 ? P.vel.x / Math.hypot(P.vel.x, P.vel.z) : -s, hz = Math.hypot(P.vel.x, P.vel.z) > 1.5 && fz >= -0.3 ? P.vel.z / Math.hypot(P.vel.x, P.vel.z) : -c;
    const L = findLedge(P, hx, hz); if (L) { L.auto = fz < -0.3; startLedge(P, L); return; }
  }
  // камера: высота глаз по позе, лёжа голова впереди центра тела
  const eyeT = POSTURE_EYE[P.posture === 2 ? 2 : P.posture === 1 ? 1 : 0];
  P.eye += (eyeT - P.eye) * Math.min(1, (P.posture === 2 || P.proneK > 0 ? 6 : 12) * dt);
  P.eyeOff.set(-Math.sin(P.bodyYaw) * 0.5 * P.proneK, 0, -Math.cos(P.bodyYaw) * 0.5 * P.proneK);
  const hs = Math.hypot(P.vel.x, P.vel.z);
  if (P.onGround && hs > 1) {
    bobT += dt * hs * 1.6;
    if (!walking && P.posture === 0 && hs > 3.5 && bobT - lastStep > Math.PI) { lastStep = bobT; stepSound(null, 1); if (hs > 5) dustFx(P.pos, 2, 0.25); }
    if (P.posture === 2 && bobT - lastStep > Math.PI) { lastStep = bobT; slideNoise(null, 0.12, 0.25); }
  }
  // стрельба (у оружия с отсечкой очередь дострeливается сама)
  // на бегу оружие опущено: выстрел прерывает спринт
  if (P.sprinting && (mouseDown || P.burstLeft > 0)) P.sprinting = false;
  const armed = canUseWeapon(P) && !P.sprinting;
  const autoShot = armed && SET.autoFire && !mouseDown && autoFireTarget(W);
  if (armed && (mouseDown || autoShot || P.burstLeft > 0) && G.state !== 'freeze' && !G.buyOpen) {
    if (fire(P) && !W.auto && !W.melee && !TOUCH && !(P.burstLeft > 0)) mouseDown = false;
  }
  if (TOUCH && mouseDown && !W.melee && SET.aimAssist) aimAssist(dt);
}
let jumpLatch = false, landKick = 0, prevJump = false;
function toggleProne() { if (!P.alive || busyMove(P)) return; wantProne = !wantProne; if (!wantProne && P.posture === 2) crouchToggled = false; }
// автострельба: стреляем сами, когда прицел наведён на видимого врага
let autoSeenT = 0;
function autoFireTarget(W) {
  if (!P.alive || P.reloading > 0 || P.switchT > 0 || G.state === 'freeze' || G.buyOpen) { autoSeenT = 0; return false; }
  P.eyePos(_e); P.forward(_d, P.yaw + P.punchY, P.pitch + P.punchP);
  const range = W.melee ? 2.2 : W.cat === 'shotgun' ? 30 : 120;
  rayWorld(_e.x, _e.y, _e.z, _d.x, _d.y, _d.z, range);
  const wallT = RW.hit ? RW.t : range;
  let target = null;
  for (const b of agents) {
    if (!b.alive || b.team === P.team || !active(b)) continue;
    if (rayAgent(_e.x, _e.y, _e.z, _d.x, _d.y, _d.z, b) && RA.t < wallT) { target = b; break; }
  }
  if (target && smokeBlocks(_e, _a.copy(target.pos).setY(target.pos.y + 1))) target = null;
  // небольшая задержка реакции, чтобы не стрелять от случайного касания прицелом
  autoSeenT = target ? autoSeenT + 1 : 0;
  return autoSeenT > 2;
}
function aimAssist(dt) {
  P.forward(_d, P.yaw, P.pitch); P.eyePos(_e);
  let best = null, ba = 0.12;
  for (const e of agents) {
    if (!e.alive || e.team === P.team) continue;
    _a.set(e.pos.x - _e.x, e.pos.y + e.height() * 0.7 - _e.y, e.pos.z - _e.z);
    const d = _a.length(), ang = Math.acos(clamp(_a.dot(_d) / d, -1, 1));
    if (ang < ba && d < 60 && canSee(P, e)) { ba = ang; best = e; }
  }
  if (!best) return;
  const dx = best.pos.x - _e.x, dz = best.pos.z - _e.z, dy = best.pos.y + best.height() * 0.7 - _e.y;
  const k = (diff === DIFF[0] ? 0.9 : 0.6) * dt;
  P.yaw = turnTo(P.yaw, Math.atan2(-dx, -dz), k); P.pitch = turnTo(P.pitch, Math.atan2(dy, Math.hypot(dx, dz)), k);
}
// уклонение по направлению движения (без ввода — назад)
function dash() {
  let fx = 0, fz = 0;
  if (bindDown('fwd')) fz -= 1; if (bindDown('back')) fz += 1; if (bindDown('left')) fx -= 1; if (bindDown('right')) fx += 1;
  if (TOUCH) { fx += joy.x; fz += joy.y; }
  if (Math.hypot(fx, fz) < 0.3) fx = fz = 0;
  dodge(P, fx, fz);
}
function cycleNade() {
  if (!P.gren) return;
  const have = NADES.filter(k => P.gren[k] > 0); if (!have.length) return;
  const i = have.indexOf(P.nadeSel); P.nadeSel = have[(i + 1) % have.length];
  showHint(t(P.nadeSel), 1); clickAt(null, 1800, 0.25);
}
let rmbHeldScope = false;
function toggleScope() { if (P.alive && P.w().scope) { P.scoped = !P.scoped; rmbHeldScope = P.scoped; clickAt(null, 2400, 0.25); } }
document.addEventListener('mousedown', e => {
  if (TOUCH || !G.started || G.over) return;
  if (!locked) { if (!G.buyOpen && !chatOpen && !e.target.closest('.overlay') && e.target.id !== 'chatin') lock(); return; }
  initAudio();
  if (e.button === 0) mouseDown = true;
  if (e.button === 2) toggleScope();
  if (!P.alive && e.button === 0) nextSpec();
});
document.addEventListener('mouseup', e => { if (e.button === 0) mouseDown = false; });
document.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('mousemove', e => {
  if (!locked || !P.alive) return;
  const W = P.w(), k = 0.0022 * SET.sens * (P.scoped ? SET.scopeSens * ((W.zoom || 40) / 40) : 1);
  P.yaw -= e.movementX * k; P.pitch = clamp(P.pitch - e.movementY * k * (SET.invertY ? -1 : 1), -1.5, 1.5);
  lookDX += e.movementX; lookDY += e.movementY;
});
document.addEventListener('keydown', e => {
  if (e.target && e.target.tagName === 'INPUT') { if (e.code === 'Enter' && e.target.id === 'mpcode') joinGame(); return; }
  if (rebinding) return;
  const act = actionOf(e.code);
  if (act === 'scores' || e.code === 'Tab') e.preventDefault();
  if (['Space', 'Tab', 'ControlLeft'].includes(e.code) || act === 'jump' || act === 'crouch') e.preventDefault();
  if (G.started && act === 'scores') { G.board = true; renderBoard(); return; }
  keys[e.code] = true;
  if (G.started && WM.open && !e.repeat && (act === 'map' || e.code === 'Escape')) { toggleWorldMap(false); return; }
  if (!G.started || !locked || e.repeat) return;
  if (G.buyOpen && buyKey(e.code)) return;
  switch (act) {
    case 'prim': switchSlot(P, 1); break;
    case 'sec': switchSlot(P, 2); break;
    case 'knife': switchSlot(P, 3); break;
    case 'nade': cycleNade(); break;
    case 'throw': if (P.alive) throwNade(P); break;
    case 'last': switchSlot(P, P.lastSlot); break;
    case 'reload': if (P.alive) startReload(P); break;
    case 'dash': dash(); break;
    case 'inspect': if (P.alive && P.reloading <= 0) vm.inspectT = 0; break;
    case 'buy': toggleBuy(); break;
    case 'chat': if (NET.mode !== 'off') { e.preventDefault(); openChat(); } break;
    case 'start': if (NET.mode === 'host' && G.state === 'lobby') hostStartMatch(); break;
    case 'team': requestTeamSwitch(); break;
    case 'crouch': if (P.posture === 2) { wantProne = false; crouchToggled = true; } else crouchToggled = !crouchToggled; break;
    case 'prone': toggleProne(); break;
    case 'map': toggleWorldMap(); break;
    case 'jump': if (!P.alive) nextSpec(); break;
  }
});
document.addEventListener('keyup', e => {
  keys[e.code] = false;
  if (actionOf(e.code) === 'scores' || e.code === 'Tab') { G.board = false; $('board').classList.add('hidden'); }
});
function lock() {
  if (TOUCH) {
    G.paused = false; $('pause').classList.add('hidden'); $('touch').classList.add('on');
    if (!IS_APP && !document.fullscreenElement && document.documentElement.requestFullscreen)
      document.documentElement.requestFullscreen().then(() => screen.orientation?.lock?.('landscape')).catch(() => {});
    return;
  }
  const r = renderer.domElement.requestPointerLock(); if (r && r.catch) r.catch(() => {});
}
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === renderer.domElement;
  if (!G.started) return;
  if (!locked) {
    mouseDown = false; for (const k in keys) keys[k] = false;
    if (G.buyOpen) toggleBuy(false);
    if (chatOpen || G.mapOpen) return;
    G.paused = true; showPause();
  } else { G.paused = false; $('pause').classList.add('hidden'); }
});
function nextSpec() {
  const allies = agents.filter(a => a.team === P.team && a.alive && a !== P);
  const pool = allies.length ? allies : agents.filter(a => a.alive);
  if (!pool.length) return;
  const i = pool.indexOf(specTarget); specTarget = pool[(i + 1) % pool.length];
}
/* --- чат (мультиплеер) --- */
let chatOpen = false;
function openChat() {
  chatOpen = true; const el = $('chatin'); el.classList.remove('hidden'); el.value = ''; el.placeholder = t('chatPh');
  setTimeout(() => el.focus(), 0);
}
function closeChat() { chatOpen = false; const el = $('chatin'); el.blur(); el.classList.add('hidden'); if (!TOUCH && G.started && !locked) lock(); }
$('chatin').addEventListener('keydown', e => {
  e.stopPropagation();
  if (e.code === 'Enter') { const m = e.target.value.trim().slice(0, 120); if (m) sendChat(m); closeChat(); }
  else if (e.code === 'Escape') closeChat();
});
function sendChat(m) {
  if (NET.mode === 'client') netSend({ t: 'chat', m });
  else { addChat(P.name, P.team, m); netEvent({ k: 'chat', n: P.name, tm: P.team, m }); }
}
function addChat(name, team, msg) {
  const el = document.createElement('div');
  el.innerHTML = `<span class="c${team}">${esc(name)}:</span> ${esc(msg)}`;
  const box = $('chat'); box.appendChild(el); while (box.children.length > 7) box.firstChild.remove();
  setTimeout(() => el.classList.add('fade'), 9000); setTimeout(() => el.remove(), 10000);
  clickAt(null, 1500, 0.2);
}
