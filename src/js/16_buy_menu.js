/* ================= buy menu ================= */
const canBuyA = a => a.alive && (G.state === 'lobby' || G.state === 'freeze' || (G.state === 'live' && G.liveT < BUY_WINDOW));
const canBuy = () => canBuyA(P);
let buyCat = -1;
function toggleBuy(force) {
  const open = force ?? !G.buyOpen;
  if (open && !canBuy()) { showHint(t('shopClosed'), 1.5); return; }
  G.buyOpen = open; buyCat = -1; $('buy').classList.toggle('hidden', !open); if (open) renderBuy();
}
const itemPrice = id => WEAPONS[id] ? WEAPONS[id].price : GEAR[id].price;
const itemName = id => WEAPONS[id] ? wName(id) : t(GEAR[id].key);
function owns(a, id) {
  const W = WEAPONS[id];
  if (W) return a.inv[W.slot] && a.inv[W.slot].id === id;
  if (id === 'armor') return a.armor >= 100;
  return a.gren && a.gren[id] >= GEAR[id].max;
}
function statBar(v) { return `<i class="bar"><b style="width:${Math.round(clamp(v, 0.05, 1) * 100)}%"></b></i>`; }
function renderBuy() {
  $('buymoney').textContent = t('money', P.money);
  $('buykeys').textContent = t('shopKeys', keyOf('buy'));
  $('buytabs').innerHTML = CATS.map((c, i) => `<button class="${i === buyCat ? 'sel' : ''}" data-c="${i}"><kbd>${i + 1}</kbd> ${esc(t(c[0]))}</button>`).join('');
  for (const b of $('buytabs').children) b.onclick = () => { buyCat = +b.dataset.c; renderBuy(); };
  const list = buyCat >= 0 ? CATS[buyCat][1] : [];
  $('buylist').innerHTML = list.map((id, i) => {
    const W = WEAPONS[id], price = itemPrice(id), own = owns(P, id);
    let info = '';
    if (W) {
      const rpm = Math.round(60 / (W.burst ? (W.rate + W.burstRate * (W.burst - 1)) / W.burst : W.rate));
      info = `<span class="stats"><span>${t('dmg')} ${W.dmg}${W.pellets ? '×' + W.pellets : ''}</span>${statBar(W.dmg * (W.pellets || 1) / 220)}<span>${rpm} ${t('rpm')}</span>${statBar(rpm / 900)}<span>${t('mag')} ${W.mag}</span></span>`;
    }
    return `<div class="item ${price > P.money ? 'no' : ''} ${own ? 'own' : ''}" data-id="${id}"><span><span class="nm"><kbd>${i + 1}</kbd>${esc(itemName(id))}${own ? ` <em>${t('owned')}</em>` : ''}</span>${info}</span><span class="price">$${price}</span></div>`;
  }).join('') || `<p class="sub">${esc(t('shopKeys', keyOf('buy')))}</p>`;
  for (const el of $('buylist').children) if (el.dataset.id) el.onclick = () => buyItem(el.dataset.id);
}
// клавиатура в магазине: цифра — категория, затем цифра — товар, 0/Backspace — назад
function buyKey(code) {
  const m = code.match(/^(?:Digit|Numpad)(\d)$/);
  if (actionOf(code) === 'buy' || code === 'Escape') { toggleBuy(false); return true; }
  if (code === 'Backspace') { buyCat = -1; renderBuy(); return true; }
  if (!m) return false;
  const n = +m[1];
  if (n === 0) { buyCat = -1; renderBuy(); return true; }
  if (buyCat < 0) { if (CATS[n - 1]) { buyCat = n - 1; renderBuy(); uiSound('blip1', 0.5); } return true; }
  const id = CATS[buyCat][1][n - 1]; if (id) buyItem(id);
  return true;
}
function doBuy(a, id) {
  const W = WEAPONS[id], price = W ? W.price : GEAR[id] ? GEAR[id].price : null;
  if (price == null || a.money < price || owns(a, id)) return false;
  if (W) { a.inv[W.slot] = newGun(id); a.slot = W.slot; a.reloading = 0; a.switchT = 0.3; }
  else if (id === 'armor') a.armor = 100;
  else { a.gren = a.gren || freshGren(); a.gren[id]++; a.nadeSel = id; }
  a.money -= price; return true;
}
function buyItem(id) {
  if (!canBuy()) { toggleBuy(false); return; }
  if (NET.mode === 'client') { netSend({ t: 'buy', id }); uiSound('button3'); return; }
  if (doBuy(P, id)) { uiSound('button3'); if (WEAPONS[id]) sfxAct('deploy'); } else uiSound('blip1', 0.4);
  renderBuy();
}
