// SandForge — entry point: game loop, weapons, networking glue.
import * as THREE from 'three';
import { G, loadSettings, saveSettings } from './state.js';
import { initWorld, applyQuality, updateFx, unlockAudio, playSound, mapMeshes, render, audioContext } from './world.js';
import * as E from './entities.js';
import { registerBuiltins } from './content.js';
import { createApi, loadEnabledAddons, runAddon, loadedAddons, addonsForClients } from './addons.js';
import * as P from './player.js';
import { initControls, input, isTouch, takeLook, takeWheel, captureMouse, releaseMouse } from './controls.js';
import * as UI from './ui.js';
import { sanitizeAvatar } from './character.js';
import { loadCustomModels } from './custommodels.js';
import { initPhysics, physicsInfo } from './phys.js';
import { initSounds } from './sounds.js';
import { initEditors, openCharEditor, charEditorOpen, updateCharPreview, openDevMenu, devMenuOpen } from './editor.js';
import { setTimeOfDay, setFog, env, updateEnvironment, adaptiveResolution } from './world.js';
import { on } from './state.js';
import { Net } from './net.js';

const $ = id => document.getElementById(id);

const WEAPONS = [
  { id: 'physgun', name: 'Физпушка' },
  { id: 'toolgun', name: 'Тулган' },
  { id: 'pistol', name: 'Бластер' },
  { id: 'launcher', name: 'Гранатомёт' },
  { id: 'hands', name: 'Руки' },
];

let weapon = 'physgun';
let toolId = 'weld';
let running = false;
let grab = null;        // local physgun hold { id, part, local, dist }
let cooldown = 0;
let netTimer = 0, fullTimer = 0, dragTimer = 0;
let rotAcc = { dx: 0, dy: 0 };
let paused = false;
const clientStates = new Map(); // host: pid -> { name, color, s }
const beam = { obj: null };

// ---------- helpers ----------
function myId() { return G.isHost ? 'host' : (G.net ? G.net.myId : 'local'); }

function act(msg) {
  if (G.isHost) E.hostAction('host', msg);
  else G.net?.sendToHost({ t: 'act', m: msg });
}

function systemMessage(text, pid) {
  if (/только/i.test(text) && (pid == null || pid === myId())) playSound('warning');
  if (pid == null) {
    UI.chatLine(null, text, null, true);
    if (G.isHost) G.net?.broadcast({ t: 'sys', text });
  } else if (pid === myId() || pid === 'host' && G.isHost) {
    UI.chatLine(null, text, null, true);
  } else if (G.isHost) {
    G.net?.sendTo(pid, { t: 'sys', text });
  }
}

const v3 = v => [v.x, v.y, v.z];

// Raycast what the crosshair points at (works on host and client)
const raycaster = new THREE.Raycaster();
function aim(maxDist = 200) {
  raycaster.set(P.player.eye, P.player.dir);
  raycaster.far = maxDist;
  const objs = [...mapMeshes];
  for (const ent of G.ents.values()) for (const p of ent.parts) objs.push(p.group);
  const hits = raycaster.intersectObjects(objs, true);
  if (!hits.length) return null;
  const h = hits[0];
  const res = { point: h.point.clone(), distance: h.distance, normal: h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : new THREE.Vector3(0, 1, 0) };
  const ud = h.object.userData;
  if (ud.entId != null && G.ents.has(ud.entId)) {
    res.entId = ud.entId;
    res.part = ud.part;
    const grp = G.ents.get(ud.entId).parts[ud.part].group;
    res.local = grp.worldToLocal(h.point.clone());
  }
  return res;
}

// ---------- spawning from the menu ----------
function defExtents(def) {
  let bottom = 0, radius = 0.3;
  for (const p of def.parts) {
    for (const s of p.shapes) {
      const off = s.offset || [0, 0, 0];
      let hy, hr;
      if (s.type === 'box') { hy = s.size[1] / 2; hr = Math.max(...s.size) / 2; }
      else if (s.type === 'sphere') { hy = hr = s.r; }
      else { hy = s.rot ? Math.max(s.rt ?? s.r, s.rb ?? s.r) : s.h / 2; hr = Math.max(s.h / 2, s.rt ?? s.r ?? 0, s.rb ?? s.r ?? 0); }
      bottom = Math.max(bottom, hy - (p.offset[1] + off[1]));
      radius = Math.max(radius, hr + Math.hypot(...off) + Math.hypot(...p.offset));
    }
  }
  return { bottom, radius };
}

function spawnFromMenu(type) {
  const def = G.propDefs.get(type);
  if (!def) return;
  const ex = defExtents(def);
  const hit = aim(40);
  let pos;
  if (hit) {
    const n = hit.normal;
    const off = n.y > 0.7 ? ex.bottom + 0.05 : ex.radius + 0.1;
    pos = hit.point.clone().addScaledVector(n, off);
  } else pos = P.player.eye.clone().addScaledVector(P.player.dir, 4 + ex.radius);
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, P.player.yaw, 0));
  act({ a: 'spawn', type, pos: v3(pos), quat: [q.x, q.y, q.z, q.w] });
  playSound('spawn');
}

// ---------- weapons ----------
function selectWeapon(i) {
  const w = WEAPONS[i];
  if (!w) return;
  if (grab) releaseGrab(false);
  weapon = w.id;
  P.setViewModel(weapon === 'hands' ? 'hands' : weapon);
  playSound('weapon');
  refreshHud();
}

function selectTool(id) {
  toolId = id;
  selectWeapon(1);
  UI.notice('Тулган: ' + (G.toolDefs.get(id)?.name || id));
  P.setToolScreen(G.toolDefs.get(id)?.name || id);
}

function refreshHud() {
  UI.setWeaponBar(WEAPONS, weapon);
  let info = '';
  if (weapon === 'physgun') info = '<b>Физпушка</b><br>' + (isTouch ? 'Держите «Огонь» — схватить (палец можно вести для обзора) · «Альт» — заморозить · «Вращать» + свайп — крутить предмет' : 'ЛКМ (держать) — схватить · ПКМ — заморозить · E + мышь — вращать · колесо — дальность');
  else if (weapon === 'toolgun') {
    const t = G.toolDefs.get(toolId);
    info = `<b>Тулган: ${UI.esc(t ? t.name : toolId)}</b><br>${UI.esc(t ? t.desc || '' : '')}<br><small>Режим выбирается в меню «Спавн», раздел «Инструменты»</small>`;
  } else if (weapon === 'pistol') info = '<b>Бластер</b> — толкает предметы и ломает бочки';
  else if (weapon === 'launcher') info = '<b>Гранатомёт</b> — граната взрывается через 2.5 с';
  else info = '<b>Руки</b> — Огонь: толкнуть предмет';
  UI.setToolInfo(info);
  UI.setTouchMode(P.player.noclip, weapon);
}

function releaseGrab(freeze) {
  if (!grab) return;
  act({ a: 'release', freeze });
  grab = null;
  playSound('drop');
}

function onPress(name) {
  unlockAudio();
  if (!G.inGame || paused) return;
  const o = v3(P.player.eye), d = v3(P.player.dir);
  if (name === 'noclip') { P.setNoclip(!P.player.noclip); refreshHud(); UI.notice(P.player.noclip ? 'Полёт: вкл' : 'Полёт: выкл'); return; }
  if (name === 'undo') { act({ a: 'undo' }); playSound('click'); return; }
  if (name === 'run') { runToggle = !runToggle; UI.setRunButton(runToggle); return; }
  if (name === 'fire') {
    if (weapon === 'physgun') {
      const hit = aim(120);
      if (hit && hit.entId != null) {
        grab = { id: hit.entId, part: hit.part, local: v3(hit.local), dist: hit.distance };
        act({ a: 'grab', id: grab.id, part: grab.part, local: grab.local, dist: grab.dist, o, d });
        playSound('grab');
      }
    } else if (weapon === 'toolgun') {
      if (cooldown > 0) return;
      cooldown = 0.25;
      act({ a: 'tool', tool: toolId, btn: 1, o, d, opts: { color: UI.ui.toolColor ? parseInt(UI.ui.toolColor.slice(1), 16) : null } });
      playSound('zap'); P.viewKick();
    } else if (weapon === 'launcher') {
      if (cooldown > 0) return;
      cooldown = 0.8;
      const pos = P.player.eye.clone().addScaledVector(P.player.dir, 1.2);
      const bv = P.player.body.velocity;
      act({ a: 'spawn', type: 'grenade', pos: v3(pos), vel: [d[0] * 22 + bv.x, d[1] * 22 + 3 + bv.y, d[2] * 22 + bv.z] });
      playSound('shoot'); P.viewKick();
    } else if (weapon === 'hands') {
      if (cooldown > 0) return;
      cooldown = 0.4;
      act({ a: 'tool', tool: 'push', btn: 1, o, d });
      P.viewKick();
    }
  }
  if (name === 'alt') {
    if (weapon === 'physgun') {
      if (grab) { releaseGrab(true); UI.notice('Заморожено'); }
      else {
        const hit = aim(120);
        if (hit && hit.entId != null) { act({ a: 'unfreeze', id: hit.entId, p: v3(hit.point) }); playSound('grab'); }
      }
    } else if (weapon === 'toolgun') {
      if (cooldown > 0) return;
      cooldown = 0.25;
      act({ a: 'tool', tool: toolId, btn: 2, o, d, opts: { color: UI.ui.toolColor ? parseInt(UI.ui.toolColor.slice(1), 16) : null } });
      playSound('zap'); P.viewKick();
    }
  }
}
function onRelease(name) {
  if (name === 'fire' && weapon === 'physgun' && grab) releaseGrab(false);
}
let runToggle = false;

function onKey(code) {
  if (code === 'Escape' && charEditorOpen()) { $('c-cancel').click(); return; }
  if (code === 'Escape' && devMenuOpen()) { $('devclose').click(); return; }
  if (charEditorOpen() || devMenuOpen()) return;
  if (code === 'Escape') {
    if (!$('chatbox').classList.contains('hidden')) { UI.closeChat(); return; }
    if (!$('spawnmenu').classList.contains('hidden')) { UI.closeSpawnMenu(); return; }
    if (G.inGame) { if (UI.pauseOpen()) resume(); else if (UI.anyScreenOpen()) UI.backScreen(); else pause(); }
    return;
  }
  if (!G.inGame || UI.anyScreenOpen() && code !== 'KeyQ') return;
  if (code.startsWith('Digit')) { const n = Number(code.slice(5)) - 1; if (n >= 0 && n < WEAPONS.length) selectWeapon(n); }
  else if (code === 'KeyQ') UI.toggleSpawnMenu();
  else if (code === 'KeyZ') onPress('undo');
  else if (code === 'KeyV') onPress('noclip');
  else if (code === 'KeyF') toggleView();
  else if (code === 'KeyT' || code === 'Enter') { setTimeout(UI.openChat, 0); }
}

// ---------- game flow ----------
function resetWorld() {
  E.clearAll();
  P.clearRemotePlayers();
  clientStates.clear();
  G.world.gravity.set(0, -9.82, 0);
  grab = null;
  P.setNoclip(false);
  P.respawn();
}

function enterGame() {
  G.inGame = true;
  paused = false;
  UI.hideAllScreens();
  UI.showHud();
  selectWeapon(0);
  updateRoomInfo();
}

function startSingle(withStarterProps = true) {
  if (G.net) { G.net.close(); G.net = null; }
  G.isHost = true;
  resetWorld();
  if (withStarterProps) {
    E.hostSpawn('crate', [3, 0.6, 6], null, { owner: 'world' });
    E.hostSpawn('crate', [3.2, 1.7, 6], null, { owner: 'world' });
    E.hostSpawn('barrel_boom', [-4, 0.7, 4], null, { owner: 'world' });
    E.hostSpawn('ragdoll', [0, 0.1, 3], null, { owner: 'world' });
    E.hostSpawn('ball', [-2, 1, 7], null, { owner: 'world' });
    E.hostSpawn('plank_long', [6, 0.2, 0], null, { owner: 'world' });
  }
  enterGame();
  UI.chatLine(null, 'Добро пожаловать в SandForge! Откройте «Спавн», чтобы создавать предметы. !помощь — список команд.', null, true);
}

async function startHost() {
  UI.setStatus('Создаю сервер…');
  startSingle(true);
  await openServer();
}

async function openServer() {
  if (G.net) return;
  const net = new Net(netHandlers);
  try {
    UI.toast('Открываю сервер…');
    const code = await net.host();
    G.net = net;
    updateRoomInfo();
    UI.chatLine(null, `Сервер открыт! Код комнаты: ${code}. Друзья вводят его в «Подключиться».`, null, true);
    UI.toast('Код комнаты: ' + code);
    if (UI.pauseOpen()) UI.openScreen('pausemenu');
  } catch (e) {
    net.close();
    UI.toast('Не удалось открыть сервер: ' + (e.message || e.type || e));
    UI.setStatus('');
  }
}

async function joinGame(code) {
  UI.setStatus('Подключаюсь к ' + code + '…');
  if (G.net) { G.net.close(); G.net = null; }
  const net = new Net(netHandlers);
  try {
    await net.join(code);
    G.net = net;
    G.isHost = false;
    resetWorld();
    net.sendToHost({ t: 'hello', name: G.me.name, color: G.me.color, avatar: G.me.avatar });
    UI.setStatus('Загрузка мира…');
  } catch (e) {
    net.close();
    UI.setStatus(e.message || 'Ошибка подключения');
  }
}

function quit() {
  if (G.net) { G.net.close(); G.net = null; }
  G.inGame = false;
  G.isHost = true;
  resetWorld();
  releaseMouse();
  UI.showMain();
  UI.setStatus('');
}

function pause() {
  if (!G.inGame) return;
  releaseMouse();
  UI.closeSpawnMenu();
  UI.openScreen('pausemenu');
  paused = !G.net; // single player actually pauses physics
}
function resume() {
  UI.hideAllScreens();
  paused = false;
  if (!isTouch) captureMouse();
}

function updateRoomInfo() {
  if (!G.inGame) return;
  if (!G.net) UI.setRoomInfo('Одиночная игра');
  else UI.setRoomInfo(`Комната ${G.net.code} · игроков: ${G.players.size + 1}${G.isHost ? ' · вы хост' : ''}`);
}

function listPlayers() {
  const out = [{ id: myId(), name: G.me.name, color: G.me.color, me: true, host: G.isHost }];
  for (const rp of G.players.values()) out.push({ id: rp.id, name: rp.name, color: rp.color, host: rp.id === 'host' });
  return out;
}
G.listPlayers = () => listPlayers().map(p => {
  const rp = G.players.get(p.id);
  const pos = p.me ? v3(P.player.body.position) : rp ? v3(rp.pos) : null;
  return { id: p.id, name: p.name, pos };
});

// ---------- chat & commands ----------
function sendChat(text) {
  if (text.startsWith('!')) {
    const [name, ...args] = text.slice(1).split(/\s+/);
    runCommand(name.toLowerCase(), args);
    return;
  }
  const msg = { t: 'chat', name: G.me.name, color: G.me.color, text };
  if (G.isHost) { UI.chatLine(msg.name, text, msg.color); G.net?.broadcast(msg); } else G.net?.sendToHost(msg);
}
function runCommand(name, args = []) {
  if (!G.commands.has(name)) { playSound('denied'); UI.chatLine(null, 'Неизвестная команда: !' + name + ' (см. !помощь)', null, true); return; }
  act({ a: 'cmd', name, args });
}

function registerCommands() {
  G.commands.set('помощь', (pid) => systemMessage('Команды: ' + [...G.commands.keys()].map(c => '!' + c).join(', '), pid));
  G.commands.set('help', (pid) => systemMessage('Команды: ' + [...G.commands.keys()].map(c => '!' + c).join(', '), pid));
  G.commands.set('очистить', (pid) => { E.hostCleanup(pid); systemMessage('Ваши предметы удалены', pid); });
  G.commands.set('очиститьвсе', (pid) => {
    if (pid !== 'host') { systemMessage('Только хост может очистить всю карту', pid); return; }
    E.hostCleanup(null); systemMessage('Карта очищена');
  });
  G.commands.set('сохранить', (pid) => {
    if (pid !== 'host') { systemMessage('Сохранять может только хост', pid); return; }
    const data = { ents: [...G.ents.values()].map(E.serializeEntity), cons: [...G.cons.values()].map(E.serializeConstraint) };
    try { localStorage.setItem('sf_save', JSON.stringify(data)); systemMessage(`Сохранено предметов: ${data.ents.length}`, pid); } catch (e) { systemMessage('Не удалось сохранить', pid); }
  });
  G.commands.set('загрузить', (pid) => {
    if (pid !== 'host') { systemMessage('Загружать может только хост', pid); return; }
    let data;
    try { data = JSON.parse(localStorage.getItem('sf_save') || 'null'); } catch (e) { data = null; }
    if (!data) { systemMessage('Нет сохранения. Используйте !сохранить', pid); return; }
    E.hostCleanup(null);
    const remap = new Map();
    for (const e of data.ents) {
      if (!G.propDefs.has(e.type)) continue;
      const id = G.nextId++;
      remap.set(e.id, id);
      const ent = E.createEntity({ ...e, id, owner: 'host' });
      if (ent) G.net?.broadcast({ t: 'spawn', e: E.serializeEntity(ent) });
    }
    for (const c of data.cons) {
      if (!remap.has(c.a) || (c.b != null && !remap.has(c.b))) continue;
      E.hostConstraint({ ...c, a: remap.get(c.a), b: c.b != null ? remap.get(c.b) : null }, null);
    }
    systemMessage('Постройка загружена', pid);
  });
}

// ---------- networking ----------
const netHandlers = {
  // host side
  onJoin() { /* wait for hello */ },
  onLeave(pid) {
    const st = clientStates.get(pid);
    clientStates.delete(pid);
    P.removeRemotePlayer(pid);
    E.dropPlayerState(pid);
    if (st) systemMessage(`${st.name} вышел из игры`);
    G.net?.broadcast({ t: 'left', id: pid });
    updateRoomInfo();
  },
  onData(from, d) {
    if (!d || typeof d !== 'object') return;
    if (G.isHost) hostData(from, d); else clientData(d);
  },
  onDisconnect() {
    if (!G.inGame && !G.net) return;
    quit();
    playSound('warning');
    UI.setStatus('Соединение с сервером потеряно');
  },
  onError(e) { console.warn('net', e); },
};

function hostData(pid, d) {
  switch (d.t) {
    case 'hello': {
      const name = String(d.name || 'Игрок').slice(0, 16);
      const color = /^#[0-9a-f]{6}$/i.test(d.color) ? d.color : '#cccccc';
      const avatar = sanitizeAvatar(d.avatar);
      clientStates.set(pid, { name, color, s: null, avatar });
      P.setAvatarFor(pid, avatar);
      P.createRemotePlayer(pid, name, color);
      const avatars = { host: G.me.avatar };
      for (const [id, st] of clientStates) avatars[id] = st.avatar;
      G.net.broadcast({ t: 'av', id: pid, a: avatar }, pid);
      G.net.sendTo(pid, {
        t: 'welcome', you: pid, addons: addonsForClients(), grav: G.world.gravity.y, avatars, env: { tod: env.tod, fog: env.fog },
        ents: [...G.ents.values()].map(E.serializeEntity), cons: [...G.cons.values()].map(E.serializeConstraint),
      });
      systemMessage(`${name} подключился`);
      updateRoomInfo();
      break;
    }
    case 'act': if (clientStates.has(pid) && d.m) E.hostAction(pid, d.m); break;
    case 'av': {
      const st = clientStates.get(pid);
      if (!st) return;
      st.avatar = sanitizeAvatar(d.a);
      P.setAvatarFor(pid, st.avatar);
      G.net.broadcast({ t: 'av', id: pid, a: st.avatar }, pid);
      break;
    }
    case 'ps': {
      const st = clientStates.get(pid);
      if (!st || !d.s) return;
      st.s = d.s;
      const rp = G.players.get(pid);
      if (rp) P.updateRemotePlayer(rp, d.s);
      break;
    }
    case 'chat': {
      const st = clientStates.get(pid);
      if (!st) return;
      const msg = { t: 'chat', name: st.name, color: st.color, text: String(d.text || '').slice(0, 200) };
      UI.chatLine(msg.name, msg.text, msg.color);
      G.net.broadcast(msg);
      break;
    }
    default: break;
  }
}

function clientData(d) {
  switch (d.t) {
    case 'welcome': {
      if (G.settings.serverAddons) {
        for (const a of d.addons || []) {
          if (loadedAddons.find(x => x.name === a.name)) continue;
          const r = runAddon(a.code, 'server', a.name);
          if (!r.ok) UI.chatLine(null, `Аддон сервера «${a.name}» не загрузился: ${r.error}`, null, true);
        }
      }
      G.world.gravity.set(0, d.grav ?? -9.82, 0);
      for (const [id, a] of Object.entries(d.avatars || {})) if (id !== G.net.myId) P.setAvatarFor(id, a);
      if (d.env) { setTimeOfDay(d.env.tod); setFog(d.env.fog); }
      for (const e of d.ents) E.createEntity(e);
      for (const c of d.cons) E.createConstraint(c);
      enterGame();
      UI.chatLine(null, `Вы подключились к комнате ${G.net.code}`, null, true);
      break;
    }
    case 'pl': {
      const seen = new Set();
      for (const p of d.l) {
        if (p.id === G.net.myId) continue;
        seen.add(p.id);
        let rp = G.players.get(p.id);
        if (!rp) rp = P.createRemotePlayer(p.id, p.nm, p.c);
        if (p.s) P.updateRemotePlayer(rp, p.s);
      }
      for (const id of [...G.players.keys()]) if (!seen.has(id)) P.removeRemotePlayer(id);
      updateRoomInfo();
      break;
    }
    case 'chat': UI.chatLine(d.name, d.text, d.color); break;
    case 'sys': UI.chatLine(null, d.text, null, true); if (/только/i.test(d.text)) playSound('warning'); break;
    case 'grav': G.world.gravity.set(0, d.y, 0); break;
    case 'av': if (d.id !== G.net.myId) P.setAvatarFor(d.id, d.a); break;
    case 'env': setTimeOfDay(d.tod); setFog(d.fog); break;
    case 'left': P.removeRemotePlayer(d.id); updateRoomInfo(); break;
    default: E.clientEntityMessage(d);
  }
}

function myState() {
  let b = null;
  if (grab && G.ents.has(grab.id)) {
    const grp = G.ents.get(grab.id).parts[grab.part].group;
    b = v3(new THREE.Vector3(...grab.local).applyMatrix4(grp.matrixWorld)).map(x => Math.round(x * 100) / 100);
  }
  const p = P.player.body.position;
  return { p: [p.x, p.y, p.z].map(x => Math.round(x * 100) / 100), y: Math.round(P.player.yaw * 100) / 100, pi: Math.round(P.player.pitch * 100) / 100, w: weapon, b, n: P.player.noclip ? 1 : 0, c: G.me.color };
}

function netTick(dt) {
  if (!G.net) return;
  netTimer += dt;
  fullTimer += dt;
  if (netTimer < 0.05) return;
  netTimer = 0;
  if (G.isHost) {
    const full = fullTimer > 3;
    if (full) fullTimer = 0;
    const snap = E.buildSnapshot(full);
    if (snap.length) G.net.broadcast({ t: 's', d: snap });
    const l = [{ id: 'host', nm: G.me.name, c: G.me.color, s: myState() }];
    for (const [pid, st] of clientStates) l.push({ id: pid, nm: st.name, c: st.color, s: st.s });
    G.net.broadcast({ t: 'pl', l });
  } else {
    G.net.sendToHost({ t: 'ps', s: myState() });
  }
}

// ---------- main loop ----------
const clock = new THREE.Clock();
let acc = 0;
const STEP = 1 / 60;

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  updateFps(dt);
  updateEnvironment(dt);
  if (G.inGame) adaptiveResolution(dt);
  if (charEditorOpen()) {
    // dressing room: the world keeps running, the camera looks at the preview character
    if (G.inGame && G.isHost && !paused) { acc += dt; while (acc >= STEP) { E.stepGrabs(); E.stepRopes(); G.world.step(STEP * (G.timeScale || 1)); acc -= STEP; } E.stepThink(dt); }
    E.syncEntityMeshes(dt);
    P.animateRemotePlayers(dt);
    updateFx(dt);
    if (G.inGame) netTick(dt);
    updateCharPreview(dt);
    render();
    return;
  }
  if (!G.inGame) {
    // idle camera orbit for the menu background
    G.time += dt;
    const a = G.time * 0.05;
    G.camera.position.set(Math.sin(a) * 45, 16, Math.cos(a) * 45);
    G.camera.lookAt(0, 3, -10);
    E.syncEntityMeshes(dt);
    render();
    return;
  }
  if (cooldown > 0) cooldown -= dt;

  // ---- input ----
  const look = takeLook();
  const sens = 0.0025 * G.settings.sens;
  const rotating = grab && input.held.has('rot');
  if (!UI.anyScreenOpen()) {
    if (rotating) { rotAcc.dx += look.dx * sens * 2; rotAcc.dy += look.dy * sens * 2; }
    else { P.player.yaw -= look.dx * sens; P.player.pitch -= look.dy * sens; }
  }
  const k = input.keys;
  const typing = UI.anyScreenOpen();
  const f = typing ? 0 : (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0) + input.move.y;
  const s = typing ? 0 : (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0) + input.move.x;
  const inp = P.player.input;
  inp.f = Math.max(-1, Math.min(1, f));
  inp.s = Math.max(-1, Math.min(1, s));
  inp.jump = !typing && (k.has('Space') || input.held.has('jump'));
  inp.run = runToggle || k.has('ShiftLeft') || k.has('ShiftRight');
  inp.up = (inp.jump ? 1 : 0) - ((k.has('ControlLeft') || k.has('KeyC') || input.held.has('down')) ? 1 : 0);

  // physgun distance & drag
  if (grab) {
    const w = takeWheel();
    if (w) grab.dist = Math.max(1.2, grab.dist - w * 0.8);
    if (input.held.has('far')) grab.dist = Math.min(60, grab.dist + dt * 8);
    if (input.held.has('near')) grab.dist = Math.max(1.2, grab.dist - dt * 8);
    dragTimer += dt;
    if (dragTimer > 0.033) {
      dragTimer = 0;
      act({ a: 'drag', o: v3(P.player.eye), d: v3(P.player.dir), dist: grab.dist });
      if (rotAcc.dx || rotAcc.dy) { act({ a: 'grot', dx: rotAcc.dx, dy: rotAcc.dy, d: v3(P.player.dir) }); rotAcc.dx = rotAcc.dy = 0; }
    }
    if (!G.ents.has(grab.id)) grab = null;
  } else {
    const w = takeWheel();
    if (w && !UI.anyScreenOpen()) selectWeapon((WEAPONS.findIndex(x => x.id === weapon) + (w > 0 ? 1 : -1) + WEAPONS.length) % WEAPONS.length);
  }
  if (weapon === 'pistol' && input.held.has('fire') && cooldown <= 0 && !paused) {
    cooldown = 0.14;
    act({ a: 'shoot', o: v3(P.player.eye), d: v3(P.player.dir) });
    playSound('shoot'); P.viewKick();
  }

  // ---- simulation ----
  if (!paused) {
    G.time += dt;
    P.updatePlayer(dt);
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 4) {
      if (G.isHost) { E.stepGrabs(); E.stepRopes(); }
      G.world.step(STEP * (G.timeScale || 1));
      acc -= STEP; n++;
    }
    if (n === 4) acc = 0;
    if (G.isHost) E.stepThink(dt);
  }
  P.player.holding = weapon === 'physgun' && !!grab;
  P.updateCamera(dt);
  E.syncEntityMeshes(dt);
  P.animateRemotePlayers(dt);
  E.updateRopeLines();
  updateFx(dt);
  P.updateViewModel(dt);

  // physgun beam
  if (weapon === 'physgun' && grab && G.ents.has(grab.id)) {
    const grp = G.ents.get(grab.id).parts[grab.part].group;
    const to = new THREE.Vector3(...grab.local).applyMatrix4(grp.matrixWorld);
    const from = P.gunTip();
    const mid = P.player.eye.clone().addScaledVector(P.player.dir, from.distanceTo(to) * 0.6);
    P.setBeam(beam.obj, from, mid, to);
  } else P.setBeam(beam.obj, null);

  netTick(dt);
  render();
}

// ---------- physgun look (player's own picture + glow colour) ----------
let skinTex = null;
function applyPhysgun() {
  let url = null;
  try { url = localStorage.getItem('sf_physgun_skin'); } catch (e) { url = null; }
  const glow = new THREE.Color(G.settings.physgunGlow || '#40c8ff').getHex();
  if (beam.obj) P.setBeamColor(beam.obj, glow);
  if (skinTex) { skinTex.dispose(); skinTex = null; }
  if (!url) { P.rebuildPhysgun(null, glow); return; }
  new THREE.TextureLoader().load(url, (t) => {
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    skinTex = t;
    P.rebuildPhysgun(t, glow);
  });
}

let botTex = null;
function applyBotSkin() {
  let url = null;
  try { url = localStorage.getItem('sf_bot_skin'); } catch (e) { url = null; }
  if (botTex) { botTex.dispose(); botTex = null; }
  if (!url) { E.setBotSkin(null); return; }
  new THREE.TextureLoader().load(url, (t) => {
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    botTex = t;
    E.setBotSkin(t);
  });
}

// ---------- view, fps, avatar ----------
function toggleView() {
  P.setThirdPerson(!P.player.thirdPerson);
  UI.notice(P.player.thirdPerson ? 'Вид от третьего лица' : 'Вид от первого лица');
}
let fpsOn = false, fpsAcc = 0, fpsN = 0;
function updateFps(dt) {
  if (!fpsOn) return;
  fpsAcc += dt; fpsN++;
  if (fpsAcc >= 0.5) { $('fps').textContent = Math.round(fpsN / fpsAcc) + ' FPS'; fpsAcc = 0; fpsN = 0; }
}
function saveAvatar(a) {
  G.settings.avatar = a;
  saveSettings();
  P.rebuildLocalAvatar(a);
  P.tintViewModel(a.shirt);
  if (G.net) {
    if (G.isHost) G.net.broadcast({ t: 'av', id: 'host', a });
    else G.net.sendToHost({ t: 'av', a });
  }
}

// Developer menu actions (host only)
function devAction(pid, m) {
  if (m.a !== 'dev') return;
  if (pid !== 'host') { systemMessage('Меню разработчика может менять мир только у хоста', pid); return; }
  const num = (v, lo, hi) => Math.min(hi, Math.max(lo, Number(v) || 0));
  switch (m.op) {
    case 'grav': G.api.setGravity(-num(m.v, 0, 50)); break;
    case 'tod': setTimeOfDay(num(m.v, 0, 24)); G.net?.broadcast({ t: 'env', tod: env.tod, fog: env.fog }); break;
    case 'fog': setFog(num(m.v, 0, 5)); G.net?.broadcast({ t: 'env', tod: env.tod, fog: env.fog }); break;
    case 'ts': G.timeScale = num(m.v, 0.05, 3); break;
    case 'clear': E.hostCleanup(null); break;
    case 'rain': {
      if (!G.propDefs.has(m.type)) break;
      const n = Math.round(num(m.n, 1, 40));
      const at = Array.isArray(m.at) ? m.at.map(Number) : [0, 0, 0];
      for (let i = 0; i < n; i++) {
        setTimeout(() => {
          const a = Math.random() * Math.PI * 2, r = Math.random() * 7;
          E.hostSpawn(m.type, [at[0] + Math.cos(a) * r, at[1] + 10 + Math.random() * 8, at[2] + Math.sin(a) * r], null, { owner: pid });
        }, i * 90);
      }
      break;
    }
    case 'obj': {
      const ent = G.ents.get(m.id);
      if (!ent) break;
      const b0 = ent.parts[0].body;
      if (m.d === 'del') E.hostRemove(ent.id);
      else if (m.d === 'freeze') E.hostSetFrozen(ent, !ent.frozen);
      else if (m.d === 'dup') {
        const q = b0.quaternion;
        const copy = E.hostSpawn(ent.type, [b0.position.x, b0.position.y + 1.5, b0.position.z], [q.x, q.y, q.z, q.w], { owner: pid, color: ent.color });
        if (copy && ent.massMul) { copy.massMul = ent.massMul; E.applyMass(copy); }
      } else if (m.d === 'mass2' || m.d === 'mass05') {
        ent.massMul = Math.min(64, Math.max(1 / 64, (ent.massMul || 1) * (m.d === 'mass2' ? 2 : 0.5)));
        E.applyMass(ent);
      } else if (m.d === 'launch') {
        if (ent.frozen) E.hostSetFrozen(ent, false);
        for (const p of ent.parts) { p.body.velocity.y += 14; p.body.wakeUp(); }
      } else if (m.d === 'float') ent.float = !ent.float;
      break;
    }
    default: break;
  }
}

// ---------- boot ----------
function boot() {
  loadSettings();
  G.me.avatar = sanitizeAvatar(G.settings.avatar);
  initWorld($('game'));
  createApi({ systemMessage });
  registerBuiltins();
  registerCommands();
  P.initPlayer();
  P.rebuildLocalAvatar(G.me.avatar);
  on('action', devAction);
  beam.obj = P.makeBeam(0x66ccff);
  P.setToolScreen(G.toolDefs.get(toolId)?.name || toolId);
  applyPhysgun();
  applyBotSkin();
  const results = loadEnabledAddons();
  initSounds(audioContext);
  loadCustomModels();
  initControls({
    key: onKey,
    press: onPress,
    release: onRelease,
    canLock: () => G.inGame && !UI.anyScreenOpen() && !isTouch,
    controlMode: () => G.settings.controls || 'auto',
    notice: (t) => UI.toast(t),
    modeChanged: () => { refreshHud(); UI.renderSpawnMenu(); },
    unlocked: () => { if (G.inGame && !UI.anyScreenOpen() && !isTouch) pause(); },
  });
  UI.initUI({
    startSingle: () => { unlockAudio(); startSingle(true); },
    startHost: () => { unlockAudio(); startHost(); },
    join: (code) => { unlockAudio(); joinGame(code); },
    resume, pause, quit, openServer,
    spawn: spawnFromMenu,
    selectTool,
    currentTool: () => toolId,
    selectWeapon,
    undo: () => act({ a: 'undo' }),
    cleanup: (all) => act({ a: 'cmd', name: all ? 'очиститьвсе' : 'очистить' }),
    respawn: () => P.respawn(),
    runCommand: (c) => runCommand(c),
    sendChat,
    listPlayers,
    kick: (id) => G.net?.kick(id),
    applySettings: () => { applyQuality(); refreshHud(); applyPhysgun(); },
    applyPhysgun,
    applyBotSkin,
    openChar: () => openCharEditor(),
    openDev: () => openDevMenu(),
    toggleView,
  });
  initEditors({
    toast: UI.toast,
    sound: (k) => playSound(k),
    act,
    aim: () => aim(120),
    player: () => P.player,
    playerPos: () => v3(P.player.body.position),
    respawn: () => P.respawn(),
    toggleView,
    toggleNoclip: () => onPress('noclip'),
    fpsOn: () => fpsOn,
    toggleFps: () => { fpsOn = !fpsOn; $('fps').classList.toggle('hidden', !fpsOn); },
    saveAvatar,
    charClosed: () => { if (G.inGame) resume(); else UI.showMain(); },
    devClosed: () => { if (G.inGame) resume(); },
  });
  P.tintViewModel(G.me.avatar.shirt);
  const bad = results.filter(r => !r.ok);
  if (bad.length) UI.toast('Ошибка аддона: ' + bad.map(b => b.name + ' — ' + b.error).join('; '));
  window.addEventListener('pointerdown', unlockAudio, { once: true });
  frame();
  // Android back button
  window.sfBack = () => {
    if (charEditorOpen() || devMenuOpen()) { onKey('Escape'); return true; }
    if (G.inGame) { onKey('Escape'); return true; }
    const sub = !$('addonsmenu').classList.contains('hidden') || !$('settingsmenu').classList.contains('hidden');
    if (sub) { UI.backScreen(); return true; }
    return false; // main menu: let Android close the app
  };
  window.SandForge = G; // handy for debugging and advanced addons
  G.debug = { act, onPress, onRelease, selectWeapon, selectTool, spawnFromMenu, player: P.player, physicsInfo };
}

// wait for the bundled font so text drawn on textures uses it
// wait for the bundled font (text drawn on textures uses it) and the Rust physics core
const fontReady = document.fonts ? Promise.race([document.fonts.load('800 20px "Exo 2"'), new Promise(r => setTimeout(r, 1500))]) : Promise.resolve();
let physPref = 'rust';
try { physPref = (JSON.parse(localStorage.getItem('sf_settings') || '{}').physics) || 'rust'; } catch (e) { /* ignore */ }
Promise.all([fontReady.catch(() => {}), initPhysics(physPref)]).then(boot, boot);
