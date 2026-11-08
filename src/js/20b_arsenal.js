/* ================= arsenal & daily ================= */
// Арсенал: покупка и примерка одежды, головных уборов, скинов оружия и тона кожи с 3D-превью.
let arTab = 'o', arSel = null, arWeapon = 'buran', prevR = null, prevScene = null, prevCam = null, prevAgent = null, prevGun = null, prevLast = 0;
const AR_TABS = [['o', 'arOutfit', OUTFITS], ['h', 'arHat', HATS], ['w', 'arSkin', WSKINS], ['g', 'arGear', null], ['s', 'arLook', null]];
function arCurrent(kind) { return kind === 'w' ? (PROF.equip.w[arWeapon] || 'std') : kind === 's' ? PROF.equip.s : PROF.equip[kind]; }
function previewCos() {
  const c = myCos();
  if (arTab === 'g' && arSel && GEAR_ITEMS[arSel]) { const g = gearProf(); c.g = { ...c.g, [GEAR_ITEMS[arSel].slot]: [arSel, g.lvl[arSel] || 1] }; return c; }
  if (arSel != null) { if (arTab === 'w') c.w[arWeapon] = arSel; else c[arTab] = arSel; }
  return c;
}
function initPreview() {
  if (prevR) return;
  try { prevR = new THREE.WebGLRenderer({ canvas: $('prevc'), antialias: true, alpha: true }); } catch (e) { return; }
  prevR.setPixelRatio(Math.min(devicePixelRatio, 2)); prevR.toneMapping = THREE.ACESFilmicToneMapping; prevR.outputColorSpace = THREE.SRGBColorSpace;
  prevScene = new THREE.Scene();
  prevScene.add(new THREE.HemisphereLight(0xdfe6ff, 0x3a2c20, 1.6));
  const d = new THREE.DirectionalLight(0xffe2c0, 2.4); d.position.set(2, 3, 3); prevScene.add(d);
  const f = new THREE.DirectionalLight(0x9fc4ff, 1.0); f.position.set(-3, 1, -2); prevScene.add(f);
  const floorM = new THREE.Mesh(new THREE.CircleGeometry(0.9, 40), new THREE.MeshStandardMaterial({ color: 0x2a2f3a, roughness: 0.9 }));
  floorM.rotation.x = -Math.PI / 2; prevScene.add(floorM);
  prevCam = new THREE.PerspectiveCamera(32, 300 / 380, 0.05, 20); prevCam.position.set(0, 1.15, 3.9); prevCam.lookAt(0, 0.95, 0);
  const R = makeSoldier(P.team); prevScene.add(R.root);
  prevAgent = { rig: R, team: P.team, pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: Math.PI * 0.85, pitch: 0, alive: true, reloading: 0, crouch: false, isPlayer: false,
    gun: () => ({ id: arWeapon }), height: () => 1.8 };
}
function refreshPreview() {
  if (!prevR) return;
  applyCos(prevAgent, previewCos());
  if (prevGun) { prevScene.remove(prevGun); prevGun = null; }
  const showGun = arTab === 'w';
  prevAgent.rig.root.visible = !showGun;
  // головные уборы и лицо — крупный план головы, одежда — во весь рост
  if (arTab === 'g') { prevCam.position.set(0, 1.2, 2.3); prevCam.lookAt(0, 1.05, 0); }
  else if (arTab === 'h' || arTab === 's') { prevCam.position.set(0, 1.6, 1.75); prevCam.lookAt(0, 1.5, 0); }
  else { prevCam.position.set(0, 1.05, 3.1); prevCam.lookAt(0, 0.92, 0); }
  if (showGun) {
    prevGun = GUNS[arWeapon].clone(); skinGun(prevGun, arSel ?? arCurrent('w'));
    prevGun.scale.setScalar(arWeapon === 'knife' || WEAPONS[arWeapon].cat === 'pistol' ? 4.5 : 2.3); prevGun.position.set(0, 1.0, 0); prevScene.add(prevGun);
  }
}
function previewTick(ts) {
  requestAnimationFrame(previewTick);
  const vis = !$('menu').classList.contains('hidden') && $('scr-arsenal').classList.contains('on');
  if (!vis || !prevR) { prevLast = ts; return; }
  const dt = Math.min(0.05, (ts - prevLast) / 1000); prevLast = ts;
  prevAgent.yaw += dt * 0.6;
  animateSoldier(prevAgent, dt);
  if (prevGun) prevGun.rotation.y += dt * 0.8;
  prevR.render(prevScene, prevCam);
}
requestAnimationFrame(previewTick);
const HAT_ICON = { helmet: '🪖', none: '🙂', beret: '🎨', cap: '🧢', beanie: '🧶', bandana: '🏴‍☠️', panama: '👒', ushanka: '❄️', cowboy: '🤠', foxears: '🦊', tophat: '🎩', crown: '👑' };
function arIcon(kind, id, it) {
  if (kind === 'h') return `<span class="ic emo">${HAT_ICON[id] || '🎩'}</span>`;
  let bg;
  if (kind === 'o') bg = id === 'std' ? `linear-gradient(135deg,#3d4b5c 50%,#5b4632 50%)` : `linear-gradient(135deg,${it.base},${it.cols.join(',')})`;
  else bg = it.tex ? { forest: 'linear-gradient(135deg,#4a5a35,#2c3a24,#6f7a4a)', digital: 'repeating-linear-gradient(90deg,#5c6670 0 6px,#9aa5ae 6px 12px,#4a6a88 12px 18px)', tiger: 'repeating-linear-gradient(110deg,#e07a1e 0 8px,#141414 8px 12px)',
    carbon: 'repeating-linear-gradient(45deg,#141518 0 4px,#2a2c30 4px 8px)', neon: 'linear-gradient(135deg,#101018,#4fe6ff,#101018)', lava: 'linear-gradient(135deg,#1a1210,#ff6a1a,#1a1210)' }[it.tex]
    : id === 'std' ? 'linear-gradient(135deg,#3b3f47,#1d1f23)' : `linear-gradient(135deg,${it.metal[0]},${it.furn[0]})`;
  return `<span class="ic" style="background:${bg}"></span>`;
}
function renderArsenal() {
  initPreview(); updateCoins();
  $('artabs').innerHTML = AR_TABS.map(([k, key]) => `<button class="${k === arTab ? 'sel' : ''}" data-k="${k}">${esc(t(key))}</button>`).join('');
  for (const b of $('artabs').children) b.onclick = () => { arTab = b.dataset.k; arSel = null; renderArsenal(); };
  const ws = $('arweapon'); ws.classList.toggle('hidden', arTab !== 'w');
  if (arTab === 'w') {
    ws.innerHTML = WIDS.map(id => `<option value="${id}" ${id === arWeapon ? 'selected' : ''}>${esc(wName(id))}</option>`).join('');
    ws.onchange = () => { arWeapon = ws.value; arSel = null; renderArsenal(); };
  }
  const g = $('argrid');
  $('argear').classList.toggle('hidden', arTab !== 'g'); $('arbuy2').classList.add('hidden');
  if (arTab === 'g') { renderGearTab(g); refreshPreview(); return; }
  if (arTab === 's') {
    g.innerHTML = SKIN_TONES.map((c, i) => `<div class="arcard ${PROF.equip.s === i ? 'eq' : ''} ${arSel === i ? 'sel' : ''}" data-id="${i}"><span class="tone" style="background:${c}"></span><b>${esc(t('skinTone'))} ${i + 1}</b><small>${esc(t('free'))}</small></div>`).join('');
  } else {
    const cat = AR_TABS.find(x => x[0] === arTab)[2], cur = arCurrent(arTab);
    g.innerHTML = Object.entries(cat).map(([id, it]) => {
      const own = isOwned(arTab, id), eq = cur === id;
      const tag = eq ? t('equipped') : own ? (it.price ? t('owned') : t('free')) : `${COIN} ${it.price}`;
      return `<div class="arcard ${eq ? 'eq' : ''} ${own ? 'own' : ''} ${arSel === id ? 'sel' : ''}" data-id="${id}">${arIcon(arTab, id, it)}<b>${esc(itemN(it))}</b><small>${esc(tag)}</small></div>`;
    }).join('');
  }
  for (const c of g.children) c.onclick = () => { arSel = arTab === 's' ? +c.dataset.id : c.dataset.id; renderArsenal(); };
  // кнопка действия
  const btn = $('arbuy'), sel = arSel ?? arCurrent(arTab);
  let label, can = true;
  if (arTab === 's') { label = PROF.equip.s === sel ? t('equipped') : t('equip'); can = PROF.equip.s !== sel; }
  else {
    const cat = AR_TABS.find(x => x[0] === arTab)[2], it = cat[sel];
    if (arCurrent(arTab) === sel) { label = t('equipped'); can = false; }
    else if (isOwned(arTab, sel)) label = t('equip');
    else { label = t('buyFor', `${COIN} ${it.price}`); can = PROF.coins >= it.price; if (!can) label += ' — ' + t('notEnough'); }
    $('arsel').textContent = itemN(it) + (arTab === 'w' ? ' · ' + wName(arWeapon) : '');
  }
  if (arTab === 's') $('arsel').textContent = t('skinTone') + ' ' + (sel + 1);
  btn.textContent = label; btn.disabled = !can;
  btn.onclick = () => arAction(sel);
  refreshPreview();
}
function arAction(sel) {
  if (arTab === 's') PROF.equip.s = sel;
  else {
    const cat = AR_TABS.find(x => x[0] === arTab)[2], it = cat[sel];
    if (!isOwned(arTab, sel)) { if (PROF.coins < it.price) return; PROF.coins -= it.price; PROF.owned[arTab + ':' + sel] = true; uiSound('button3'); }
    if (arTab === 'w') PROF.equip.w[arWeapon] = sel; else PROF.equip[arTab] = sel;
  }
  arSel = null; saveProfile(); applyLocalLook(); renderArsenal();
}
/* --- броня: покупка, улучшение, надеть и снять --- */
const fmtStat = (k, v) => k === 'absorb' || k === 'mob' ? Math.round(v * 100) + '%' : k === 'weight' ? v.toFixed(1) + ' ' + t('kg') : k === 'cls' ? Math.floor(v) : Math.round(v);
function gearRows(id, lvl, cmp) {
  // cmp: [id, lvl] для сравнения (надетое или следующий уровень); для массы и подвижности лучше меньше
  const it = GEAR_ITEMS[id], rows = [['cls', 'gCls'], ['absorb', 'gAbs'], ['dur', 'gDur'], ['weight', 'gWeight'], ['mob', 'gMob']];
  return rows.map(([k, lab]) => {
    const v = gStat(it, k, lvl); let d = '';
    if (cmp && GEAR_ITEMS[cmp[0]]) {
      const c = gStat(GEAR_ITEMS[cmp[0]], k, cmp[1]), diff = v - c, better = (k === 'weight' || k === 'mob') ? diff < 0 : diff > 0;
      if (Math.abs(diff) > 1e-6) d = ` <span class="${better ? 'up' : 'down'}">(${diff > 0 ? '+' : '−'}${fmtStat(k, Math.abs(diff))})</span>`;
    }
    return `<div class="row"><span>${esc(t(lab))}</span><span>${fmtStat(k, v)}${d}</span></div>`;
  }).join('') + `<div class="row"><span>${esc(t('gZones'))}</span><span>${it.zones.map(z => esc(t('z_' + z))).join(', ')}</span></div>`;
}
function renderGearTab(grid) {
  const G_ = gearProf();
  let html = '';
  for (const slot of GEAR_SLOTS) {
    html += `<div class="argroup">${esc(t('gearSlot_' + slot))}</div>`;
    for (const [id, it] of Object.entries(GEAR_ITEMS).filter(([, it]) => it.slot === slot)) {
      const lvl = G_.lvl[id] || 0, eq = G_.eq[slot] === id;
      const tag = eq ? t('equipped') : lvl ? t('gLvl', lvl) : `${COIN} ${it.price}`;
      html += `<div class="arcard ${eq ? 'eq' : ''} ${lvl ? 'own' : ''} ${arSel === id ? 'sel' : ''}" data-id="${id}"><span class="ic emo">${{ helmet: '⛑️', vest: '🦺', plates: '🛡️', arms: '💪', legs: '🦵', collar: '🧣' }[slot]}</span><b>${esc(gearItemName(id))}</b><span class="lv">${[1, 2, 3, 4, 5].map(n => `<i class="${n <= lvl ? 'on' : ''}"></i>`).join('')}</span><small>${esc(tag)}</small></div>`;
    }
  }
  grid.innerHTML = html;
  for (const c of grid.querySelectorAll('.arcard')) c.onclick = () => { arSel = c.dataset.id; renderArsenal(); };
  const id = arSel || G_.eq.vest || Object.keys(GEAR_ITEMS)[0], it = GEAR_ITEMS[id], slot = it.slot, lvl = G_.lvl[id] || 0, eqId = G_.eq[slot];
  arSel = id;
  const cfg = myGearCfg();
  $('arsel').textContent = gearItemName(id) + (lvl ? ' · ' + t('gLvl', lvl) : '');
  // сравнение: с надетым в этом слоте, а для надетого предмета — со следующим уровнем
  let body = '';
  if (eqId === id && lvl < GEAR_MAX_LVL) body = `<b>${esc(t('gNext'))}</b>` + gearRows(id, lvl + 1, [id, lvl]);
  else body = (eqId && eqId !== id ? `<b>${esc(t('gCompare'))}</b>` : '') + gearRows(id, Math.max(1, lvl), eqId && eqId !== id ? [eqId, G_.lvl[eqId]] : null);
  body += `<div class="note">${esc(t('gTotal', gearWeight(cfg).toFixed(1), Math.round(gearMobility({ gearCfg: cfg }) * 100)))}</div><div class="note">${esc(t('gHint'))}</div>`;
  $('argear').innerHTML = body;
  const btn = $('arbuy'), b2 = $('arbuy2');
  if (!lvl) { btn.textContent = t('buyFor', `${COIN} ${it.price}`) + (PROF.coins < it.price ? ' — ' + t('notEnough') : ''); btn.disabled = PROF.coins < it.price; btn.onclick = () => gearAction('buy', id); }
  else if (eqId !== id) { btn.textContent = t('equip'); btn.disabled = false; btn.onclick = () => gearAction('equip', id); }
  else if (lvl < GEAR_MAX_LVL) { const cost = GEAR_UP_COST[lvl + 1]; btn.textContent = t('gUpgrade', lvl + 1, `${COIN} ${cost}`) + (PROF.coins < cost ? ' — ' + t('notEnough') : ''); btn.disabled = PROF.coins < cost; btn.onclick = () => gearAction('up', id); }
  else { btn.textContent = t('gMax'); btn.disabled = true; }
  b2.classList.toggle('hidden', !lvl);
  if (lvl) {
    if (eqId === id) { b2.textContent = t('gRemove'); b2.disabled = false; b2.onclick = () => gearAction('off', id); }
    else if (lvl < GEAR_MAX_LVL) { const cost = GEAR_UP_COST[lvl + 1]; b2.textContent = t('gUpgrade', lvl + 1, `${COIN} ${cost}`); b2.disabled = PROF.coins < cost; b2.onclick = () => gearAction('up', id); }
    else b2.classList.add('hidden');
  }
}
function gearAction(act, id) {
  const G_ = gearProf(), it = GEAR_ITEMS[id];
  if (act === 'buy') { if (PROF.coins < it.price || G_.lvl[id]) return; PROF.coins -= it.price; G_.lvl[id] = 1; G_.eq[it.slot] = id; uiSound('button3'); }
  else if (act === 'equip') { if (!G_.lvl[id]) return; G_.eq[it.slot] = id; }
  else if (act === 'off') G_.eq[it.slot] = null;
  else if (act === 'up') { const L = G_.lvl[id], cost = GEAR_UP_COST[L + 1]; if (!L || L >= GEAR_MAX_LVL || PROF.coins < cost) return; PROF.coins -= cost; G_.lvl[id] = L + 1; uiSound('button3'); }
  saveProfile(); applyLocalLook(); renderArsenal();
}
/* --- ежедневные подарки --- */
function renderDaily() {
  updateCoins();
  const avail = canClaim(), next = avail ? nextStreak() : PROF.daily.streak;
  $('days').innerHTML = DAILY.map((c, i) => {
    const d = i + 1, done = avail ? d < next : d <= next, cur = avail && d === next;
    return `<div class="day ${done ? 'done' : ''} ${cur ? 'cur' : ''}"><small>${esc(t('day', d))}</small><b>${COIN} ${c}</b>${d === 7 ? '<em>🎁</em>' : ''}${done ? '<i>✓</i>' : ''}</div>`;
  }).join('');
  $('claim').disabled = !avail;
  if (!avail && !$('dailymsg').dataset.keep) $('dailymsg').textContent = t('comeBack');
  $('dailybadge').classList.toggle('hidden', !avail);
}
$('claim').onclick = () => {
  const r = claimDaily(); if (!r) return;
  uiSound('button3');
  coinPop(`+${r.coins} ${COIN} ${t('rwDaily')}`);
  $('dailymsg').textContent = `+${r.coins} ${COIN}` + (r.item ? ' · ' + t('gotItem', r.item) : '');
  $('dailymsg').dataset.keep = '1'; renderDaily();
};
/* --- список серверов и настройки комнаты --- */
$('srvrefresh').onclick = () => { $('srvlist').innerHTML = `<p class="sub">${esc(t('srvSearching'))}</p>`; DIR.lastList = Date.now(); dirFetch(); };
$('srvname').value = SET.srvName || ''; $('srvname').oninput = () => { SET.srvName = $('srvname').value.slice(0, 24); saveSettings(); };
$('srvpub').checked = SET.mpPublic !== false; $('srvpub').onchange = () => { SET.mpPublic = $('srvpub').checked; saveSettings(); };
// перерисовка при открытии экранов
const _showMenu = showMenu;
showMenu = scr => { _showMenu(scr); if (menuScreen === 'arsenal') renderArsenal(); if (menuScreen === 'daily') renderDaily(); if (menuScreen === 'mp') { DIR.lastList = 0; dirTick(); } };
applyLocalLook(); updateCoins(); renderDaily();
