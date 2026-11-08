/* ================= менеджер производительности ================= */
// Аудит v8 показал, почему «Ультра» тормозила: опции перемножались —
// масштаб 1,5 × плотность экрана телефона (до 2) = рендер в 3 раза плотнее, плюс MSAA ×4 в HDR-буфере,
// плюс AO, который заново рисовал всю сцену (≈ вдвое больше вызовов отрисовки), плюс тени 4096.
// Здесь собраны:
//  • предел итоговой плотности пикселей (на телефоне ≤ 1,5, на ПК ≤ 2);
//  • динамическое разрешение и адаптация качества: если кадр не укладывается в цель,
//    сначала плавно (шагами по 0,1) снижается разрешение, затем временно выключаются AO,
//    свечение и понижаются тени; при запасе — всё возвращается в обратном порядке;
//  • статистика кадров: средний FPS, 1% худших кадров, время кадра.
const PERF = {
  dyn: 1,            // множитель разрешения от адаптации (0,6…1)
  cut: 0,            // сколько дорогих опций временно выключено (0…3)
  hist: [], histI: 0, // последние 240 времён кадра, мс
  lastAdj: 0, badT: 0, goodT: 0,
};
const maxPixelRatio = () => TOUCH ? 1.5 : 2;
function targetPixelRatio() {
  return clamp(Math.min(devicePixelRatio, 2) * SET.renderScale * PERF.dyn, 0.5, maxPixelRatio());
}
function applyPixelRatio() {
  const pr = targetPixelRatio();
  if (Math.abs(renderer.getPixelRatio() - pr) < 0.01) return;
  renderer.setPixelRatio(pr); renderer.setSize(innerWidth, innerHeight);
  if (typeof buildPost === 'function') buildPost();
}
// временные упрощения при нехватке производительности (настройки игрока не меняются)
const effAO = () => SET.ao && PERF.cut < 1, effBloom = () => SET.bloom && PERF.cut < 2;
const effShadows = () => PERF.cut >= 3 ? Math.min(SET.shadows, 1) : SET.shadows;
function perfFrame(frameMs) {
  PERF.hist[PERF.histI++ % 240] = frameMs;
  if (!SET.autoQuality || !G.started || G.paused) return;
  const target = 1000 / (SET.fpsLimit > 0 ? Math.min(SET.fpsLimit, 60) : 60);
  // сглаженное время кадра за последние ~0,5 с
  const n = Math.min(30, PERF.hist.length); let s = 0;
  for (let i = 1; i <= n; i++) s += PERF.hist[(PERF.histI - i + 240) % 240];
  const avg = s / n, now_ = performance.now();
  if (avg > target * 1.2) { PERF.badT += frameMs; PERF.goodT = 0; } else if (avg < target * 1.06) { PERF.goodT += frameMs; PERF.badT = 0; } else { PERF.badT = PERF.goodT = 0; }
  if (now_ - PERF.lastAdj < 2000) return; // не чаще раза в 2 с — без резких скачков картинки
  if (PERF.badT > 1500) {
    PERF.badT = 0;
    if (PERF.dyn > 0.61) { PERF.dyn = Math.max(0.6, +(PERF.dyn - 0.1).toFixed(2)); applyPixelRatio(); PERF.lastAdj = now_; }
    else if (PERF.cut < 3) { PERF.cut++; applyCut(); PERF.lastAdj = now_; }
  } else if (PERF.goodT > 6000) {
    PERF.goodT = 0;
    // возврат в обратном порядке: сначала эффекты, потом разрешение
    if (PERF.cut > 0) { PERF.cut--; applyCut(); PERF.lastAdj = now_; }
    else if (PERF.dyn < 1) { PERF.dyn = Math.min(1, +(PERF.dyn + 0.1).toFixed(2)); applyPixelRatio(); PERF.lastAdj = now_; }
  }
}
function applyCut() { if (typeof applyShadows === 'function') applyShadows(); if (typeof buildPost === 'function') buildPost(); }
function resetPerf() { PERF.dyn = 1; PERF.cut = 0; PERF.badT = PERF.goodT = 0; applyPixelRatio(); applyCut(); }
// статистика: средний FPS, 1% low (по худшему 1% кадров), среднее время кадра
function perfStats() {
  const h = PERF.hist.filter(x => x > 0); if (h.length < 10) return null;
  const s = [...h].sort((a, b) => b - a), avg = h.reduce((a, b) => a + b, 0) / h.length;
  const worst = s.slice(0, Math.max(1, Math.floor(h.length / 100)));
  return { fps: 1000 / avg, low1: 1000 / (worst.reduce((a, b) => a + b, 0) / worst.length), ms: avg };
}
bootMark('06c_perf');
