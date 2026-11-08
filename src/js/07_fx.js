/* ================= FX ================= */
const fx = [];
// --- трассеры: пул готовых линий, без создания геометрии на каждый выстрел ---
const tracerMats = [0xfff2a8, 0x9fd8ff, 0xffb27a].map(c => new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
const tracerPool = [];
for (let i = 0; i < 32; i++) {
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const l = new THREE.Line(geo, tracerMats[0]); l.visible = false; l.frustumCulled = false; scene.add(l); tracerPool.push({ l, life: 0 });
}
let tracerI = 0;
function addTracer(a, b, mi = 0) {
  const t = tracerPool[tracerI++ % tracerPool.length], arr = t.l.geometry.attributes.position;
  arr.setXYZ(0, a.x, a.y, a.z); arr.setXYZ(1, b.x, b.y, b.z); arr.needsUpdate = true;
  t.l.material = tracerMats[mi]; t.l.visible = true; t.life = 0.06;
}

// --- частицы: два пула (обычное и аддитивное смешивание), каждый рисуется одним вызовом ---
const softTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); return t;
})();
function makeParticles(n, additive) {
  const geo = new THREE.BufferGeometry();
  const P_ = { n, i: 0, pos: new Float32Array(n * 3), col: new Float32Array(n * 3), size: new Float32Array(n), alpha: new Float32Array(n),
    vel: new Float32Array(n * 3), life: new Float32Array(n), max: new Float32Array(n), grow: new Float32Array(n), a0: new Float32Array(n), grav: new Float32Array(n), drag: new Float32Array(n), live: 0 };
  geo.setAttribute('position', new THREE.BufferAttribute(P_.pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(P_.col, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('size', new THREE.BufferAttribute(P_.size, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('alpha', new THREE.BufferAttribute(P_.alpha, 1).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: softTex }, scale: { value: innerHeight * 0.5 } },
    vertexShader: 'attribute float size; attribute float alpha; attribute vec3 color; varying float vA; varying vec3 vC; uniform float scale;' +
      'void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vA = alpha * smoothstep(0.25, 0.9, -mv.z); vC = color; gl_PointSize = min(size * scale / max(0.1, -mv.z), scale * 0.35); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform sampler2D map; varying float vA; varying vec3 vC; void main(){ vec4 t = texture2D(map, gl_PointCoord); float a = t.a * vA; if (a < 0.01) discard; gl_FragColor = vec4(vC, a); }',
    transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = additive ? 3 : 2; scene.add(pts);
  P_.pts = pts; P_.geo = geo; P_.mat = mat; return P_;
}
const PSMOKE = makeParticles(700, false), PGLOW = makeParticles(500, true);
addEventListener('resize', () => { PSMOKE.mat.uniforms.scale.value = PGLOW.mat.uniforms.scale.value = innerHeight * 0.5; });
const fxScale = () => SET.effects ? 1 : 0.5; // при низких эффектах частиц вдвое меньше
// emit: позиция, скорость, размер и рост, время жизни, цвет, прозрачность, гравитация, сопротивление воздуха
function emit(S, x, y, z, vx, vy, vz, size, grow, life, r, g, b, a = 1, grav = 0, drag = 0) {
  const i = S.i++ % S.n, k = i * 3;
  S.pos[k] = x; S.pos[k + 1] = y; S.pos[k + 2] = z; S.vel[k] = vx; S.vel[k + 1] = vy; S.vel[k + 2] = vz;
  S.col[k] = r; S.col[k + 1] = g; S.col[k + 2] = b; S.size[i] = size; S.grow[i] = grow; S.life[i] = S.max[i] = life;
  S.a0[i] = a; S.alpha[i] = a; S.grav[i] = grav; S.drag[i] = drag;
  S.live = Math.max(S.live, i + 1);
}
function updateParticles(S, dt) {
  let any = false;
  for (let i = 0; i < S.live; i++) {
    if (S.life[i] <= 0) continue;
    S.life[i] -= dt; const k = i * 3;
    if (S.life[i] <= 0) { S.alpha[i] = 0; S.size[i] = 0; any = true; continue; }
    const dr = Math.exp(-S.drag[i] * dt);
    S.vel[k] *= dr; S.vel[k + 1] = S.vel[k + 1] * dr - S.grav[i] * dt; S.vel[k + 2] *= dr;
    S.pos[k] += S.vel[k] * dt; S.pos[k + 1] += S.vel[k + 1] * dt; S.pos[k + 2] += S.vel[k + 2] * dt;
    if (S.pos[k + 1] < 0.02 && S.grav[i] > 0) { S.pos[k + 1] = 0.02; S.vel[k + 1] *= -0.3; S.vel[k] *= 0.6; S.vel[k + 2] *= 0.6; }
    S.size[i] += S.grow[i] * dt;
    const f = S.life[i] / S.max[i]; S.alpha[i] = S.a0[i] * Math.min(1, f * 1.6) * Math.min(1, (1 - f) * 12 + 0.25);
    any = true;
  }
  if (any) for (const n of ['position', 'color', 'size', 'alpha']) S.geo.attributes[n].needsUpdate = true;
}

// --- искры и кровь (через частицы) ---
function sparks(pos, n, blood = false) {
  n = Math.ceil(n * fxScale());
  for (let i = 0; i < n; i++) {
    if (blood) emit(PSMOKE, pos.x, pos.y, pos.z, rand(-1, 1) * 1.6, rand(-0.2, 1.5), rand(-1, 1) * 1.6, rand(0.05, 0.09), 0.05, rand(0.25, 0.45), 0.55, 0.04, 0.06, 0.95, 9, 1);
    else emit(PGLOW, pos.x, pos.y, pos.z, rand(-1, 1) * 4, rand(0, 1.5) * 3, rand(-1, 1) * 4, rand(0.03, 0.055), -0.04, rand(0.18, 0.4), 1, 0.78, 0.4, 1, 12, 0.5);
  }
}
// материал поверхности по клетке карты: бетон, дерево, металл или земля
function surfaceAt(p, nx, ny, nz) {
  if (ny > 0.5 && p.y < 0.05) return 'ground';
  const c = cellCh(Math.floor((p.x - nx * 0.05) / CELL), Math.floor((p.z - nz * 0.05) / CELL));
  return c === 'b' ? 'wood' : c === 'B' || c === 'u' ? 'metal' : 'concrete';
}
// попадание по миру: реакция зависит от материала
function impactFx(p, nx, ny, nz) {
  const m = surfaceAt(p, nx, ny, nz), q = fxScale();
  if (m === 'metal') { sparks(p, 7); emit(PGLOW, p.x, p.y, p.z, 0, 0, 0, 0.22, -0.6, 0.06, 1, 0.85, 0.5, 1); }
  else {
    const col = m === 'wood' ? [0.45, 0.33, 0.2] : m === 'ground' ? [0.38, 0.36, 0.33] : [0.55, 0.56, 0.6];
    for (let i = 0; i < 3 * q; i++) emit(PSMOKE, p.x + nx * 0.05, p.y + ny * 0.05, p.z + nz * 0.05, nx * rand(0.4, 1.2) + rand(-0.3, 0.3), ny * rand(0.4, 1.2) + rand(0, 0.5), nz * rand(0.4, 1.2) + rand(-0.3, 0.3), rand(0.12, 0.2), 0.5, rand(0.5, 0.9), col[0], col[1], col[2], 0.5, -0.1, 2);
    // осколки: щепа у дерева, крошка у бетона
    for (let i = 0; i < 4 * q; i++) emit(PSMOKE, p.x, p.y, p.z, nx * rand(1, 3) + rand(-1.2, 1.2), ny * rand(1, 3) + rand(0.5, 2), nz * rand(1, 3) + rand(-1.2, 1.2), rand(0.025, 0.045), 0, rand(0.35, 0.6), col[0] * 0.7, col[1] * 0.7, col[2] * 0.7, 1, 12, 0.3);
  }
}
// пыль из-под ног: бег, приземление, уклонение, ползание
function dustFx(pos, n, strength = 0.5) {
  n = Math.ceil(n * fxScale());
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.283, s = rand(0.4, 1.2) * strength * 2;
    emit(PSMOKE, pos.x + Math.cos(a) * 0.2, pos.y + 0.06, pos.z + Math.sin(a) * 0.2, Math.cos(a) * s, rand(0.1, 0.5) * strength, Math.sin(a) * s, rand(0.18, 0.3), 0.7 * strength, rand(0.5, 0.9), 0.42, 0.4, 0.37, 0.35 * strength + 0.12, 0, 3);
  }
}
// дымок из ствола
function muzzleSmoke(p, heavy) {
  if (!SET.effects) return;
  for (let i = 0; i < (heavy ? 3 : 1); i++) emit(PSMOKE, p.x, p.y, p.z, rand(-0.15, 0.15), rand(0.15, 0.4), rand(-0.15, 0.15), rand(0.06, 0.1), 0.35, rand(0.5, 0.9), 0.75, 0.75, 0.75, 0.22, -0.15, 1.5);
}
// --- следы от пуль ---
const decalGeo = new THREE.PlaneGeometry(0.11, 0.11);
const decalTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d'); const gr = g.createRadialGradient(16, 16, 1, 16, 16, 15); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.35, 'rgba(10,10,10,.9)'); gr.addColorStop(1, 'rgba(30,30,30,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(c); })();
const decalMat = new THREE.MeshBasicMaterial({ map: decalTex, color: 0x111111, transparent: true, opacity: 0.9, polygonOffset: true, polygonOffsetFactor: -4, depthWrite: false });
const decals = new THREE.InstancedMesh(decalGeo, decalMat, 96); decals.count = 0; decals.frustumCulled = false; scene.add(decals);
let decalI = 0; const _dm = new THREE.Object3D();
function addDecal(p, nx, ny, nz) {
  _dm.position.set(p.x + nx * 0.01, p.y + ny * 0.01, p.z + nz * 0.01);
  _dm.lookAt(_dm.position.x + nx, _dm.position.y + ny, _dm.position.z + nz); _dm.rotateZ(Math.random() * 6.28); _dm.scale.setScalar(rand(0.8, 1.3)); _dm.updateMatrix();
  decals.setMatrixAt(decalI % 96, _dm.matrix); decalI++; decals.count = Math.min(96, decalI); decals.instanceMatrix.needsUpdate = true;
  impactFx(p, nx, ny, nz);
}
// --- взрыв: вспышка, огненный шар, дым, ударная волна по земле, обломки, тряска камеры ---
const boomLight = new THREE.PointLight(0xffb070, 0, 22); scene.add(boomLight);
const ringMat = new THREE.MeshBasicMaterial({ map: softTex, color: 0xffe0b0, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
const shockRing = new THREE.Mesh(new THREE.RingGeometry(0.75, 1, 40), ringMat); shockRing.rotation.x = -Math.PI / 2; shockRing.visible = false; scene.add(shockRing);
function explosionFx(pos) {
  const q = fxScale();
  for (let i = 0; i < 26 * q; i++) { const v = new THREE.Vector3(rand(-1, 1), rand(-0.2, 1), rand(-1, 1)).normalize().multiplyScalar(rand(2, 6)); emit(PGLOW, pos.x, pos.y, pos.z, v.x, v.y, v.z, rand(0.5, 0.9), 1.6, rand(0.25, 0.45), 1, rand(0.45, 0.7), 0.15, 0.9, -1, 4); }
  for (let i = 0; i < 30 * q; i++) { const v = new THREE.Vector3(rand(-1, 1), rand(0, 1), rand(-1, 1)).normalize().multiplyScalar(rand(0.8, 3)); const g = rand(0.12, 0.25); emit(PSMOKE, pos.x, pos.y + 0.2, pos.z, v.x, v.y, v.z, rand(0.6, 1.1), 1.4, rand(1.6, 3), g, g, g * 1.05, 0.7, -0.35, 1.2); }
  for (let i = 0; i < 24 * q; i++) emit(PGLOW, pos.x, pos.y, pos.z, rand(-7, 7), rand(2, 8), rand(-7, 7), rand(0.03, 0.06), 0, rand(0.5, 1.1), 1, 0.7, 0.3, 1, 14, 0.4);
  dustFx(new THREE.Vector3(pos.x, 0, pos.z), 14, 1.4);
  boomLight.position.copy(pos); boomLight.intensity = 160;
  shockRing.position.set(pos.x, 0.05, pos.z); shockRing.visible = true; shockRing.scale.setScalar(0.5); ringMat.opacity = 0.8;
  fx.push({ life: 0.5, max: 0.5, tick(f) { boomLight.intensity = 160 * f * f; shockRing.scale.setScalar(0.5 + (1 - f) * 9); ringMat.opacity = 0.8 * f; }, done() { boomLight.intensity = 0; shockRing.visible = false; } });
  // тряска камеры зависит от расстояния и не мешает прицеливанию надолго
  const d = camera.position.distanceTo(pos); if (d < 22) shake = Math.max(shake, 0.55 * (1 - d / 22));
}
function updateFx(dt) {
  updateCasings(dt);
  for (const t of tracerPool) if (t.life > 0) { t.life -= dt; if (t.life <= 0) t.l.visible = false; }
  for (let i = fx.length - 1; i >= 0; i--) {
    const e = fx[i]; e.life -= dt;
    if (e.tick) e.tick(Math.max(0, e.life / e.max));
    if (e.life <= 0) { e.done(); fx.splice(i, 1); }
  }
  updateParticles(PSMOKE, dt); updateParticles(PGLOW, dt);
}
bootMark('07_fx');
