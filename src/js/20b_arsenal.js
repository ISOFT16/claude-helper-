/* ================= arsenal & daily ================= */
// Арсенал: покупка и примерка одежды, головных уборов, скинов оружия и тона кожи с 3D-превью.
let arTab = 'o', arSel = null, arWeapon = 'buran', prevR = null, prevScene = null, prevCam = null, prevAgent = null, prevGun = null, prevLast = 0;
const AR_TABS = [['o', 'arOutfit', OUTFITS], ['h', 'arHat', HATS], ['w', 'arSkin', WSKINS], ['s', 'arLook', null]];
function arCurrent(kind) { return kind === 'w' ? (PROF.equip.w[arWeapon] || 'std') : kind === 's' ? PROF.equip.s : PROF.equip[kind]; }
function previewCos() {
  const c = myCos();
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
  if (arTab === 'h' || arTab === 's') { prevCam.position.set(0, 1.6, 1.75); prevCam.lookAt(0, 1.5, 0); }
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
