/* ================= FX ================= */
const fx = [];
const tracerMats = [0xfff2a8, 0x9fd8ff, 0xffb27a].map(c => new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending }));
function addTracer(a, b, mi = 0) {
  const geo = new THREE.BufferGeometry().setFromPoints([a.clone(), b.clone()]);
  const l = new THREE.Line(geo, tracerMats[mi]); scene.add(l);
  fx.push({ o: l, life: 0.06, done() { scene.remove(l); geo.dispose(); } });
}
const sparkGeo = new THREE.BoxGeometry(0.05, 0.05, 0.05);
const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffd27a }), bloodMat = new THREE.MeshBasicMaterial({ color: 0xb3122a });
const sparkPool = []; for (let i = 0; i < 160; i++) { const m = new THREE.Mesh(sparkGeo, sparkMat); m.visible = false; scene.add(m); sparkPool.push({ m, v: new THREE.Vector3(), life: 0 }); }
let sparkI = 0;
function sparks(pos, n, blood = false) {
  for (let i = 0; i < n; i++) {
    const s = sparkPool[sparkI++ % sparkPool.length];
    s.m.material = blood ? bloodMat : sparkMat; s.m.position.copy(pos); s.m.visible = true;
    s.v.set(rand(-1, 1), rand(0, 1.5), rand(-1, 1)).multiplyScalar(blood ? 2.5 : 4); s.life = rand(0.2, 0.4);
  }
}
const decalGeo = new THREE.PlaneGeometry(0.11, 0.11);
const decalMat = new THREE.MeshBasicMaterial({ color: 0x0b0b0b, transparent: true, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: -4, depthWrite: false });
const decals = []; let decalI = 0;
for (let i = 0; i < 80; i++) { const m = new THREE.Mesh(decalGeo, decalMat); m.visible = false; scene.add(m); decals.push(m); }
function addDecal(p, nx, ny, nz) {
  const m = decals[decalI++ % decals.length]; m.visible = true;
  m.position.set(p.x + nx * 0.01, p.y + ny * 0.01, p.z + nz * 0.01);
  m.lookAt(m.position.x + nx, m.position.y + ny, m.position.z + nz);
}
function explosionFx(pos) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial({ color: 0x9fe7ff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
  m.position.copy(pos); scene.add(m);
  const L = new THREE.PointLight(0x9fe7ff, 120, 18); L.position.copy(pos); scene.add(L);
  fx.push({ o: m, life: 0.45, max: 0.45, tick(f) { m.scale.setScalar(1 + (1 - f) * 5); m.material.opacity = f * 0.8; L.intensity = f * 120; }, done() { scene.remove(m, L); m.geometry.dispose(); m.material.dispose(); L.dispose(); } });
  sparks(pos, 30);
}
function updateFx(dt) {
  updateCasings(dt);
  for (let i = fx.length - 1; i >= 0; i--) {
    const e = fx[i]; e.life -= dt;
    if (e.tick) e.tick(Math.max(0, e.life / e.max));
    if (e.life <= 0) { e.done(); fx.splice(i, 1); }
  }
  for (const s of sparkPool) if (s.life > 0) {
    s.life -= dt; s.v.y -= 12 * dt; s.m.position.addScaledVector(s.v, dt);
    if (s.m.position.y < 0.02) { s.m.position.y = 0.02; s.v.set(0, 0, 0); }
    if (s.life <= 0) s.m.visible = false;
  }
}

