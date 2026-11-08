// Addon system: a small JS API that addons use to add props, tools, commands and hooks.
import * as THREE from 'three';
import { CANNON } from './phys.js';
import { G, on } from './state.js';
import {
  registerProp, registerTool, hostSpawn, hostRemove, hostFx, explode, hostConstraint, hostSetColor, hostSetFrozen,
} from './entities.js';

import furniture from '../addons/furniture_plus.js';
import moon from '../addons/moon_gravity.js';
import bouncy from '../addons/bouncy_balls.js';
import magnet from '../addons/gravity_magnet.js';
import fireworks from '../addons/fireworks.js';
import cannonAddon from '../addons/prop_cannon.js';

export const WORKSHOP = [
  { id: 'furniture_plus', name: 'Мебель+', author: 'SandForge', desc: 'Диван, шкаф, лампа и кровать.', code: furniture },
  { id: 'moon_gravity', name: 'Лунная гравитация', author: 'SandForge', desc: 'Команды !луна и !земля, кнопки в «Утилитах».', code: moon },
  { id: 'bouncy_balls', name: 'Прыгучие мячи', author: 'SandForge', desc: 'Супермячи разных размеров.', code: bouncy },
  { id: 'gravity_magnet', name: 'Гравимагнит', author: 'SandForge', desc: 'Режим тулгана, притягивающий всё вокруг точки.', code: magnet },
  { id: 'fireworks', name: 'Фейерверки', author: 'SandForge', desc: 'Ракета-фейерверк, взлетает и взрывается.', code: fireworks },
  { id: 'prop_cannon', name: 'Пушка предметов', author: 'SandForge', desc: 'Тулган стреляет случайными предметами.', code: cannonAddon },
];

export const utilities = []; // {name, cmd} - buttons in spawn menu
export const loadedAddons = []; // {name, source:'local'|'server', code}

// ---------- API object ----------
export function createApi(ui) {
  const api = {
    THREE, CANNON,
    get time() { return G.time; },
    get isHost() { return G.isHost; },
    registerProp, registerTool,
    registerCommand(name, fn) { G.commands.set(name, fn); },
    registerUtility(name, cmd) { if (!utilities.find(u => u.name === name)) utilities.push({ name, cmd }); },
    on,
    spawn(type, pos, quat, opts = {}) { return G.isHost ? hostSpawn(type, pos, quat, opts) : null; },
    remove(id) { if (G.isHost) hostRemove(id); },
    fx(kind, pos, extra) { if (G.isHost) hostFx(kind, pos, extra || {}); },
    explode(pos, opts) { if (G.isHost) explode(null, pos, opts); },
    weld(a, b) { if (G.isHost) return hostConstraint({ kind: 'weld', a: a.id, pa: 0, b: b.id, pb: 0 }, null); return null; },
    setColor(ent, color) { if (G.isHost) hostSetColor(ent, color); },
    setFrozen(ent, v) { if (G.isHost) hostSetFrozen(ent, v); },
    pos(ent) { const p = ent.parts[0].body.position; return [p.x, p.y, p.z]; },
    quat(ent) { const q = ent.parts[0].body.quaternion; return [q.x, q.y, q.z, q.w]; },
    ents() { return [...G.ents.values()]; },
    players() { return G.listPlayers ? G.listPlayers() : []; },
    setGravity(y) {
      G.world.gravity.set(0, y, 0);
      for (const ent of G.ents.values()) for (const p of ent.parts) p.body.wakeUp();
      if (G.isHost) G.net?.broadcast({ t: 'grav', y });
    },
    tell(pid, text) { ui.systemMessage(text, pid); },
    chat(text) { ui.systemMessage(text, null); },
  };
  G.api = api;
  return api;
}

// ---------- Running addon code ----------
export function runAddon(code, source, nameHint) {
  let meta = null;
  const addon = (m) => { meta = m; };
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function('addon', 'api', 'THREE', 'CANNON', code);
    fn(addon, G.api, THREE, CANNON);
    if (!meta || typeof meta.init !== 'function') throw new Error('Аддон должен вызвать addon({ name, init(api) { ... } })');
    meta.init(G.api);
    loadedAddons.push({ name: meta.name || nameHint || 'Без названия', source, code, version: meta.version, author: meta.author });
    return { ok: true, meta };
  } catch (e) {
    console.error('Addon error', e);
    return { ok: false, error: String(e.message || e) };
  }
}

// ---------- Local storage of installed addons ----------
export function getInstalled() {
  try { return JSON.parse(localStorage.getItem('sf_addons') || '[]'); } catch (e) { return []; }
}
function saveInstalled(list) {
  try { localStorage.setItem('sf_addons', JSON.stringify(list)); return true; } catch (e) { return false; }
}

// Validate code by parsing it and reading its metadata without running init
export function inspectAddon(code) {
  let meta = null;
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function('addon', 'api', 'THREE', 'CANNON', code);
    const fakeApi = new Proxy({}, { get: () => () => undefined });
    fn((m) => { meta = m; }, fakeApi, THREE, CANNON);
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
  if (!meta || typeof meta.init !== 'function') return { ok: false, error: 'Не найден вызов addon({ name, init(api) {...} })' };
  return { ok: true, meta };
}

export function installAddon(code, id) {
  const info = inspectAddon(code);
  if (!info.ok) return info;
  const list = getInstalled();
  const aid = id || ('user_' + (info.meta.name || 'addon').replace(/[^\wа-яё]+/gi, '_').toLowerCase());
  const existing = list.find(a => a.id === aid);
  const rec = { id: aid, name: info.meta.name || aid, author: info.meta.author || '', version: info.meta.version || '', desc: info.meta.description || '', code, enabled: true };
  if (existing) Object.assign(existing, rec); else list.push(rec);
  if (!saveInstalled(list)) return { ok: false, error: 'Не удалось сохранить (память переполнена?)' };
  return { ok: true, meta: info.meta, id: aid };
}

export function setAddonEnabled(id, enabled) {
  const list = getInstalled();
  const a = list.find(x => x.id === id);
  if (a) { a.enabled = enabled; saveInstalled(list); }
}

export function uninstallAddon(id) {
  saveInstalled(getInstalled().filter(a => a.id !== id));
}

export function loadEnabledAddons() {
  const results = [];
  for (const a of getInstalled()) {
    if (!a.enabled) continue;
    const r = runAddon(a.code, 'local', a.name);
    results.push({ name: a.name, ...r });
  }
  return results;
}

// For multiplayer: the host shares its addons with joining players
export function addonsForClients() {
  return loadedAddons.map(a => ({ name: a.name, code: a.code }));
}
