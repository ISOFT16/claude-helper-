/* ================= settings ================= */
// Все настройки хранятся в localStorage и применяются на лету (кроме сглаживания).
const DEF_BINDS = {
  fwd: ['KeyW', 'ArrowUp'], back: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
  jump: ['Space', ''], crouch: ['ControlLeft', 'KeyC'], walk: ['ShiftLeft', ''], reload: ['KeyR', ''],
  prim: ['Digit1', ''], sec: ['Digit2', ''], knife: ['Digit3', ''], nade: ['Digit4', ''], last: ['KeyQ', ''],
  dash: ['KeyE', ''], throw: ['KeyG', ''], inspect: ['KeyF', ''], buy: ['KeyB', ''], scores: ['Tab', ''],
  chat: ['KeyY', 'KeyT'], start: ['Enter', ''], team: ['KeyM', ''],
};
const BIND_ORDER = ['fwd', 'back', 'left', 'right', 'jump', 'crouch', 'walk', 'reload', 'prim', 'sec', 'knife', 'nade', 'throw', 'last', 'dash', 'inspect', 'buy', 'scores', 'chat', 'start', 'team'];
const PRESETS = {
  low: { renderScale: 0.75, shadows: 0, charShadows: false, reflections: false, drawDist: 0, effects: 0 },
  medium: { renderScale: 1, shadows: 1, charShadows: false, reflections: true, drawDist: 1, effects: 1 },
  high: { renderScale: 1, shadows: 2, charShadows: true, reflections: true, drawDist: 1, effects: 1 },
  ultra: { renderScale: 1.5, shadows: 4, charShadows: true, reflections: true, drawDist: 2, effects: 1 },
};
const DEF_SET = {
  lang: LANG, preset: TOUCH ? 'medium' : 'high', ...PRESETS[TOUCH ? 'medium' : 'high'], antialias: !TOUCH, fpsLimit: 0, showFps: false, brightness: 1.1, fov: 80,
  vmSide: 'right', bob: true, master: 0.8, sfxVol: 1, announcer: true,
  sens: 1, scopeSens: 0.45, invertY: false, toggleCrouch: false, keyLayout: 'en', touchSize: 1, touchSens: 1, aimAssist: true,
  xStyle: 'cross', xColor: '#7dffb0', xSize: 8, xThick: 2, xGap: 4, xCenter: false, xDynamic: true, xOutline: true,
  radar: true, killfeed: true, hitmarkers: true, dmgNumbers: true, hudScale: 1,
  diff: 1, hp: 210, rounds: 8, mpHp: 210, mpRounds: 8, mpAuto: 4, name: '', srvName: '', mpPublic: true,
  binds: DEF_BINDS,
};
const SET = (() => {
  let s = {};
  try { s = JSON.parse(localStorage.getItem('perehvat-settings') || '{}') || {}; } catch (e) {}
  try { const old = localStorage.getItem('perehvat-sens'); if (old && s.sens == null) s.sens = +old; } catch (e) {}
  const out = { ...DEF_SET, ...s };
  out.binds = { ...DEF_BINDS, ...(s.binds || {}) };
  if (!STR[out.lang]) out.lang = LANG;
  return out;
})();
LANG = SET.lang;
function saveSettings() { try { localStorage.setItem('perehvat-settings', JSON.stringify(SET)); } catch (e) {} }
// действие по коду клавиши
function actionOf(code) { for (const a in SET.binds) if (SET.binds[a][0] === code || SET.binds[a][1] === code) return a; return null; }
function bindDown(a) { const b = SET.binds[a]; return !!(b && (keys[b[0]] || (b[1] && keys[b[1]]))); }
const keyOf = a => keyLabel(SET.binds[a] && SET.binds[a][0]);
