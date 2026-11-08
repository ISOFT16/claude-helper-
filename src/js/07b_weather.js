/* ================= погода и атмосфера ================= */
// Дождь и снег — частицы вокруг камеры (один вызов отрисовки), в помещении погода стихает.
// Звук: шум дождя, эхо выстрелов сильнее в помещениях и слабее на улице. Деревья качаются на ветру.
const WEATHER = { kind: null, n: 0, pts: null, vel: null, indoor: 0, rainGain: null, t: 0 };
function weatherBuild() {
  if (WEATHER.pts) { scene.remove(WEATHER.pts); WEATHER.pts.geometry.dispose(); WEATHER.pts = null; }
  const kind = WORLD.env.weather; WEATHER.kind = kind;
  if (kind !== 'rain' && kind !== 'snow') return;
  const n = kind === 'rain' ? 2200 : 1400, R = 22, pos = new Float32Array(n * 3 * (kind === 'rain' ? 2 : 1));
  WEATHER.n = n; WEATHER.seed = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { WEATHER.seed[i * 3] = rand(-R, R); WEATHER.seed[i * 3 + 1] = rand(0, 18); WEATHER.seed[i * 3 + 2] = rand(-R, R); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  const obj = kind === 'rain'
    ? new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xaab8cc, transparent: true, opacity: 0.35, depthWrite: false }))
    : new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 0.07, transparent: true, opacity: 0.85, depthWrite: false }));
  obj.frustumCulled = false; scene.add(obj); WEATHER.pts = obj;
}
onWorld(weatherBuild);
// в помещении: над головой перекрытие в пределах 12 м
const isIndoor = p => solidRect(p.x, p.z, 0.05, p.y + 2.2, p.y + 12);
function updateWeather(dt) {
  WEATHER.t += dt;
  const cam = camera.position, inside = isIndoor(cam);
  WEATHER.indoor += ((inside ? 1 : 0) - WEATHER.indoor) * Math.min(1, dt * 3);
  // эхо: в помещении — длиннее и громче
  if (revOut) revOut.gain.value = 0.18 + WEATHER.indoor * 0.5;
  // качание деревьев
  if (WR.trees && WR.trees.count) {
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), ps = new THREE.Vector3(), sc = new THREE.Vector3();
    const trees = WORLD.props.filter(p => p.kind === 'tree');
    trees.forEach((t, i) => { const a = Math.sin(WEATHER.t * 1.3 + t.x * 0.7) * 0.05 + Math.sin(WEATHER.t * 2.9 + t.z) * 0.02; q.setFromEuler(new THREE.Euler(a * 0.6, 0, a)); ps.set(t.x, 2.6 * t.s + 1.4, t.z); sc.setScalar(t.s); WR.trees.setMatrixAt(i, m4.compose(ps, q, sc)); });
    WR.trees.instanceMatrix.needsUpdate = true;
  }
  // дыхание тумана в горах
  if (WORLD.id === 'village' && WORLD.fogBase) { scene.fog.near = WORLD.fogBase[0] * (1 + Math.sin(WEATHER.t * 0.21) * 0.25); }
  if (!WEATHER.pts) { rainSound(0); return; }
  const rain = WEATHER.kind === 'rain', arr = WEATHER.pts.geometry.attributes.position.array, S = WEATHER.seed, R = 22, n = WEATHER.n;
  const fall = rain ? 16 : 1.4, wind = rain ? 2.2 : 0.8;
  for (let i = 0; i < n; i++) {
    let y = S[i * 3 + 1] - fall * dt; if (y < 0) y += 18; S[i * 3 + 1] = y;
    let x = S[i * 3] + (rain ? wind * dt * 0.3 : Math.sin(WEATHER.t + i) * 0.3 * dt), z = S[i * 3 + 2];
    if (x > R) x -= 2 * R; S[i * 3] = x;
    const wx = Math.round(cam.x / 4) * 4 + x, wz = Math.round(cam.z / 4) * 4 + z, wy = cam.y - 6 + y;
    if (rain) { const k = i * 6; arr[k] = wx; arr[k + 1] = wy; arr[k + 2] = wz; arr[k + 3] = wx + 0.06; arr[k + 4] = wy + 0.55; arr[k + 5] = wz; }
    else { const k = i * 3; arr[k] = wx; arr[k + 1] = wy; arr[k + 2] = wz; }
  }
  WEATHER.pts.geometry.attributes.position.needsUpdate = true;
  WEATHER.pts.material.opacity = (rain ? 0.35 : 0.85) * (1 - WEATHER.indoor * 0.85);
  rainSound(rain ? 1 - WEATHER.indoor * 0.6 : 0);
}
// шум дождя: отфильтрованный белый шум, громкость по погоде
function rainSound(v) {
  if (!AC || !noiseBuf) return;
  if (!WEATHER.rainGain) {
    if (v <= 0) return;
    const src = AC.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = AC.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2400; f.Q.value = 0.4;
    const g = AC.createGain(); g.gain.value = 0; src.connect(f).connect(g).connect(sfxBus); src.start(); WEATHER.rainGain = g;
  }
  const target = G.started ? v * 0.06 : 0; WEATHER.rainGain.gain.value += (target - WEATHER.rainGain.gain.value) * 0.05;
}
