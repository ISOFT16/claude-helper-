/* ================= menu ================= */
// перевод интерфейса
function applyLang() {
  document.documentElement.lang = LANG;
  document.title = t('title') + ' — 3D';
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-html]').forEach(el => { el.innerHTML = t(el.dataset.i18nHtml); });
  document.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
  buildOptions(); renderHelp();
  if (!$('settings').classList.contains('hidden')) renderSettings();
  if (G.buyOpen) renderBuy();
  if (NET.mode === 'off') agents.forEach((a, i) => { a.name = defaultName(a, i); });
  updateRoomBadge();
}
/* --- экраны главного меню --- */
let menuScreen = 'sp';
function showMenu(scr) {
  $('menu').classList.remove('hidden');
  if (scr === 'main') { $('menu').classList.remove('sub-open'); scr = menuScreen; } else $('menu').classList.add('sub-open');
  menuScreen = scr;
  document.querySelectorAll('.panel').forEach(p => p.classList.toggle('on', p.id === 'scr-' + scr));
  document.querySelectorAll('.nb[data-screen]').forEach(b => b.classList.toggle('sel', b.dataset.screen === scr));
}
document.querySelectorAll('.nb').forEach(b => b.onclick = () => { if (b.dataset.open === 'settings') openSettings(); else showMenu(b.dataset.screen); });
// звуки интерфейса: крупные кнопки — button3, вкладки/переключатели/варианты — blip1
const BIG_BTN = '.nb, .go, .pbtns button, #setclose, #buyclose, #overmenu, .backbtn';
document.addEventListener('click', e => {
  const el = e.target.closest('button, select'); if (!el || el.closest('#touch') || el.closest('#buylist')) return;
  uiSound(el.matches(BIG_BTN) ? 'button3' : 'blip1', el.matches(BIG_BTN) ? 0.7 : 0.5);
}, true);
document.addEventListener('pointerdown', () => initAudio(), { capture: true, once: true });
document.addEventListener('change', e => { if (e.target.matches('input[type=range]')) uiSound('blip1', 0.35); }, true);
document.addEventListener('mouseover', e => {
  const el = e.target.closest('.nb'); if (!el || (e.relatedTarget && el.contains(e.relatedTarget))) return;
  if (AC) uiSound('blip1', 0.25);
});
document.querySelectorAll('.backbtn').forEach(b => b.onclick = () => $('menu').classList.remove('sub-open'));
function segBtns(id, values, key, fmt) {
  const el = $(id); el.innerHTML = '';
  for (const v of values) {
    const b = document.createElement('button'); b.textContent = fmt(v); b.classList.toggle('sel', SET[key] === v);
    b.onclick = () => { SET[key] = v; saveSettings(); segBtns(id, values, key, fmt); };
    el.appendChild(b);
  }
}
function buildOptions() {
  segBtns('optDiff', [0, 1, 2], 'diff', v => t('d' + v));
  segBtns('optHp', [100, 150, 210, 250], 'hp', v => v + ' HP');
  segBtns('optRounds', [5, 8, 12, 16], 'rounds', v => String(v));
  segBtns('optMpHp', [100, 150, 210, 250], 'mpHp', v => v + ' HP');
  segBtns('optMpRounds', [5, 8, 12, 16], 'mpRounds', v => String(v));
  const sel = $('optMpAuto'); sel.innerHTML = [2, 4, 6, 8, 10, 0].map(v => `<option value="${v}" ${SET.mpAuto === v ? 'selected' : ''}>${v ? esc(t('playersN', v)) : esc(t('manual'))}</option>`).join('');
  sel.onchange = () => { SET.mpAuto = +sel.value; saveSettings(); };
  $('mpname').value = SET.name || '';
}
function renderHelp() {
  $('helpkeys').innerHTML = BIND_ORDER.map(a => `<b>${esc(keyOf(a))}${SET.binds[a][1] ? ' / ' + esc(keyLabel(SET.binds[a][1])) : ''}</b><span>${esc(t('a_' + a))}</span>`).join('');
}
$('play').onclick = () => {
  netReset(); setStatus('');
  G.mode = 'sp'; G.maxHp = +SET.hp; G.winRounds = +SET.rounds; diff = DIFF[SET.diff] || DIFF[1];
  startGameUI(); startMatch();
};
$('mphost').onclick = () => hostGame();
$('mpjoin').onclick = () => joinGame();
$('buyclose').onclick = () => toggleBuy(false);
$('board').onclick = () => { G.board = false; $('board').classList.add('hidden'); };
/* --- пауза --- */
function showPause() {
  if (WM.open) { WM.open = false; G.mapOpen = false; $('wmap').classList.add('hidden'); }
  if (G.over || !G.started) return;
  $('pause').classList.remove('hidden');
  $('pausemp').classList.toggle('hidden', NET.mode === 'off');
  $('pstart').classList.toggle('hidden', !(NET.mode === 'host' && G.state === 'lobby'));
  $('pteam').classList.toggle('hidden', !(G.mode === 'mp' && G.state === 'lobby'));
  $('pcodebox').classList.toggle('hidden', NET.mode === 'off'); $('pcode').textContent = NET.code;
}
$('pcopy').onclick = () => {
  const txt = NET.code;
  const ok = () => showHint(t('copied'), 2);
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(ok).catch(() => {});
  else { const ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); ok(); } catch (e) {} ta.remove(); }
};
function goToMenu() {
  toggleWorldMap(false); netShutdown(); $('touch').classList.remove('on'); G.started = false; G.paused = true; document.exitPointerLock?.();
  for (const id of ['pause', 'hud', 'over', 'buy', 'board']) $(id).classList.add('hidden');
  closeChat(); showMenu('main');
}
$('resume').onclick = () => lock();
$('pstart').onclick = () => { hostStartMatch(); lock(); };
$('pteam').onclick = () => { requestTeamSwitch(); showPause(); };
$('psettings').onclick = () => openSettings();
$('tomenu').onclick = () => goToMenu();
$('overmenu').onclick = () => goToMenu();
$('again').onclick = () => { $('over').classList.add('hidden'); G.paused = false; if (NET.mode === 'host') startLobby(); else startMatch(); lock(); };
$('pause').addEventListener('mousedown', e => { if (e.target.id === 'pause') lock(); });

/* --- настройки --- */
const pct = v => Math.round(v * 100) + '%', fx2 = v => (+v).toFixed(2), px = v => v + 'px';
const SCHEMA = {
  tGfx: [
    ['preset', 'select', [['low', 'pLow'], ['medium', 'pMed'], ['high', 'pHigh'], ['ultra', 'pUltra'], ['custom', 'pCustom']]],
    ['renderScale', 'range', 0.5, 2, 0.05, pct], ['shadows', 'select', [[0, 'off'], [1, 'low'], [2, 'med'], [3, 'high'], [4, 'ultra']]],
    ['charShadows', 'toggle'], ['reflections', 'toggle'], ['drawDist', 'select', [[0, 'near'], [1, 'mid'], [2, 'far']]],
    ['effects', 'select', [[0, 'low'], [1, 'high']]], ['antialias', 'toggle', 'restart'], ['grading', 'toggle'], ['bloom', 'toggle'], ['ao', 'toggle'],
    ['fpsLimit', 'select', [[30, '#30'], [60, '#60'], [75, '#75'], [90, '#90'], [120, '#120'], [144, '#144'], [165, '#165'], [240, '#240'], [0, 'unlimited']]],
    ['showFps', 'toggle'], ['autoQuality', 'toggle'], ['brightness', 'range', 0.6, 1.8, 0.05, fx2], ['fov', 'range', 60, 110, 1, v => v + '°'],
    ['vmSide', 'select', [['right', 'right'], ['left', 'left']]], ['bob', 'toggle'],
  ],
  tSnd: [['master', 'range', 0, 1, 0.05, pct], ['sfxVol', 'range', 0, 1, 0.05, pct], ['announcer', 'toggle']],
  tCtl: [
    ['sens', 'range', 0.2, 4, 0.05, fx2], ['strongShake', 'toggle'], ['scopeSens', 'range', 0.1, 1.5, 0.05, fx2], ['invertY', 'toggle'], ['toggleCrouch', 'toggle'],
    ['keyLayout', 'select', [['en', 'kAuto'], ['ru', 'kRu']]],
    ['touchSize', 'range', 0.7, 1.4, 0.05, pct, 'touch'], ['touchSens', 'range', 0.3, 3, 0.05, fx2, 'touch'], ['aimAssist', 'toggle', 'touch'], ['autoFire', 'toggle'], 'BINDS',
  ],
  tCross: [
    ['xStyle', 'select', [['cross', 'xCross'], ['t', 'xT'], ['dot', 'xDot'], ['circle', 'xCircle']]], ['xColor', 'color'],
    ['xSize', 'range', 2, 24, 1, px], ['xThick', 'range', 1, 6, 1, px], ['xGap', 'range', 0, 20, 1, px], ['xCenter', 'toggle'], ['xDynamic', 'toggle'], ['xOutline', 'toggle'], 'XPREV',
  ],
  tUi: [['radar', 'toggle'], ['radarAll', 'toggle'], ['killfeed', 'toggle'], ['hitmarkers', 'toggle'], ['dmgNumbers', 'toggle'], ['hudScale', 'range', 0.7, 1.3, 0.05, pct]],
  tLang: 'LANGS',
};
const XCOLORS = ['#7dffb0', '#00ff3c', '#ff3b3b', '#ffd85a', '#4fe6ff', '#ffffff', '#ff4fd8', '#000000'];
let setTab = 'tGfx', rebinding = null;
function openSettings() { $('settings').classList.remove('hidden'); renderSettings(); }
$('setclose').onclick = () => { $('settings').classList.add('hidden'); rebinding = null; };
function setVal(k, v) {
  SET[k] = v;
  if (k === 'preset' && PRESETS[v]) Object.assign(SET, PRESETS[v]);
  else if (['renderScale', 'shadows', 'charShadows', 'reflections', 'drawDist', 'effects', 'grading', 'bloom', 'ao', 'antialias'].includes(k)) SET.preset = 'custom';
  if (['preset', 'renderScale', 'shadows', 'ao', 'bloom', 'autoQuality'].includes(k)) { PERF.dyn = 1; PERF.cut = 0; }
  if (k === 'lang') { LANG = v; }
  saveSettings(); applySettings();
  if (k === 'lang') applyLang();
}
function renderSettings() {
  $('settabs').innerHTML = Object.keys(SCHEMA).map(k => `<button class="${k === setTab ? 'sel' : ''}" data-t="${k}">${esc(t(k))}</button>`).join('');
  for (const b of $('settabs').children) b.onclick = () => { setTab = b.dataset.t; rebinding = null; renderSettings(); };
  const body = $('setbody'); body.innerHTML = '';
  const sc = SCHEMA[setTab];
  if (sc === 'LANGS') {
    const g = document.createElement('div'); g.className = 'langs';
    for (const [code, name] of Object.entries(LANGS)) { const b = document.createElement('button'); b.textContent = name; b.classList.toggle('sel', LANG === code); b.onclick = () => { setVal('lang', code); renderSettings(); }; g.appendChild(b); }
    body.appendChild(g); return;
  }
  for (const it of sc) {
    if (it === 'BINDS') { renderBinds(body); continue; }
    if (it === 'XPREV') { const d = document.createElement('div'); d.className = 'xprev'; d.innerHTML = '<div id="xpv"></div>'; body.appendChild(d); previewCross(); continue; }
    const [k, type, a, b, step, fmt, only] = it;
    if ((type === 'range' ? only : (type === 'toggle' ? a : null)) === 'touch' && !TOUCH) continue;
    const row = document.createElement('div'); row.className = 'srow';
    row.innerHTML = `<span>${esc(t(k))}${a === 'restart' ? `<br><small class="note">${esc(t('restartNote'))}</small>` : ''}</span><div class="ctl"></div>`;
    const ctl = row.lastChild;
    if (type === 'toggle') {
      const sw = document.createElement('button'); sw.className = 'sw' + (SET[k] ? ' on' : '');
      sw.onclick = () => { setVal(k, !SET[k]); renderSettings(); };
      ctl.appendChild(sw);
      if (a === 'restart') { const r = document.createElement('button'); r.textContent = t('restartBtn'); r.onclick = () => location.reload(); ctl.appendChild(r); }
    } else if (type === 'range') {
      const inp = document.createElement('input'); Object.assign(inp, { type: 'range', min: a, max: b, step, value: SET[k] });
      const val = document.createElement('span'); val.className = 'val'; val.textContent = fmt(SET[k]);
      inp.oninput = () => { val.textContent = fmt(+inp.value); setVal(k, +inp.value); if (k.startsWith('x')) previewCross(); };
      inp.onchange = () => renderSettings();
      ctl.append(inp, val);
    } else if (type === 'select') {
      const s = document.createElement('select');
      s.innerHTML = a.map(([v, l]) => `<option value="${v}" ${String(SET[k]) === String(v) ? 'selected' : ''}>${esc(l[0] === '#' ? l.slice(1) : t(l))}</option>`).join('');
      s.onchange = () => { const v = a.find(o => String(o[0]) === s.value)[0]; setVal(k, v); renderSettings(); };
      ctl.appendChild(s);
    } else if (type === 'color') {
      for (const c of XCOLORS) { const sw = document.createElement('button'); sw.className = 'swatch' + (SET.xColor === c ? ' sel' : ''); sw.style.background = c; sw.onclick = () => { setVal('xColor', c); renderSettings(); }; ctl.appendChild(sw); }
    }
    body.appendChild(row);
  }
}
function renderBinds(body) {
  const h = document.createElement('div'); h.innerHTML = `<h3 style="margin:14px 0 4px">${esc(t('binds'))}</h3><p class="sub" style="margin:0 0 6px">${esc(t('bindsNote'))}</p>`;
  body.appendChild(h);
  for (const a of BIND_ORDER) {
    const row = document.createElement('div'); row.className = 'srow';
    row.innerHTML = `<span>${esc(t('a_' + a))}</span><div class="ctl"></div>`;
    for (let i = 0; i < 2; i++) {
      const b = document.createElement('button'); b.className = 'keyb';
      const waiting = rebinding && rebinding.a === a && rebinding.i === i;
      b.textContent = waiting ? t('pressKey') : keyLabel(SET.binds[a][i]); b.classList.toggle('wait', !!waiting);
      b.onclick = () => { rebinding = { a, i }; renderSettings(); };
      row.lastChild.appendChild(b);
    }
    body.appendChild(row);
  }
  const r = document.createElement('button'); r.textContent = t('resetBinds'); r.style.marginTop = '10px';
  r.onclick = () => { SET.binds = JSON.parse(JSON.stringify(DEF_BINDS)); saveSettings(); renderSettings(); renderHelp(); };
  body.appendChild(r);
}
// перехват клавиши для переназначения (до игровых обработчиков)
document.addEventListener('keydown', e => {
  if (!rebinding) return;
  e.preventDefault(); e.stopImmediatePropagation();
  if (e.code === 'Escape') { rebinding = null; renderSettings(); return; }
  const code = e.code === 'Backspace' || e.code === 'Delete' ? '' : e.code;
  if (code) for (const a in SET.binds) for (let i = 0; i < 2; i++) if (SET.binds[a][i] === code) SET.binds[a][i] = '';
  SET.binds[rebinding.a] = [...SET.binds[rebinding.a]]; SET.binds[rebinding.a][rebinding.i] = code;
  rebinding = null; saveSettings(); renderSettings(); renderHelp();
}, true);
function previewCross() {
  const pv = $('xpv'); if (!pv) return;
  const real = $('cross'); real.id = 'cross_'; pv.id = 'cross'; buildCrosshair(); placeCrosshair(SET.xGap); pv.id = 'xpv'; real.id = 'cross'; buildCrosshair();
}
/* --- применение настроек --- */
let shadowSize = 2048;
function applyShadows() {
  const lv = effShadows(); sun.castShadow = lv > 0;
  const sz = [1024, 1024, 2048, 3072, 4096][lv] || 2048;
  if (sz !== shadowSize) { shadowSize = sz; sun.shadow.mapSize.set(sz, sz); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
}
function applySettings() {
  if (!SET.autoQuality) { PERF.dyn = 1; PERF.cut = 0; }
  const pr = targetPixelRatio(); if (Math.abs(renderer.getPixelRatio() - pr) > 0.01) renderer.setPixelRatio(pr);
  renderer.setSize(innerWidth, innerHeight);
  applyShadows();
  for (const a of agents) if (a.rig) a.rig.lodDirty = true; // тени бойцов выставит LOD с учётом дальности
  scene.environment = SET.reflections ? envTex : null; vmScene.environment = SET.reflections ? envTex : null;
  const dd = [[30, 90, 120], [50, 170, 300], [80, 260, 420]][SET.drawDist] || [50, 170, 300];
  scene.fog.near = dd[0]; scene.fog.far = dd[1]; camera.far = dd[2]; camera.updateProjectionMatrix();
  renderer.toneMappingExposure = SET.brightness;
  buildPost();
  vmRoot.scale.x = SET.vmSide === 'left' ? -1 : 1;
  applyVolume();
  buildCrosshair();
  for (const id of ['top', 'bl', 'br', 'feed', 'radar', 'chat']) $(id).style.zoom = SET.hudScale;
  shakeK = SET.strongShake ? 1 : 0.35;
  $('fps').classList.toggle('hidden', !SET.showFps);
  document.body.style.setProperty('--ts', SET.touchSize);
  // автоогонь: кнопка огня не нужна — убираем её целиком (display:none, касания не перехватывает)
  $('tFire').classList.toggle('hidden', !!SET.autoFire); if (SET.autoFire) { $('tFire').classList.remove('pr'); if (TOUCH) mouseDown = false; }
}
applySettings();
applyLang();
showMenu('main');
bootMark('20_menu');
