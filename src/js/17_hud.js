/* ================= HUD ================= */
let centerT = 0, hintT = 0;
function showCenter(html, sub, dur) { $('center').innerHTML = html + (sub ? `<small>${esc(sub)}</small>` : ''); centerT = dur; $('center').style.opacity = 1; }
function showHint(txt, d) { $('hint').textContent = txt; hintT = d; }
let hitT = 0;
function hitMarker(head, killed) {
  if (!SET.hitmarkers) return;
  const h = $('hit'); h.classList.toggle('hs', head || killed); h.style.opacity = 1; hitT = 0.15;
  if (killed) tone(600, 0.12, 'triangle', 0.12, 0.05);
}
let dmgT = 0;
function flashDamage(from) {
  $('dmg').style.opacity = 1; dmgT = 0.25;
  if (from) {
    const dx = from.x - P.pos.x, dz = from.z - P.pos.z;
    const ang = angDiff(P.yaw, Math.atan2(-dx, -dz));
    $('dmgarrow').style.transform = `rotate(${-ang}rad)`; $('dmgi').style.opacity = 1;
  }
}
/* прицел по настройкам */
let XH = {};
function buildCrosshair() {
  const c = $('cross'); c.innerHTML = '';
  const mk = cls => { const i = document.createElement('i'); i.className = cls; c.appendChild(i); return i; };
  const col = SET.xColor, th = SET.xThick, len = SET.xSize, ol = SET.xOutline ? '0 0 0 1px rgba(0,0,0,.8)' : 'none';
  XH = {};
  if (SET.xStyle === 'cross' || SET.xStyle === 't') {
    for (const k of ['l', 'r', 'd'].concat(SET.xStyle === 'cross' ? ['u'] : [])) {
      const e = mk('xl'); const h = k === 'l' || k === 'r';
      Object.assign(e.style, { width: (h ? len : th) + 'px', height: (h ? th : len) + 'px', background: col, boxShadow: ol, marginLeft: (-th / 2) + 'px', marginTop: (-th / 2) + 'px' });
      XH[k] = e;
    }
  } else if (SET.xStyle === 'circle') {
    const e = mk('xc'); Object.assign(e.style, { border: `${th}px solid ${col}`, boxShadow: ol }); XH.c = e;
  }
  if (SET.xCenter || SET.xStyle === 'dot') { const e = mk('xd'); const s = Math.max(2, th + (SET.xStyle === 'dot' ? 2 : 0)); Object.assign(e.style, { width: s + 'px', height: s + 'px', margin: (-s / 2) + 'px 0 0 ' + (-s / 2) + 'px', background: col, boxShadow: ol }); }
}
function placeCrosshair(gap) {
  const len = SET.xSize;
  if (XH.l) XH.l.style.transform = `translate(${-gap - len}px,0)`;
  if (XH.r) XH.r.style.transform = `translate(${gap}px,0)`;
  if (XH.u) XH.u.style.transform = `translate(0,${-gap - len}px)`;
  if (XH.d) XH.d.style.transform = `translate(0,${gap}px)`;
  if (XH.c) { const d = gap * 2 + 6; Object.assign(XH.c.style, { width: d + 'px', height: d + 'px', margin: (-d / 2) + 'px 0 0 ' + (-d / 2) + 'px' }); }
}
let dotsSig = '';
function buildDots() {
  for (const tm of [0, 1]) $('dots' + tm).innerHTML = agents.filter(a => a.team === tm && active(a)).map(() => `<span class="dot d${tm}"></span>`).join('');
}
let fpsShown = 0;
function updateHUD(dt) {
  const sig = agents.map(a => active(a) ? 1 : 0).join('');
  if (sig !== dotsSig) { dotsSig = sig; buildDots(); }
  $('s0').textContent = G.score[0]; $('s1').textContent = G.score[1];
  for (const tm of [0, 1]) {
    const ds = $('dots' + tm).children; agents.filter(a => a.team === tm && active(a)).forEach((a, i) => { if (ds[i]) ds[i].className = `dot ${a.alive ? 'd' + tm : 'dead'}`; });
  }
  const lobby = G.state === 'lobby';
  $('timer').textContent = lobby ? '∞' : (G.state === 'freeze' || G.state === 'live') ? fmtTime(G.timer) : fmtTime(0);
  $('timer').style.color = G.state === 'freeze' ? '#ffd85a' : G.timer < 15 && G.state === 'live' ? '#ff6b6b' : '';
  let zt;
  if (lobby) zt = t('warmup');
  else if (G.state === 'freeze') zt = t('prep');
  else if (G.state === 'live' && G.liveT < ZONE_OPEN) zt = t('zoneIn', Math.ceil(ZONE_OPEN - G.liveT));
  else if (G.state === 'live') zt = zoneText();
  else zt = t('roundOver');
  $('zonetxt').textContent = zt;
  $('zonebars').style.display = lobby ? 'none' : '';
  $('zb0').firstChild.style.width = (G.prog[0] * 100) + '%'; $('zb1').firstChild.style.width = (G.prog[1] * 100) + '%';
  // разминка
  const lb = $('lobby');
  if (lobby) {
    const n = humansCount();
    let txt = G.autoN ? t('warmupNeed', n, G.autoN) : t('warmupManual', n);
    if (G.lobbyT > 0) txt += ' · ' + t('autoStart', Math.ceil(G.lobbyT));
    if (NET.mode === 'host') txt += ' · ' + (TOUCH ? t('hostStartTouch') : t('hostStartKey'));
    lb.textContent = txt; lb.classList.remove('hidden');
  } else lb.classList.add('hidden');
  $('money').textContent = '$' + P.money;
  $('hp').textContent = Math.max(0, Math.ceil(P.hp)); $('hp').style.color = P.hp < G.maxHp * 0.3 ? '#ff6b6b' : '';
  $('ar').textContent = Math.ceil(P.armor);
  $('dashv').textContent = P.dashCd > 0 ? P.dashCd.toFixed(1) + ' ' + t('sec') : t('ready');
  const g = P.gun(), W = WEAPONS[g.id];
  $('wname').textContent = wName(g.id) + (P.reloading > 0 ? ' — ' + t('reloading') : '');
  $('ammo').innerHTML = W.melee ? '—' : `${g.mag} <small>/ ${g.res}</small>`;
  const gr = P.gren || freshGren(), sel = pickNade(P);
  $('nades').innerHTML = NADES.filter(k => gr[k] > 0).map(k => `<span class="${k === sel ? 'nsel' : ''}">${esc(t(k))} ×${gr[k]}</span>`).join(' ');
  // прицел
  const moving = Math.hypot(P.vel.x, P.vel.z) > 1.5 || !P.onGround;
  const sp = W.melee ? 0.01 : (W.scope && !P.scoped && W.cat === 'sniper' ? W.spread : W.spread + P.spreadAcc + (moving ? W.moveSpread : 0)) * (P.crouch ? 0.7 : 1);
  placeCrosshair(SET.xGap + (SET.xDynamic ? sp * 450 : 0));
  $('cross').style.display = P.scoped || !P.alive ? 'none' : '';
  $('scope').classList.toggle('hidden', !P.scoped);
  $('scope').classList.toggle('lite', !!(P.scoped && W.cat !== 'sniper'));
  if (centerT > 0) { centerT -= dt; if (centerT <= 0) $('center').style.opacity = 0; }
  if (hintT > 0) { hintT -= dt; if (hintT <= 0) $('hint').textContent = ''; }
  else if (!P.alive && G.state === 'live') $('hint').textContent = t('spectate', specTarget?.name ?? '—', TOUCH ? t('tapNext') : t('clickNext'));
  else if (G.state === 'freeze' && !G.buyOpen) $('hint').textContent = TOUCH ? t('buyTouch') : t('buyKey', keyOf('buy'));
  else if (!hintT) $('hint').textContent = '';
  if (hitT > 0) { hitT -= dt; if (hitT <= 0) $('hit').style.opacity = 0; }
  if (dmgT > 0) { dmgT -= dt; if (dmgT <= 0) { $('dmg').style.opacity = 0; $('dmgi').style.opacity = 0; } }
  if (G.buyOpen && !canBuy()) toggleBuy(false);
  if (G.buyOpen) $('buymoney').textContent = t('money', P.money);
  if (G.board) renderBoard();
  $('radar').style.display = SET.radar ? '' : 'none';
  if (SET.radar) drawRadar();
  $('feed').style.display = SET.killfeed ? '' : 'none';
  if (TOUCH) {
    $('tDash').textContent = P.dashCd > 0 ? Math.ceil(P.dashCd) + ' ' + t('sec') : t('tDash');
    $('tDash').classList.toggle('off', P.dashCd > 0);
    const nt = nadeTotal(P); $('tNade').textContent = (sel ? t(sel) : t('tNade')) + (nt ? ' ' + nt : ''); $('tNade').classList.toggle('off', !nt);
    $('tScope').style.display = P.alive && P.w().scope ? '' : 'none'; $('tScope').classList.toggle('on', !!P.scoped);
    $('tCrouch').classList.toggle('on', touchCrouch);
    $('tBuy').style.display = canBuy() ? '' : 'none';
    $('tStart').style.display = NET.mode === 'host' && lobby ? '' : 'none';
    $('tChat').style.display = NET.mode !== 'off' ? '' : 'none';
  }
}
function zoneText() {
  const n = [0, 0]; for (const a of agents) if (a.alive && inZone(a.pos)) n[a.team]++;
  if (n[0] && n[1]) return t('zoneContested');
  if (n[0] || n[1]) { const tm = n[0] ? 0 : 1; return t('zoneCap', teamName(tm), Math.floor(G.prog[tm] * 100)); }
  return t('zoneFree');
}
function renderBoard() {
  $('board').classList.remove('hidden');
  const rows = tm => agents.filter(a => a.team === tm && active(a)).sort((a, b) => b.kills - a.kills).map(a =>
    `<tr class="${a.alive ? '' : 'deadrow'} ${a === P ? 'mine' : ''}"><td class="c${tm}">${esc(a.name)}</td><td>${a.kills}</td><td>${a.deaths}</td><td>${a === P ? '$' + a.money : (a.net === 'bot' || (a.net === 'proxy' && !a.human)) ? t('bot') : t('player')}</td><td>${a.alive ? '' : '✖'}</td></tr>`).join('');
  $('boardc').innerHTML = `<h2 style="margin-top:0">${esc(G.state === 'lobby' ? t('warmup') : t('round', G.round))} · ${G.score[0]} : ${G.score[1]}</h2>
    <table><tr><th class="c0">${esc(t('team0n'))}</th><th>${t('kills')}</th><th>${t('deaths')}</th><th>${t('moneyCol')}</th><th></th></tr>${rows(0)}
    <tr><th class="c1">${esc(t('team1n'))}</th><th>${t('kills')}</th><th>${t('deaths')}</th><th></th><th></th></tr>${rows(1)}</table>`;
}
const radar = $('radar'), rctx = radar.getContext('2d'), RS = 5;
const radarBg = document.createElement('canvas'); radarBg.width = MW * RS; radarBg.height = MH * RS;
{
  const g = radarBg.getContext('2d');
  for (let z = 0; z < MH; z++) for (let x = 0; x < MW; x++) {
    const h = heights[z * MW + x];
    if (h) { g.fillStyle = h > 3 ? '#56607a' : h > 2 ? '#3d6a7a' : '#7a5a3a'; g.fillRect(x * RS, z * RS, RS, RS); }
  }
  g.strokeStyle = '#c7a6ff'; g.lineWidth = 1.5; g.strokeRect(zone.x0 / CELL * RS, zone.z0 / CELL * RS, (zone.x1 - zone.x0) / CELL * RS, (zone.z1 - zone.z0) / CELL * RS);
}
function drawRadar() {
  rctx.clearRect(0, 0, radar.width, radar.height);
  rctx.drawImage(radarBg, 0, 0, radar.width, radar.height);
  const sx = radar.width / (MW * CELL), sz = radar.height / (MH * CELL);
  for (const a of agents) {
    if (!a.alive || !active(a)) continue;
    if (a.team !== P.team && a.spot[P.team] <= 0) continue;
    rctx.fillStyle = a === P ? '#fff' : a.team ? '#ff8a3d' : '#4fb3ff';
    rctx.beginPath(); rctx.arc(a.pos.x * sx, a.pos.z * sz, a === P ? 3.5 : 3, 0, 7); rctx.fill();
    if (a === P) { rctx.strokeStyle = '#fff'; rctx.beginPath(); rctx.moveTo(a.pos.x * sx, a.pos.z * sz); rctx.lineTo(a.pos.x * sx - Math.sin(a.yaw) * 9, a.pos.z * sz - Math.cos(a.yaw) * 9); rctx.stroke(); }
  }
}
