/* ================= touch controls ================= */
const joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 }, look = { id: null, lx: 0, ly: 0 };
let touchCrouch = false;
function touchTurn(dx, dy) {
  if (!P.alive || G.paused) return;
  const k = 0.0062 * SET.touchSens * (P.scoped ? SET.scopeSens * ((P.w().zoom || 40) / 40) : 1);
  P.yaw -= dx * k; P.pitch = clamp(P.pitch - dy * k * (SET.invertY ? -1 : 1), -1.5, 1.5); lookDX += dx * 0.5; lookDY += dy * 0.5;
}
function pauseGame() {
  if (!G.started || G.over || G.paused) return;
  G.paused = true; mouseDown = false; keys.TouchJump = false; joy.id = look.id = null; $('joyBase').style.display = 'none';
  if (G.buyOpen) toggleBuy(false);
  showPause();
}
if (TOUCH) {
  const tl = $('touch');
  tl.addEventListener('touchstart', e => {
    e.preventDefault(); initAudio();
    for (const t of e.changedTouches) {
      if (!P.alive) { nextSpec(); continue; }
      if (t.clientX < innerWidth * 0.42 && joy.id === null) {
        joy.id = t.identifier; joy.ox = t.clientX; joy.oy = t.clientY; joy.x = joy.y = 0;
        const jb = $('joyBase'); jb.style.display = 'block'; jb.style.left = t.clientX + 'px'; jb.style.top = t.clientY + 'px'; $('joyKnob').style.transform = '';
      } else if (look.id === null) { look.id = t.identifier; look.lx = t.clientX; look.ly = t.clientY; }
    }
  }, { passive: false });
  document.addEventListener('touchmove', e => {
    if (!G.started) return;
    for (const t of e.changedTouches) {
      if (t.identifier === joy.id) {
        let dx = t.clientX - joy.ox, dy = t.clientY - joy.oy; const d = Math.hypot(dx, dy), R = 55;
        if (d > R) { dx *= R / d; dy *= R / d; }
        joy.x = dx / R; joy.y = dy / R; $('joyKnob').style.transform = `translate(${dx}px,${dy}px)`;
      } else if (t.identifier === look.id) { touchTurn(t.clientX - look.lx, t.clientY - look.ly); look.lx = t.clientX; look.ly = t.clientY; }
    }
    if (e.cancelable && $('touch').classList.contains('on') && !G.paused && !G.buyOpen) e.preventDefault();
  }, { passive: false });
  const endT = e => {
    for (const t of e.changedTouches) {
      if (t.identifier === joy.id) { joy.id = null; joy.x = joy.y = 0; $('joyBase').style.display = 'none'; }
      if (t.identifier === look.id) look.id = null;
    }
  };
  document.addEventListener('touchend', endT); document.addEventListener('touchcancel', endT);
  const tbtn = (id, down, up) => {
    const el = $(id);
    el.addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); initAudio(); el.classList.add('pr'); down(e.changedTouches[0]); }, { passive: false });
    const u = e => { el.classList.remove('pr'); if (up) up(e.changedTouches[0]); };
    el.addEventListener('touchend', u); el.addEventListener('touchcancel', u);
  };
  tbtn('tFire', t => { if (!P.alive) { nextSpec(); return; } mouseDown = true; if (look.id === null) { look.id = t.identifier; look.lx = t.clientX; look.ly = t.clientY; } }, () => { mouseDown = false; });
  tbtn('tJump', () => { keys.TouchJump = true; }, () => { keys.TouchJump = false; });
  tbtn('tCrouch', () => { touchCrouch = !touchCrouch; });
  tbtn('tReload', () => { if (P.alive) startReload(P); });
  tbtn('tSwap', () => { if (!P.alive) return; const order = [1, 2, 3]; let i = order.indexOf(P.slot); for (let k = 1; k <= 3; k++) { const s = order[(i + k) % 3]; if (P.inv[s]) { switchSlot(P, s); break; } } });
  tbtn('tDash', () => dash());
  tbtn('tProne', () => toggleProne());
  tbtn('tMap', () => toggleWorldMap());
  tbtn('tNade', () => { if (P.alive) throwNade(P); });
  tbtn('tScope', () => toggleScope());
  tbtn('tNadeSel', () => cycleNade());
  tbtn('tChat', () => openChat());
  tbtn('tStart', () => hostStartMatch());
  tbtn('tBuy', () => toggleBuy());
  tbtn('tBoard', () => { G.board = !G.board; if (G.board) renderBoard(); else $('board').classList.add('hidden'); });
  tbtn('tPause', () => pauseGame());
  document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });
}
// для Android-приложения: системная кнопка «Назад» и сворачивание
window.__onAppPause = () => pauseGame();
window.__onBack = () => {
  if (G.buyOpen) { toggleBuy(false); return true; }
  if (G.board) { G.board = false; $('board').classList.add('hidden'); return true; }
  if (G.started && !G.over && !G.paused) { pauseGame(); return true; }
  if (!$('settings').classList.contains('hidden')) { $('settings').classList.add('hidden'); return true; }
  if (chatOpen) { closeChat(); return true; }
  if (G.started) { goToMenu(); return true; }
  if ($('menu').classList.contains('sub-open')) { $('menu').classList.remove('sub-open'); return true; }
  return false;
};

window.__game = { BOOT, PERF, perfFrame, perfStats, keys, moveStateName, toggleProne, setWantProne: v => { wantProne = v; }, canUseWeapon, dash, dodge, dodgeTry: (x, z) => dodge(P, x, z), setPosture, setMove, WM, toggleWorldMap, gearAction, absorbDamage, PROF, GEAR_ITEMS, restoreGear, myGearCfg, gearProf, MOVE_CFG, POST, buildPost, G, agents, SET, toggleBuy, buyKey, chat: sendChat, uiBufs, applySettings, hostStartMatch, startLobby, throwNade, WEAPONS, get P() { return P; }, NET, renderer, fire, damage, buy: buyItem, animateSoldier, vm, vmGuns, get now() { return now; }, findPath, WORLD, loadWorld, nearestNode, navPath, floorAt, solidRect, rayWorld, MAPS, step: (n, dt = 1 / 60) => { for (let i = 0; i < n && G.state !== "over"; i++) { now += dt; updateGame(dt); } } };
