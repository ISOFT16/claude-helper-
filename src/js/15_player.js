/* ================= player ================= */
const keys = {};
let mouseDown = false, locked = false, reScopeT = 0, shake = 0, bobT = 0, lastStep = 0, specTarget = null, crouchToggled = false, wasGround = true;
let lookDX = 0, lookDY = 0;
function updatePlayer(dt) {
  P.fireCd -= dt; P.switchT -= dt; P.dashCd = Math.max(0, (P.dashCd || 0) - dt);
  if (P.reloading > 0) { P.reloading -= dt; if (P.reloading <= 0) finishReload(P); }
  P.punchP *= Math.exp(-(mouseDown ? 3 : 7) * dt); P.punchY *= Math.exp(-6 * dt);
  P.spreadAcc *= Math.exp(-(mouseDown ? 2 : 6) * dt);
  if (reScopeT > 0) { reScopeT -= dt; if (reScopeT <= 0 && rmbHeldScope && P.alive && P.w().scope) P.scoped = true; }
  if (!P.alive) return;
  const W = P.w(), typing = chatOpen;
  P.crouch = !typing && (SET.toggleCrouch ? crouchToggled : bindDown('crouch')) || touchCrouch;
  const walking = !typing && bindDown('walk');
  let fx = 0, fz = 0;
  if (!typing) { if (bindDown('fwd')) fz -= 1; if (bindDown('back')) fz += 1; if (bindDown('left')) fx -= 1; if (bindDown('right')) fx += 1; }
  if (TOUCH) { fx += joy.x; fz += joy.y; }
  if (G.state === 'freeze') fx = fz = 0;
  const len = Math.hypot(fx, fz); if (len > 1) { fx /= len; fz /= len; }
  const s = Math.sin(P.yaw), c = Math.cos(P.yaw);
  const wx = fx * c + fz * s, wz = -fx * s + fz * c;
  const speed = (P.crouch ? 2.4 : walking ? 2.9 : 6.2) * W.move * (P.scoped ? 0.55 : 1);
  P.dashT = Math.max(0, (P.dashT || 0) - dt);
  const acc = P.dashT > 0 ? 0 : P.onGround ? 14 : 2.5;
  P.vel.x += (wx * speed - P.vel.x) * Math.min(1, acc * dt);
  P.vel.z += (wz * speed - P.vel.z) * Math.min(1, acc * dt);
  if (!typing && (bindDown('jump') || keys.TouchJump) && P.onGround && G.state !== 'freeze') { P.vel.y = 7.4; P.onGround = false; }
  const vy = P.vel.y;
  moveBody(P, dt);
  if (P.onGround && !wasGround && vy < -6) landSound();
  wasGround = P.onGround;
  P.eye += ((P.crouch ? 1.05 : 1.62) - P.eye) * Math.min(1, 12 * dt);
  const hs = Math.hypot(P.vel.x, P.vel.z);
  if (P.onGround && hs > 1) {
    bobT += dt * hs * 1.6;
    if (!walking && !P.crouch && hs > 3.5 && bobT - lastStep > Math.PI) { lastStep = bobT; stepSound(null, 1); }
  }
  // стрельба (у оружия с отсечкой очередь дострeливается сама)
  if ((mouseDown || P.burstLeft > 0) && G.state !== 'freeze' && !G.buyOpen) {
    if (fire(P) && !W.auto && !W.melee && !TOUCH && !(P.burstLeft > 0)) mouseDown = false;
  }
  if (TOUCH && mouseDown && !W.melee && SET.aimAssist) aimAssist(dt);
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
function dash() {
  if (!P.alive || P.dashCd > 0 || G.state === 'freeze') return;
  let fx = 0, fz = 0;
  if (bindDown('fwd')) fz -= 1; if (bindDown('back')) fz += 1; if (bindDown('left')) fx -= 1; if (bindDown('right')) fx += 1;
  if (TOUCH) { fx += joy.x; fz += joy.y; }
  if (!fx && !fz) fz = -1;
  const l = Math.hypot(fx, fz); fx /= l; fz /= l;
  const s = Math.sin(P.yaw), c = Math.cos(P.yaw);
  P.vel.x = (fx * c + fz * s) * 17; P.vel.z = (-fx * s + fz * c) * 17; P.vel.y = Math.max(P.vel.y, 2);
  P.dashCd = 5; P.dashT = 0.2; slideNoise(null, 0.4, 0.2); landSound();
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
    case 'crouch': crouchToggled = !crouchToggled; break;
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
    if (chatOpen) return;
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
