// Keyboard + mouse (PC, or a phone with a Bluetooth / USB-OTG keyboard and mouse) and on-screen touch controls.
const touchDevice = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
// Live binding: true while the on-screen touch controls are in use. Switches automatically when a
// mouse moves / a key is pressed (-> PC mode) or the screen is touched (-> touch mode).
export let isTouch = touchDevice;

export const input = {
  move: { x: 0, y: 0 },   // joystick (x = strafe, y = forward)
  keys: new Set(),
  look: { dx: 0, dy: 0 },
  wheel: 0,
  held: new Set(),        // 'fire' | 'alt' | 'rot' | 'jump' | 'down' | 'run' | 'far' | 'near'
  locked: false,
};

let H = null;
const $ = id => document.getElementById(id);
// Android app bridge (MainActivity): native mouse capture works even where the browser Pointer Lock API does not
const bridge = () => window.SandForgeAndroid;

// Physical key position, independent of keyboard layout (WASD works with a Russian layout too)
const KEYCODES = { 8: 'Backspace', 9: 'Tab', 13: 'Enter', 16: 'ShiftLeft', 17: 'ControlLeft', 18: 'AltLeft', 27: 'Escape', 32: 'Space',
  37: 'ArrowLeft', 38: 'ArrowUp', 39: 'ArrowRight', 40: 'ArrowDown', 112: 'F1', 113: 'F2', 114: 'F3', 115: 'F4', 116: 'F5' };
export function keyCode(e) {
  if (e.code && e.code !== 'Unidentified') return e.code;
  const k = e.keyCode || e.which;
  if (k >= 65 && k <= 90) return 'Key' + String.fromCharCode(k);
  if (k >= 48 && k <= 57) return 'Digit' + String.fromCharCode(k);
  return KEYCODES[k] || '';
}

// ----- control mode -----
let modeLocked = false; // user forced a mode in settings
export function setControlMode(mode, fromSettings = false) {
  if (fromSettings) modeLocked = mode !== 'auto';
  const touch = mode === 'auto' ? touchDevice : mode === 'touch';
  if (touch === isTouch && !fromSettings) return;
  isTouch = touch;
  const t = $('touch');
  if (t) t.classList.toggle('hidden', !isTouch);
  const hint = $('pchint');
  if (hint) hint.classList.toggle('hidden', isTouch);
  if (isTouch && input.locked) releaseMouse();
  H?.modeChanged?.(isTouch);
}
function autoMode(touch) {
  if (modeLocked || touch === isTouch) return;
  setControlMode(touch ? 'touch' : 'pc');
  if (!touch) H?.notice?.('Мышь и клавиатура подключены. Нажмите на экран мышью, чтобы управлять камерой.');
}

// ----- mouse capture -----
export function captureMouse() {
  if (isTouch) return;
  const b = bridge();
  if (b && b.canCapture && b.canCapture()) { b.capturePointer(); return; }
  $('game').requestPointerLock?.();
}
export function releaseMouse() {
  const b = bridge();
  if (b && b.canCapture && b.canCapture()) b.releasePointer();
  if (document.pointerLockElement) document.exitPointerLock?.();
}
function setLocked(v) {
  if (input.locked === v) return;
  input.locked = v;
  if (!v) {
    if (input.held.has('fire')) { input.held.delete('fire'); H.release('fire'); }
    if (input.held.has('alt')) { input.held.delete('alt'); H.release('alt'); }
    H.unlocked();
  }
}

// Called by the Android app ~60 times a second while the mouse is captured
let nativeButtons = 0;
window.sfMouse = (dx, dy, buttons, wheel) => {
  input.look.dx += dx;
  input.look.dy += dy;
  if (wheel) input.wheel += Math.sign(wheel);
  const changed = buttons ^ nativeButtons;
  nativeButtons = buttons;
  if (changed & 1) { if (buttons & 1) { input.held.add('fire'); H.press('fire'); } else if (input.held.has('fire')) { input.held.delete('fire'); H.release('fire'); } }
  if (changed & 2) { if (buttons & 2) { input.held.add('alt'); H.press('alt'); } else if (input.held.has('alt')) { input.held.delete('alt'); H.release('alt'); } }
};
window.sfPointerCapture = (on) => { nativeButtons = 0; setLocked(!!on); };

export function initControls(handlers) {
  H = handlers;
  // ----- keyboard -----
  window.addEventListener('keydown', (e) => {
    const code = keyCode(e);
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) {
      if (code === 'Escape') H.key('Escape', e);
      return;
    }
    if (!code) return;
    if (touchDevice && !e.repeat && code !== 'Escape') autoMode(false);
    if (!e.repeat) H.key(code, e);
    input.keys.add(code);
    if (code === 'KeyE') input.held.add('rot');
    if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backspace'].includes(code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => {
    const code = keyCode(e);
    input.keys.delete(code);
    if (code === 'KeyE') input.held.delete('rot');
  });
  window.addEventListener('blur', () => { input.keys.clear(); input.held.clear(); });

  // ----- mouse -----
  const canvasArea = $('game');
  canvasArea.addEventListener('click', () => { if (H.canLock()) captureMouse(); });
  // switch modes by the kind of pointer that is used
  window.addEventListener('pointerdown', (e) => { if (touchDevice) autoMode(e.pointerType === 'touch'); }, true);
  window.addEventListener('pointermove', (e) => { if (touchDevice && e.pointerType === 'mouse' && (e.movementX || e.movementY)) autoMode(false); }, true);
  document.addEventListener('pointerlockchange', () => setLocked(document.pointerLockElement === canvasArea));
  document.addEventListener('mousemove', (e) => {
    if (!input.locked || !document.pointerLockElement) return;
    input.look.dx += e.movementX;
    input.look.dy += e.movementY;
  });
  document.addEventListener('mousedown', (e) => {
    if (!input.locked || !document.pointerLockElement) return;
    if (e.button === 0) { input.held.add('fire'); H.press('fire'); }
    if (e.button === 2) { input.held.add('alt'); H.press('alt'); }
  });
  document.addEventListener('mouseup', (e) => {
    if (!document.pointerLockElement) return;
    if (e.button === 0 && input.held.has('fire')) { input.held.delete('fire'); H.release('fire'); }
    if (e.button === 2 && input.held.has('alt')) { input.held.delete('alt'); H.release('alt'); }
  });
  document.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('wheel', (e) => { if (input.locked) input.wheel += Math.sign(e.deltaY); }, { passive: true });

  if (touchDevice) initTouch();
  const pref = handlers.controlMode ? handlers.controlMode() : 'auto';
  setControlMode(pref || 'auto', true);
}

function initTouch() {
  // joystick
  const zone = $('joyzone'), joy = $('joy'), knob = $('joyknob');
  let joyId = null, cx = 0, cy = 0;
  const R = 55;
  zone.addEventListener('pointerdown', (e) => {
    if (joyId !== null) return;
    joyId = e.pointerId;
    zone.setPointerCapture(e.pointerId);
    const zr = zone.getBoundingClientRect();
    joy.style.left = (e.clientX - zr.left - 70) + 'px';
    joy.style.bottom = (zr.bottom - e.clientY - 70) + 'px';
    cx = e.clientX; cy = e.clientY;
    moveKnob(e);
  });
  const moveKnob = (e) => {
    let dx = e.clientX - cx, dy = e.clientY - cy;
    const l = Math.hypot(dx, dy);
    if (l > R) { dx *= R / l; dy *= R / l; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    input.move.x = dx / R;
    input.move.y = -dy / R;
  };
  zone.addEventListener('pointermove', (e) => { if (e.pointerId === joyId) moveKnob(e); });
  const endJoy = (e) => {
    if (e.pointerId !== joyId) return;
    joyId = null;
    input.move.x = input.move.y = 0;
    knob.style.transform = '';
    joy.style.left = ''; joy.style.bottom = '';
  };
  zone.addEventListener('pointerup', endJoy);
  zone.addEventListener('pointercancel', endJoy);

  // look zone (multi-touch aware)
  const look = $('lookzone');
  const last = new Map();
  look.addEventListener('pointerdown', (e) => { look.setPointerCapture(e.pointerId); last.set(e.pointerId, [e.clientX, e.clientY]); });
  look.addEventListener('pointermove', (e) => {
    const l = last.get(e.pointerId);
    if (!l) return;
    input.look.dx += (e.clientX - l[0]) * 1.6;
    input.look.dy += (e.clientY - l[1]) * 1.6;
    last.set(e.pointerId, [e.clientX, e.clientY]);
  });
  const endLook = e => last.delete(e.pointerId);
  look.addEventListener('pointerup', endLook);
  look.addEventListener('pointercancel', endLook);

  // buttons
  const hold = { 'b-fire': 'fire', 'b-alt': 'alt', 'b-jump': 'jump', 'b-down': 'down', 'b-rot': 'rot', 'b-far': 'far', 'b-near': 'near' };
  for (const [id, name] of Object.entries(hold)) {
    const el = $(id);
    // while a button is held, sliding the same finger turns the camera (aim while shooting/carrying)
    let last = null;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      last = [e.clientX, e.clientY];
      input.held.add(name); el.classList.add('on'); H.press(name);
    });
    el.addEventListener('pointermove', (e) => {
      if (!last) return;
      input.look.dx += (e.clientX - last[0]) * 1.6;
      input.look.dy += (e.clientY - last[1]) * 1.6;
      last = [e.clientX, e.clientY];
    });
    const up = () => { last = null; if (input.held.has(name)) { input.held.delete(name); el.classList.remove('on'); H.release(name); } };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }
  const tap = { 'b-noclip': 'noclip', 'b-undo': 'undo', 'b-run': 'run' };
  for (const [id, name] of Object.entries(tap)) {
    $(id).addEventListener('pointerdown', (e) => { e.preventDefault(); H.press(name); });
  }
}

// Called once per frame: consume accumulated look delta
export function takeLook() {
  const d = { dx: input.look.dx, dy: input.look.dy };
  input.look.dx = input.look.dy = 0;
  return d;
}
export function takeWheel() {
  const w = input.wheel;
  input.wheel = 0;
  return w;
}
