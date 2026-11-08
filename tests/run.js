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
  await b.close();
  const f = result(); console.log(f ? `ПРОВАЛЕНО: ${f}` : 'Все проверки пройдены'); process.exit(f);
})();
