/* ================= game state ================= */
// mode: sp — одиночная игра с ботами, mp — мультиплеер (только люди, пустые места = 'empty')
const G = { started: false, paused: true, state: 'menu', mode: 'sp', timer: 0, liveT: 0, round: 0, score: [0, 0], prog: [0, 0], over: false, buyOpen: false, board: false,
  maxHp: 210, winRounds: 8, autoN: 4, lobbyT: -1 };
const ROUND_TIME = 115, FREEZE = 6, ZONE_OPEN = 20, CAP_TIME = 12, BUY_WINDOW = 15;
let now = 0;
const freshInv = () => ({ 1: null, 2: newGun('osa'), 3: { id: 'knife' } });
const freshGren = () => ({ he: 0, smoke: 0, flash: 0 });
const active = a => a.net !== 'empty';
const humans = (tm) => agents.filter(a => (a.net === 'local' || a.net === 'remote') && (tm == null || a.team === tm));

function spawnAgent(a, cell) {
  const [cx, cz] = cell || pick(spawnCells[a.team]);
  a.pos.set(cx * CELL + CELL / 2 + rand(-0.3, 0.3), 0, cz * CELL + CELL / 2 + rand(-0.3, 0.3));
  a.vel.set(0, 0, 0); a.hp = G.maxHp; a.alive = true; a.crouch = false; a.reloading = 0; a.fireCd = 0; a.burstLeft = 0;
  a.yaw = a.team === 0 ? -Math.PI / 2 : Math.PI / 2; a.pitch = 0; a.punchP = a.punchY = 0; a.spreadAcc = 0;
  a.slot = a.inv[1] ? 1 : 2; a.lastSlot = 3; a.spot = [0, 0]; a.dashCd = 0; a.tp++; a.blindT = 0;
  a.model.visible = true; resetRig(a);
}
function hideEmpty(a) { a.alive = false; a.model.visible = false; a.hp = 0; }
function startMatch() {
  G.score = [0, 0]; G.round = 0; G.over = false; G.lobbyT = -1;
  for (const a of agents) { a.money = 800; a.kills = a.deaths = 0; a.inv = freshInv(); a.armor = 0; a.gren = freshGren(); a.alive = false; }
  $('feed').innerHTML = '';
  clearSmokes();
  startRound();
}
function startRound() {
  G.round++; G.state = 'freeze'; G.timer = FREEZE; G.liveT = 0; G.prog = [0, 0];
  for (const tm of [0, 1]) {
    const cells = [...spawnCells[tm]].sort(() => Math.random() - 0.5);
    agents.filter(a => a.team === tm).forEach((a, i) => {
      if (!active(a)) { hideEmpty(a); return; }
      if (!a.alive) { a.inv = freshInv(); a.armor = 0; a.gren = freshGren(); }
      else { for (const s of [1, 2]) if (a.inv[s]) a.inv[s].res = WEAPONS[a.inv[s].id].res; }
      spawnAgent(a, cells[i]);
      if (a.net === 'bot') { a.ai = newAI(a); botBuy(a); a.slot = a.inv[1] ? 1 : 2; }
    });
  }
  clearSmokes();
  roundStartFx();
}
// разминка мультиплеера: урона нет, денег без ограничений, можно перебегать за другую команду
function startLobby() {
  G.state = 'lobby'; G.round = 0; G.score = [0, 0]; G.prog = [0, 0]; G.over = false; G.lobbyT = -1; G.liveT = 0;
  for (const a of agents) {
    if (!active(a)) { hideEmpty(a); continue; }
    a.money = 16000; a.kills = a.deaths = 0; a.inv = freshInv(); a.armor = 0; a.gren = freshGren();
    spawnAgent(a);
  }
  clearSmokes();
  P.scoped = false; specTarget = null;
}
function lobbyTick(dt) {
  for (const a of agents) if (active(a)) { a.money = 16000; if (!a.alive) spawnAgent(a); }
  const n = humans().length;
  if (G.autoN && n >= G.autoN) {
    if (G.lobbyT < 0) G.lobbyT = 10;
    G.lobbyT -= dt; if (G.lobbyT <= 0) hostStartMatch();
  } else G.lobbyT = -1;
}
function hostStartMatch() {
  if (NET.mode !== 'host' || G.state !== 'lobby') return;
  if (humans().length < 2) { showHint(t('needTwo'), 2.5); G.lobbyT = -1; return; }
  // выравниваем команды: из большей переводим не-хоста
  for (let guard = 0; guard < 10; guard++) {
    const n0 = humans(0).length, n1 = humans(1).length;
    if (Math.abs(n0 - n1) <= 1) break;
    const big = n0 > n1 ? 0 : 1;
    const who = humans(big).find(a => a !== P), to = agents.find(a => a.team !== big && a.net === 'empty');
    if (!who || !to) break;
    moveHuman(who, to);
  }
  startMatch();
  showCenter(t('matchStart'), '', 2); netEvent({ k: 'ms' });
}
function roundStartFx() {
  P.eye = 1.62; P.scoped = false; specTarget = null;
  for (const d of decals) d.visible = false;
  showCenter(t('round', G.round), TOUCH ? t('buyTouch') : t('buyKey', keyOf('buy')), 2.5);
  radio('start');
}
function roundEndFx(winner, reason) {
  const txt = winner < 0 ? t('draw') : t(winner ? 'win1' : 'win0');
  showCenter(`<span class="${winner < 0 ? '' : 'c' + winner}">${esc(txt)}</span>`, t(reason), 4.5);
  radio(winner === P.team ? 'win' : 'lose');
  if (winner >= 0) announce(winner ? 'say_win1' : 'say_win0');
}
function goFx() { showCenter(t('go'), '', 1.2); radio('go'); announce('say_go'); }
function zoneOpenFx() { showHint(t('zoneOpen'), 2.5); radio('zone'); announce('say_zone'); }
function showOver() {
  document.exitPointerLock?.();
  const win = G.score[P.team] > G.score[1 - P.team];
  $('overt').textContent = t(win ? 'victory' : 'defeat');
  $('overs').textContent = t('overStats', G.score[0], G.score[1], P.kills, P.deaths) + (NET.mode === 'client' ? ' · ' + t('overHost') : '');
  $('again').style.display = NET.mode === 'client' ? 'none' : '';
  $('over').classList.remove('hidden'); $('pause').classList.add('hidden');
}
function newAI(a) {
  const enemyTeam = 1 - a.team, mid = MW / 2;
  const lanes = [
    () => randomCellIn(mid - 6, mid + 5, 1, 3),
    () => randomCellIn(mid - 6, mid + 5, MH - 4, MH - 2),
    () => randomCellIn(a.team ? mid : mid - 10, a.team ? mid + 9 : mid - 1, 7, MH - 8),
    () => randomCellIn(a.team ? mid - 4 : mid + 3, a.team ? mid - 1 : mid + 6, 5, MH - 6),
  ];
  let wps = []; wps.push(pick(lanes)());
  if (Math.random() < 0.35) wps.push(randomCellIn(enemyTeam ? mid + 2 : 3, enemyTeam ? MW - 4 : mid - 3, 1, MH - 2));
  wps = wps.filter(Boolean);
  return { wps, path: null, pathKey: -1, pathI: 0, repath: 0, think: rand(0, 0.2), target: null, visible: false, seen: 0,
    react: rand(...diff.react), invest: null, investUntil: 0, strafe: 0, strafeT: 0, burst: randi(3, 7), holdT: 0, holdCell: null, phase: rand(0, 6), stuckT: 0, deadT: 0 };
}
// боты закупаются из всего каталога: копят на лучшее, иногда экономят
function botBuy(a) {
  if (!a.inv[1]) {
    const budget = a.money - (a.armor < 50 ? 650 : 0);
    const pool = WIDS.filter(id => WEAPONS[id].slot === 1 && WEAPONS[id].price <= budget && (WEAPONS[id].cat !== 'sniper' || Math.random() < 0.25));
    if (pool.length && (budget > 2200 || Math.random() < 0.6)) {
      pool.sort((x, y) => WEAPONS[y].price - WEAPONS[x].price);
      const id = pick(pool.slice(0, 3)); a.money -= WEAPONS[id].price; a.inv[1] = newGun(id);
    } else if (a.inv[2].id === 'osa') {
      const pis = WIDS.filter(id => WEAPONS[id].cat === 'pistol' && id !== 'osa' && WEAPONS[id].price <= a.money && Math.random() < 0.5);
      if (pis.length) { const id = pick(pis); a.money -= WEAPONS[id].price; a.inv[2] = newGun(id); }
    }
  }
  if (a.armor < 50 && a.money >= 650) { a.money -= 650; a.armor = 100; }
}
function endRound(winner, reason) {
  if (G.state !== 'live') return;
  G.state = 'end'; G.timer = 5;
  if (winner >= 0) G.score[winner]++;
  for (const a of agents) if (active(a)) a.money = Math.min(16000, a.money + (a.team === winner ? 3000 : 1800));
  roundEndFx(winner, reason); netEvent({ k: 're', w: winner, r: reason });
  if (G.score[0] >= G.winRounds || G.score[1] >= G.winRounds) G.over = true;
}
function checkElimination() {
  if (G.state !== 'live') return;
  const alive = [0, 1].map(tm => agents.some(a => a.team === tm && a.alive));
  if (!alive[0] && !alive[1]) endRound(-1, 'rBoth');
  else if (!alive[1]) endRound(0, 'rElim1');
  else if (!alive[0]) endRound(1, 'rElim0');
}
