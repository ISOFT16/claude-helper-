// Замер производительности на одной и той же сцене (спавн, начало раунда) для пресетов.
// Рендер программный (SwiftShader): абсолютные мс не равны реальным устройствам — сравнивайте версии между собой.
// Запуск: npm run perf
const { launch, openGame, startMatch } = require('./helper');
const MAPID = process.env.MAP || 'node', ONLY = (process.env.PRESETS || 'low,high,ultra').split(',');
const CASES = {
  low: { preset: 'low', renderScale: 0.75, shadows: 0, charShadows: false, reflections: false, drawDist: 0, effects: 0, grading: false, bloom: false, ao: false },
  high: { preset: 'high', renderScale: 1, shadows: 2, charShadows: true, reflections: true, drawDist: 1, effects: 1, grading: true, bloom: true, ao: false },
  ultra: { preset: 'ultra', renderScale: 1.25, shadows: 4, charShadows: true, reflections: true, drawDist: 2, effects: 1, grading: true, bloom: true, ao: true, antialias: true },
};
(async () => {
  const b = await launch(), out = {};
  for (const [k, s] of Object.entries(CASES)) {
    if (!ONLY.includes(k)) continue;
    const { pg, ctx } = await openGame(b, { settings: { ...s, autoQuality: false, map: MAPID } }); await startMatch(pg);
    await pg.waitForTimeout(4000); // прогрев: компиляция шейдеров и загрузка текстур не попадают в замер
    out[k] = await pg.evaluate(() => new Promise(res => {
      const g = window.__game; g.P.yaw = -Math.PI / 2; g.renderer.info.autoReset = false; g.renderer.info.reset();
      const ft = []; let prev = performance.now(), t0 = prev, calls = 0, tris = 0;
      const logicT = performance.now(); g.step(120); const logic = (performance.now() - logicT) / 120;
      function f(ts) { ft.push(ts - prev); prev = ts; calls = Math.max(calls, g.renderer.info.render.calls); tris = Math.max(tris, g.renderer.info.render.triangles); g.renderer.info.reset();
        if (ts - t0 < 6000) requestAnimationFrame(f); else { ft.shift(); const s = [...ft].sort((a, b) => a - b), avg = ft.reduce((a, b) => a + b, 0) / ft.length;
          res({ frames: ft.length, avgFrameMs: +avg.toFixed(1), p99FrameMs: +s[Math.floor(s.length * 0.99)].toFixed(1), drawCalls: calls, triangles: tris, logicMsPerStep: +logic.toFixed(3), heapMB: +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) }); } }
      requestAnimationFrame(f);
    }));
    console.log(MAPID, k, JSON.stringify(out[k])); await ctx.close();
  }
  await b.close();
})();
