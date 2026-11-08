/* ================= карта мира ================= */
// Полноэкранная карта: масштаб (колёсико, щипок, кнопки), сдвиг перетаскиванием, свои метки.
// Статичные объекты описаны в WORLD_MARKERS — новые точки интереса и локации добавляются данными.
// Противники видны по тем же правилам, что и на радаре (настройка «Все игроки на радаре» или замечены союзниками).
const WORLD_MARKERS = [];
onWorld(() => {
  WORLD_MARKERS.length = 0;
  WORLD_MARKERS.push({ kind: 'zone', x: zone.cx, z: zone.cz, label: 'mkZone', color: '#c7a6ff' });
  for (const tm of [0, 1]) { const c = WORLD.spawns[tm]; if (!c.length) continue; WORLD_MARKERS.push({ kind: 'spawn', team: tm, x: c.reduce((s, v) => s + v[0], 0) / c.length, z: c.reduce((s, v) => s + v[1], 0) / c.length, label: 'mkSpawn' + tm, color: tm ? '#ff8a3d' : '#4fb3ff' }); }
  for (const m of WORLD.markers) if (m.kind === 'bld') WORLD_MARKERS.push({ kind: 'bld', x: m.x, z: m.z, label: '', floors: m.floors, color: '#dfe6f5' });
});
const WM = { open: false, zoom: 0, cx: WORLD.W / 2, cz: WORLD.D / 2, pins: [], ptrs: new Map(), moved: 0, pinch: 0 };
const wmCanvas = $('wmapc'), wmCtx = wmCanvas.getContext('2d');
// фон карты рисуется при загрузке локации (8 пикселей на метр)
const WM_PX = 8, wmBg = document.createElement('canvas');
onWorld(() => { wmBg.width = WORLD.W * WM_PX; wmBg.height = WORLD.D * WM_PX; drawTopDown(wmBg.getContext('2d'), WM_PX, { edges: true }); WM.zoom = 0; });
function wmFit() { const r = wmCanvas.getBoundingClientRect(); return Math.min(r.width / (WORLD.W), r.height / (WORLD.D)) * 0.92; }
function toggleWorldMap(force) {
  const open = force ?? !WM.open;
  if (open === WM.open || (open && !G.started)) return;
  WM.open = open; G.mapOpen = open; $('wmap').classList.toggle('hidden', !open);
  if (open) {
    resizeWorldMap(); if (!WM.zoom) WM.zoom = wmFit();
    // при общем масштабе видна вся локация, при крупном — центр на игроке
    if (WM.zoom <= wmFit() * 1.05) { WM.cx = WORLD.W / 2; WM.cz = WORLD.D / 2; } else { WM.cx = P.pos.x; WM.cz = P.pos.z; }
    if (!TOUCH && document.pointerLockElement) document.exitPointerLock();
    mouseDown = false;
  } else if (!TOUCH && G.started && !G.paused) lock();
}
function resizeWorldMap() {
  const r = wmCanvas.getBoundingClientRect(), d = Math.min(devicePixelRatio, 2);
  wmCanvas.width = Math.round(r.width * d); wmCanvas.height = Math.round(r.height * d);
}
addEventListener('resize', () => { if (WM.open) resizeWorldMap(); });
const wmToScreen = (x, z) => { const r = wmCanvas.width / wmCanvas.getBoundingClientRect().width; return [((x - WM.cx) * WM.zoom) * r + wmCanvas.width / 2, ((z - WM.cz) * WM.zoom) * r + wmCanvas.height / 2]; };
const wmToWorld = (px, py) => { const b = wmCanvas.getBoundingClientRect(); return [(px - b.left - b.width / 2) / WM.zoom + WM.cx, (py - b.top - b.height / 2) / WM.zoom + WM.cz]; };
function wmZoomAt(f, px, py) {
  const [wx, wz] = px == null ? [WM.cx, WM.cz] : wmToWorld(px, py);
  const nz = clamp(WM.zoom * f, wmFit() * 0.6, wmFit() * 8);
  // точка под курсором остаётся на месте
  WM.cx = wx - (wx - WM.cx) * WM.zoom / nz; WM.cz = wz - (wz - WM.cz) * WM.zoom / nz; WM.zoom = nz;
}
// кто из бойцов виден на карте: союзники всегда, враги — как на радаре
const mapVisible = a => a.alive && active(a) && (a.team === P.team || SET.radarAll || a.spot[P.team] > 0);
function drawWorldMap() {
  if (!WM.open) return;
  const g = wmCtx, W = wmCanvas.width, H = wmCanvas.height, k = wmCanvas.width / wmCanvas.getBoundingClientRect().width, z = WM.zoom * k;
  g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#0d1018'; g.fillRect(0, 0, W, H);
  const [ox, oy] = wmToScreen(0, 0);
  g.imageSmoothingEnabled = true; g.drawImage(wmBg, ox, oy, WORLD.W * z, WORLD.D * z);
  g.strokeStyle = '#8a96b0'; g.lineWidth = 2 * k; g.strokeRect(ox, oy, WORLD.W * z, WORLD.D * z); // граница локации
  const label = (txt, x, y, col) => { g.font = `600 ${12 * k}px system-ui,sans-serif`; g.textAlign = 'center'; g.fillStyle = 'rgba(0,0,0,.6)'; g.fillText(txt, x + k, y + k); g.fillStyle = col; g.fillText(txt, x, y); };
  for (const m of WORLD_MARKERS) {
    const [x, y] = wmToScreen(m.x, m.z);
    g.fillStyle = m.color; g.beginPath();
    if (m.kind === 'zone') { g.arc(x, y, 7 * k, 0, 7); g.fill(); g.strokeStyle = m.color; g.lineWidth = 2 * k; g.beginPath(); g.arc(x, y, (11 + Math.sin(now * 3) * 2) * k, 0, 7); g.stroke(); }
    else if (m.kind === 'spawn') { g.rect(x - 6 * k, y - 6 * k, 12 * k, 12 * k); g.fill(); }
    else if (m.kind === 'bld') { /* подпись этажности */ }
    else { g.arc(x, y, 4 * k, 0, 7); g.fill(); }
    if (m.kind === 'bld') { label(m.floors + (LANG === 'ru' || LANG === 'uk' ? ' эт.' : ' fl.'), x, y + 4 * k, 'rgba(240,244,255,.8)'); continue; }
    label(t(m.label), x, y - 13 * k, m.color);
  }
  for (const a of agents) {
    if (a === P || !mapVisible(a)) continue;
    const [x, y] = wmToScreen(a.pos.x, a.pos.z);
    g.fillStyle = a.team ? '#ff8a3d' : '#4fb3ff'; g.strokeStyle = '#000'; g.lineWidth = 1.5 * k;
    g.beginPath(); g.arc(x, y, 5 * k, 0, 7); g.fill(); g.stroke();
    if (WM.zoom > wmFit() * 1.8) label(a.name, x, y - 9 * k, '#dfe6f5');
  }
  WM.pins.forEach((p, i) => { const [x, y] = wmToScreen(p.x, p.z); g.fillStyle = '#ffd85a'; g.beginPath(); g.moveTo(x, y); g.arc(x, y - 14 * k, 6 * k, Math.PI * 0.8, Math.PI * 2.2); g.closePath(); g.fill(); label(t('mkPin') + ' ' + (i + 1), x, y - 24 * k, '#ffd85a'); });
  if (P.alive) {
    // игрок: стрелка и конус взгляда
    const [x, y] = wmToScreen(P.pos.x, P.pos.z), ang = Math.atan2(-Math.cos(P.yaw), -Math.sin(P.yaw)), fov = THREE.MathUtils.degToRad(camera.fov) * camera.aspect * 0.5;
    const gr = g.createRadialGradient(x, y, 0, x, y, 70 * k); gr.addColorStop(0, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.moveTo(x, y); g.arc(x, y, 70 * k, ang - fov, ang + fov); g.closePath(); g.fill();
    g.save(); g.translate(x, y); g.rotate(ang + Math.PI / 2); g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 1.5 * k;
    g.beginPath(); g.moveTo(0, -10 * k); g.lineTo(7 * k, 8 * k); g.lineTo(0, 4 * k); g.lineTo(-7 * k, 8 * k); g.closePath(); g.fill(); g.stroke(); g.restore();
    label(t('mkYou'), x, y + 22 * k, '#fff');
  }
}
// ввод: перетаскивание, щипок, колёсико, щелчок — метка
wmCanvas.addEventListener('pointerdown', e => { wmCanvas.setPointerCapture(e.pointerId); WM.ptrs.set(e.pointerId, [e.clientX, e.clientY]); WM.moved = 0; if (WM.ptrs.size === 2) { const [a, b] = [...WM.ptrs.values()]; WM.pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); } });
wmCanvas.addEventListener('pointermove', e => {
  const p = WM.ptrs.get(e.pointerId); if (!p) return;
  if (WM.ptrs.size === 1) { WM.cx -= (e.clientX - p[0]) / WM.zoom; WM.cz -= (e.clientY - p[1]) / WM.zoom; WM.moved += Math.abs(e.clientX - p[0]) + Math.abs(e.clientY - p[1]); }
  WM.ptrs.set(e.pointerId, [e.clientX, e.clientY]);
  if (WM.ptrs.size === 2) {
    const [a, b] = [...WM.ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
    if (WM.pinch > 0) wmZoomAt(d / WM.pinch, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    WM.pinch = d; WM.moved = 99;
  }
});
const wmUp = e => {
  if (!WM.ptrs.has(e.pointerId)) return;
  const single = WM.ptrs.size === 1; WM.ptrs.delete(e.pointerId);
  if (single && WM.moved < 6 && e.type === 'pointerup') {
    const [x, z] = wmToWorld(e.clientX, e.clientY);
    if (x < 0 || z < 0 || x > WORLD.W || z > WORLD.D) return;
    const near = WM.pins.findIndex(p => Math.hypot(p.x - x, p.z - z) * WM.zoom < 16);
    if (near >= 0) WM.pins.splice(near, 1); else { WM.pins.push({ x, z }); if (WM.pins.length > 6) WM.pins.shift(); }
    uiSound('blip1');
  }
  if (WM.ptrs.size < 2) WM.pinch = 0;
};
wmCanvas.addEventListener('pointerup', wmUp); wmCanvas.addEventListener('pointercancel', wmUp);
wmCanvas.addEventListener('wheel', e => { e.preventDefault(); wmZoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY); }, { passive: false });
$('wmzin').onclick = () => wmZoomAt(1.4); $('wmzout').onclick = () => wmZoomAt(1 / 1.4);
$('wmcenter').onclick = () => { WM.cx = P.pos.x; WM.cz = P.pos.z; };
$('wmclose').onclick = () => toggleWorldMap(false);
for (const id of ['wmap', 'wmapc']) $(id).addEventListener('touchstart', e => e.stopPropagation(), { passive: true });
