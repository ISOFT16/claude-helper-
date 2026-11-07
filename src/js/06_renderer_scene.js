/* ================= renderer & scene ================= */
const renderer = new THREE.WebGLRenderer({ antialias: !!SET.antialias, powerPreference: 'high-performance' });
renderer.setPixelRatio(clamp(Math.min(devicePixelRatio, 2) * SET.renderScale, 0.4, 3));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
renderer.autoClear = false;
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2a2f45);
scene.fog = new THREE.Fog(0x2a2f45, 50, 170);
const camera = new THREE.PerspectiveCamera(80, innerWidth / innerHeight, 0.05, 300);
camera.rotation.order = 'YXZ';
const vmScene = new THREE.Scene();
const vmCam = new THREE.PerspectiveCamera(66, innerWidth / innerHeight, 0.01, 10);
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = vmCam.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); vmCam.updateProjectionMatrix();
});

scene.add(new THREE.HemisphereLight(0xb8c6ff, 0x4a3a2a, 1.0), new THREE.AmbientLight(0x404a66, 0.25));
const sun = new THREE.DirectionalLight(0xffd9b0, 2.1);
sun.position.set(MW * CELL / 2 + 30, 60, MH * CELL / 2 - 25);
sun.target.position.set(MW * CELL / 2, 0, MH * CELL / 2);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -55, right: 55, top: 55, bottom: -55, near: 1, far: 160 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.035;
scene.add(sun, sun.target);

function canvasTex(w, h, draw, rx = 1, ry = 1) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 8; return t;
}
function speckle(g, w, h, n, a) { for (let i = 0; i < n; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${Math.random() * a})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); } }
const floorTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#3b4252'; g.fillRect(0, 0, w, h); speckle(g, w, h, 2500, 0.15);
  g.strokeStyle = '#2a303d'; g.lineWidth = 4; g.strokeRect(2, 2, w - 4, h - 4);
  g.strokeStyle = 'rgba(255,255,255,.05)'; g.lineWidth = 2; g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
}, MW, MH);
const wallTex = canvasTex(256, 512, (g, w, h) => {
  g.fillStyle = '#5a6275'; g.fillRect(0, 0, w, h); speckle(g, w, h, 4000, 0.18);
  g.strokeStyle = '#3e4556'; g.lineWidth = 3;
  for (let y = 0; y < h; y += 128) { g.strokeRect(4, y + 4, w - 8, 120); }
  g.fillStyle = '#2b2f3a'; g.fillRect(0, h - 60, w, 60);
  for (let x = -60; x < w; x += 40) { g.fillStyle = '#d9a43a'; g.beginPath(); g.moveTo(x, h - 60); g.lineTo(x + 20, h - 60); g.lineTo(x + 50, h); g.lineTo(x + 30, h); g.fill(); }
  g.fillStyle = '#7fe7ff'; g.fillRect(0, 90, w, 5);
});
const crateTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#6b5236'; g.fillRect(0, 0, w, h); speckle(g, w, h, 2500, 0.2);
  g.strokeStyle = '#3d2c1b'; g.lineWidth = 18; g.strokeRect(9, 9, w - 18, h - 18);
  g.lineWidth = 14; g.beginPath(); g.moveTo(16, 16); g.lineTo(w - 16, h - 16); g.moveTo(w - 16, 16); g.lineTo(16, h - 16); g.stroke();
});
const tallTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#2f5b6b'; g.fillRect(0, 0, w, h); speckle(g, w, h, 2500, 0.18);
  g.fillStyle = 'rgba(0,0,0,.25)'; for (let x = 10; x < w; x += 26) g.fillRect(x, 0, 10, h);
  g.strokeStyle = '#1b333d'; g.lineWidth = 12; g.strokeRect(6, 6, w - 12, h - 12);
  g.fillStyle = '#ff8a3d'; g.font = 'bold 40px sans-serif'; g.fillText('PX-7', 70, 140);
});

// небо: градиент заката и звёзды
const sky = new THREE.Mesh(new THREE.SphereGeometry(250, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { top: { value: new THREE.Color(0x0b1026) }, mid: { value: new THREE.Color(0x2a2f45) }, low: { value: new THREE.Color(0xc0603a) } },
  vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 low; varying vec3 vP; void main(){ float h = vP.y; vec3 c = mix(mid, top, smoothstep(0.05, 0.6, h)); c = mix(c, low, smoothstep(0.18, -0.02, h) * 0.55); gl_FragColor = vec4(c, 1.0); }',
}));
sky.position.set(MW * CELL / 2, 0, MH * CELL / 2); sky.renderOrder = -1; scene.add(sky);
{
  const n = 600, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const th = Math.random() * Math.PI * 2, y = rand(0.25, 1), r = Math.sqrt(1 - y * y); pos.set([Math.cos(th) * r * 240, y * 240, Math.sin(th) * r * 240], i * 3); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const st = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 1.2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.8 }));
  st.position.copy(sky.position); scene.add(st);
}
const floorRough = canvasTex(512, 512, (g, w, h) => {
  g.fillStyle = '#e6e6e6'; g.fillRect(0, 0, w, h);
  g.filter = 'blur(18px)';
  for (let i = 0; i < 18; i++) { g.fillStyle = `rgba(120,120,120,${rand(0.4, 0.8)})`; g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, rand(25, 60), rand(12, 35), Math.random() * 3, 0, 7); g.fill(); }
  g.filter = 'none'; speckle(g, w, h, 5000, 0.12);
}, MW / 4, MH / 4);
floorRough.colorSpace = THREE.NoColorSpace;
const floor = new THREE.Mesh(new THREE.PlaneGeometry(MW * CELL, MH * CELL), new THREE.MeshStandardMaterial({ map: floorTex, roughnessMap: floorRough, roughness: 1, metalness: 0.05, envMapIntensity: 0.4 }));
floor.rotation.x = -Math.PI / 2; floor.position.set(MW * CELL / 2, 0, MH * CELL / 2); floor.receiveShadow = true;
scene.add(floor);
function buildInstanced(ch, h, mat, geo = new THREE.BoxGeometry(CELL, h, CELL)) {
  const cells = []; for (let z = 0; z < MH; z++) for (let x = 0; x < MW; x++) if (MAP[z][x] === ch) cells.push([x, z]);
  const m = new THREE.InstancedMesh(geo, mat, cells.length);
  const mat4 = new THREE.Matrix4();
  cells.forEach(([x, z], i) => { mat4.makeTranslation(x * CELL + CELL / 2, h / 2, z * CELL + CELL / 2); m.setMatrixAt(i, mat4); });
  m.castShadow = m.receiveShadow = true; scene.add(m); return m;
}
buildInstanced('#', WALL_H, new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.85, envMapIntensity: 0.35 }));
buildInstanced('b', CRATE_H, new THREE.MeshStandardMaterial({ map: crateTex, roughness: 0.75, envMapIntensity: 0.35 }), new RoundedBoxGeometry(CELL - 0.02, CRATE_H, CELL - 0.02, 2, 0.07));
buildInstanced('B', TALL_H, new THREE.MeshStandardMaterial({ map: tallTex, roughness: 0.45, metalness: 0.45, envMapIntensity: 0.6 }), new RoundedBoxGeometry(CELL - 0.02, TALL_H, CELL - 0.02, 2, 0.06));
// карнизы стен и неоновые полосы в цветах команд на сторонах карты
{
  const walls = []; for (let z = 0; z < MH; z++) for (let x = 0; x < MW; x++) if (MAP[z][x] === '#') walls.push([x, z]);
  const cap = new THREE.InstancedMesh(new THREE.BoxGeometry(CELL + 0.12, 0.22, CELL + 0.12), new THREE.MeshStandardMaterial({ color: 0x3a4152, roughness: 0.5, metalness: 0.6, envMapIntensity: 0.6 }), walls.length);
  const m4 = new THREE.Matrix4();
  walls.forEach(([x, z], i) => { m4.makeTranslation(x * CELL + 1, WALL_H + 0.05, z * CELL + 1); cap.setMatrixAt(i, m4); });
  cap.castShadow = cap.receiveShadow = true; scene.add(cap);
  const strips = [[], []];
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (const [x, z] of walls) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    if (!walk(x + dx, z + dz) || rnd() > 0.22) continue;
    strips[x < MW / 2 ? 0 : 1].push([x * CELL + 1 + dx * 1.005, z * CELL + 1 + dz * 1.005, dx !== 0]);
  }
  const sg = new THREE.BoxGeometry(1.5, 0.07, 0.05);
  strips.forEach((list, t) => {
    const im = new THREE.InstancedMesh(sg, new THREE.MeshBasicMaterial({ color: t ? 0xff9a50 : 0x5fc0ff }), list.length);
    list.forEach(([x, z, rot], i) => { m4.makeRotationY(rot ? Math.PI / 2 : 0).setPosition(x, 2.9, z); im.setMatrixAt(i, m4); });
    scene.add(im);
  });
}

// узел связи
const zoneMat = new THREE.MeshBasicMaterial({ color: 0xc7a6ff, transparent: true, opacity: 0.18, depthWrite: false });
const zonePlane = new THREE.Mesh(new THREE.PlaneGeometry(zone.x1 - zone.x0, zone.z1 - zone.z0), zoneMat);
zonePlane.rotation.x = -Math.PI / 2; zonePlane.position.set(zone.cx, 0.02, zone.cz); scene.add(zonePlane);
const zoneEdge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(zone.x1 - zone.x0, 0.05, zone.z1 - zone.z0)), new THREE.LineBasicMaterial({ color: 0xc7a6ff }));
zoneEdge.position.set(zone.cx, 0.05, zone.cz); scene.add(zoneEdge);
const beamMat = new THREE.MeshBasicMaterial({ color: 0xc7a6ff, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, 40, 16, 1, true), beamMat);
beam.position.set(zone.cx, 20, zone.cz); scene.add(beam);
const ring = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.06, 8, 48), new THREE.MeshBasicMaterial({ color: 0xc7a6ff }));
ring.rotation.x = Math.PI / 2; ring.position.set(zone.cx, 1.5, zone.cz); scene.add(ring);
const zoneLight = new THREE.PointLight(0xc7a6ff, 30, 16); zoneLight.position.set(zone.cx, 3, zone.cz); scene.add(zoneLight);
for (const t of [0, 1]) {
  const c = spawnCells[t][7]; const L = new THREE.PointLight(t ? 0xff8a3d : 0x4fb3ff, 25, 14);
  L.position.set(c[0] * CELL + 1, 3, c[1] * CELL + 1); scene.add(L);
}

