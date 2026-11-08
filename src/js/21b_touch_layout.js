/* ================= раскладка сенсорных кнопок ================= */
// Редактор: кнопки можно перетаскивать, менять размер и прозрачность (у каждой своя), сбросить к стандартной.
// Положение хранится в долях экрана — подходит для широких и складных экранов. Сохраняется в настройках.
function tbIds() { return ['tFire', 'tJump', 'tCrouch', 'tProne', 'tReload', 'tSwap', 'tDash', 'tNade', 'tNadeSel', 'tScope', 'tClimb', 'tBuy', 'tMap', 'tChat', 'tBoard', 'tPause']; }
var tlSel = null, tlDrag = null;
function applyTouchLayout() {
  const L = SET.touchLayout || {};
  for (const id of tbIds()) {
    const el = $(id); if (!el) continue; const c = L[id];
    if (c) { el.style.left = (c.x * 100) + 'vw'; el.style.top = (c.y * 100) + 'vh'; el.style.right = 'auto'; el.style.bottom = 'auto'; el.style.setProperty('--bs', c.s || 1); }
    else { el.style.left = el.style.top = el.style.right = el.style.bottom = ''; el.style.removeProperty('--bs'); }
    el.style.opacity = c && c.o != null ? c.o : (SET.touchOpacity ?? 1);
  }
}
function openTouchEditor() {
  $('settings').classList.add('hidden'); $('tledit').classList.remove('hidden');
  document.body.classList.add('tl-editing'); $('touch').classList.add('on', 'edit');
  for (const id of tbIds()) { const el = $(id); if (el) el.classList.remove('hidden'); }
  tlSel = null; renderTlPanel();
}
function closeTouchEditor() {
  $('tledit').classList.add('hidden'); document.body.classList.remove('tl-editing'); $('touch').classList.remove('edit');
  if (!G.started) $('touch').classList.remove('on');
  saveSettings(); applySettings(); $('settings').classList.remove('hidden');
}
function renderTlPanel() {
  const c = tlSel && (SET.touchLayout || {})[tlSel];
  $('tlsel').textContent = tlSel ? ($(tlSel).textContent.trim() || tlSel) : t('tlPick');
  $('tlsize').disabled = $('tlop').disabled = !tlSel;
  $('tlsize').value = c ? c.s || 1 : 1; $('tlop').value = c && c.o != null ? c.o : (SET.touchOpacity ?? 1);
}
function ensureLayout(id) {
  SET.touchLayout = SET.touchLayout || {};
  if (!SET.touchLayout[id]) { const r = $(id).getBoundingClientRect(); SET.touchLayout[id] = { x: r.left / innerWidth, y: r.top / innerHeight, s: 1 }; }
  return SET.touchLayout[id];
}
document.addEventListener('pointerdown', e => {
  if (!document.body.classList.contains('tl-editing')) return;
  const el = e.target.closest && e.target.closest('#touch .tb'); if (!el) return;
  e.preventDefault(); e.stopPropagation();
  tlSel = el.id; const c = ensureLayout(el.id); tlDrag = { id: el.id, sx: e.clientX, sy: e.clientY, x: c.x, y: c.y };
  for (const id of tbIds()) $(id) && $(id).classList.toggle('tlsel', id === tlSel);
  applyTouchLayout(); renderTlPanel();
}, true);
document.addEventListener('pointermove', e => {
  if (!tlDrag) return;
  const c = SET.touchLayout[tlDrag.id], el = $(tlDrag.id), r = el.getBoundingClientRect();
  c.x = clamp(tlDrag.x + (e.clientX - tlDrag.sx) / innerWidth, 0, 1 - r.width / innerWidth);
  c.y = clamp(tlDrag.y + (e.clientY - tlDrag.sy) / innerHeight, 0, 1 - r.height / innerHeight);
  applyTouchLayout();
}, true);
document.addEventListener('pointerup', () => { tlDrag = null; }, true);
$('tlsize').oninput = () => { if (!tlSel) return; ensureLayout(tlSel).s = +$('tlsize').value; applyTouchLayout(); };
$('tlop').oninput = () => { if (!tlSel) return; ensureLayout(tlSel).o = +$('tlop').value; applyTouchLayout(); };
$('tlreset').onclick = () => { SET.touchLayout = {}; tlSel = null; applyTouchLayout(); renderTlPanel(); };
$('tldone').onclick = () => closeTouchEditor();
addEventListener('resize', applyTouchLayout);
applyTouchLayout();
