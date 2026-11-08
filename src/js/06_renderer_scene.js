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

const MAX_ANISO = Math.min(8, renderer.capabilities.getMaxAnisotropy());
function canvasTex(w, h, draw, rx = 1, ry = 1) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = MAX_ANISO; return t;
}
function speckle(g, w, h, n, a) { for (let i = 0; i < n; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${Math.random() * a})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); } }
// Набор PBR-текстур из процедурных рисунков: цвет, карта нормалей (из карты высот фильтром Собеля)
// и карта шероховатости. Разрешение подобрано под класс объекта: стены и пол крупнее, мелочь меньше.
function pbrSet(w, h, drawColor, drawHeight, drawRough, normalK = 2.5, rx = 1, ry = 1) {
  const map = canvasTex(w, h, drawColor, rx, ry);
  const hc = document.createElement('canvas'); hc.width = w; hc.height = h; const hg = hc.getContext('2d');
  hg.fillStyle = '#808080'; hg.fillRect(0, 0, w, h); drawHeight(hg, w, h);
  const src = hg.getImageData(0, 0, w, h).data, nc = document.createElement('canvas'); nc.width = w; nc.height = h;
  const ng = nc.getContext('2d'), out = ng.createImageData(w, h), d = out.data;
  const H = (x, y) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (H(x + 1, y - 1) + 2 * H(x + 1, y) + H(x + 1, y + 1) - H(x - 1, y - 1) - 2 * H(x - 1, y) - H(x - 1, y + 1)) * normalK;
    const dy = (H(x - 1, y + 1) + 2 * H(x, y + 1) + H(x + 1, y + 1) - H(x - 1, y - 1) - 2 * H(x, y - 1) - H(x + 1, y - 1)) * normalK;
    const l = Math.hypot(dx, dy, 1), i = (y * w + x) * 4;
    d[i] = (-dx / l * 0.5 + 0.5) * 255; d[i + 1] = (dy / l * 0.5 + 0.5) * 255; d[i + 2] = (1 / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  ng.putImageData(out, 0, 0);
  const normalMap = new THREE.CanvasTexture(nc); normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping; normalMap.repeat.set(rx, ry); normalMap.anisotropy = MAX_ANISO;
  const roughnessMap = drawRough ? canvasTex(w, h, drawRough, rx, ry) : null; if (roughnessMap) roughnessMap.colorSpace = THREE.NoColorSpace;
  return { map, normalMap, roughnessMap };
}
const rnd01 = (() => { let s = 12345; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
// пол: бетонные плиты со швами, пятнами и трещинами
const floorSet = pbrSet(512, 512, (g, w, h) => {
  g.fillStyle = '#3d4352'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 26; i++) { g.fillStyle = `rgba(${rnd01() < 0.5 ? '20,24,32' : '90,96,110'},${rnd01() * 0.12})`; g.beginPath(); g.ellipse(rnd01() * w, rnd01() * h, 20 + rnd01() * 70, 10 + rnd01() * 40, rnd01() * 3, 0, 7); g.fill(); }
  speckle(g, w, h, 9000, 0.12);
  g.strokeStyle = '#262b36'; g.lineWidth = 5; for (const v of [2, w / 2]) { g.beginPath(); g.moveTo(v, 0); g.lineTo(v, h); g.moveTo(0, v); g.lineTo(w, v); g.stroke(); }
  g.strokeStyle = 'rgba(20,22,28,.6)'; g.lineWidth = 1.5; for (let i = 0; i < 5; i++) { let x = rnd01() * w, y = rnd01() * h; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (rnd01() - 0.5) * 40; y += (rnd01() - 0.5) * 40; g.lineTo(x, y); } g.stroke(); }
}, (g, w, h) => {
  g.strokeStyle = '#303030'; g.lineWidth = 6; for (const v of [2, w / 2]) { g.beginPath(); g.moveTo(v, 0); g.lineTo(v, h); g.moveTo(0, v); g.lineTo(w, v); g.stroke(); }
  for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(${rnd01() < 0.5 ? '0,0,0' : '255,255,255'},${rnd01() * 0.15})`; g.fillRect(rnd01() * w, rnd01() * h, 2, 2); }
}, (g, w, h) => {
  g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, w, h); g.filter = 'blur(16px)';
  for (let i = 0; i < 18; i++) { g.fillStyle = `rgba(110,110,110,${0.4 + rnd01() * 0.4})`; g.beginPath(); g.ellipse(rnd01() * w, rnd01() * h, 25 + rnd01() * 50, 12 + rnd01() * 30, rnd01() * 3, 0, 7); g.fill(); }
  g.filter = 'none';
}, 2.2, MW, MH);
// стены: бетонные панели с утоплёнными швами, болтами, потёками и разметкой у пола
const wallSet = pbrSet(512, 1024, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#646d80'); gr.addColorStop(1, '#4f5768'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  speckle(g, w, h, 12000, 0.14);
  for (let i = 0; i < 14; i++) { const x = rnd01() * w, y = rnd01() * h * 0.6; const gg = g.createLinearGradient(0, y, 0, y + 260); gg.addColorStop(0, 'rgba(20,22,28,.28)'); gg.addColorStop(1, 'rgba(20,22,28,0)'); g.fillStyle = gg; g.fillRect(x, y, 6 + rnd01() * 18, 260); }
  g.strokeStyle = '#3a4152'; g.lineWidth = 5; for (let y = 0; y < h; y += 256) g.strokeRect(6, y + 6, w - 12, 244);
  g.fillStyle = '#8d97aa'; for (let y = 0; y < h; y += 256) for (const [bx, by] of [[22, 22], [w - 22, 22], [22, 228], [w - 22, 228]]) { g.beginPath(); g.arc(bx, y + by, 5, 0, 7); g.fill(); }
  g.fillStyle = '#2b2f3a'; g.fillRect(0, h - 120, w, 120);
  for (let x = -120; x < w; x += 80) { g.fillStyle = '#d9a43a'; g.beginPath(); g.moveTo(x, h - 120); g.lineTo(x + 40, h - 120); g.lineTo(x + 100, h); g.lineTo(x + 60, h); g.fill(); }
  g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, h - 128, w, 8);
  g.fillStyle = '#7fe7ff'; g.fillRect(0, 180, w, 8);
}, (g, w, h) => {
  g.strokeStyle = '#2a2a2a'; g.lineWidth = 8; for (let y = 0; y < h; y += 256) g.strokeRect(6, y + 6, w - 12, 244);
  g.fillStyle = '#e0e0e0'; for (let y = 0; y < h; y += 256) for (const [bx, by] of [[22, 22], [w - 22, 22], [22, 228], [w - 22, 228]]) { g.beginPath(); g.arc(bx, y + by, 5, 0, 7); g.fill(); }
  g.fillStyle = '#6a6a6a'; g.fillRect(0, h - 128, w, 6);
  for (let i = 0; i < 6000; i++) { g.fillStyle = `rgba(${rnd01() < 0.5 ? '0,0,0' : '255,255,255'},${rnd01() * 0.2})`; g.fillRect(rnd01() * w, rnd01() * h, 2, 2); }
}, (g, w, h) => {
  g.fillStyle = '#d0d0d0'; g.fillRect(0, 0, w, h); g.fillStyle = '#9a9a9a'; g.fillRect(0, h - 120, w, 120); g.fillStyle = '#707070'; g.fillRect(0, 180, w, 8);
  speckle(g, w, h, 5000, 0.2);
}, 2.6);
// ящики: доски, рамка, крестовина и гвозди
const crateSet = pbrSet(256, 256, (g, w, h) => {
  g.fillStyle = '#6b5236'; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 32) { g.fillStyle = `rgba(${rnd01() < 0.5 ? '40,26,12' : '140,104,64'},${0.15 + rnd01() * 0.15})`; g.fillRect(0, y, w, 30); g.fillStyle = 'rgba(30,18,8,.6)'; g.fillRect(0, y + 30, w, 2); }
  speckle(g, w, h, 2500, 0.2);
  g.strokeStyle = '#3d2c1b'; g.lineWidth = 18; g.strokeRect(9, 9, w - 18, h - 18);
  g.lineWidth = 14; g.beginPath(); g.moveTo(16, 16); g.lineTo(w - 16, h - 16); g.moveTo(w - 16, 16); g.lineTo(16, h - 16); g.stroke();
  g.fillStyle = '#9aa0a8'; for (const [x, y] of [[9, 9], [w - 9, 9], [9, h - 9], [w - 9, h - 9]]) { g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); }
}, (g, w, h) => {
  for (let y = 0; y < h; y += 32) { g.fillStyle = '#404040'; g.fillRect(0, y + 30, w, 2); }
  g.strokeStyle = '#d0d0d0'; g.lineWidth = 18; g.strokeRect(9, 9, w - 18, h - 18);
  g.lineWidth = 14; g.beginPath(); g.moveTo(16, 16); g.lineTo(w - 16, h - 16); g.moveTo(w - 16, 16); g.lineTo(16, h - 16); g.stroke();
}, null, 3);
// высокие контейнеры: гофрированный металл, краска и маркировка
const tallSet = pbrSet(256, 256, (g, w, h) => {
  g.fillStyle = '#2f5b6b'; g.fillRect(0, 0, w, h); speckle(g, w, h, 2500, 0.18);
  for (let x = 10; x < w; x += 26) { g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(x, 0, 10, h); g.fillStyle = 'rgba(255,255,255,.06)'; g.fillRect(x + 10, 0, 3, h); }
  g.strokeStyle = '#1b333d'; g.lineWidth = 12; g.strokeRect(6, 6, w - 12, h - 12);
  g.fillStyle = 'rgba(120,70,40,.35)'; for (let i = 0; i < 8; i++) g.fillRect(rnd01() * w, rnd01() * h, 4 + rnd01() * 18, 2 + rnd01() * 30);
  g.fillStyle = '#ff8a3d'; g.font = 'bold 40px sans-serif'; g.fillText('PX-7', 70, 140);
}, (g, w, h) => {
  for (let x = 10; x < w; x += 26) { const gr = g.createLinearGradient(x, 0, x + 13, 0); gr.addColorStop(0, '#606060'); gr.addColorStop(0.5, '#c0c0c0'); gr.addColorStop(1, '#808080'); g.fillStyle = gr; g.fillRect(x, 0, 13, h); }
  g.strokeStyle = '#d0d0d0'; g.lineWidth = 12; g.strokeRect(6, 6, w - 12, h - 12);
}, (g, w, h) => { g.fillStyle = '#7a7a7a'; g.fillRect(0, 0, w, h); speckle(g, w, h, 3000, 0.25); g.fillStyle = 'rgba(230,230,230,.6)'; for (let i = 0; i < 8; i++) g.fillRect(rnd01() * w, rnd01() * h, 4 + rnd01() * 18, 2 + rnd01() * 30); }, 2);
// воздуховод: оцинкованный короб с рёбрами и полосами «осторожно, низко»
const ductSet = pbrSet(256, 256, (g, w, h) => {
  g.fillStyle = '#8a95a3'; g.fillRect(0, 0, w, h); speckle(g, w, h, 3000, 0.12);
  for (let x = 0; x < w; x += 32) { g.fillStyle = 'rgba(0,0,0,.22)'; g.fillRect(x, 0, 4, h); g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(x + 4, 0, 2, h); }
  for (let x = -40; x < w; x += 40) { g.fillStyle = '#e0b030'; g.beginPath(); g.moveTo(x, h - 30); g.lineTo(x + 20, h - 30); g.lineTo(x + 40, h); g.lineTo(x + 20, h); g.fill(); g.fillStyle = '#1a1a1a'; g.beginPath(); g.moveTo(x + 20, h - 30); g.lineTo(x + 40, h - 30); g.lineTo(x + 60, h); g.lineTo(x + 40, h); g.fill(); }
}, (g, w, h) => { for (let x = 0; x < w; x += 32) { g.fillStyle = '#d0d0d0'; g.fillRect(x, 0, 6, h); } }, (g, w, h) => { g.fillStyle = '#5a5a5a'; g.fillRect(0, 0, w, h); speckle(g, w, h, 4000, 0.3); }, 2);

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
const floor = new THREE.Mesh(new THREE.PlaneGeometry(MW * CELL, MH * CELL), new THREE.MeshStandardMaterial({ ...floorSet, roughness: 1, metalness: 0.05, envMapIntensity: 0.45, normalScale: new THREE.Vector2(0.6, 0.6) }));
floor.rotation.x = -Math.PI / 2; floor.position.set(MW * CELL / 2, 0, MH * CELL / 2); floor.receiveShadow = true;
scene.add(floor);
// земля за пределами локации и городские силуэты вдали — глубина и атмосферная перспектива (уходят в туман)
{
  const outer = new THREE.Mesh(new THREE.RingGeometry(Math.hypot(MW, MH) * CELL * 0.5 + 2, 260, 48, 1), new THREE.MeshStandardMaterial({ color: 0x232838, roughness: 1, metalness: 0 }));
  outer.rotation.x = -Math.PI / 2; outer.position.set(MW * CELL / 2, -0.02, MH * CELL / 2); scene.add(outer);
  const under = new THREE.Mesh(new THREE.PlaneGeometry(MW * CELL + 40, MH * CELL + 40), new THREE.MeshStandardMaterial({ color: 0x232838, roughness: 1 }));
  under.rotation.x = -Math.PI / 2; under.position.set(MW * CELL / 2, -0.03, MH * CELL / 2); scene.add(under);
  const winTex = canvasTex(64, 128, (g, w, h) => { g.fillStyle = '#141824'; g.fillRect(0, 0, w, h); for (let y = 6; y < h; y += 12) for (let x = 5; x < w; x += 12) { g.fillStyle = rnd01() < 0.22 ? `rgba(255,${190 + rnd01() * 50 | 0},120,${0.5 + rnd01() * 0.5})` : 'rgba(40,48,66,.8)'; g.fillRect(x, y, 6, 7); } });
  const bm = new THREE.MeshStandardMaterial({ color: 0x1a1f2c, roughness: 0.9, emissive: 0xffffff, emissiveMap: winTex, emissiveIntensity: 0.55, map: winTex });
  const n = 70, sk = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), bm, n), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2 + rnd01() * 0.05, r = 95 + rnd01() * 60, hgt = 14 + rnd01() * 46;
    ps.set(MW * CELL / 2 + Math.cos(a) * r * 1.2, hgt / 2, MH * CELL / 2 + Math.sin(a) * r); sc.set(8 + rnd01() * 14, hgt, 8 + rnd01() * 14); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd01() * 3);
    sk.setMatrixAt(i, m4.compose(ps, q, sc));
  }
  scene.add(sk);
}
function buildInstanced(ch, h, mat, geo = new THREE.BoxGeometry(CELL, h, CELL), y0 = 0) {
  const cells = []; for (let z = 0; z < MH; z++) for (let x = 0; x < MW; x++) if (MAP[z][x] === ch) cells.push([x, z]);
  const m = new THREE.InstancedMesh(geo, mat, cells.length);
  const mat4 = new THREE.Matrix4();
  cells.forEach(([x, z], i) => { mat4.makeTranslation(x * CELL + CELL / 2, y0 + h / 2, z * CELL + CELL / 2); m.setMatrixAt(i, mat4); });
  m.castShadow = m.receiveShadow = true; scene.add(m); return m;
}
buildInstanced('#', WALL_H, new THREE.MeshStandardMaterial({ ...wallSet, roughness: 1, envMapIntensity: 0.4, normalScale: new THREE.Vector2(0.8, 0.8) }));
buildInstanced('b', CRATE_H, new THREE.MeshStandardMaterial({ map: crateSet.map, normalMap: crateSet.normalMap, roughness: 0.78, envMapIntensity: 0.35 }), new RoundedBoxGeometry(CELL - 0.02, CRATE_H, CELL - 0.02, 2, 0.07));
buildInstanced('B', TALL_H, new THREE.MeshStandardMaterial({ ...tallSet, roughness: 1, metalness: 0.5, envMapIntensity: 0.7 }), new RoundedBoxGeometry(CELL - 0.02, TALL_H, CELL - 0.02, 2, 0.06));
buildInstanced('u', DUCT_T - DUCT_B, new THREE.MeshStandardMaterial({ ...ductSet, roughness: 1, metalness: 0.7, envMapIntensity: 0.9 }), new RoundedBoxGeometry(CELL, DUCT_T - DUCT_B, CELL - 0.04, 2, 0.05), DUCT_B);
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

// статичная геометрия мира — слой 1 (для AO и будущего отсечения невидимого)
for (const o of scene.children) if ((o.isMesh || o.isInstancedMesh) && o !== sky && !(o.material && o.material.transparent)) o.layers.enable(1);
bootMark('06_renderer_scene');
