/* ================= server list ================= */
// Список серверов без своего сервера: одна из запущенных копий игры становится «справочной»
// под известным id. Публичные комнаты регистрируются в ней каждые несколько секунд,
// остальные спрашивают у неё список. Если справочная пропала, её место занимает следующая копия.
const DIR = { peer: null, isDir: false, rooms: new Map(), conn: null, connT: 0, lastReg: 0, browse: null, lastList: 0, list: [], busy: false };
const DIR_ID = PEER_PREFIX + 'directory';
const ROOM_TTL = 30000;
function dirBecome() {
  if (DIR.isDir || DIR.busy) return Promise.resolve(DIR.isDir);
  DIR.busy = true;
  return loadPeer().then(() => new Promise(res => {
    const p = new Peer(DIR_ID, peerOpts());
    let settled = false; const done = v => { if (!settled) { settled = true; DIR.busy = false; res(v); } };
    p.on('open', () => {
      DIR.peer = p; DIR.isDir = true;
      p.on('connection', c => c.on('data', m => dirHandle(c, m)));
      done(true);
    });
    p.on('disconnected', () => { if (!p.destroyed) setTimeout(() => { try { p.reconnect(); } catch (e) {} }, 1500); });
    p.on('error', err => {
      if (err.type === 'unavailable-id') { p.destroy(); done(false); }
      else if (!DIR.isDir) { p.destroy(); done(false); }
    });
    setTimeout(() => { if (!settled) { p.destroy(); done(false); } }, 10000);
  })).catch(() => { DIR.busy = false; return false; });
}
function cleanRoom(r) {
  return { code: String(r.code || '').replace(/\D/g, '').slice(0, 8), name: String(r.name || '').slice(0, 24), n: clamp(r.n | 0, 0, 10),
    st: ['lobby', 'freeze', 'live', 'end', 'over'].includes(r.st) ? r.st : 'lobby', r: clamp(r.r | 0, 0, 99), hp: clamp(r.hp | 0, 0, 999), map: MAPS[r.map] ? r.map : '', t: Date.now() };
}
function dirHandle(c, m) {
  if (!m || typeof m !== 'object') return;
  if (m.t === 'reg') { const r = cleanRoom(m); if (r.code.length >= 5) DIR.rooms.set(r.code, r); }
  else if (m.t === 'unreg') DIR.rooms.delete(String(m.code || ''));
  else if (m.t === 'list') { try { c.send({ t: 'rooms', list: dirList() }); } catch (e) {} }
}
function dirList() {
  const nowMs = Date.now();
  for (const [k, r] of DIR.rooms) if (nowMs - r.t > ROOM_TTL) DIR.rooms.delete(k);
  return [...DIR.rooms.values()].sort((a, b) => b.n - a.n).slice(0, 50);
}
function myRoomInfo() { return { t: 'reg', code: NET.code, name: SET.srvName || (P.name + ' — ' + t('mpTitle')), n: humansCount(), st: G.state, r: G.round, hp: G.maxHp, map: WORLD.id }; }
// хост: регистрация комнаты в справочной
function dirRegister() {
  if (NET.mode !== 'host' || !SET.mpPublic) return;
  const info = myRoomInfo();
  if (DIR.isDir) { dirHandle(null, info); return; }
  if (DIR.conn && DIR.conn.open) { try { DIR.conn.send(info); } catch (e) {} return; }
  if (Date.now() - DIR.connT < 6000) return;
  DIR.connT = Date.now();
  const c = NET.peer.connect(DIR_ID, { reliable: true, serialization: 'json' });
  DIR.conn = c;
  c.on('open', () => { try { c.send(myRoomInfo()); } catch (e) {} });
  c.on('close', () => { if (DIR.conn === c) DIR.conn = null; });
  c.on('error', () => { if (DIR.conn === c) DIR.conn = null; });
  // справочная не ответила — становимся ею сами
  setTimeout(() => { if (!c.open && NET.mode === 'host') { if (DIR.conn === c) DIR.conn = null; dirBecome().then(ok => { if (ok) dirHandle(null, myRoomInfo()); }); } }, 5000);
}
function dirUnregister() {
  try { if (DIR.isDir) DIR.rooms.delete(NET.code); else if (DIR.conn && DIR.conn.open) DIR.conn.send({ t: 'unreg', code: NET.code }); } catch (e) {}
  if (DIR.conn) { try { DIR.conn.close(); } catch (e) {} DIR.conn = null; }
}
// игрок в меню: запрос списка
function dirFetch() {
  if (DIR.isDir) { renderServers(dirList()); return; }
  return loadPeer().then(() => {
    if (!DIR.browse || DIR.browse.destroyed) {
      DIR.browse = new Peer(randId(), peerOpts());
      DIR.browse.on('error', err => {
        if (err.type === 'peer-unavailable') dirBecome().then(ok => renderServers(ok ? dirList() : []));
      });
      DIR.browse.on('disconnected', () => { try { DIR.browse.reconnect(); } catch (e) {} });
    }
    const go = () => {
      const c = DIR.browse.connect(DIR_ID, { reliable: true, serialization: 'json' });
      c.on('open', () => c.send({ t: 'list' }));
      c.on('data', m => { if (m && m.t === 'rooms') { renderServers((Array.isArray(m.list) ? m.list : []).map(cleanRoom)); setTimeout(() => c.close(), 200); } });
    };
    if (DIR.browse.open) go(); else DIR.browse.once('open', go);
  }).catch(() => renderServers(null));
}
function renderServers(list) {
  const el = $('srvlist'); if (!el) return;
  if (list === null) { el.innerHTML = `<p class="sub">${esc(t('st_nointernet'))}</p>`; return; }
  DIR.list = list;
  if (!list.length) { el.innerHTML = `<p class="sub">${esc(t('srvEmpty'))}</p>`; return; }
  el.innerHTML = list.map(r => `<div class="srv"><div><b>${esc(r.name || r.code)}</b><small>${esc(r.st === 'lobby' ? t('srvWarmup') : t('srvMatch', r.r))} · ${r.hp} HP${MAPS[r.map] ? ' · ' + esc(mapName(r.map)) : ''}</small></div>
    <span class="srvn">${r.n}/10</span><button data-code="${esc(r.code)}" ${r.n >= 10 ? 'disabled' : ''}>${esc(t('join'))}</button></div>`).join('');
  for (const b of el.querySelectorAll('button[data-code]')) b.onclick = () => { $('mpcode').value = b.dataset.code; joinGame(); };
}
// периодические задачи: регистрация хоста, обновление списка в открытом меню
function dirTick() {
  const nowMs = Date.now();
  if (NET.mode === 'host' && nowMs - DIR.lastReg > 8000) { DIR.lastReg = nowMs; dirRegister(); }
  const open = !G.started && !$('menu').classList.contains('hidden') && $('scr-mp').classList.contains('on');
  if (open && nowMs - DIR.lastList > 6000) { DIR.lastList = nowMs; dirFetch(); }
}
setInterval(dirTick, 1000);
window.addEventListener('beforeunload', () => { if (NET.mode === 'host') dirUnregister(); });
