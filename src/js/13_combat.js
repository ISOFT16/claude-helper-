/* ================= combat ================= */
const ZONES = ['head', 'torso', 'arms', 'legs'], _o2 = new THREE.Vector3();
const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3(), _m = new THREE.Vector3();
function damage(victim, amount, attacker, head, weaponId, fromPos, zone) {
  if (!victim.alive) return;
  // разминка: урона нет, но попадания видны
  if (G.state === 'lobby') {
    if (attacker === P) { hitMarker(head, false); hitSound(head, victim.armor > 0, victim.pos); }
    else if (attacker && attacker.net === 'remote') netEvent({ k: 'hm', i: idxOf(attacker), h: head ? 1 : 0, x: 0 });
    return;
  }
  // броня по зоне попадания: что закрывает зону и насколько она цела
  zone = zone || (head ? 'head' : 'torso');
  const ab = absorbDamage(victim, amount, zone, weaponId);
  let d = ab.dmg; const helmet = ab.armored;
  victim.hp -= d; victim.lastHitBy = attacker; if (victim.rig) victim.rig.flinch = 1;
  if (victim === P) {
    flashDamage(fromPos); hitSound(false, false, null);
  } else if (victim.net === 'remote') {
    netEvent({ k: 'hurt', i: idxOf(victim), f: fromPos ? [r2(fromPos.x), r2(fromPos.z)] : null });
  } else if (victim.net === 'bot' && attacker && attacker.alive) {
    const ai = victim.ai; ai.invest = attacker.pos.clone(); ai.investUntil = now + 4;
    // боты иногда уходят из-под огня рывком в сторону, а при малом здоровье — отходят в укрытие
    if (victim.hp - d > 0 && Math.random() < 0.25 + 0.1 * (SET.diff | 0)) dodge(victim, Math.random() < 0.5 ? -1 : 1, 0);
    if (victim.hp - d > 0 && victim.hp - d < G.maxHp * 0.35 && !ai.cover && Math.random() < 0.6) { ai.cover = findCover(victim, attacker.pos); if (ai.cover) ai.coverT = now + 4; }
    if (!ai.target) { ai.target = attacker; ai.seen = Math.max(ai.seen, ai.react * 0.5); }
  }
  if (attacker === P && victim !== P) { hitMarker(head, victim.hp <= 0); hitSound(head, helmet, victim.pos); dmgNumber(victim, d, head); }
  else if (attacker && attacker.net === 'remote') netEvent({ k: 'hm', i: idxOf(attacker), h: head ? 1 : 0, x: victim.hp <= 0 ? 1 : 0 });
  if (victim.hp <= 0) kill(victim, attacker, weaponId, head);
}
function kill(v, k, wid, head) {
  v.alive = false; v.hp = 0; v.deaths++; v.vel.set(0, 0, 0);
  if (v === P) { $('scope').classList.add('hidden'); P.scoped = false; }
  if (k && k !== v) { k.kills++; k.money = Math.min(MAX_MONEY, k.money + (WEAPONS[wid]?.kill ?? 300)); }
  if (k === P && v !== P && G.state !== 'lobby') { PROF.stats.kills++; earn(10, t('rwKill')); }
  if (v.rig) {
    v.rig.deadT = 0; v.rig.fallDir = 1;
    if (k && k !== v) v.rig.fallDir = ((k.pos.x - v.pos.x) * -Math.sin(v.yaw) + (k.pos.z - v.pos.z) * -Math.cos(v.yaw)) > 0 ? 1 : -1;
  }
  addFeed(k, v, wid, head);
  netEvent({ k: 'f', ki: k ? idxOf(k) : -1, vi: idxOf(v), w: wid, h: head ? 1 : 0 });
  checkElimination();
}
function addFeed(k, v, wid, head) {
  if (!SET.killfeed) return;
  const el = document.createElement('div');
  const wn = wid === 'grenade' ? t('nadeShort') : wName(wid);
  el.innerHTML = `<span class="c${k?.team ?? 0}">${esc(k?.name ?? '?')}</span> ⟶ ${esc(wn)}${head ? ' ◎' : ''} ⟶ <span class="c${v.team}">${esc(v.name)}</span>`;
  if (k === P || v === P) el.className = 'me';
  const f = $('feed'); f.prepend(el); while (f.children.length > 6) f.lastChild.remove();
  setTimeout(() => el.remove(), 7000);
}
function muzzleWorld(a, out) {
  if (a === P && a.isPlayer) { vmRoot.updateMatrixWorld(true); return vmGuns[a.gun().id].p.muzzle.getWorldPosition(out).applyMatrix4(camera.matrixWorld); }
  if (a.rig.parts) return a.rig.parts.muzzle.getWorldPosition(out);
  return out.set(a.pos.x, a.pos.y + 1.3, a.pos.z);
}
// Баллистика (игровая модель): скорость пули и эффективная гравитация по классу оружия.
// Траектория считается отрезками; тонкие лёгкие материалы (стекло, дерево, штукатурка, листовой металл) пробиваются
// с потерей урона, толстые (бетон, кирпич, камень) — нет. Стекло при попадании разбивается.
const BALLISTICS = {
  pistol: { v: 360, g: 26, pen: 1 }, smg: { v: 400, g: 22, pen: 1 }, shotgun: { v: 400, g: 22, pen: 0 },
  rifle: { v: 880, g: 14, pen: 2 }, sniper: { v: 950, g: 12, pen: 3 }, mg: { v: 820, g: 14, pen: 2 },
};
const GLASS_LOCAL = [], PENDING_HITS = [], _v7 = new THREE.Vector3(), _bp = new THREE.Vector3(), _bd = new THREE.Vector3();
function traceBullet(o, dir, BV, shooter, W) {
  const p = _bp.copy(o), vel = _bd.copy(dir).multiplyScalar(BV.v), skip = new Set();
  let k = 1, t = 0, pens = BV.pen, out = null;
  for (let seg = 0; seg < 30 && t < 0.6; seg++) {
    const dt = 6 / BV.v; // отрезки по ~6 м
    const nx = vel.x * dt, ny = vel.y * dt - 0.5 * BV.g * dt * dt, nz = vel.z * dt, L = Math.hypot(nx, ny, nz), dx = nx / L, dy = ny / L, dz = nz / L;
    const w = rayWorld(p.x, p.y, p.z, dx, dy, dz, L, skip);
    let tw = w.hit ? w.t : L, victim = null, head = false;
    for (const b of agents) { if (!b.alive || b === shooter || b.team === shooter.team) continue; if (rayAgent(p.x, p.y, p.z, dx, dy, dz, b) && RA.t < tw) { tw = RA.t; victim = b; head = RA.head; } }
    if (victim) { out = { end: new THREE.Vector3(p.x + dx * tw, p.y + dy * tw, p.z + dz * tw), victim, head, n: [0, 0, 0], world: false, k, t: t + tw / BV.v }; break; }
    if (w.hit) {
      const hp = new THREE.Vector3(p.x + dx * tw, p.y + dy * tw, p.z + dz * tw), box = w.box, wn = [w.nx, w.ny, w.nz];
      addDecal(hp, wn[0], wn[1], wn[2]);
      const mi = box ? MAT_INFO[box.m] : null, thin = box && Math.min(box.x1 - box.x0, box.y1 - box.y0, box.z1 - box.z0) <= 0.35;
      if (box && box.glass) { breakGlass(box, hp); skip.add(box); k *= 0.9; p.copy(hp).addScaledVector(_v7.set(dx, dy, dz), 0.01); t += tw / BV.v; vel.y -= BV.g * (tw / BV.v); continue; }
      if (box && mi && thin && pens > 0 && mi.pen > 0.2) { pens--; k *= mi.pen; skip.add(box); p.copy(hp).addScaledVector(_v7.set(dx, dy, dz), 0.02); t += tw / BV.v; vel.y -= BV.g * (tw / BV.v); continue; }
      out = { end: hp, victim: null, head: false, n: wn, world: true, k, t: t + tw / BV.v }; break;
    }
    p.set(p.x + nx, p.y + ny, p.z + nz); vel.y -= BV.g * dt; t += dt;
  }
  return out || { end: p.clone(), victim: null, head: false, n: [0, 0, 0], world: false, k, t };
}
// параметры отдачи из характеристик оружия: мощность выстрела против массы оружия
const RECOIL_MASS = { pistol: 1.1, smg: 2.8, shotgun: 3.4, rifle: 3.6, sniper: 5.5, mg: 9, knife: 1 };
const _recoilCache = {};
function recoilOf(W) {
  const id = W.n[1]; if (_recoilCache[id]) return _recoilCache[id];
  const power = W.dmg * (W.pellets || 1), mass = RECOIL_MASS[W.cat] || 3, rateK = W.auto ? clamp(0.09 / W.rate, 0.7, 1.6) : 1;
  const base = W.recoil, r = {
    v: base, h: base * 0.32 * rateK, climb: W.auto ? 0.045 * rateK : 0.02,
    drift: (W.cat === 'mg' || W.cat === 'rifle' ? 0.08 : 0.04) * base * (id.length % 2 ? 1 : -1), seed: id.length * 1.7,
    recover: clamp(9 / Math.sqrt(mass), 3, 9), vis: clamp(0.35 + power / 40 - mass * 0.06, 0.5, 2.4),
  };
  return (_recoilCache[id] = r);
}
function fire(a) {
  const g = a.gun(), W = WEAPONS[g.id];
  if (a.fireCd > 0 || a.reloading > 0 || a.switchT > 0) return false;
  if (W.melee) return melee(a, W);
  if (g.mag <= 0) { a.burstLeft = 0; if (a.isPlayer) sfxAct('empty'); startReload(a); a.fireCd = 0.2; return false; }
  g.mag--; a.fireCd = W.rate;
  if (W.burst) { a.burstLeft = a.burstLeft > 0 ? a.burstLeft - 1 : W.burst - 1; a.fireCd = a.burstLeft > 0 ? W.burstRate : W.rate; }
  const eye = a.eyePos(_e);
  const moving = Math.hypot(a.vel.x, a.vel.z) > 1.5 || !a.onGround;
  let spread = W.spread + a.spreadAcc + (moving ? W.moveSpread : 0);
  if (W.scope) spread = (a.scoped ? W.scopeSpread : W.spread + (W.cat === 'sniper' ? 0 : a.spreadAcc)) + (moving ? W.moveSpread : 0);
  spread *= POSTURE_SPREAD[a.posture || 0];
  if (a.blindT > now) spread += 0.05;
  const yaw = a.yaw + (a.isPlayer ? a.punchY : 0), pitch = a.pitch + (a.isPlayer ? a.punchP : 0);
  a.forward(_d, yaw, pitch);
  _r.set(Math.cos(yaw), 0, -Math.sin(yaw)); _u.crossVectors(_r, _d);
  if (!a.isPlayer) { const err = a.ai.err || 0.03; _d.addScaledVector(_r, gauss() * err).addScaledVector(_u, gauss() * err).normalize(); }
  const muz = muzzleWorld(a, _m);
  const n = W.pellets || 1, ends = [], hits = []; let whizzed = false;
  const netClient = NET.mode === 'client' && a === P;
  const BV = BALLISTICS[W.cat] || BALLISTICS.rifle;
  for (let i = 0; i < n; i++) {
    const dir = _o.copy(_d).addScaledVector(_r, gauss() * spread * 0.6).addScaledVector(_u, gauss() * spread * 0.6).normalize();
    const tr = traceBullet(eye, dir, BV, a, W);
    const hit = tr.end, victim = tr.victim, vh = tr.head, wn = tr.n;
    if (!whizzed && a !== P && victim !== P) whizzed = nearMiss(eye, _v7.copy(hit).sub(eye).normalize(), eye.distanceTo(hit));
    if (victim) {
      const zone = vh ? 'head' : hitZone(victim, hit);
      const dmg = W.dmg * (vh ? W.head : ZONE_MULT[zone]) * tr.k;
      if (netClient) {
        hits.push([idxOf(victim), dmg, vh ? 1 : 0, ZONES.indexOf(zone)]);
        if (G.state === 'lobby') hitMarker(vh, false); else { hitMarker(vh, false); hitSound(vh, victim.armor > 0, victim.pos); dmgNumber(victim, dmg * (victim.armor > 0 ? 0.55 : 1), vh); }
      } else {
        // пуля летит: урон — по времени подлёта (дальние попадания чуть запаздывают)
        const v_ = victim, eyeC = eye.clone(), wid = g.id;
        if (tr.t < 0.03) damage(v_, dmg, a, vh, wid, eyeC, zone); else PENDING_HITS.push({ at: now + tr.t, f: () => damage(v_, dmg, a, vh, wid, eyeC, zone) });
      }
      sparks(hit, vh ? 8 : 5, true);
    }
    else if (tr.world) { if (i === 0) impactSound(hit); }
    ends.push([r2(hit.x), r2(hit.y), r2(hit.z), victim ? 1 : tr.world ? 0 : 2, wn[0], wn[1], wn[2]]);
    if (i < 3 && !W.quiet) addTracer(muz, hit, a.isPlayer ? 0 : a.team + 1, BV.v);
  }
  // отдача
  if (a.isPlayer) {
    // отдача: импульс от мощности и массы оружия, растёт в длинной очереди, узор отклонения у каждого ствола свой
    const R_ = recoilOf(W), shot = a.burstN = (now - (a.lastShotT || 0) < W.rate * 2.2 ? (a.burstN || 0) + 1 : 0); a.lastShotT = now;
    const climb = 1 + Math.min(shot, 14) * R_.climb, k = POSTURE_RECOIL[a.posture || 0] * (a.mstate === 'air' ? 1.5 : 1);
    a.punchP += R_.v * climb * rand(0.9, 1.1) * k;
    a.punchY += (Math.sin(shot * 0.85 + R_.seed) * R_.h + R_.drift * Math.min(shot, 8)) * k;
    a.recoverK = R_.recover;
    a.spreadAcc = Math.min(a.spreadAcc + W.inc, 0.06); vmOnFire(g.id, W, recoilOf(W).vis);
    if (W.act === 'bolt' && a.scoped) { a.scoped = false; reScopeT = W.rate * 0.9; }
  } else {
    const R = a.rig; R.kick = 1; R.flashT = 0.05; if (R.parts) R.parts.flash.visible = true;
    if (SET.effects && R.parts && W.act !== 'rev' && W.act !== 'break' && a.pos.distanceTo(camera.position) < 25) {
      const ep = R.parts.eject.getWorldPosition(new THREE.Vector3());
      ejectCasing(ep, new THREE.Vector3(Math.cos(a.yaw), 0.2, -Math.sin(a.yaw)), new THREE.Vector3(a.vel.x, 0, a.vel.z), W.cat === 'shotgun');
    }
    if (W.act === 'pump' || W.act === 'bolt') setTimeout(() => sfxAct(W.act, a.pos), W.act === 'pump' ? 250 : 350);
  }
  sfx(W.snd, a.isPlayer ? null : a.pos);
  if (a !== P || !a.isPlayer) muzzleSmoke(muz, W.cat === 'shotgun' || W.cat === 'sniper');
  if (a.isPlayer && !W.quiet) { vmFlashLight.position.copy(muz); vmFlashLight.intensity = 8; }
  if (netClient) netSend({ t: 'shot', w: g.id, e: ends, h: hits, gl: GLASS_LOCAL.splice(0, 8) });
  else netEvent({ k: 'sh', i: idxOf(a), w: g.id, e: ends });
  hearShot(a, W);
  if (g.mag === 0) { a.burstLeft = 0; if (!a.isPlayer) startReload(a); }
  return true;
}
// пуля прошла рядом с игроком: свист и жёлтая стрелка направления
function nearMiss(o, dir, len) {
  if (!P.alive || G.state === 'lobby') return false;
  const cx = P.pos.x - o.x, cy = P.pos.y + P.height() * 0.6 - o.y, cz = P.pos.z - o.z;
  const t = cx * dir.x + cy * dir.y + cz * dir.z; if (t < 1 || t > len) return false;
  const dx = cx - dir.x * t, dy = cy - dir.y * t, dz = cz - dir.z * t;
  if (dx * dx + dy * dy + dz * dz > 1.6) return false;
  flashWhiz(o); tone(rand(1800, 2600), 0.07, 'sawtooth', 0.025); return true;
}
function hearShot(a, W) {
  const range = W && W.quiet ? 9 : 32;
  for (const b of agents) if (b.net === 'bot' && b.alive && b.team !== a.team && !b.ai.target && b.pos.distanceTo(a.pos) < range) { b.ai.invest = a.pos.clone(); b.ai.investUntil = now + 5; }
}
function melee(a, W) {
  a.fireCd = W.rate; sfx('knife', a.isPlayer ? null : a.pos);
  const eye = a.eyePos(_e); a.forward(_d);
  let best = null, bt = W.range, bh = false;
  for (const b of agents) {
    if (!b.alive || b.team === a.team) continue;
    if (rayAgent(eye.x, eye.y, eye.z, _d.x, _d.y, _d.z, b) && RA.t < bt) { bt = RA.t; best = b; bh = RA.head; }
  }
  if (a.isPlayer) vmOnMelee(); else a.rig.kick = 1.5;
  const dmg = W.dmg * (bh ? W.head : 1) * (G.maxHp / 100);
  if (best) {
    if (NET.mode === 'client' && a === P) { hitMarker(bh, false); hitSound(false, false, best.pos); netSend({ t: 'shot', w: 'knife', e: [], h: [[idxOf(best), dmg, bh ? 1 : 0]] }); }
    else damage(best, dmg, a, bh, 'knife', eye.clone());
    sparks(new THREE.Vector3().copy(eye).addScaledVector(_d, bt), 6, true);
  } else if (NET.mode === 'client' && a === P) netSend({ t: 'shot', w: 'knife', e: [], h: [] });
  if (NET.mode !== 'client') netEvent({ k: 'ml', i: idxOf(a) });
  return true;
}
function startReload(a) {
  const g = a.gun(), W = WEAPONS[g.id];
  if (W.melee || a.reloading > 0 || g.mag >= W.mag || g.res <= 0 || busyMove(a)) return;
  a.reloading = W.reload; a.scoped = false; a.burstLeft = 0;
  if (a.isPlayer || a.pos.distanceTo(camera.position) < 20) reloadSound(a, W);
}
function finishReload(a) { const g = a.gun(), W = WEAPONS[g.id]; const n = Math.min(W.mag - g.mag, g.res); g.mag += n; g.res -= n; }
function switchSlot(a, s) {
  if (!a.inv[s] || a.slot === s || busyMove(a)) return;
  a.lastSlot = a.slot; a.slot = s; a.reloading = 0; a.switchT = 0.35; a.scoped = false; a.spreadAcc = 0; a.burstLeft = 0;
  if (a.isPlayer) sfxAct('deploy');
}

/* grenades: he — осколочная, smoke — дымовая, flash — световая */
const grenades = [];
const nadeGeo = new THREE.SphereGeometry(0.09, 10, 8);
const nadeMats = { he: new THREE.MeshStandardMaterial({ color: 0x334, emissive: 0x3fc9ff, emissiveIntensity: 1.2 }), smoke: new THREE.MeshStandardMaterial({ color: 0x777, emissive: 0x444444 }), flash: new THREE.MeshStandardMaterial({ color: 0xddd, emissive: 0xffffaa, emissiveIntensity: 0.8 }) };
const nadeMat = nadeMats.he;
const nadeTotal = a => a.gren ? a.gren.he + a.gren.smoke + a.gren.flash : 0;
function pickNade(a) { if (!a.gren) return null; if (a.gren[a.nadeSel] > 0) return a.nadeSel; return NADES.find(k => a.gren[k] > 0) || null; }
function throwNade(a, kind) {
  kind = kind || pickNade(a);
  if (!kind || !a.gren || a.gren[kind] <= 0 || G.state === 'freeze' || !canUseWeapon(a)) return;
  if (NET.mode === 'client' && a === P) { netSend({ t: 'nade', k: kind }); clickAt(null, 2600, 0.3); return; }
  a.gren[kind]--;
  const m = new THREE.Mesh(nadeGeo, nadeMats[kind]); scene.add(m);
  const eye = a.eyePos(), f = a.forward(new THREE.Vector3(), a.yaw, a.pitch + 0.12);
  grenades.push({ m, kind, pos: eye.addScaledVector(f, 0.4), vel: f.multiplyScalar(16).add(new THREE.Vector3(a.vel.x, 0, a.vel.z).multiplyScalar(0.5)), t: kind === 'flash' ? 1.4 : 1.7, owner: a });
  clickAt(a.isPlayer ? null : a.pos, 2600, 0.3);
}
function updateNades(dt) {
  for (let i = grenades.length - 1; i >= 0; i--) {
    const n = grenades[i]; n.t -= dt; n.vel.y -= GRAV * dt;
    for (const ax of ['x', 'y', 'z']) {
      const old = n.pos[ax]; n.pos[ax] += n.vel[ax] * dt;
      const cx = Math.floor(n.pos.x / CELL), cz = Math.floor(n.pos.z / CELL);
      if (n.pos.y < 0.09 || solidSpan(cx, cz, n.pos.y - 0.06, n.pos.y + 0.06)) {
        n.pos[ax] = old; if (Math.abs(n.vel[ax]) > 2) bounceSound(n.pos);
        n.vel[ax] *= -0.4; if (ax === 'y') { n.vel.x *= 0.7; n.vel.z *= 0.7; }
      }
    }
    n.m.position.copy(n.pos);
    if (n.t <= 0) {
      scene.remove(n.m); grenades.splice(i, 1);
      const c = n.pos.clone(); c.y = Math.max(c.y, 0.3);
      if (n.kind === 'smoke') { spawnSmoke(c); netEvent({ k: 'sm', p: [r2(c.x), r2(c.y), r2(c.z)] }); continue; }
      if (n.kind === 'flash') { flashBang(c); netEvent({ k: 'fl', p: [r2(c.x), r2(c.y), r2(c.z)] }); continue; }
      explosionFx(c); boomSound(c); netEvent({ k: 'x', p: [r2(c.x), r2(c.y), r2(c.z)] });
      if (G.state === 'lobby') continue;
      for (const b of agents) {
        if (!b.alive) continue;
        const chest = new THREE.Vector3(b.pos.x, b.pos.y + b.height() * 0.55, b.pos.z), d = chest.distanceTo(c);
        if (d < 7 && losClear(c, chest)) {
          const dmg = 110 * (G.maxHp / 100) * 0.85 * (1 - d / 7) * (b.team === n.owner.team && b !== n.owner ? 0 : b === n.owner ? 0.5 : 1);
          if (dmg > 0) damage(b, dmg, n.owner, false, 'grenade', c);
          if (b === P) shake = 0.5;
        }
      }
    }
  }
}
// световая: ослепляет тех, кто видит вспышку (боты теряют цель, игрок видит белый экран)
function flashBang(c) {
  flashSound(c); sparks(c, 20);
  const L = new THREE.PointLight(0xffffff, 300, 30); L.position.copy(c); scene.add(L);
  fx.push({ o: L, life: 0.25, max: 0.25, tick(f) { L.intensity = 300 * f; }, done() { scene.remove(L); L.dispose(); } });
  for (const b of agents) {
    if (!b.alive) continue;
    const eye = b.eyePos(new THREE.Vector3()), d = eye.distanceTo(c);
    if (d > 28 || !losClear(c, eye)) continue;
    const fwd = b.forward(new THREE.Vector3()), to = new THREE.Vector3().subVectors(c, eye).normalize();
    const facing = fwd.dot(to) > 0.3 ? 1 : 0.35, amount = (1 - d / 28) * facing, dur = 0.4 + amount * 4;
    b.blindT = now + dur;
    if (b === P) blindPlayer(amount, dur);
  }
}
function blindPlayer(amount, dur) {
  const el = $('flashw'); el.style.transition = 'none'; el.style.opacity = Math.min(1, 0.4 + amount);
  requestAnimationFrame(() => { el.style.transition = `opacity ${dur}s ease-in`; el.style.opacity = 0; });
  ringing(Math.min(4, dur));
}
// дымовая: облако из спрайтов, перекрывает обзор ботам
const SMOKES = [];
const smokeTex = canvasTex(128, 128, (g, w, h) => {
  const gr = g.createRadialGradient(64, 64, 4, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(0.5, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
});
function spawnSmoke(c) {
  smokeSound(c);
  const parts = [];
  for (let i = 0; i < 22; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, color: 0xb9bcc4, transparent: true, opacity: 0, depthWrite: false }));
    s.userData.off = new THREE.Vector3(rand(-1, 1), rand(0, 1), rand(-1, 1)).normalize().multiplyScalar(rand(0.3, 1));
    s.position.copy(c); scene.add(s); parts.push(s);
  }
  SMOKES.push({ c: c.clone(), parts, t: 0, life: 17, r: 0 });
}
function updateSmokes(dt) {
  for (let i = SMOKES.length - 1; i >= 0; i--) {
    const s = SMOKES[i]; s.t += dt;
    s.r = Math.min(3.4, 0.6 + s.t * 2.2);
    const fade = s.t < 1 ? s.t : s.t > s.life - 3 ? Math.max(0, (s.life - s.t) / 3) : 1;
    s.parts.forEach((p, k) => {
      p.position.copy(s.c).addScaledVector(p.userData.off, s.r * 0.85); p.position.y = Math.max(0.5, p.position.y + 0.6);
      const sz = s.r * 1.5 + (k % 3) * 0.4; p.scale.set(sz, sz, 1); p.material.opacity = 0.82 * fade; p.material.rotation += dt * 0.05 * (k % 2 ? 1 : -1);
    });
    if (s.t >= s.life) { for (const p of s.parts) { scene.remove(p); p.material.dispose(); } SMOKES.splice(i, 1); }
  }
}
function clearSmokes() { for (const s of SMOKES) for (const p of s.parts) { scene.remove(p); p.material.dispose(); } SMOKES.length = 0; }
// перекрыт ли отрезок a-b дымом
function smokeBlocks(a, b) {
  for (const s of SMOKES) {
    if (s.t < 0.6 || s.t > s.life - 1.5) continue;
    const ab = _o.subVectors(b, a), len = ab.length(); if (len < 1e-4) continue;
    const tt = clamp(_u.subVectors(s.c, a).dot(ab) / (len * len), 0, 1);
    const px = a.x + ab.x * tt, py = a.y + ab.y * tt, pz = a.z + ab.z * tt;
    if (Math.hypot(px - s.c.x, (py - s.c.y - 0.8) * 0.8, pz - s.c.z) < s.r * 0.85) return true;
  }
  return false;
}
// всплывающие цифры урона
function dmgNumber(v, d, head) {
  if (!SET.dmgNumbers) return;
  const p = new THREE.Vector3(v.pos.x, v.pos.y + 1.9, v.pos.z).project(camera);
  if (p.z > 1) return;
  const el = document.createElement('div'); el.className = 'dnum' + (head ? ' hs' : '');
  el.textContent = Math.round(d);
  el.style.left = ((p.x + 1) / 2 * innerWidth + rand(-12, 12)) + 'px'; el.style.top = ((1 - p.y) / 2 * innerHeight) + 'px';
  $('dnums').appendChild(el); setTimeout(() => el.remove(), 900);
}
