// Shared game state.
export const G = {
  scene: null, camera: null, renderer: null, world: null,
  ents: new Map(),        // id -> entity
  cons: new Map(),        // id -> constraint record
  players: new Map(),     // peerId -> remote player
  propDefs: new Map(),    // type -> definition
  toolDefs: new Map(),    // toolgun modes
  commands: new Map(),
  hooks: {},
  isHost: true,
  inGame: false,
  net: null,
  me: { id: 'local', name: 'Игрок', color: '#3fa7ff' },
  settings: {},
  nextId: 1,
  time: 0,
};

export function on(name, fn) { (G.hooks[name] ||= []).push(fn); }
export function emit(name, ...args) {
  const list = G.hooks[name];
  if (!list) return;
  for (const fn of list) {
    try { fn(...args); } catch (e) { console.error('hook', name, e); }
  }
}

const DEFAULT_SETTINGS = {
  name: 'Игрок' + Math.floor(Math.random() * 900 + 100),
  color: '#3fa7ff',
  quality: 'high',
  sens: 1,
  serverAddons: true,
  physgunGlow: '#40c8ff',
};

export function loadSettings() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem('sf_settings') || '{}'); } catch (e) { /* ignore */ }
  G.settings = { ...DEFAULT_SETTINGS, ...s };
  G.me.name = G.settings.name;
  G.me.color = G.settings.color;
}
export function saveSettings() {
  try { localStorage.setItem('sf_settings', JSON.stringify(G.settings)); } catch (e) { /* ignore */ }
  G.me.name = G.settings.name;
  G.me.color = G.settings.color;
}

// Collision groups
export const GROUP = { PROP: 1, PLAYER: 2, MAP: 4, DEBRIS: 8 };
