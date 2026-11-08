// Keyboard + mouse (PC) and on-screen touch controls (phones/tablets).
export const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

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

export function initControls(handlers) {
  H = handlers;
  // ----- keyboard -----
  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
      if (e.code === 'Escape') H.key('Escape', e);
      return;
    }
    if (!e.repeat) H.key(e.code, e);
    input.keys.add(e.code);
    if (e.code === 'KeyE') input.held.add('rot');
    if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => {
    input.keys.delete(e.code);
    if (e.code === 'KeyE') input.held.delete('rot');
  });
  window.addEventListener('blur', () => { input.keys.clear(); input.held.clear(); });

  // ----- mouse -----
  const canvasArea = $('game');
  canvasArea.addEventListener('click', () => { if (H.canLock()) canvasArea.requestPointerLock?.(); });
  document.addEventListener('pointerlockchange', () => {
    input.locked = document.pointerLockElement === canvasArea;
    if (!input.locked) { input.held.delete('fire'); input.held.delete('alt'); H.unlocked(); }
  });
  document.addEventListener('mousemove', (e) => {
    if (!input.locked) return;
    input.look.dx += e.movementX;
    input.look.dy += e.movementY;
  });
  document.addEventListener('mousedown', (e) => {
    if (!input.locked) return;
    if (e.button === 0) { input.held.add('fire'); H.press('fire'); }
    if (e.button === 2) { input.held.add('alt'); H.press('alt'); }
  });
  document.addEventListener('mouseup', (e) => {
    if (e.button === 0 && input.held.has('fire')) { input.held.delete('fire'); H.release('fire'); }
    if (e.button === 2 && input.held.has('alt')) { input.held.delete('alt'); H.release('alt'); }
  });
  document.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('wheel', (e) => { if (input.locked) input.wheel += Math.sign(e.deltaY); }, { passive: true });

  if (isTouch) initTouch();
}

function initTouch() {
  $('touch').classList.remove('hidden');
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
