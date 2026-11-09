// Character editor ("dressing room") and the PIN-protected developer menu.
import * as THREE from 'three';
import { G } from './state.js';
import { OPTIONS, SKIN_TONES, PALETTE, DEFAULT_AVATAR, sanitizeAvatar, randomAvatar, buildCharacter, shrinkImage } from './character.js';
import { env } from './world.js';
import { releaseMouse } from './controls.js';
import { physicsInfo } from './phys.js';
import { saveSettings } from './state.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let H = null;

// =====================================================================
// Character editor
// =====================================================================
let editing = null;
let preview = null;
let charTab = 'body';
let orbit = 0.4;
const PREVIEW_POS = new THREE.Vector3(0, 0, 30);

export function charEditorOpen() { return !$('charmenu').classList.contains('hidden'); }

export function openCharEditor() {
  editing = JSON.parse(JSON.stringify(G.me.avatar));
  $('charmenu').classList.remove('hidden');
  releaseMouse();
  rebuildPreview();
  renderChar();
}
function closeCharEditor() {
  $('charmenu').classList.add('hidden');
  if (preview) { G.scene.remove(preview.group); preview = null; }
  G.camera.clearViewOffset();
  H.charClosed();
}

function rebuildPreview() {
  if (preview) G.scene.remove(preview.group);
  preview = buildCharacter(editing);
  preview.group.position.copy(PREVIEW_POS);
  G.scene.add(preview.group);
}

// Called every frame while the editor is open: camera looks at the preview character
export function updateCharPreview(dt) {
  if (!preview) return;
  preview.group.rotation.y = orbit;
  const t = performance.now() / 1000;
  preview.armL.rotation.z = -0.08 - Math.sin(t * 1.5) * 0.03;
  preview.armR.rotation.z = 0.08 + Math.sin(t * 1.5) * 0.03;
  const w = window.innerWidth, h = window.innerHeight;
  const portrait = h > w;
  G.camera.position.set(PREVIEW_POS.x, PREVIEW_POS.y + 1.15, PREVIEW_POS.z + (portrait ? 4.2 : 3.4));
  G.camera.lookAt(PREVIEW_POS.x, PREVIEW_POS.y + 0.95, PREVIEW_POS.z);
  // shift the picture so the character stands left of the panel (landscape) or above it (portrait)
  if (portrait) G.camera.setViewOffset(w, h, 0, h * 0.22, w, h);
  else G.camera.setViewOffset(w, h, w * 0.26, 0, w, h);
}

function swatches(list, current, onPick, custom = true) {
  const id = 'sw' + Math.random().toString(36).slice(2);
  const html = `<div class="swatches" id="${id}">` + list.map(c => `<button style="background:${c}" data-c="${c}" class="${c === current ? 'active' : ''}"></button>`).join('') +
    (custom ? `<label class="custom-color">Свой<input type="color" value="${current}"></label>` : '') + '</div>';
  return { html, bind: () => {
    const el = $(id);
    el.querySelectorAll('button').forEach(b => { b.onclick = () => { onPick(b.dataset.c); }; });
    const inp = el.querySelector('input[type=color]');
    if (inp) inp.oninput = () => onPick(inp.value);
  } };
}
function choice(list, current, onPick) {
  const id = 'ch' + Math.random().toString(36).slice(2);
  const html = `<div class="choices" id="${id}">` + list.map(([v, label]) => `<button data-v="${v}" class="${v === current ? 'active' : ''}">${esc(label)}</button>`).join('') + '</div>';
  return { html, bind: () => $(id).querySelectorAll('button').forEach(b => { b.onclick = () => onPick(b.dataset.v); }) };
}
function slider(label, key, min, max) {
  const id = 'sl' + key;
  return { html: `<label>${esc(label)} <span id="${id}v">${Math.round(editing[key] * 100)}%</span><input type="range" id="${id}" min="${min}" max="${max}" step="0.01" value="${editing[key]}"></label>`,
    bind: () => { $(id).oninput = () => { editing[key] = Number($(id).value); $(id + 'v').textContent = Math.round(editing[key] * 100) + '%'; rebuildPreview(); }; } };
}

function renderChar() {
  document.querySelectorAll('#chartabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === charTab));
  const parts = [];
  const set = (k) => (v) => { editing[k] = v; rebuildPreview(); renderChar(); };
  const section = t => ({ html: `<div class="section">${esc(t)}</div>`, bind: () => {} });
  if (charTab === 'body') {
    parts.push(slider('Рост', 'height', 0.8, 1.2), slider('Ширина', 'width', 0.8, 1.3), slider('Размер головы', 'head', 0.8, 1.4), slider('Длина рук и ног', 'limbs', 0.85, 1.2));
    parts.push(section('Цвет кожи'), swatches(SKIN_TONES, editing.skin, set('skin')));
  } else if (charTab === 'clothes') {
    parts.push(section('Футболка'), swatches(PALETTE, editing.shirt, set('shirt')), choice(OPTIONS.pattern, editing.pattern, set('pattern')));
    parts.push({ html: `<label>Своя картинка на футболку<div class="row"><input type="file" id="c-shirtimg" accept="image/*"><button class="mbtn sm" id="c-shirtimgx">Убрать</button></div></label>${editing.shirtImg ? '<div class="note">Сейчас стоит ваша картинка.</div>' : ''}`,
      bind: () => {
        $('c-shirtimg').onchange = (e) => {
          const f = e.target.files[0]; if (!f) return;
          const rd = new FileReader();
          rd.onload = async () => { try { editing.shirtImg = await shrinkImage(String(rd.result), 160); rebuildPreview(); renderChar(); } catch (err) { H.toast('Не удалось открыть картинку'); } };
          rd.readAsDataURL(f);
        };
        $('c-shirtimgx').onclick = () => { editing.shirtImg = null; rebuildPreview(); renderChar(); };
      } });
    parts.push(section('Штаны'), swatches(PALETTE, editing.pants, set('pants')));
    parts.push(section('Обувь'), swatches(PALETTE, editing.shoes, set('shoes')));
  } else if (charTab === 'face') {
    parts.push(section('Глаза'), choice(OPTIONS.eyes, editing.eyes, set('eyes')));
    parts.push(section('Рот'), choice(OPTIONS.mouth, editing.mouth, set('mouth')));
    parts.push(section('Щёки'), choice([['no', 'Обычные'], ['yes', 'Румянец']], editing.cheeks ? 'yes' : 'no', (v) => { editing.cheeks = v === 'yes'; rebuildPreview(); renderChar(); }));
  } else if (charTab === 'head') {
    parts.push(section('Волосы'), choice(OPTIONS.hair, editing.hair, set('hair')),
      swatches(['#1a1210', '#2a1a10', '#4a2e18', '#8a5a2a', '#d8b060', '#f0e0b0', '#c04020', '#e0e0e0', '#3f8fe8', '#e65c9c', '#46b04a', '#8c4fd0'], editing.hairColor, set('hairColor')));
    parts.push(section('Головной убор'), choice(OPTIONS.hat, editing.hat, set('hat')), swatches(PALETTE, editing.hatColor, set('hatColor')));
  } else if (charTab === 'acc') {
    parts.push(section('Аксессуары (можно несколько)'), {
      html: '<div class="choices" id="c-acc">' + OPTIONS.acc.map(([v, l]) => `<button data-v="${v}" class="${editing.acc.includes(v) ? 'active' : ''}">${esc(l)}</button>`).join('') + '</div>',
      bind: () => $('c-acc').querySelectorAll('button').forEach(b => {
        b.onclick = () => { const v = b.dataset.v; editing.acc = editing.acc.includes(v) ? editing.acc.filter(x => x !== v) : [...editing.acc, v]; rebuildPreview(); renderChar(); };
      }),
    });
    parts.push(section('Цвет аксессуаров'), swatches(PALETTE, editing.accColor, set('accColor')));
  }
  $('charcontent').innerHTML = parts.map(p => p.html).join('');
  parts.forEach(p => p.bind());
}

function initCharEditor() {
  document.querySelectorAll('#chartabs button').forEach(b => { b.onclick = () => { charTab = b.dataset.tab; renderChar(); }; });
  $('c-random').onclick = () => { editing = randomAvatar(); rebuildPreview(); renderChar(); };
  $('c-reset').onclick = () => { editing = { ...DEFAULT_AVATAR }; rebuildPreview(); renderChar(); };
  $('c-cancel').onclick = () => closeCharEditor();
  $('c-save').onclick = () => {
    G.me.avatar = sanitizeAvatar(editing);
    H.saveAvatar(G.me.avatar);
    H.toast('Персонаж сохранён');
    closeCharEditor();
  };
  // drag on the free area to rotate the preview
  const zone = $('charrotate');
  let last = null;
  zone.addEventListener('pointerdown', (e) => { last = e.clientX; zone.setPointerCapture(e.pointerId); });
  zone.addEventListener('pointermove', (e) => { if (last == null) return; orbit += (e.clientX - last) * 0.012; last = e.clientX; });
  const end = () => { last = null; };
  zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end);
}

// =====================================================================
// Developer menu (PIN protected, world changes are applied by the host)
// =====================================================================
let devTab = 'world';
let devUnlocked = false;
let selected = null;

export function openDevMenu() {
  releaseMouse();
  let pin = null;
  try { pin = localStorage.getItem('sf_dev_pin'); } catch (e) { pin = null; }
  $('devmenu').classList.remove('hidden');
  if (!pin) showPin('create');
  else if (!devUnlocked) showPin('enter');
  else { $('devpin').classList.add('hidden'); $('devmain').classList.remove('hidden'); renderDev(); }
}
export function devMenuOpen() { return !$('devmenu').classList.contains('hidden'); }
function closeDev() { $('devmenu').classList.add('hidden'); H.devClosed(); }

function showPin(mode) {
  $('devmain').classList.add('hidden');
  $('devpin').classList.remove('hidden');
  $('devpintitle').textContent = mode === 'create' ? 'Придумайте PIN-код для меню разработчика (4–8 цифр)' : 'Введите PIN-код';
  $('devpininput').value = '';
  $('devpinok').onclick = () => {
    const v = $('devpininput').value.trim();
    if (mode === 'create') {
      if (!/^\d{4,8}$/.test(v)) { H.toast('PIN: от 4 до 8 цифр'); return; }
      try { localStorage.setItem('sf_dev_pin', v); } catch (e) { /* ignore */ }
      H.toast('PIN сохранён. Не забудьте его!');
    } else {
      let pin = null;
      try { pin = localStorage.getItem('sf_dev_pin'); } catch (e) { pin = null; }
      if (v !== pin) { H.sound('denied'); H.toast('Неверный PIN'); return; }
    }
    devUnlocked = true;
    $('devpin').classList.add('hidden');
    $('devmain').classList.remove('hidden');
    renderDev();
  };
}

function devAct(op, extra = {}) { H.act({ a: 'dev', op, ...extra }); }

function rangeRow(id, label, min, max, step, value, fmt, onChange) {
  return {
    html: `<label>${esc(label)} <span id="${id}v">${fmt(value)}</span><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}"></label>`,
    bind: () => { $(id).oninput = () => { const v = Number($(id).value); $(id + 'v').textContent = fmt(v); onChange(v); }; },
  };
}
function buttons(list) {
  const id = 'db' + Math.random().toString(36).slice(2);
  return { html: `<div class="choices" id="${id}">` + list.map(([l], i) => `<button data-i="${i}">${esc(l)}</button>`).join('') + '</div>',
    bind: () => $(id).querySelectorAll('button').forEach(b => { b.onclick = () => list[Number(b.dataset.i)][1](); }) };
}

function renderDev() {
  document.querySelectorAll('#devtabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === devTab));
  const parts = [];
  const note = t => ({ html: `<div class="note">${esc(t)}</div>`, bind: () => {} });
  const P = H.player();
  if (devTab === 'world') {
    if (!G.isHost) parts.push(note('Изменения мира применяет только хост сервера.'));
    parts.push(rangeRow('d-grav', 'Гравитация', 0, 25, 0.1, -G.world.gravity.y, v => v.toFixed(1) + ' м/с²', v => devAct('grav', { v })));
    parts.push(rangeRow('d-tod', 'Время суток', 0, 24, 0.25, env.tod, v => `${String(Math.floor(v)).padStart(2, '0')}:${String(Math.round((v % 1) * 60)).padStart(2, '0')}`, v => devAct('tod', { v })));
    parts.push(rangeRow('d-fog', 'Туман', 0, 4, 0.1, env.fog, v => '×' + v.toFixed(1), v => devAct('fog', { v })));
    parts.push(rangeRow('d-ts', 'Скорость времени (замедление)', 0.1, 2, 0.05, G.timeScale || 1, v => '×' + v.toFixed(2), v => devAct('ts', { v })));
    parts.push(buttons([['Утро', () => devAct('tod', { v: 7 })], ['День', () => devAct('tod', { v: 13 })], ['Закат', () => devAct('tod', { v: 18.3 })], ['Ночь', () => devAct('tod', { v: 23 })], ['Сбросить всё', () => { devAct('grav', { v: 9.82 }); devAct('tod', { v: 13 }); devAct('fog', { v: 1 }); devAct('ts', { v: 1 }); setTimeout(renderDev, 100); }]]));
  } else if (devTab === 'player') {
    parts.push(rangeRow('d-spd', 'Скорость бега', 0.5, 4, 0.1, P.speedMul, v => '×' + v.toFixed(1), v => { P.speedMul = v; }));
    parts.push(rangeRow('d-jmp', 'Высота прыжка', 0.5, 6, 0.1, P.jumpMul, v => '×' + v.toFixed(1), v => { P.jumpMul = v; }));
    parts.push(rangeRow('d-fly', 'Скорость полёта', 0.5, 5, 0.1, P.flyMul, v => '×' + v.toFixed(1), v => { P.flyMul = v; }));
    parts.push(buttons([[P.thirdPerson ? 'Вид: от третьего лица' : 'Вид: от первого лица', () => { H.toggleView(); renderDev(); }], ['Полёт вкл/выкл', () => H.toggleNoclip()], ['Возродиться', () => H.respawn()]]));
  } else if (devTab === 'object') {
    parts.push(buttons([['Выбрать то, на что смотрю', () => { const hit = H.aim(); selected = hit && hit.entId != null ? hit.entId : null; if (selected == null) { H.sound('denied'); H.toast('Прицел не наведён на предмет'); } renderDev(); }]]));
    const ent = selected != null ? G.ents.get(selected) : null;
    if (!ent) parts.push(note('Закройте меню, наведите прицел на предмет, откройте снова и нажмите «Выбрать».'));
    else {
      const mass = ent.parts.reduce((m, p) => m + (G.isHost ? (p.body.mass || p.def.mass) : p.def.mass), 0);
      parts.push(note(`${ent.def.name} · №${ent.id} · масса ${mass.toFixed(1)} кг · ${ent.frozen ? 'заморожен' : 'свободен'}${ent.def.health ? ' · здоровье ' + Math.max(0, Math.round(ent.health)) : ''}`));
      const o = (d) => () => { devAct('obj', { id: ent.id, d }); setTimeout(renderDev, 150); };
      parts.push(buttons([['Дублировать', o('dup')], [ent.frozen ? 'Разморозить' : 'Заморозить', o('freeze')], ['Масса ×2', o('mass2')], ['Масса ÷2', o('mass05')], ['Подбросить', o('launch')], ['Невесомость', o('float')], ['Удалить', o('del')]]));
    }
  } else if (devTab === 'spawn') {
    const types = [...G.propDefs.values()].filter(d => !d.hidden);
    parts.push({ html: `<label>Предмет<select id="d-type">${types.map(d => `<option value="${esc(d.type)}">${esc(d.name)}</option>`).join('')}</select></label>`, bind: () => {} });
    parts.push(rangeRow('d-n', 'Количество', 1, 40, 1, 10, v => String(v), () => {}));
    parts.push(buttons([['Дождь из предметов', () => devAct('rain', { type: $('d-type').value, n: Number($('d-n').value), at: H.playerPos() })], ['Очистить всю карту', () => { H.sound('warning'); devAct('clear'); }]]));
  } else if (devTab === 'debug') {
    parts.push(buttons([[H.fpsOn() ? 'Счётчик FPS: вкл' : 'Счётчик FPS: выкл', () => { H.toggleFps(); renderDev(); }], ['Сменить PIN', () => { try { localStorage.removeItem('sf_dev_pin'); } catch (e) { /* ignore */ } devUnlocked = false; showPin('create'); }]]));
    const rust = (G.settings.physics || 'rust') === 'rust';
    parts.push(note('Физика: ' + physicsInfo.engine));
    parts.push(buttons([[rust ? 'Переключить на старую физику (JS)' : 'Переключить на быструю физику (Rust)', () => { G.settings.physics = rust ? 'js' : 'rust'; saveSettings(); location.reload(); }]]));
    parts.push(note(`Предметов: ${G.ents.size} · связей: ${G.cons.size} · игроков: ${G.players.size + 1} · ${G.isHost ? 'вы хост' : 'вы гость'}`));
  }
  $('devcontent').innerHTML = parts.map(p => p.html).join('');
  parts.forEach(p => p.bind());
}

function initDevMenu() {
  document.querySelectorAll('#devtabs button').forEach(b => { b.onclick = () => { devTab = b.dataset.tab; renderDev(); }; });
  $('devclose').onclick = closeDev;
  $('devpincancel').onclick = closeDev;
  $('devpininput').addEventListener('keydown', e => { if (e.key === 'Enter') $('devpinok').click(); });
}

export function initEditors(handlers) {
  H = handlers;
  initCharEditor();
  initDevMenu();
}
