/* ================= network (multiplayer) ================= */
// Хост ведёт всю симуляцию (раунды, урон, зона) и рассылает снимки состояния 20 раз в секунду.
// Игроки сами двигают своего бойца и считают попадания, а хост применяет урон.
// В мультиплеере ботов нет: свободные места — 'empty'. До старта матча идёт разминка без урона.
const NET = { mode: 'off', peer: null, conns: [], host: null, events: [], sendT: 0, myIdx: 0, code: '', nades: [], lastSnap: 0 };
const NET_TIMEOUT = 15000;
const PEERJS_URL = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
// префикс с версией протокола: разные версии игры не смогут случайно подключиться друг к другу
const PEER_PREFIX = 'perehvat-v4-';
// сервера для пробивания NAT: STUN Google и Cloudflare, TURN PeerJS и OpenRelay (на случай мобильных сетей)
const ICE = { iceServers: [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] },
  { urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'], username: 'peerjs', credential: 'peerjsp' },
  { urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turn:openrelay.metered.ca:443?transport=tcp'], username: 'openrelayproject', credential: 'openrelayproject' },
], sdpSemantics: 'unified-plan' };
const idxOf = a => agents.indexOf(a);
const r2 = v => Math.round(v * 100) / 100, r3 = v => Math.round(v * 1000) / 1000;
function netEvent(e) { if (NET.mode === 'host') NET.events.push(e); }
function netSend(m) { if (NET.mode === 'client' && NET.host && NET.host.open) NET.host.send(m); }
function setStatus(txt) { $('mpstatus').textContent = txt; }
function loadPeer() {
  if (window.Peer) return Promise.resolve();
  return new Promise((res, rej) => {
    const sc = document.createElement('script'); sc.src = PEERJS_URL; sc.onload = res;
    sc.onerror = () => rej(new Error(t('st_nointernet')));
    document.head.appendChild(sc);
  });
}
function peerOpts() {
  const q = new URLSearchParams(location.search), o = { debug: 0, config: ICE };
  if (q.get('peerhost')) { o.host = q.get('peerhost'); o.port = +(q.get('peerport') || 9000); o.path = q.get('peerpath') || '/'; o.secure = q.get('peersecure') === '1'; }
  return o;
}
// код комнаты — только цифры: одинаково вводится на любой раскладке и цифровой клавиатуре телефона
function genCode() { let c = String(1 + Math.floor(Math.random() * 9)); for (let i = 0; i < 5; i++) c += Math.floor(Math.random() * 10); return c; }
// на всякий случай чистим ввод: пробелы, дефисы, похожие кириллические буквы
const CYR_LAT = { 'А': 'A', 'В': 'B', 'Е': 'E', 'К': 'K', 'М': 'M', 'Н': 'H', 'О': '0', 'Р': 'P', 'С': 'C', 'Т': 'T', 'Х': 'X', 'У': 'Y', 'З': '3', 'Ч': '4', 'б': '6' };
function normCode(s) { return String(s || '').replace(/./g, ch => CYR_LAT[ch] || CYR_LAT[ch.toUpperCase()] || ch).toUpperCase().replace(/[^A-Z0-9]/g, ''); }
const randId = () => PEER_PREFIX + 'c-' + Math.random().toString(36).slice(2, 12);
function myName() { const n = ($('mpname').value || '').trim().slice(0, 14) || t('playerDef'); SET.name = n; saveSettings(); return n; }
function applyNames(n) { n.forEach((x, i) => { if (agents[i]) agents[i].name = String(x || '').slice(0, 14); }); }
function humansCount() { return agents.filter(a => a.net === 'local' || a.net === 'remote' || a.human).length; }
function updateRoomBadge() {
  const el = $('room');
  if (NET.mode === 'off') { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  el.textContent = NET.mode === 'host' ? t('roomHost', NET.code, humansCount()) : t('room', NET.code, humansCount());
}
function startGameUI() {
  initAudio();
  $('menu').classList.add('hidden'); $('hud').classList.remove('hidden'); $('over').classList.add('hidden');
  G.started = true; G.paused = false; lock();
}
function defaultName(a, i) { return i === 0 ? (SET.name || t('you')) : NAMES[LANG === 'ru' || LANG === 'uk' ? 0 : 1][i]; }
function netReset() {
  if (NET.mode === 'host') dirUnregister();
  if (NET.peer) { try { NET.peer.destroy(); } catch (e) {} }
  NET.mode = 'off'; NET.peer = null; NET.host = null; NET.conns = []; NET.events = []; NET.nades = [];
  G.mode = 'sp';
  P.isPlayer = false; P = agents[0]; P.isPlayer = true;
  agents.forEach((a, i) => { a.net = a === P ? 'local' : 'bot'; a.human = false; a.conn = null; a.name = defaultName(a, i); a.ai = {}; a.netState = null; a.model.visible = true; });
  applyLocalLook();
  updateRoomBadge();
}
function applyAllCos(list) { if (Array.isArray(list)) list.forEach((c, i) => { if (agents[i] && agents[i] !== P && c) applyCos(agents[i], c); }); }
// внешность своего бойца и оружия в руках — из профиля
function applyLocalLook() {
  applyCos(P, myCos());
  for (const id in vmGuns) skinGun(vmGuns[id].g, PROF.equip.w[id]);
  vmSleeveMat.map = PROF.equip.o !== 'std' ? outfitMats(PROF.equip.o).fabric.map : teamMats[P.team].fabric.map; vmSleeveMat.needsUpdate = true;
}
function netShutdown() { if (NET.mode !== 'off') netReset(); }
// перевод игрока на другое место (смена команды / балансировка)
function moveHuman(from, to) {
  if (from === to || to.net !== 'empty') return;
  to.name = from.name; to.money = from.money; to.kills = from.kills; to.deaths = from.deaths;
  to.inv = freshInv(); to.gren = freshGren(); to.armor = 0; to.tp = from.tp + 1;
  applyCos(to, from.rig.cos);
  if (from === P) { P.isPlayer = false; P = to; P.isPlayer = true; to.net = 'local'; applyLocalLook(); }
  else { to.net = 'remote'; to.conn = from.conn; to.netState = null; if (to.conn) to.conn.agent = to; }
  from.net = 'empty'; from.conn = null; from.name = ''; hideEmpty(from);
  if (G.state === 'lobby') { to.money = START_MONEY; spawnAgent(to); } else hideEmpty(to);
  if (to.conn && to.conn.open) to.conn.send({ t: 'welcome', i: idxOf(to), code: NET.code, names: agents.map(x => x.name), cos: agents.map(x => x.rig.cos) });
  netEvent({ k: 'nm', n: agents.map(x => x.name) }); netEvent({ k: 'cos', c: agents.map(x => x.rig.cos) });
}
function requestTeamSwitch() {
  if (G.mode !== 'mp' || G.state !== 'lobby') return;
  if (NET.mode === 'client') { netSend({ t: 'team' }); return; }
  const to = agents.find(a => a.team !== P.team && a.net === 'empty');
  if (!to) { showHint(t('teamFull'), 2); return; }
  moveHuman(P, to); showHint(t('youTeam', teamName(P.team)), 2);
}
// если в одной из команд не осталось игроков — обратно в разминку
function hostCheckTeams() {
  if (G.mode !== 'mp' || G.state === 'lobby' || G.state === 'over') return;
  if (!humans(0).length || !humans(1).length) { startLobby(); showHint(t('backLobby'), 3); netEvent({ k: 'bl' }); }
}

/* --- хост --- */
async function hostGame() {
  netReset(); setStatus(t('st_creating'));
  try { await loadPeer(); } catch (e) { setStatus(e.message); return; }
  const tryOpen = attempt => {
    const code = genCode(), peer = new Peer(PEER_PREFIX + code, peerOpts());
    NET.peer = peer;
    peer.on('open', () => {
      NET.mode = 'host'; NET.code = code; G.mode = 'mp';
      G.maxHp = +SET.mpHp; G.winRounds = +SET.mpRounds; G.autoN = +SET.mpAuto;
      P.name = myName();
      for (const a of agents) if (a !== P) { a.net = 'empty'; a.name = ''; }
      setStatus(''); startGameUI(); startLobby(); updateRoomBadge();
      showHint(t('roomCreated', code), 6);
    });
    peer.on('connection', conn => hostAccept(conn));
    // связь с сервером комнат пропала (сеть, сворачивание приложения) — переподключаемся, иначе код перестанет работать
    const reconnect = () => {
      if (NET.peer !== peer || peer.destroyed || !peer.disconnected) return;
      if (NET.mode === 'host') showHint(t('roomReconnect'), 3);
      try { peer.reconnect(); } catch (e) {}
      setTimeout(reconnect, 4000);
    };
    peer.on('disconnected', () => setTimeout(reconnect, 500));
    peer.on('error', err => {
      if (err.type === 'unavailable-id' && attempt < 4) { peer.destroy(); tryOpen(attempt + 1); return; }
      if (NET.mode !== 'host') setStatus(t('st_neterr', err.type || err.message));
      else if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(err.type)) setTimeout(reconnect, 1000);
    });
  };
  tryOpen(0);
}
function hostAccept(conn) {
  conn.on('open', () => {
    const n0 = humans(0).length, n1 = humans(1).length;
    const tm = n0 <= n1 ? 0 : 1;
    const slot = agents.find(a => a.team === tm && a.net === 'empty') || agents.find(a => a.net === 'empty');
    if (!slot) { conn.send({ t: 'full' }); setTimeout(() => conn.close(), 500); return; }
    slot.net = 'remote'; slot.conn = conn; slot.netState = null;
    slot.name = String((conn.metadata && conn.metadata.name) || t('playerDef')).slice(0, 14);
    slot.kills = slot.deaths = 0; slot.inv = freshInv(); slot.gren = freshGren(); slot.armor = 0; slot.tp++;
    applyCos(slot, conn.metadata && conn.metadata.cos);
    if (G.state === 'lobby') { slot.money = START_MONEY; spawnAgent(slot); }
    else { slot.money = START_MONEY; hideEmpty(slot); }
    conn.agent = slot; conn.lastSeen = performance.now(); NET.conns.push(conn);
    conn.send({ t: 'welcome', i: idxOf(slot), code: NET.code, names: agents.map(a => a.name), cos: agents.map(a => a.rig.cos) });
    netEvent({ k: 'cos', c: agents.map(a => a.rig.cos) });
    if (G.state !== 'lobby') conn.send({ t: 'msg', k: 'specNext' });
    netEvent({ k: 'nm', n: agents.map(a => a.name) });
    showHint(t('joinedTeam', slot.name, teamName(slot.team)), 3); updateRoomBadge();
  });
  conn.on('data', m => hostMsg(conn, m));
  const drop = () => {
    const a = conn.agent; if (!a) return;
    conn.agent = null; NET.conns = NET.conns.filter(c => c !== conn);
    showHint(t('playerLeft', a.name), 3);
    a.net = 'empty'; a.conn = null; a.name = ''; a.netState = null; hideEmpty(a);
    netEvent({ k: 'nm', n: agents.map(x => x.name) }); updateRoomBadge(); checkElimination();
  };
  conn.drop = drop;
  conn.on('close', drop); conn.on('error', drop);
}
function hostMsg(conn, m) {
  const a = conn.agent; if (!a || !m || typeof m !== 'object') return;
  conn.lastSeen = performance.now();
  switch (m.t) {
    case 'st': if (m.tp === a.tp) a.netState = m; break;
    case 'shot': if (a.alive && WEAPONS[m.w]) netRemoteShot(a, m); break;
    case 'nade': if (a.alive && NADES.includes(m.k)) throwNade(a, m.k); break;
    case 'buy': if (canBuyA(a) && (WEAPONS[m.id] || GEAR[m.id])) doBuy(a, m.id); break;
    case 'team': {
      if (G.state !== 'lobby') break;
      const to = agents.find(x => x.team !== a.team && x.net === 'empty');
      if (to) moveHuman(a, to); else conn.send({ t: 'msg', k: 'teamFull' });
      break;
    }
    case 'chat': {
      const msg = String(m.m || '').slice(0, 120).trim(); if (!msg) break;
      addChat(a.name, a.team, msg); netEvent({ k: 'chat', n: a.name, tm: a.team, m: msg });
      break;
    }
  }
}
function netRemoteShot(a, m) {
  const W = WEAPONS[m.w], ends = Array.isArray(m.e) ? m.e.slice(0, 12) : [];
  shotFx(a, m.w, ends);
  netEvent(W.melee ? { k: 'ml', i: idxOf(a) } : { k: 'sh', i: idxOf(a), w: m.w, e: ends });
  const maxD = W.dmg * (W.head || 1) * (W.melee ? G.maxHp / 100 : 1) + 1;
  for (const h of (Array.isArray(m.h) ? m.h.slice(0, 12) : [])) {
    const v = agents[h[0]]; if (!v || !v.alive || v.team === a.team) continue;
    damage(v, Math.min(+h[1] || 0, maxD), a, !!h[2], m.w, a.eyePos());
  }
  hearShot(a, W);
}
function hostTick(dt) {
  NET.sendT -= dt; if (NET.sendT > 0) return; NET.sendT = 0.05;
  const g = [G.state, r2(G.timer), r2(G.liveT), G.round, G.score[0], G.score[1], r3(G.prog[0]), r3(G.prog[1]), G.over ? 1 : 0, G.maxHp, G.winRounds, G.autoN, r2(G.lobbyT)];
  const A = agents.map(a => [r2(a.pos.x), r2(a.pos.y), r2(a.pos.z), r3(a.yaw), r3(a.pitch), r2(a.vel.x), r2(a.vel.z),
    (a.alive ? 1 : 0) | (a.crouch ? 2 : 0) | (a.reloading > 0 ? 4 : 0) | (a.net !== 'bot' && a.net !== 'empty' ? 8 : 0) | (a.net === 'empty' ? 16 : 0),
    Math.ceil(Math.max(0, a.hp)), Math.ceil(a.armor), WIDS.indexOf(a.gun().id), a.tp, a.kills, a.deaths]);
  const N = grenades.map(n => [r2(n.pos.x), r2(n.pos.y), r2(n.pos.z), NADES.indexOf(n.kind)]);
  const ev = NET.events; NET.events = [];
  for (const c of [...NET.conns]) if (performance.now() - c.lastSeen > NET_TIMEOUT) { try { c.close(); } catch (e) {} c.drop(); }
  for (const c of NET.conns) {
    if (!c.open || !c.agent) continue; const a = c.agent, gr = a.gren || freshGren();
    try { c.send({ t: 's', g, a: A, n: N, e: ev, me: [a.money, a.inv[1] ? a.inv[1].id : '', a.inv[2] ? a.inv[2].id : '', gr.he, gr.smoke, gr.flash] }); } catch (e) {}
  }
}

/* --- эффекты чужих выстрелов --- */
function shotFx(a, w, ends) {
  const W = WEAPONS[w], R = a.rig; if (!W) return;
  if (W.melee) { sfx('knife', a.pos); if (R) R.kick = 1.5; return; }
  if (R) { R.kick = 1; R.flashT = 0.05; if (R.parts && R.gunId === w) R.parts.flash.visible = true; }
  const muz = muzzleWorld(a, new THREE.Vector3());
  ends.forEach((e, i) => {
    const p = new THREE.Vector3(e[0], e[1], e[2]);
    if (i < 3 && !W.quiet) addTracer(muz, p, a.team + 1);
    if (e[3] === 1) sparks(p, 5, true); else if (e[3] === 0) { sparks(p, 3); addDecal(p, e[4], e[5], e[6]); }
  });
  sfx(W.snd, a.pos);
  if (W.act === 'pump' || W.act === 'bolt') setTimeout(() => sfxAct(W.act, a.pos), W.act === 'pump' ? 250 : 350);
  if (SET.effects && R && R.parts && W.act !== 'rev' && W.act !== 'break' && a.pos.distanceTo(camera.position) < 25)
    ejectCasing(R.parts.eject.getWorldPosition(new THREE.Vector3()), new THREE.Vector3(Math.cos(a.yaw), 0.2, -Math.sin(a.yaw)), new THREE.Vector3(a.vel.x, 0, a.vel.z), W.cat === 'shotgun');
}
// плавное следование сетевого бойца за полученным состоянием + анимация
function followNet(a, dt) {
  if (a.net === 'empty') return;
  const s = a.netState;
  if (s && a.alive) {
    const k = Math.min(1, dt * 16);
    a.pos.x += (s.p[0] - a.pos.x) * k; a.pos.y += (s.p[1] - a.pos.y) * k; a.pos.z += (s.p[2] - a.pos.z) * k;
    a.yaw += angDiff(a.yaw, s.y) * k; a.pitch += (s.pt - a.pitch) * k;
    a.vel.set(s.v[0], 0, s.v[1]); a.crouch = !!s.c;
    if (a.net === 'remote' && WEAPONS[s.w]) {
      const sl = s.w === 'knife' ? 3 : a.inv[1] && a.inv[1].id === s.w ? 1 : a.inv[2] && a.inv[2].id === s.w ? 2 : a.slot;
      a.slot = a.inv[sl] ? sl : 2;
    }
    const W = WEAPONS[a.gun().id];
    const was = a.reloading > 0;
    a.reloading = s.r && W.reload ? (was ? Math.max(0.01, a.reloading - dt) : W.reload) : 0;
    if (!was && a.reloading > 0 && a.pos.distanceTo(camera.position) < 20) reloadSound(a, W);
  }
  if (a.alive || a.rig.deadT < 3) animateSoldier(a, dt);
}

/* --- клиент --- */
async function joinGame() {
  const code = normCode($('mpcode').value);
  $('mpcode').value = code;
  if (code.length < 5) { setStatus(t('st_code')); return; }
  netReset(); setStatus(t('st_connecting'));
  try { await loadPeer(); } catch (e) { setStatus(e.message); return; }
  // свой id задаём сами — не нужен отдельный HTTP-запрос к серверу за id
  const peer = new Peer(randId(), peerOpts()); NET.peer = peer;
  let tries = 0, done = false;
  const timeout = setTimeout(() => { if (NET.mode !== 'client' && NET.peer === peer) setStatus(t('st_timeout')); }, 25000);
  const connect = () => {
    if (NET.peer !== peer || done) return;
    const conn = peer.connect(PEER_PREFIX + code, { metadata: { name: myName(), cos: myCos() }, serialization: 'json', reliable: true });
    NET.host = conn;
    conn.on('data', m => { if (m && m.t === 'welcome') { done = true; clearTimeout(timeout); } clientMsg(m); });
    conn.on('close', () => netLost()); conn.on('error', () => netLost());
  };
  peer.on('error', err => {
    if (NET.peer !== peer) return;
    // хост мог на секунду потерять связь с сервером — пробуем ещё пару раз
    if (err.type === 'peer-unavailable' && tries < 1 && !done) { tries++; setStatus(t('st_retry')); setTimeout(connect, 2500); return; }
    setStatus(err.type === 'peer-unavailable' ? t('st_notfound') : t('st_neterr', err.type || err.message));
  });
  peer.on('open', connect);
}
function netLost() {
  if (NET.mode !== 'client') return;
  netReset(); G.started = false; document.exitPointerLock?.();
  for (const id of ['hud', 'pause', 'over', 'buy', 'board']) $(id).classList.add('hidden');
  $('touch').classList.remove('on'); showMenu('mp');
  setStatus(t('st_lost'));
}
function clientMsg(m) {
  if (!m || typeof m !== 'object') return;
  if (m.t === 'full') { setStatus(t('st_full')); return; }
  if (m.t === 'msg') { showHint(t(m.k), 3); return; }
  if (m.t === 'welcome') {
    const first = NET.mode !== 'client';
    NET.mode = 'client'; G.mode = 'mp'; NET.myIdx = m.i; NET.code = String(m.code || '').slice(0, 8); NET.lastSnap = performance.now();
    P.isPlayer = false; P = agents[m.i]; P.isPlayer = true; P.eye = 1.62; P.tp = -1;
    agents.forEach(a => { a.net = a === P ? 'local' : 'proxy'; a.netState = null; });
    applyNames(m.names);
    applyAllCos(m.cos);
    applyLocalLook();
    if (first) { $('feed').innerHTML = ''; setStatus(''); G.over = false; startGameUI(); }
    updateRoomBadge();
    showHint(t('youTeam', teamName(P.team)), 4);
    return;
  }
  if (m.t === 's' && NET.mode === 'client') clientSnap(m);
}
function syncInv(slot, id) {
  const cur = P.inv[slot] ? P.inv[slot].id : '';
  if (cur === id) return;
  P.inv[slot] = id && WEAPONS[id] ? newGun(id) : null;
  if (P.inv[slot]) { P.lastSlot = P.slot; P.slot = slot; P.reloading = 0; P.switchT = 0.3; }
  else if (P.slot === slot) P.slot = P.inv[2] ? 2 : 3;
}
function clientSnap(m) {
  NET.lastSnap = performance.now();
  const [st, timer, liveT, round, s0, s1, p0, p1, over, maxHp, winR, autoN, lobbyT] = m.g;
  const prevState = G.state, newRound = round !== G.round && st !== 'lobby';
  G.state = st; G.timer = timer; G.liveT = liveT; G.round = round; G.score = [s0, s1]; G.prog = [p0, p1]; G.over = !!over;
  G.maxHp = maxHp || 210; G.winRounds = winR || 8; G.autoN = autoN || 0; G.lobbyT = lobbyT;
  if (st === 'lobby' && prevState !== 'lobby') { clearSmokes(); specTarget = null; }
  for (let i = 0; i < agents.length; i++) {
    const a = agents[i], s = m.a[i]; if (!s) continue;
    const alive = !!(s[7] & 1), tpChanged = s[11] !== a.tp, empty = !!(s[7] & 16);
    a.hp = s[8]; a.armor = s[9]; a.kills = s[12]; a.deaths = s[13]; a.human = !!(s[7] & 8);
    if (a === P) {
      if (tpChanged) { a.tp = s[11]; a.pos.set(s[0], s[1], s[2]); a.vel.set(0, 0, 0); a.yaw = s[3]; a.pitch = s[4]; }
      if (a.alive && !alive) { a.alive = false; a.vel.set(0, 0, 0); $('scope').classList.add('hidden'); P.scoped = false; a.rig.deadT = 0; mouseDown = false; }
      else if (!a.alive && alive) { a.alive = true; a.reloading = 0; a.fireCd = 0; a.punchP = a.punchY = 0; a.hp = s[8]; }
      continue;
    }
    if (empty) { a.net = 'empty'; a.alive = false; a.model.visible = false; continue; }
    a.net = 'proxy';
    a.netState = { p: [s[0], s[1], s[2]], y: s[3], pt: s[4], v: [s[5], s[6]], c: s[7] & 2, r: s[7] & 4 };
    const wid = WIDS[s[10]] || 'osa', W = WEAPONS[wid];
    if (!a.inv[W.slot] || a.inv[W.slot].id !== wid) a.inv[W.slot] = W.slot === 3 ? { id: 'knife' } : newGun(wid);
    a.slot = W.slot;
    if (tpChanged || (!a.alive && alive)) { a.tp = s[11]; a.pos.set(s[0], s[1], s[2]); a.yaw = s[3]; a.alive = alive; resetRig(a); a.model.visible = alive; }
    if (a.alive && !alive) a.rig.deadT = 0;
    a.alive = alive;
  }
  if (newRound) {
    for (const sl of [1, 2]) if (P.inv[sl] && WEAPONS[P.inv[sl].id].res) P.inv[sl].res = WEAPONS[P.inv[sl].id].res;
    roundStartFx(); resetRig(P); P.crouch = false; clearSmokes();
  }
  const [money, i1, i2, he, sm, fl] = m.me;
  P.money = money; P.gren = { he: he | 0, smoke: sm | 0, flash: fl | 0 }; syncInv(1, i1); syncInv(2, i2);
  if (!P.inv[P.slot]) P.slot = P.inv[1] ? 1 : 2;
  if (G.buyOpen) renderBuy();
  NET.nades = m.n || [];
  for (const e of m.e || []) clientEvent(e);
  if (st === 'over' && prevState !== 'over') showOver();
  if (st !== 'over') $('over').classList.add('hidden');
}
function clientEvent(e) {
  const V = arr => new THREE.Vector3(+arr[0] || 0, +arr[1] || 0, +arr[2] || 0);
  switch (e.k) {
    case 'sh': if (e.i !== NET.myIdx && agents[e.i] && WEAPONS[e.w]) shotFx(agents[e.i], e.w, e.e || []); break;
    case 'ml': if (e.i !== NET.myIdx && agents[e.i]) shotFx(agents[e.i], 'knife', []); break;
    case 'f': {
      const k = agents[e.ki], v = agents[e.vi]; if (!v) break;
      addFeed(k, v, e.w, e.h);
      if (e.ki === NET.myIdx && v !== P && G.state !== 'lobby') { PROF.stats.kills++; earn(10, t('rwKill')); }
      if (k && k !== v && v.rig) v.rig.fallDir = ((k.pos.x - v.pos.x) * -Math.sin(v.yaw) + (k.pos.z - v.pos.z) * -Math.cos(v.yaw)) > 0 ? 1 : -1;
      break;
    }
    case 'hurt': if (e.i === NET.myIdx) { flashDamage(e.f ? new THREE.Vector3(e.f[0], 0, e.f[1]) : null); hitSound(false, false, null); } break;
    case 'hm': if (e.i === NET.myIdx && e.x) hitMarker(!!e.h, true); break;
    case 'x': { const p = V(e.p); explosionFx(p); boomSound(p); if (P.alive && p.distanceTo(P.pos) < 7) shake = 0.5; break; }
    case 'sm': spawnSmoke(V(e.p)); break;
    case 'fl': {
      const c = V(e.p); flashSound(c); sparks(c, 20);
      if (P.alive) {
        const eye = P.eyePos(new THREE.Vector3()), d = eye.distanceTo(c);
        if (d < 28 && losClear(c, eye)) { const facing = P.forward(new THREE.Vector3()).dot(c.clone().sub(eye).normalize()) > 0.3 ? 1 : 0.35, amount = (1 - d / 28) * facing; blindPlayer(amount, 0.4 + amount * 4); }
      }
      break;
    }
    case 're': roundEndFx(e.w, e.r); break;
    case 'go': goFx(); break;
    case 'zo': zoneOpenFx(); break;
    case 'nm': applyNames(e.n); updateRoomBadge(); break;
    case 'cos': applyAllCos(e.c); break;
    case 'ms': showCenter(t('matchStart'), '', 2); radio('go'); break;
    case 'bl': showHint(t('backLobby'), 3); break;
    case 'chat': addChat(String(e.n || '?').slice(0, 14), e.tm ? 1 : 0, String(e.m || '').slice(0, 120)); break;
  }
}
const netNadeMeshes = [];
function clientUpdate(dt) {
  if (NET.lastSnap && performance.now() - NET.lastSnap > NET_TIMEOUT) { netLost(); return; }
  zoneVisual(dt);
  if (!G.paused) updatePlayer(dt); else { P.vel.x *= 0.8; P.vel.z *= 0.8; moveBody(P, dt); }
  for (const a of agents) { if (a !== P) followNet(a, dt); a.spot[0] -= dt; a.spot[1] -= dt; }
  if (!P.alive && P.rig.deadT < 3) animateSoldier(P, dt);
  localSpot(dt);
  NET.nades.forEach((n, i) => {
    if (!netNadeMeshes[i]) { netNadeMeshes[i] = new THREE.Mesh(nadeGeo, nadeMat); scene.add(netNadeMeshes[i]); }
    netNadeMeshes[i].visible = true; netNadeMeshes[i].position.set(n[0], n[1], n[2]); netNadeMeshes[i].material = nadeMats[NADES[n[3]] || 'he'];
  });
  for (let i = NET.nades.length; i < netNadeMeshes.length; i++) netNadeMeshes[i].visible = false;
  updateSmokes(dt);
  updateFx(dt);
  NET.sendT -= dt;
  if (NET.sendT <= 0) {
    NET.sendT = 1 / 30;
    netSend({ t: 'st', tp: P.tp, p: [r2(P.pos.x), r2(P.pos.y), r2(P.pos.z)], y: r3(P.yaw), pt: r3(P.pitch), v: [r2(P.vel.x), r2(P.vel.z)], c: P.crouch ? 1 : 0, w: P.gun().id, r: P.reloading > 0 ? 1 : 0 });
  }
}
// если вкладка хоста свёрнута, браузер почти останавливает requestAnimationFrame —
// тогда игру для всех продолжает двигать таймер из фонового воркера
{
  let lastBg = performance.now(), lastBeat = 0;
  try {
    const w = new Worker(URL.createObjectURL(new Blob(['setInterval(() => postMessage(0), 40)'], { type: 'text/javascript' })));
    w.onmessage = () => {
      const tt = performance.now(), dt = Math.min(0.1, (tt - lastBg) / 1000); lastBg = tt;
      if (NET.mode === 'host' && document.hidden && G.started) { now += dt; if (G.state !== 'over') updateGame(dt); hostTick(dt); if (typeof dirTick === 'function') dirTick(); }
      // в фоне браузер замедляет таймеры PeerJS — сами шлём серверу «я жив», чтобы комната не пропала
      if (NET.peer && document.hidden && tt - lastBeat > 5000) {
        lastBeat = tt;
        try { if (NET.peer.socket && !NET.peer.disconnected) NET.peer.socket.send({ type: 'HEARTBEAT' }); else if (NET.mode === 'host' && NET.peer.disconnected) NET.peer.reconnect(); } catch (e) {}
      }
    };
  } catch (e) {}
}
