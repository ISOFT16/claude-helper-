// Автотесты основных функций. Запуск: cd tests && npm install && npm test (сначала python3 tools/build.py).
// Каждая проверка печатает ✓/✗; код выхода — число проваленных проверок.
const { launch, openGame, startMatch, check, result } = require('./helper');
(async () => {
  const b = await launch();
  console.log('Передвижение: лёжа, лаз, уклонение, захват края');
  {
    const { pg, ctx } = await openGame(b); await startMatch(pg);
    const r = await pg.evaluate(() => {
      const g = window.__game, P = g.P, out = {};
      for (const a of g.agents) if (a !== P) { a.alive = false; a.model.visible = false; a.pos.set(-50, 0, -50); }
      g.G.timer = 999;
      const key = (c, v) => { g.keys[c] = v; }, run = n => { for (let i = 0; i < n; i++) g.step(1); };
      const place = (x, z, yaw) => { P.pos.set(x, 0, z); P.vel.set(0, 0, 0); P.yaw = yaw; P.pitch = 0; P.posture = 0; P.mstate = 'ground'; P.proneK = 0; P.onGround = true; g.setWantProne(false); run(5); };
      place(17, 11.2, 0); g.toggleProne(); run(40); out.prone = P.posture === 2 && P.height() < 0.6;
      g.toggleProne(); run(40); out.stand = P.posture === 0;
      place(17, 11.2, 0); key('KeyW', true); run(60); key('KeyW', false); out.ductBlocks = P.pos.z > 10.2;
      g.toggleProne(); run(40); key('KeyW', true); for (let i = 0; i < 480 && P.pos.z > 9.1; i++) g.step(1); key('KeyW', false); out.crawlUnder = P.pos.z < 10 && P.pos.z > 8;
      g.toggleProne(); run(40); out.noStandUnder = P.posture === 2;
      place(6, 13, 0); P.dodgeCd = 0; const x0 = P.pos.x; key('KeyD', true); g.dash(); let d = 0; for (let i = 0; i < 30 && P.mstate === 'dodge'; i++) { g.step(1); d = P.pos.x - x0; } key('KeyD', false); out.dodge = d;
      place(2.5, 6, 0); P.dodgeCd = 0; out.dodgeWall = g.dodgeTry(-1, 0);
      place(25, 16.6, 0); key('KeyW', true); key('Space', true); const seq = new Set();
      for (let i = 0; i < 120 && g.moveStateName(P) !== 'ClimbFinish'; i++) { if (i === 4) key('Space', false); seq.add(g.moveStateName(P)); g.step(1); }
      key('KeyW', false); run(30); out.climb = [...seq].join(','); out.onTop = Math.abs(P.pos.y - 2.2) < 0.01;
      place(3, 6, Math.PI / 2); key('KeyW', true); key('Space', true); run(60); key('KeyW', false); key('Space', false); run(30); out.wallNoGrab = P.pos.y < 0.01;
      out.badTransition = g.setMove({ mstate: 'hanging' }, 'dodge');
      return out;
    });
    check('лечь и встать', r.prone && r.stand); check('стоя под воздуховод не пройти', r.ductBlocks);
    check('лёжа проползти под воздуховодом', r.crawlUnder); check('под воздуховодом не встать', r.noStandUnder);
    check('уклонение ≈3 м', r.dodge > 2.5 && r.dodge < 3.6, r.dodge.toFixed(2) + ' м'); check('уклонение в стену не выполняется', r.dodgeWall === false);
    check('захват → вис → подъём', /LedgeGrab/.test(r.climb) && /Climbing/.test(r.climb) && r.onTop, r.climb);
    check('стену 4,5 м не захватить', r.wallNoGrab); check('запрещённый переход отклонён', r.badTransition === false);
    check('без ошибок страницы', pg.errs.length === 0, pg.errs[0]); await ctx.close();
  }
  console.log('Броня');
  {
    const { pg, ctx } = await openGame(b);
    const r = await pg.evaluate(() => {
      const g = window.__game, a = g.agents[3];
      const shot = (cfg, zone, w = 'buran', n = 1) => { a.gearCfg = cfg; g.restoreGear(a); let last; for (let i = 0; i < n; i++) last = g.absorbDamage(a, 30, zone, w); return last.dmg; };
      return { none: shot({}, 'torso'), basic: shot({ vest: ['vest_basic', 1] }, 'torso'), legs: shot({ vest: ['vest_basic', 1] }, 'legs'), heavy: shot({ vest: ['vest_heavy', 5], plates: ['plates_ceramic', 5] }, 'torso'), pistol: shot({ vest: ['vest_basic', 1] }, 'torso', 'osa'), worn: shot({ vest: ['vest_basic', 1] }, 'torso', 'buran', 10) };
    });
    check('без брони урон полный', r.none === 30); check('жилет снижает урон по корпусу', r.basic < 30); check('жилет не защищает ноги', r.legs === 30);
    check('тяжёлая броня ур.5 + пластины сильнее', r.heavy < r.basic, r.heavy.toFixed(1)); check('пистолет пробивает хуже винтовки', r.pistol < r.basic);
    check('изношенная броня защищает слабее', r.worn > r.basic, r.worn.toFixed(1)); await ctx.close();
  }
  console.log('Интерфейс: автоогонь скрывает кнопку на телефоне');
  {
    const { pg, ctx } = await openGame(b, { viewport: { width: 780, height: 360 }, touch: true }); await startMatch(pg);
    const r = await pg.evaluate(() => { const g = window.__game; document.getElementById('touch').classList.add('on'); const pos = () => [...document.querySelectorAll('#touch .tb')].filter(e => e.id !== 'tFire').map(e => e.getBoundingClientRect().left).join(); const before = pos(); g.SET.autoFire = true; g.applySettings(); const hidden = getComputedStyle(document.getElementById('tFire')).display === 'none'; const same = before === pos(); g.SET.autoFire = false; g.applySettings(); return { hidden, same, back: getComputedStyle(document.getElementById('tFire')).display !== 'none' }; });
    check('кнопка «Огонь» скрыта', r.hidden); check('другие кнопки на местах', r.same); check('кнопка возвращается', r.back); await ctx.close();
  }
  console.log('Полный матч с ботами, память, объекты сцены');
  {
    const { pg, ctx } = await openGame(b); await startMatch(pg);
    const snap = () => pg.evaluate(() => { const g = window.__game; let n = 0; g.agents[0].model.parent.traverse(() => n++); return { heap: performance.memory.usedJSHeapSize / 1048576, nodes: n }; });
    const m0 = await snap();
    const r = await pg.evaluate(() => { const g = window.__game; for (let s = 0; s < 60 * 60 * 14 && g.G.state !== 'over'; s++) g.step(1); return { state: g.G.state, rounds: g.G.round }; });
    const m1 = await snap();
    check('матч доигран до конца', r.state === 'over', r.rounds + ' раундов');
    check('объекты сцены не растут без предела', m1.nodes < m0.nodes * 1.3, m0.nodes + ' → ' + m1.nodes);
    check('без ошибок страницы', pg.errs.length === 0, pg.errs[0]); await ctx.close();
  }
  console.log('Мир v10: карты, этажи, лестницы, навигация ботов');
  {
    const { pg, ctx } = await openGame(b);
    const r = await pg.evaluate(() => {
      const g = window.__game, out = {};
      for (const id of ['city', 'factory', 'base', 'village']) {
        g.loadWorld(id); const N = g.WORLD.nav, sp = g.WORLD.spawns[0][0], from = g.nearestNode({ x: sp[0], y: 0, z: sp[1] });
        const seen = new Set([from.i]), q = [from.i]; while (q.length) { const c = q.pop(); for (const n of N.nodes[c].nb) if (!seen.has(n)) { seen.add(n); q.push(n); } }
        let up = 0, under = 0; for (const i of seen) { if (N.nodes[i].y > 5.5) up++; if (N.nodes[i].y < -1) under++; }
        out[id] = { up, under, boxes: g.WORLD.boxes.length };
      }
      return out;
    });
    for (const id of ['city', 'factory', 'base', 'village']) check(`карта «${id}»: 3-й этаж/крыши достижимы со спавна`, r[id].up > 50, r[id].up + ' узлов выше 5,5 м');
    check('квартал: подземный переход достижим', r.city.under > 100, r.city.under + ' узлов');
    check('база: бункер достижим', r.base.under > 100, r.base.under + ' узлов');
    await ctx.close();
  }
  {
    const { pg, ctx } = await openGame(b, { settings: { map: 'city' } }); await startMatch(pg);
    const r = await pg.evaluate(() => {
      const g = window.__game, P = g.P, out = {};
      for (const a of g.agents) if (a !== P) { a.alive = false; a.model.visible = false; a.pos.set(90, 0, 70); } g.G.timer = 999;
      const run = (n, k) => { g.keys[k] = true; for (let i = 0; i < n; i++) g.step(1); g.keys[k] = false; };
      const place = (x, y, z, yaw) => { P.pos.set(x, y, z); P.vel.set(0, 0, 0); P.yaw = yaw; P.onGround = true; P.mstate = 'ground'; P.stam = 100; g.step(2); };
      place(5.2, 0, 5.1, -Math.PI / 2); run(150, 'KeyW'); out.floor2 = P.pos.y;
      place(10.9, 3.2, 6.5, Math.PI / 2); run(150, 'KeyW'); out.floor3 = P.pos.y;
      place(31.4, 0, 29.3, Math.PI); run(180, 'KeyW'); out.under = P.pos.y;
      // бот поднимается на крышу по лестницам
      const bot = g.agents.find(a => a.net === 'bot'); bot.alive = true; bot.model.visible = true; bot.pos.set(11, 0, 17); bot.ai = { ...bot.ai, wps: [g.WORLD.nav.nodes.find(n => n.y > 9 && n.x > 6 && n.x < 15 && n.z > 6 && n.z < 13)], path: null, invest: null, target: null, visible: false };
      let maxY = 0; for (let i = 0; i < 60 * 30; i++) { g.step(1); maxY = Math.max(maxY, bot.pos.y); } out.botRoof = maxY;
      // баллистика: пробитие и стекло
      const W = g.WEAPONS, mk = (cat) => g.BALLISTICS[cat];
      const glass = g.WORLD.boxes.find(x => x.glass && x.alive);
      const c = { x: (glass.x0 + glass.x1) / 2, y: (glass.y0 + glass.y1) / 2, z: (glass.z0 + glass.z1) / 2 }, thinX = glass.x1 - glass.x0 < 0.3;
      const o = new g.THREE.Vector3(c.x - (thinX ? 4 : 0), c.y, c.z - (thinX ? 0 : 4)), d = new g.THREE.Vector3(thinX ? 1 : 0, 0, thinX ? 0 : 1);
      const tr = g.traceBullet(o, d, mk('rifle'), P, W.buran); out.glassBroken = !glass.alive; out.passedGlass = !tr.world || tr.end.distanceTo(o) > 4.2;
      // падение пули: пистолет на 60 м ниже, чем винтовка
      const o2 = new g.THREE.Vector3(10, 1.6, 36), d2 = new g.THREE.Vector3(1, 0, 0);
      const p1 = g.traceBullet(o2, d2, mk('pistol'), P, W.osa), p2 = g.traceBullet(o2, d2, mk('rifle'), P, W.buran);
      out.drop = [+p1.end.y.toFixed(2), +p2.end.y.toFixed(2)];
      // отдача: тяжёлое оружие даёт больший импульс, чем пистолет
      out.recoil = [g.recoilOf(W.osa).vis, g.recoilOf(W.kobra).vis, g.recoilOf(W.buran).vis, g.recoilOf(W.garpun).vis];
      // выносливость: спринт тратит, уклонение стоит выносливости, перекат из приседа дальше
      place(60, 0, 36, -Math.PI / 2); g.keys.ShiftLeft = true; run(120, 'KeyW'); g.keys.ShiftLeft = false; out.stamAfterSprint = P.stam;
      place(60, 0, 34, 0); P.stam = 100; P.dodgeCd = 0; const x0 = P.pos.x; g.dodge(P, 1, 0); for (let i = 0; i < 40; i++) g.step(1); out.dodgeCost = 100 - P.stam; out.dodgeDist = P.pos.x - x0;
      place(60, 0, 32, 0); P.stam = 100; P.dodgeCd = 0; P.posture = 1; const x1 = P.pos.x; g.dodge(P, 1, 0); out.roll = P.roll; for (let i = 0; i < 50; i++) g.step(1); out.rollDist = P.pos.x - x1;
      return out;
    });
    check('игрок поднимается на 2-й этаж', Math.abs(r.floor2 - 3.2) < 0.05, r.floor2.toFixed(2) + ' м');
    check('игрок поднимается на 3-й этаж', Math.abs(r.floor3 - 6.4) < 0.05, r.floor3.toFixed(2) + ' м');
    check('спуск в подземный переход', Math.abs(r.under + 3.4) < 0.05, r.under.toFixed(2) + ' м');
    check('бот сам поднимается на крышу', r.botRoof > 9, 'макс. высота ' + r.botRoof.toFixed(1) + ' м');
    check('пуля разбивает стекло и летит дальше', r.glassBroken && r.passedGlass);
    check('пистолетная пуля падает сильнее винтовочной', r.drop[0] < r.drop[1], r.drop.join(' / '));
    check('мощное оружие отдаёт сильнее (Кобра > Оса, Гарпун > Буран)', r.recoil[1] > r.recoil[0] && r.recoil[3] > r.recoil[2], r.recoil.map(v => v.toFixed(2)).join(' / '));
    check('спринт тратит выносливость', r.stamAfterSprint < 80, Math.round(r.stamAfterSprint) + '');
    check('уклонение стоит выносливости', r.dodgeCost > 15, Math.round(r.dodgeCost) + '');
    check('перекат из приседа дальше уклонения', r.roll && r.rollDist > r.dodgeDist, r.rollDist.toFixed(2) + ' > ' + r.dodgeDist.toFixed(2));
    check('без ошибок страницы', pg.errs.length === 0, pg.errs[0]); await ctx.close();
  }
  console.log('Раскладка кнопок');
  {
    const { pg, ctx } = await openGame(b, { viewport: { width: 780, height: 360 }, touch: true });
    const r = await pg.evaluate(async () => {
      const g = window.__game; g.openTouchEditor(); const el = document.getElementById('tJump'), r0 = el.getBoundingClientRect();
      const ev = (type, x, y) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId: 1 }));
      ev('pointerdown', r0.left + 10, r0.top + 10); document.dispatchEvent(new PointerEvent('pointermove', { clientX: r0.left - 90, clientY: r0.top - 40, pointerId: 1 })); document.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1 }));
      const s = document.getElementById('tlsize'); s.value = '1.4'; s.oninput();
      document.getElementById('tldone').click();
      const saved = JSON.parse(localStorage.getItem('perehvat-settings')).touchLayout.tJump, r1 = el.getBoundingClientRect();
      return { moved: Math.round(r0.left - r1.left), size: saved.s };
    });
    check('кнопку можно перетащить', r.moved > 60, r.moved + ' px'); check('размер кнопки сохраняется', r.size === 1.4);
    await ctx.close();
  }
  await b.close();
  const f = result(); console.log(f ? `ПРОВАЛЕНО: ${f}` : 'Все проверки пройдены'); process.exit(f);
})();
