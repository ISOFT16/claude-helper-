// DOM user interface: menus, spawn menu, addon manager, settings, chat and HUD.
import { G, saveSettings } from './state.js';
import {
  WORKSHOP, utilities, loadedAddons, getInstalled, installAddon, setAddonEnabled, uninstallAddon,
} from './addons.js';
import { isTouch } from './controls.js';
import { thumbnail } from './thumbs.js';
import { customList, importModelFile, deleteCustomModel } from './custommodels.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const COLORS = ['#3fa7ff', '#ff5a4f', '#46d16a', '#ffc93c', '#b06bff', '#ff8a3d', '#2fd5c9', '#ff6fb5', '#e8e8e8', '#5a6470'];
const CAT_ORDER = ['Предметы', 'Строительство', 'Мебель', 'Забавное', 'Персонажи'];

let H = null;
let screenStack = [];
let spawnTab = 'Предметы';
let addonTab = 'installed';
export const ui = { toolColor: null };

export function initUI(handlers) {
  H = handlers;
  // main menu
  $('m-single').onclick = () => H.startSingle();
  $('m-host').onclick = () => H.startHost();
  $('m-join').onclick = () => {
    const code = $('m-code').value.trim().toUpperCase();
    if (code.length < 5) { setStatus('Введите код комнаты из 5 символов'); return; }
    H.join(code);
  };
  $('m-code').addEventListener('keydown', e => { if (e.key === 'Enter') $('m-join').click(); });
  $('m-addons').onclick = () => openScreen('addonsmenu');
  $('m-settings').onclick = () => openScreen('settingsmenu');
  $('m-char').onclick = () => { hideAllScreens(); H.openChar(); };
  // pause
  $('p-resume').onclick = () => H.resume();
  $('p-open').onclick = () => H.openServer();
  $('p-players').onclick = () => showPlayers();
  $('p-addons').onclick = () => openScreen('addonsmenu');
  $('p-settings').onclick = () => openScreen('settingsmenu');
  $('p-char').onclick = () => { hideAllScreens(); H.openChar(); };
  $('p-dev').onclick = () => { hideAllScreens(); H.openDev(); };
  $('b-view').onclick = () => H.toggleView();
  $('p-quit').onclick = () => H.quit();
  // generic back/close buttons
  document.querySelectorAll('[data-back]').forEach(b => { b.onclick = () => backScreen(); });
  document.querySelectorAll('[data-close]').forEach(b => { b.onclick = () => closeSpawnMenu(); });
  // HUD buttons
  $('b-pause').onclick = () => H.pause();
  $('b-spawn').onclick = () => toggleSpawnMenu();
  $('b-chat').onclick = () => openChat();
  // chat
  $('chatinput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendChat();
    if (e.key === 'Escape') closeChat();
  });
  $('chatsend').onclick = () => sendChat();
  // addons
  document.querySelectorAll('#addontabs button').forEach(b => {
    b.onclick = () => { addonTab = b.dataset.tab; renderAddons(); };
  });
  $('a-reload').onclick = () => location.reload();
  // settings
  $('s-save').onclick = () => {
    G.settings.name = $('s-name').value.trim().slice(0, 16) || 'Игрок';
    G.settings.quality = $('s-quality').value;
    G.settings.sens = Number($('s-sens').value);
    G.settings.serverAddons = $('s-serveraddons').checked;
    G.settings.peerServer = $('s-peer').value.trim();
    saveSettings();
    H.applySettings();
    toast('Настройки сохранены');
    backScreen();
  };
  if (!isTouch) $('pchint').classList.remove('hidden');
}

export function setStatus(t) { $('m-status').textContent = t; }

// ---------- Screens ----------
export function showMain() {
  screenStack = [];
  for (const id of ['pausemenu', 'addonsmenu', 'settingsmenu']) $(id).classList.add('hidden');
  $('hud').classList.add('hidden');
  closeSpawnMenu();
  $('mainmenu').classList.remove('hidden');
}
export function hideAllScreens() {
  screenStack = [];
  for (const id of ['mainmenu', 'pausemenu', 'addonsmenu', 'settingsmenu']) $(id).classList.add('hidden');
}
export function showHud() { $('hud').classList.remove('hidden'); }

export function openScreen(id) {
  const cur = currentScreen();
  if (cur) { $(cur).classList.add('hidden'); screenStack.push(cur); }
  $(id).classList.remove('hidden');
  if (id === 'addonsmenu') renderAddons();
  if (id === 'settingsmenu') renderSettings();
  if (id === 'pausemenu') renderPause();
}
function currentScreen() {
  return ['mainmenu', 'pausemenu', 'addonsmenu', 'settingsmenu'].find(id => !$(id).classList.contains('hidden')) || null;
}
export function backScreen() {
  const cur = currentScreen();
  if (cur) $(cur).classList.add('hidden');
  const prev = screenStack.pop();
  if (prev) { $(prev).classList.remove('hidden'); if (prev === 'pausemenu') renderPause(); }
  else if (G.inGame) H.resume();
  else $('mainmenu').classList.remove('hidden');
}
export function anyScreenOpen() {
  return !!currentScreen() || !$('spawnmenu').classList.contains('hidden') || !$('chatbox').classList.contains('hidden') ||
    !$('charmenu').classList.contains('hidden') || !$('devmenu').classList.contains('hidden');
}
export function pauseOpen() { return !$('pausemenu').classList.contains('hidden'); }

function renderPause() {
  const room = G.net ? `Код комнаты: <b>${esc(G.net.code)}</b><br><small>Друзья вводят этот код в «Подключиться»</small>` : 'Одиночная игра';
  $('p-room').innerHTML = room;
  $('p-open').classList.toggle('hidden', !!G.net);
}

function showPlayers() {
  const list = H.listPlayers();
  const html = list.map(p => `<div class="playerrow"><span class="dot" style="background:${esc(p.color)}"></span><span style="flex:1">${esc(p.name)}${p.me ? ' (вы)' : ''}${p.host ? ' (хост)' : ''}</span>${G.isHost && !p.me && G.net ? `<button class="mbtn sm" data-kick="${esc(p.id)}">Выгнать</button>` : ''}</div>`).join('');
  $('p-room').innerHTML = (G.net ? `Код комнаты: <b>${esc(G.net.code)}</b><br>` : '') + `<div style="text-align:left;margin-top:8px">${html}</div>`;
  $('p-room').querySelectorAll('[data-kick]').forEach(b => { b.onclick = () => { H.kick(b.dataset.kick); setTimeout(showPlayers, 300); }; });
}

// ---------- Settings ----------
function renderSettings() {
  $('s-name').value = G.settings.name;
  $('s-quality').value = G.settings.quality;
  $('s-sens').value = G.settings.sens;
  $('s-serveraddons').checked = G.settings.serverAddons;
  $('s-peer').value = G.settings.peerServer || '';
  const GLOWS = ['#40e0d0', '#40c8ff', '#3070ff', '#5dff7a', '#ff8a2a', '#c060ff', '#ff4060', '#f0f0f0'];
  const gw = $('s-glow');
  gw.innerHTML = GLOWS.map(c => `<button style="background:${c}" data-c="${c}" class="${c === G.settings.physgunGlow ? 'active' : ''}"></button>`).join('');
  gw.querySelectorAll('button').forEach(b => {
    b.onclick = () => { G.settings.physgunGlow = b.dataset.c; gw.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b)); };
  });
  pictureSetting('sf_physgun_skin', 's-skin', 's-skinreset', 's-skininfo', () => H.applyPhysgun());
  pictureSetting('sf_bot_skin', 's-botskin', 's-botskinreset', 's-botskininfo', () => H.applyBotSkin());
  const sw = $('s-colors');
  sw.innerHTML = COLORS.map(c => `<button style="background:${c}" data-c="${c}" class="${c === G.settings.color ? 'active' : ''}"></button>`).join('');
  sw.querySelectorAll('button').forEach(b => {
    b.onclick = () => { G.settings.color = b.dataset.c; sw.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b)); };
  });
}

// A picture slot in settings: pick an image on the device, shrink it, keep it in local storage
function pictureSetting(key, inputId, resetId, infoId, apply) {
  const has = (() => { try { return !!localStorage.getItem(key); } catch (e) { return false; } })();
  $(infoId).textContent = has ? 'Сейчас стоит ваша картинка.' : 'Сейчас стандартная окраска.';
  $(inputId).value = '';
  $(inputId).onchange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, 1024 / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        try {
          localStorage.setItem(key, c.toDataURL('image/jpeg', 0.9));
          $(infoId).textContent = 'Картинка поставлена.';
          apply();
        } catch (err) { toast('Картинка слишком большая, не удалось сохранить'); }
      };
      img.onerror = () => toast('Не удалось открыть картинку');
      img.src = String(rd.result);
    };
    rd.readAsDataURL(f);
  };
  $(resetId).onclick = () => {
    try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
    $(infoId).textContent = 'Сейчас стандартная окраска.';
    apply();
  };
}

// ---------- Spawn menu ----------
export function toggleSpawnMenu() {
  if ($('spawnmenu').classList.contains('hidden')) openSpawnMenu(); else closeSpawnMenu();
}
export function openSpawnMenu() {
  document.exitPointerLock?.();
  $('spawnmenu').classList.remove('hidden');
  renderSpawnMenu();
}
export function closeSpawnMenu() { $('spawnmenu').classList.add('hidden'); }

export function renderSpawnMenu() {
  if ($('spawnmenu').classList.contains('hidden')) return;
  const cats = new Set();
  for (const d of G.propDefs.values()) if (!d.hidden) cats.add(d.category);
  const ordered = [...CAT_ORDER.filter(c => cats.has(c)), ...[...cats].filter(c => !CAT_ORDER.includes(c))];
  const tabs = [...ordered.filter(c => c !== 'Свои модели'), 'Свои модели', 'Инструменты', 'Утилиты'];
  if (!tabs.includes(spawnTab)) spawnTab = tabs[0];
  $('spawntabs').innerHTML = tabs.map(t => `<button class="${t === spawnTab ? 'active' : ''}" data-t="${esc(t)}">${esc(t)}</button>`).join('');
  $('spawntabs').querySelectorAll('button').forEach(b => { b.onclick = () => { spawnTab = b.dataset.t; renderSpawnMenu(); }; });
  const body = $('spawncontent');
  if (spawnTab === 'Свои модели') {
    let html = `<div class="note">Загрузите свою 3D-модель в формате .glb с телефона. Она сохранится только на этом устройстве и появится здесь как неподвижный NPC: стоит, не падает, её можно толкать и носить физпушкой. В мультиплеере работает, если вы хост; другие игроки её не увидят.</div>
      <div class="row" style="margin:8px 0;align-items:end;flex-wrap:wrap">
        <label style="flex:2;min-width:180px">Файл модели (.glb)<input type="file" id="cm-file" accept=".glb,.gltf,model/gltf-binary,application/octet-stream,*/*"></label>
        <label style="flex:1;min-width:120px">Рост, м (0 — как в файле)<input type="number" id="cm-height" value="1.85" min="0" max="50" step="0.05"></label>
      </div><div id="cm-status" class="note"></div><div class="grid">`;
    html += customList.map(m => `<div class="item"><button class="item-btn" data-type="custom_${esc(m.id)}"><img class="thumb" alt="" src="${thumbnail('custom_' + m.id)}">${esc(m.name)}</button><button class="mbtn sm danger" data-cmdel="${esc(m.id)}">Удалить</button></div>`).join('');
    html += '</div>';
    body.innerHTML = html;
    body.querySelectorAll('[data-type]').forEach(b => { b.onclick = () => { H.spawn(b.dataset.type); if (!isTouch) closeSpawnMenu(); else toast('Создано: ' + b.textContent.trim()); }; });
    body.querySelectorAll('[data-cmdel]').forEach(b => { b.onclick = async () => { await deleteCustomModel(b.dataset.cmdel); renderSpawnMenu(); toast('Модель удалена'); }; });
    $('cm-file').onchange = async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      $('cm-status').textContent = 'Загружаю модель…';
      try {
        const rec = await importModelFile(f, $('cm-height').value);
        toast(`Модель «${rec.name}» добавлена`);
        renderSpawnMenu();
      } catch (err) { $('cm-status').textContent = 'Не получилось: ' + (err.message || err); }
    };
  } else if (spawnTab === 'Инструменты') {
    const cur = H.currentTool();
    let html = '<div class="section">Режимы тулгана (выберите, затем стреляйте тулганом)</div><div class="grid">';
    for (const t of G.toolDefs.values()) {
      if (t.hidden) continue;
      html += `<button class="item text ${t.id === cur ? 'active' : ''}" data-tool="${esc(t.id)}">${esc(t.name)}</button>`;
    }
    html += '</div><div class="section">Цвет для «Краски» и «Шариков»</div><div class="swatches" id="toolcolors">';
    html += `<button data-c="" class="${!ui.toolColor ? 'active' : ''}" style="background:conic-gradient(red,yellow,lime,cyan,blue,magenta,red)" title="Случайный"></button>`;
    html += COLORS.map(c => `<button data-c="${c}" style="background:${c}" class="${ui.toolColor === c ? 'active' : ''}"></button>`).join('');
    html += '</div>';
    body.innerHTML = html;
    body.querySelectorAll('[data-tool]').forEach(b => { b.onclick = () => { H.selectTool(b.dataset.tool); closeSpawnMenu(); }; });
    body.querySelectorAll('#toolcolors button').forEach(b => { b.onclick = () => { ui.toolColor = b.dataset.c || null; renderSpawnMenu(); }; });
  } else if (spawnTab === 'Утилиты') {
    const items = [
      ['', 'Отменить последнее', () => H.undo()],
      ['', 'Убрать мои предметы', () => H.cleanup(false)],
      ['', 'Очистить всю карту' + (G.isHost ? '' : ' (только хост)'), () => H.cleanup(true)],
      ['', 'Возродиться', () => H.respawn()],
      ['', 'Сохранить постройку', () => H.runCommand('сохранить')],
      ['', 'Загрузить постройку', () => H.runCommand('загрузить')],
      ...utilities.map(u => ['', u.name, () => H.runCommand(u.cmd)]),
    ];
    body.innerHTML = '<div class="grid">' + items.map((it, i) => `<button class="item text" data-i="${i}">${esc(it[1])}</button>`).join('') + '</div>' +
      '<div class="section">Команды чата: !помощь, !луна (с аддоном), !очистить</div>';
    body.querySelectorAll('[data-i]').forEach(b => { b.onclick = () => { items[Number(b.dataset.i)][2](); closeSpawnMenu(); }; });
  } else {
    const list = [...G.propDefs.values()].filter(d => d.category === spawnTab && !d.hidden);
    body.innerHTML = '<div class="grid">' + list.map(d => `<button class="item" data-type="${esc(d.type)}"><img class="thumb" alt="" src="${thumbnail(d.type)}">${esc(d.name)}</button>`).join('') + '</div>';
    body.querySelectorAll('[data-type]').forEach(b => { b.onclick = () => { H.spawn(b.dataset.type); if (!isTouch) closeSpawnMenu(); else toast('Создано: ' + b.textContent.trim()); }; });
  }
}

// ---------- Addons manager ----------
const TEMPLATE = `addon({
  name: 'Мой аддон',
  author: 'Я',
  version: '1.0',
  init(api) {
    api.registerProp('my_cube', {
      name: 'Мой куб', category: 'Мои вещи', mass: 10,
      shape: { type: 'box', size: [1, 1, 1], color: 0xaa44ff, tex: 'metal' },
    });
  },
});`;

function renderAddons() {
  document.querySelectorAll('#addontabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === addonTab));
  const box = $('addoncontent');
  const installed = getInstalled();
  if (addonTab === 'installed') {
    if (!installed.length) { box.innerHTML = '<p>Аддонов пока нет. Загляните в «Мастерскую» или установите свой.</p>'; return; }
    box.innerHTML = installed.map(a => `<div class="addon"><div class="info"><div class="name">${esc(a.name)} <small>${esc(a.version || '')}</small></div><div class="desc">${esc(a.desc || '')} ${a.author ? '· ' + esc(a.author) : ''}</div></div>
      <div class="btns"><button class="mbtn sm" data-toggle="${esc(a.id)}">${a.enabled ? 'Включён' : 'Выключен'}</button><button class="mbtn sm danger" data-del="${esc(a.id)}">Удалить</button></div></div>`).join('');
    box.querySelectorAll('[data-toggle]').forEach(b => {
      b.onclick = () => { const a = installed.find(x => x.id === b.dataset.toggle); setAddonEnabled(a.id, !a.enabled); renderAddons(); };
    });
    box.querySelectorAll('[data-del]').forEach(b => { b.onclick = () => { uninstallAddon(b.dataset.del); renderAddons(); toast('Аддон удалён'); }; });
  } else if (addonTab === 'workshop') {
    box.innerHTML = WORKSHOP.map(w => {
      const have = installed.find(a => a.id === w.id);
      return `<div class="addon"><div class="info"><div class="name">${esc(w.name)}</div><div class="desc">${esc(w.desc)} · ${esc(w.author)}</div></div>
        <div class="btns">${have ? '<span>Установлен</span>' : `<button class="mbtn sm primary" data-inst="${esc(w.id)}">Установить</button>`}</div></div>`;
    }).join('');
    box.querySelectorAll('[data-inst]').forEach(b => {
      b.onclick = () => {
        const w = WORKSHOP.find(x => x.id === b.dataset.inst);
        const r = installAddon(w.code, w.id);
        toast(r.ok ? `«${w.name}» установлен. Перезапустите игру.` : 'Ошибка: ' + r.error);
        renderAddons();
      };
    });
  } else if (addonTab === 'import') {
    box.innerHTML = `
      <label>Из файла (.js)<input type="file" id="a-file" accept=".js,.txt,text/javascript,text/plain,application/javascript,*/*"></label>
      <label>По ссылке<div class="row"><input id="a-url" placeholder="https://.../my_addon.js"><button class="mbtn sm" id="a-urlbtn">Скачать</button></div></label>
      <label>Или вставьте код аддона<textarea id="a-code" spellcheck="false"></textarea></label>
      <div class="row"><button class="mbtn sm primary" id="a-install">Установить код</button><button class="mbtn sm" id="a-template">Шаблон</button></div>
      <p class="desc" style="font-size:12px;opacity:.75">Аддон — это JavaScript-файл с вызовом <code>addon({ name, init(api) {...} })</code>. В api есть registerProp, registerTool, registerCommand, registerUtility, on, spawn, remove, fx, explode, setGravity, chat. Устанавливайте аддоны только из источников, которым доверяете.</p>`;
    const doInstall = (code) => {
      const r = installAddon(code);
      toast(r.ok ? `Аддон «${r.meta.name}» установлен. Перезапустите игру.` : 'Ошибка в аддоне: ' + r.error);
      if (r.ok) { addonTab = 'installed'; renderAddons(); }
    };
    $('a-file').onchange = (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const rd = new FileReader();
      rd.onload = () => doInstall(String(rd.result));
      rd.readAsText(f);
    };
    $('a-urlbtn').onclick = async () => {
      const url = $('a-url').value.trim();
      if (!url) return;
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        doInstall(await res.text());
      } catch (e) { toast('Не удалось скачать: ' + e.message); }
    };
    $('a-install').onclick = () => doInstall($('a-code').value);
    $('a-template').onclick = () => { $('a-code').value = TEMPLATE; };
  } else {
    box.innerHTML = loadedAddons.length ? loadedAddons.map(a => `<div class="addon"><div class="info"><div class="name">${esc(a.name)}</div><div class="desc">${a.source === 'server' ? 'с сервера' : 'локальный'}</div></div></div>`).join('')
      : '<p>Сейчас не загружено ни одного аддона.</p>';
  }
}

// ---------- Chat & messages ----------
export function openChat() {
  document.exitPointerLock?.();
  $('chatbox').classList.remove('hidden');
  $('chatinput').focus();
}
export function closeChat() {
  $('chatbox').classList.add('hidden');
  $('chatinput').blur();
}
function sendChat() {
  const t = $('chatinput').value.trim();
  $('chatinput').value = '';
  closeChat();
  if (t) H.sendChat(t);
}
export function chatLine(name, text, color, sys) {
  const log = $('chatlog');
  const d = document.createElement('div');
  if (sys) { d.className = 'sys'; d.textContent = text; } else {
    d.innerHTML = `<b style="color:${esc(color || '#fff')}">${esc(name)}:</b> ${esc(text)}`;
  }
  log.appendChild(d);
  while (log.children.length > 8) log.firstChild.remove();
}

let toastTimer = 0;
export function toast(t) {
  const el = $('toast');
  el.textContent = t;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}
let noticeTimer = 0;
export function notice(t) {
  const el = $('notice');
  el.textContent = t;
  el.classList.add('show');
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => el.classList.remove('show'), 1400);
}

// ---------- HUD ----------
export function setRoomInfo(t) { $('roominfo').textContent = t; }
export function setWeaponBar(weapons, cur) {
  const bar = $('weaponbar');
  bar.innerHTML = weapons.map((w, i) => `<button class="${w.id === cur ? 'active' : ''}" data-w="${i}">${isTouch ? '' : (i + 1) + '. '}${esc(w.name)}</button>`).join('');
  bar.querySelectorAll('button').forEach(b => { b.onclick = () => H.selectWeapon(Number(b.dataset.w)); });
}
export function setToolInfo(html) { $('toolinfo').innerHTML = html; $('toolinfo').classList.toggle('hidden', !html); }
export function setTouchMode(noclip, weapon) {
  $('b-down').classList.toggle('hidden', !noclip);
  $('b-jump').textContent = noclip ? 'Вверх' : 'Прыжок';
  $('b-noclip').classList.toggle('on', noclip);
  for (const id of ['b-rot', 'b-far', 'b-near']) $(id).classList.toggle('hidden', weapon !== 'physgun');
}
export function setRunButton(on) { $('b-run').classList.toggle('on', on); }
export { esc };
