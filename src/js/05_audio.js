/* ================= audio ================= */
// Все звуки синтезируются Web Audio API: слоистые выстрелы (щелчок + тело + удар + хвост)
// с ревербом помещения, механика перезарядки, шаги, звон шлема, радио и голос диктора.
let AC = null, master = null, sfxBus = null, revIn = null, revOut = null, noiseBuf = null;
function initAudio() {
  if (AC) { if (AC.state !== 'running') AC.resume(); return; }
  AC = new (window.AudioContext || window.webkitAudioContext)();
  const comp = AC.createDynamicsCompressor(); comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 5; comp.connect(AC.destination);
  master = AC.createGain(); master.connect(comp);
  sfxBus = AC.createGain(); sfxBus.connect(master);
  const conv = AC.createConvolver(); conv.buffer = makeIR(1.6, 3.2);
  revIn = AC.createGain(); revIn.gain.value = 1; revIn.connect(conv);
  revOut = AC.createGain(); revOut.gain.value = 0.42; conv.connect(revOut).connect(sfxBus);
  noiseBuf = AC.createBuffer(1, AC.sampleRate * 2, AC.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  applyVolume();
  loadUiSounds();
}
// звуки кнопок интерфейса (assets/sounds: button3 — нажатие, blip1 — мелкие действия и наведение)
const uiBufs = {};
function loadUiSounds() {
  for (const k in UI_SOUND_DATA) {
    try {
      const bin = atob(UI_SOUND_DATA[k]), u = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      AC.decodeAudioData(u.buffer).then(b => { uiBufs[k] = b; }).catch(() => {});
    } catch (e) {}
  }
}
function uiSound(k, vol = 0.7) {
  initAudio(); const b = uiBufs[k]; if (!b) return;
  const s = AC.createBufferSource(), g = AC.createGain(); s.buffer = b; g.gain.value = vol;
  s.connect(g).connect(master); s.start();
}
function applyVolume() { if (!AC) return; master.gain.value = SET.master; sfxBus.gain.value = SET.sfxVol; }
function makeIR(dur, decay) {
  const n = Math.floor(AC.sampleRate * dur), b = AC.createBuffer(2, n, AC.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay) * 0.6;
    for (let k = 0; k < 8; k++) { const at = Math.floor(AC.sampleRate * rand(0.008, 0.09)); if (at < n) d[at] += rand(-0.7, 0.7); }
  }
  return b;
}
const _sv = new THREE.Vector3();
function spatial(pos) {
  if (!pos) return { vol: 1, pan: 0, d: 0 };
  _sv.copy(pos).sub(camera.position); const d = _sv.length() || 1;
  const yaw = camera.rotation.y;
  const pan = clamp((_sv.x * Math.cos(yaw) - _sv.z * Math.sin(yaw)) / d, -1, 1) * 0.75;
  return { vol: 1 / (1 + d / 10), pan, d };
}
// выход звука: панорама, приглушение дальних звуков, посыл в ревербератор
function outChain(sp, rev) {
  const p = AC.createStereoPanner(); p.pan.value = sp.pan;
  const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = clamp(18000 / (1 + sp.d / 12), 900, 18000);
  p.connect(lp).connect(sfxBus);
  const s = AC.createGain(); s.gain.value = rev + Math.min(0.5, sp.d / 60); p.connect(s).connect(revIn);
  return p;
}
function noiseHit(out, t, o) {
  const src = AC.createBufferSource(); src.buffer = noiseBuf;
  const f = AC.createBiquadFilter(); f.type = o.type || 'lowpass'; f.frequency.setValueAtTime(o.f, t); if (o.q) f.Q.value = o.q;
  if (o.sweep) f.frequency.exponentialRampToValueAtTime(Math.max(60, o.f * o.sweep), t + o.dur);
  const g = AC.createGain(), a = o.attack || 0.0015;
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(o.vol, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + o.dur);
  src.connect(f).connect(g).connect(out); src.start(t, Math.random() * 1.5); src.stop(t + a + o.dur + 0.05);
}
function oscHit(out, t, type, f0, f1, dur, vol) {
  const o = AC.createOscillator(), g = AC.createGain(); o.type = type;
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out); o.start(t); o.stop(t + dur + 0.05);
}
// профили выстрелов
const GUN = {
  pistol:      { crack: 3400, body: 1500, bq: 0.9, bd: 0.09, th: [170, 60, 0.07], tail: 0.35, tf: 1000, v: 0.65 },
  heavy:       { crack: 2600, body: 850, bq: 0.8, bd: 0.15, th: [105, 38, 0.13], tail: 0.65, tf: 700, v: 0.95 },
  deagle:      { crack: 2500, body: 800, bq: 0.8, bd: 0.16, th: [100, 35, 0.14], tail: 0.7, tf: 650, v: 1.0 },
  smgLight:    { crack: 3900, body: 1900, bq: 1, bd: 0.055, th: [190, 85, 0.05], tail: 0.25, tf: 1300, v: 0.48 },
  smg:         { crack: 3500, body: 1500, bq: 0.9, bd: 0.07, th: [150, 65, 0.06], tail: 0.3, tf: 1050, v: 0.55 },
  smgHeavy:    { crack: 3100, body: 1250, bq: 0.9, bd: 0.08, th: [135, 55, 0.07], tail: 0.35, tf: 950, v: 0.6 },
  rifle:       { crack: 2900, body: 1100, bq: 0.85, bd: 0.1, th: [120, 42, 0.09], tail: 0.5, tf: 820, v: 0.75 },
  ak:          { crack: 2400, body: 880, bq: 0.8, bd: 0.12, th: [105, 38, 0.11], tail: 0.55, tf: 720, v: 0.85 },
  battle:      { crack: 2200, body: 780, bq: 0.8, bd: 0.13, th: [95, 34, 0.12], tail: 0.65, tf: 660, v: 0.9 },
  dmr:         { crack: 2000, body: 680, bq: 0.75, bd: 0.15, th: [88, 30, 0.14], tail: 0.85, tf: 600, v: 1.0 },
  sniper:      { crack: 1900, body: 520, bq: 0.7, bd: 0.2, th: [72, 26, 0.2], tail: 1.25, tf: 520, v: 1.15 },
  sniperSemi:  { crack: 2000, body: 640, bq: 0.7, bd: 0.17, th: [80, 30, 0.16], tail: 0.95, tf: 560, v: 1.05 },
  heavySniper: { crack: 1500, body: 380, bq: 0.7, bd: 0.27, th: [55, 22, 0.3], tail: 1.6, tf: 420, v: 1.3 },
  shotgun:     { crack: 2100, body: 620, bq: 0.6, bd: 0.18, th: [76, 30, 0.18], tail: 0.85, tf: 600, v: 1.05 },
  shotgunHeavy:{ crack: 1800, body: 500, bq: 0.6, bd: 0.22, th: [64, 25, 0.22], tail: 0.95, tf: 540, v: 1.15 },
  mg:          { crack: 2700, body: 1000, bq: 0.85, bd: 0.1, th: [112, 40, 0.1], tail: 0.5, tf: 780, v: 0.8 },
  mgHeavy:     { crack: 2400, body: 860, bq: 0.8, bd: 0.12, th: [96, 34, 0.12], tail: 0.6, tf: 700, v: 0.9 },
  silenced:    { crack: 0, body: 2400, bq: 1.6, bd: 0.045, th: [240, 140, 0.03], tail: 0.07, tf: 2200, v: 0.32, mech: 1 },
  silencedSmg: { crack: 0, body: 2600, bq: 1.6, bd: 0.04, th: [250, 150, 0.03], tail: 0.06, tf: 2300, v: 0.26, mech: 1 },
};
function shotSound(kind, pos) {
  const s = GUN[kind] || GUN.rifle, sp = spatial(pos), v = s.v * sp.vol;
  if (v < 0.004) return;
  const t = AC.currentTime, o = outChain(sp, s.mech ? 0.05 : 0.22);
  if (s.crack) noiseHit(o, t, { type: 'highpass', f: s.crack, dur: 0.014, vol: v * 0.9 });
  noiseHit(o, t, { type: 'bandpass', f: s.body * rand(0.92, 1.08), q: s.bq, dur: s.bd, vol: v * 1.7, sweep: 0.55 });
  oscHit(o, t, 'sine', s.th[0] * rand(0.95, 1.05), s.th[1], s.th[2], v * 1.1);
  noiseHit(o, t + 0.008, { type: 'lowpass', f: s.tf, dur: s.tail, vol: v * 0.32, attack: 0.012, sweep: 0.5 });
  if (s.mech) mclick(o, t + 0.005, 3200, v * 0.6);
  if (pos && sp.d > 35) noiseHit(o, t + sp.d / 340 * 0.3, { type: 'lowpass', f: 400, dur: 0.6, vol: v * 0.4, attack: 0.03 });
}
// короткий металлический щелчок (детали оружия)
function mclick(out, t, f, vol) {
  noiseHit(out, t, { type: 'highpass', f: f * 1.5, dur: 0.012, vol: vol * 0.8 });
  oscHit(out, t, 'triangle', f, f * 0.85, 0.035, vol * 0.5);
  oscHit(out, t, 'sine', f * 1.73, f * 1.6, 0.025, vol * 0.25);
}
function clickAt(pos, f, vol, delay = 0) {
  if (!AC) return; const sp = spatial(pos), v = vol * sp.vol; if (v < 0.004) return;
  mclick(outChain(sp, 0.08), AC.currentTime + delay, f, v);
}
function slideNoise(pos, vol, dur = 0.12, delay = 0) {
  if (!AC) return; const sp = spatial(pos), v = vol * sp.vol; if (v < 0.004) return;
  noiseHit(outChain(sp, 0.05), AC.currentTime + delay, { type: 'bandpass', f: 2600, q: 1.2, dur, vol: v, attack: 0.02, sweep: 0.6 });
}
const RELOAD_SEQ = {
  mag: [[0.16, 'out'], [0.5, 'in'], [0.72, 'back'], [0.8, 'fwd']],
  slide: [[0.18, 'out'], [0.52, 'in'], [0.77, 'fwd']],
  bolt: [[0.15, 'up'], [0.25, 'back'], [0.42, 'out'], [0.6, 'in'], [0.8, 'fwd']],
  rev: [[0.18, 'open'], [0.4, 'shells'], [0.62, 'in'], [0.86, 'close']],
  break: [[0.15, 'open'], [0.38, 'shells'], [0.6, 'in'], [0.84, 'close']],
  pump: [[0.25, 'shell'], [0.42, 'shell'], [0.59, 'shell'], [0.76, 'shell'], [0.9, 'pump']],
};
function reloadSound(a, W) {
  if (!AC) return;
  const token = a.reloadToken = (a.reloadToken || 0) + 1;
  for (const [f, k] of RELOAD_SEQ[W.act] || RELOAD_SEQ.mag) setTimeout(() => {
    if (a.reloadToken !== token || a.reloading <= 0 || !a.alive) return;
    const pos = a.isPlayer ? null : a.pos, v = a.isPlayer ? 0.5 : 0.35;
    switch (k) {
      case 'out': clickAt(pos, 1300, v); slideNoise(pos, v * 0.5, 0.1, 0.03); break;
      case 'in': slideNoise(pos, v * 0.5, 0.08); clickAt(pos, 950, v * 1.2, 0.07); break;
      case 'back': clickAt(pos, 2100, v); slideNoise(pos, v * 0.6, 0.07, 0.02); break;
      case 'fwd': case 'close': clickAt(pos, 1700, v * 1.1); clickAt(pos, 1200, v * 0.7, 0.03); break;
      case 'up': clickAt(pos, 2400, v * 0.8); break;
      case 'open': clickAt(pos, 1500, v); slideNoise(pos, v * 0.4, 0.06, 0.02); break;
      case 'shells': for (let i = 0; i < 3; i++) clickAt(pos, rand(3000, 4200), v * 0.4, i * 0.05); break;
      case 'shell': slideNoise(pos, v * 0.45, 0.06); clickAt(pos, 1100, v * 0.8, 0.05); break;
      case 'pump': sfxAct('pump', pos); break;
    }
  }, W.reload * f * 1000);
}
function sfxAct(kind, pos = null) {
  if (!AC) return;
  if (kind === 'pump') { slideNoise(pos, 0.45, 0.09); clickAt(pos, 1500, 0.5, 0.0); clickAt(pos, 1150, 0.55, 0.16); slideNoise(pos, 0.4, 0.08, 0.14); }
  else if (kind === 'bolt') { clickAt(pos, 2300, 0.4); slideNoise(pos, 0.4, 0.1, 0.08); clickAt(pos, 1800, 0.45, 0.22); clickAt(pos, 2400, 0.35, 0.36); }
  else if (kind === 'deploy') { slideNoise(pos, 0.25, 0.1); clickAt(pos, 1600, 0.35, 0.06); }
  else if (kind === 'empty') clickAt(pos, 2600, 0.45);
}
// шаги зависят от поверхности: бетон/камень, металл (гулкий звон), дерево (глухой стук), грунт/песок (шорох)
function stepSound(pos, vol = 1) {
  if (!AC) return; const sp = spatial(pos), v = 0.22 * vol * sp.vol; if (v < 0.004) return;
  const o = outChain(sp, 0.08), t = AC.currentTime;
  const p = pos || (typeof P !== 'undefined' ? P.pos : null);
  const kind = p ? (MAT_INFO[materialAt(p.x, p.y - 0.05, p.z)] || {}).step || 'hard' : 'hard';
  if (kind === 'metal') {
    noiseHit(o, t, { type: 'bandpass', f: rand(900, 1300), q: 3, dur: 0.09, vol: v * 1.2 });
    oscHit(o, t, 'triangle', rand(420, 520), 300, 0.12, v * 0.35); oscHit(o, t, 'sine', 120, 60, 0.06, v * 0.6);
  } else if (kind === 'wood') {
    noiseHit(o, t, { type: 'lowpass', f: rand(500, 700), dur: 0.07, vol: v * 1.5 }); oscHit(o, t, 'sine', 160, 90, 0.07, v * 0.9);
  } else if (kind === 'soft') {
    noiseHit(o, t, { type: 'bandpass', f: rand(1500, 2500), q: 0.6, dur: 0.11, vol: v * 1.1 }); noiseHit(o, t + 0.03, { type: 'highpass', f: 4000, dur: 0.05, vol: v * 0.5 });
  } else {
    noiseHit(o, t, { type: 'bandpass', f: rand(380, 620), q: 1.1, dur: 0.06, vol: v * 1.4 });
    noiseHit(o, t + 0.012, { type: 'highpass', f: 3500, dur: 0.02, vol: v * 0.4 });
    oscHit(o, t, 'sine', 90, 50, 0.05, v * 0.8);
  }
}
function landSound() { if (!AC) return; const o = outChain({ vol: 1, pan: 0, d: 0 }, 0.1), t = AC.currentTime; noiseHit(o, t, { type: 'lowpass', f: 500, dur: 0.12, vol: 0.35 }); oscHit(o, t, 'sine', 80, 40, 0.1, 0.3); }
function knifeSound(pos) {
  if (!AC) return; const sp = spatial(pos), v = 0.4 * sp.vol; if (v < 0.004) return;
  noiseHit(outChain(sp, 0.05), AC.currentTime, { type: 'bandpass', f: 3500, q: 0.8, dur: 0.14, vol: v, attack: 0.03, sweep: 0.45 });
}
// попадания: звон шлема (как в классических шутерах), удар по телу
function hitSound(head, helmet, pos) {
  if (!AC) return; const sp = spatial(pos), v = Math.max(0.25, sp.vol), o = outChain(sp, 0.12), t = AC.currentTime;
  if (head && helmet) { for (const [f, g] of [[2650, 0.32], [3900, 0.2], [5300, 0.12], [7100, 0.06]]) oscHit(o, t, 'sine', f, f * 0.995, 0.35, g * v); noiseHit(o, t, { type: 'highpass', f: 5000, dur: 0.02, vol: 0.3 * v }); }
  else if (head) { noiseHit(o, t, { type: 'bandpass', f: 900, q: 1, dur: 0.09, vol: 0.6 * v }); oscHit(o, t, 'sine', 180, 70, 0.08, 0.4 * v); }
  else { noiseHit(o, t, { type: 'lowpass', f: 700, dur: 0.07, vol: 0.5 * v }); oscHit(o, t, 'sine', 140, 60, 0.07, 0.35 * v); }
}
function impactSound(pos) {
  if (!AC || !pos) return; const sp = spatial(pos); if (sp.d > 18) return;
  noiseHit(outChain(sp, 0.1), AC.currentTime, { type: 'highpass', f: 2200, dur: 0.03, vol: 0.18 * sp.vol });
}
function boomSound(pos) {
  if (!AC) return; const sp = spatial(pos), v = 1.4 * Math.max(0.15, sp.vol), o = outChain(sp, 0.4), t = AC.currentTime;
  noiseHit(o, t, { type: 'highpass', f: 1500, dur: 0.05, vol: v * 0.8 });
  noiseHit(o, t, { type: 'lowpass', f: 900, dur: 1.4, vol: v * 1.2, sweep: 0.2 });
  oscHit(o, t, 'sine', 70, 28, 0.9, v);
}
function flashSound(pos) {
  if (!AC) return; const sp = spatial(pos), v = 1.2 * Math.max(0.2, sp.vol), o = outChain(sp, 0.3), t = AC.currentTime;
  noiseHit(o, t, { type: 'highpass', f: 2500, dur: 0.18, vol: v }); oscHit(o, t, 'sine', 110, 50, 0.3, v * 0.6);
}
function smokeSound(pos) {
  if (!AC) return; const sp = spatial(pos), v = 0.35 * sp.vol;
  noiseHit(outChain(sp, 0.2), AC.currentTime, { type: 'bandpass', f: 3200, q: 0.6, dur: 2.2, vol: v, attack: 0.15 });
}
function ringing(dur) {
  if (!AC) return; const o = AC.createOscillator(), g = AC.createGain(), t = AC.currentTime;
  o.frequency.value = 3600; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.12, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(sfxBus); o.start(t); o.stop(t + dur + 0.1);
}
function bounceSound(pos) { clickAt(pos, rand(2400, 3200), 0.35); }
// радиосигналы раундов
function radio(kind) {
  if (!AC) return; const o = outChain({ vol: 1, pan: 0, d: 0 }, 0.02), t = AC.currentTime;
  noiseHit(o, t, { type: 'bandpass', f: 2000, q: 0.7, dur: 0.12, vol: 0.18 });
  const notes = kind === 'start' ? [[1000, 0.15], [1000, 0.3]] : kind === 'go' ? [[1300, 0.12]] : kind === 'win' ? [[880, 0.15], [1100, 0.3], [1320, 0.45]] : kind === 'lose' ? [[660, 0.15], [520, 0.3], [440, 0.45]] : [[800, 0.12], [1200, 0.25]];
  for (const [f, d] of notes) { const og = AC.createGain(), os = AC.createOscillator(); os.type = 'square'; os.frequency.value = f; og.gain.setValueAtTime(0.0001, t + d); og.gain.linearRampToValueAtTime(0.06, t + d + 0.01); og.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.11); os.connect(og).connect(o); os.start(t + d); os.stop(t + d + 0.15); }
  noiseHit(o, t + 0.55, { type: 'bandpass', f: 1800, q: 0.7, dur: 0.08, vol: 0.12 });
}
// голос диктора (синтез речи браузера, если доступен)
function announce(key) {
  if (!SET.announcer || !window.speechSynthesis || !window.SpeechSynthesisUtterance) return;
  try {
    const u = new SpeechSynthesisUtterance(t(key)); u.lang = TTS_LANG[LANG] || 'en-US'; u.rate = 1.1; u.pitch = 0.8; u.volume = Math.min(1, SET.master * 1.1);
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  } catch (e) {}
}
// совместимость со старым API
// ограничение числа одновременно запускаемых звуков: в перестрелке далёкие звуки пропускаются
let sndWin = 0, sndCount = 0;
function sfx(kind, pos, mul = 1) {
  if (!AC) return;
  if (AC.currentTime - sndWin > 0.1) { sndWin = AC.currentTime; sndCount = 0; }
  if (++sndCount > 16 && pos && pos.distanceTo(camera.position) > 12) return;
  if (GUN[kind]) shotSound(kind, pos);
  else if (kind === 'knife') knifeSound(pos);
  else if (kind === 'boom') boomSound(pos);
  else if (kind === 'step') stepSound(pos, mul);
}
function tone(freq, dur, type = 'sine', vol = 0.2, delay = 0) {
  if (!AC) return;
  const t0 = AC.currentTime + delay, o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(g).connect(master); o.start(t0); o.stop(t0 + dur + 0.02);
}
