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

const hemi = new THREE.HemisphereLight(0xb8c6ff, 0x4a3a2a, 1.0), amb = new THREE.AmbientLight(0x404a66, 0.25);
scene.add(hemi, amb);
const sun = new THREE.DirectionalLight(0xffd9b0, 2.1);
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

// кирпич: кладка со швами и разными оттенками
const brickSet = pbrSet(512, 512, (g, w, h) => {
  g.fillStyle = '#7a3f2c'; g.fillRect(0, 0, w, h);
  for (let y = 0, r = 0; y < h; y += 32, r++) for (let x = (r % 2) * -32; x < w; x += 64) { const k = 0.75 + rnd01() * 0.4; g.fillStyle = `rgb(${130 * k | 0},${62 * k | 0},${44 * k | 0})`; g.fillRect(x + 2, y + 2, 60, 28); }
  g.fillStyle = 'rgba(200,190,170,.35)'; for (let y = 0; y < h; y += 32) g.fillRect(0, y, w, 3);
  speckle(g, w, h, 6000, 0.15);
}, (g, w, h) => { g.fillStyle = '#c0c0c0'; g.fillRect(0, 0, w, h); g.fillStyle = '#404040'; for (let y = 0, r = 0; y < h; y += 32, r++) { g.fillRect(0, y, w, 3); for (let x = (r % 2) * -32; x < w; x += 64) g.fillRect(x, y, 3, 32); } }, null, 3);
// камень: бутовая кладка
const stoneSet = pbrSet(512, 512, (g, w, h) => {
  g.fillStyle = '#6d6a63'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 70; i++) { const k = 0.7 + rnd01() * 0.5; g.fillStyle = `rgb(${120 * k | 0},${116 * k | 0},${106 * k | 0})`; g.beginPath(); g.ellipse(rnd01() * w, rnd01() * h, 24 + rnd01() * 40, 16 + rnd01() * 24, rnd01() * 3, 0, 7); g.fill(); }
  speckle(g, w, h, 8000, 0.2);
}, (g, w, h) => { g.fillStyle = '#404040'; g.fillRect(0, 0, w, h); for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(230,230,230,${0.5 + rnd01() * 0.5})`; g.beginPath(); g.ellipse(rnd01() * w, rnd01() * h, 22 + rnd01() * 38, 14 + rnd01() * 22, rnd01() * 3, 0, 7); g.fill(); } }, null, 3);
// штукатурка: светлая с потёками
const plasterSet = pbrSet(256, 256, (g, w, h) => {
  g.fillStyle = '#b9b2a2'; g.fillRect(0, 0, w, h); speckle(g, w, h, 6000, 0.1);
  for (let i = 0; i < 8; i++) { const x = rnd01() * w; const gg = g.createLinearGradient(0, 0, 0, h); gg.addColorStop(0, 'rgba(60,55,45,.25)'); gg.addColorStop(1, 'rgba(60,55,45,0)'); g.fillStyle = gg; g.fillRect(x, 0, 5 + rnd01() * 12, h); }
}, (g, w, h) => { for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(${rnd01() < 0.5 ? '0,0,0' : '255,255,255'},${rnd01() * 0.25})`; g.fillRect(rnd01() * w, rnd01() * h, 2, 2); } }, null, 1.5);
// асфальт и грунт
const asphaltSet = pbrSet(512, 512, (g, w, h) => { g.fillStyle = '#2d3036'; g.fillRect(0, 0, w, h); speckle(g, w, h, 16000, 0.18); g.strokeStyle = 'rgba(15,15,18,.7)'; g.lineWidth = 1.5; for (let i = 0; i < 6; i++) { let x = rnd01() * w, y = rnd01() * h; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 8; k++) { x += (rnd01() - 0.5) * 50; y += (rnd01() - 0.5) * 50; g.lineTo(x, y); } g.stroke(); } },
  (g, w, h) => { for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(${rnd01() < 0.5 ? '0,0,0' : '255,255,255'},${rnd01() * 0.3})`; g.fillRect(rnd01() * w, rnd01() * h, 2, 2); } }, null, 1.2);
const dirtSet = pbrSet(512, 512, (g, w, h) => { g.fillStyle = '#5b4e3c'; g.fillRect(0, 0, w, h); for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(${rnd01() < 0.5 ? '70,60,45' : '110,95,70'},${0.2 + rnd01() * 0.3})`; g.beginPath(); g.ellipse(rnd01() * w, rnd01() * h, 20 + rnd01() * 60, 10 + rnd01() * 30, rnd01() * 3, 0, 7); g.fill(); } speckle(g, w, h, 14000, 0.2); },
  (g, w, h) => { for (let i = 0; i < 12000; i++) { g.fillStyle = `rgba(${rnd01() < 0.5 ? '0,0,0' : '255,255,255'},${rnd01() * 0.35})`; g.fillRect(rnd01() * w, rnd01() * h, 3, 3); } }, null, 1.5);
const tileSet = floorSet;
// бетон без разметки: плиты перекрытий, стены цехов, бункеры
const concreteSet = pbrSet(512, 512, (g, w, h) => {
  g.fillStyle = '#7d8086'; g.fillRect(0, 0, w, h); speckle(g, w, h, 14000, 0.12);
  for (let i = 0; i < 20; i++) { g.fillStyle = `rgba(${rnd01() < 0.5 ? '40,42,48' : '150,152,158'},${rnd01() * 0.14})`; g.beginPath(); g.ellipse(rnd01() * w, rnd01() * h, 30 + rnd01() * 80, 15 + rnd01() * 40, rnd01() * 3, 0, 7); g.fill(); }
  g.strokeStyle = '#5c5f66'; g.lineWidth = 3; g.strokeRect(2, 2, w - 4, h - 4);
  g.fillStyle = '#9a9ea6'; for (const [x, y] of [[24, 24], [w - 24, 24], [24, h - 24], [w - 24, h - 24], [w / 2, h / 2]]) { g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill(); }
}, (g, w, h) => { g.strokeStyle = '#303030'; g.lineWidth = 5; g.strokeRect(2, 2, w - 4, h - 4); for (let i = 0; i < 7000; i++) { g.fillStyle = `rgba(${rnd01() < 0.5 ? '0,0,0' : '255,255,255'},${rnd01() * 0.22})`; g.fillRect(rnd01() * w, rnd01() * h, 2, 2); } }, null, 2.2);
// листовой металл: гофра с потёртостями (цеха, ангары, заборы)
const sheetSet = pbrSet(256, 256, (g, w, h) => {
  g.fillStyle = '#7f8a92'; g.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 16) { const gr = g.createLinearGradient(x, 0, x + 16, 0); gr.addColorStop(0, 'rgba(0,0,0,.25)'); gr.addColorStop(0.5, 'rgba(255,255,255,.12)'); gr.addColorStop(1, 'rgba(0,0,0,.25)'); g.fillStyle = gr; g.fillRect(x, 0, 16, h); }
  speckle(g, w, h, 4000, 0.15); g.fillStyle = 'rgba(110,70,40,.3)'; for (let i = 0; i < 10; i++) g.fillRect(rnd01() * w, rnd01() * h, 3 + rnd01() * 10, 10 + rnd01() * 40);
}, (g, w, h) => { for (let x = 0; x < w; x += 16) { const gr = g.createLinearGradient(x, 0, x + 16, 0); gr.addColorStop(0, '#404040'); gr.addColorStop(0.5, '#e0e0e0'); gr.addColorStop(1, '#404040'); g.fillStyle = gr; g.fillRect(x, 0, 16, h); } },
(g, w, h) => { g.fillStyle = '#6a6a6a'; g.fillRect(0, 0, w, h); speckle(g, w, h, 5000, 0.35); }, 3);
// материалы мира: тип → PBR-материал и масштаб текстуры (метров на повтор)
const WMAT = {};
function worldMat(m) {
  if (WMAT[m]) return WMAT[m];
  const T = (set, rep, o = {}) => { const mm = new THREE.MeshStandardMaterial({ map: set.map.clone(), normalMap: set.normalMap.clone(), roughnessMap: set.roughnessMap ? set.roughnessMap.clone() : null, roughness: 1, envMapIntensity: 0.45, ...o }); for (const t of [mm.map, mm.normalMap, mm.roughnessMap]) if (t) { t.repeat.set(1, 1); t.needsUpdate = true; } mm.userData.rep = rep; return mm; };
  const def = {
    concrete: () => T(concreteSet, 3.5, { normalScale: new THREE.Vector2(0.6, 0.6) }), panel: () => T(wallSet, 4.5, { normalScale: new THREE.Vector2(0.7, 0.7) }), brick: () => T(brickSet, 2.5), stone: () => T(stoneSet, 3), plaster: () => T(plasterSet, 2.5, { color: 0xf0ece4 }),
    metal: () => T(sheetSet, 2.5, { metalness: 0.55, envMapIntensity: 0.8 }), roof: () => T(sheetSet, 2.5, { metalness: 0.5, color: 0xb07a5a }), duct: () => T(ductSet, 2, { metalness: 0.7, envMapIntensity: 0.9 }),
    container: () => T(tallSet, 2.4, { metalness: 0.45, envMapIntensity: 0.6 }), wood: () => T(crateSet, 1.2, { roughness: 0.8, color: 0xc9a27a }), crate: () => T(crateSet, 1.1, { roughness: 0.78 }),
    asphalt: () => T(asphaltSet, 4), dirt: () => T(dirtSet, 4), tile: () => T(tileSet, 4, { normalScale: new THREE.Vector2(0.6, 0.6) }), sand: () => T(dirtSet, 1.5, { color: 0xd8c9a0 }),
    car: () => new THREE.MeshStandardMaterial({ color: 0x5a6b7c, metalness: 0.6, roughness: 0.35, envMapIntensity: 1.1 }),
    snow: () => T(plasterSet, 3, { color: 0xffffff }), grass: () => T(dirtSet, 4, { color: 0x6f8a4a }),
  };
  return (WMAT[m] = (def[m] || def.concrete)());
}
// грани коробки с UV в мировых метрах (текстура тянется по поверхности без искажений)
function pushBoxGeo(b, acc, rep) {
  const { x0, y0, z0, x1, y1, z1 } = b, k = 1 / rep;
  const F = [
    [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], (p) => [-p[2] * k, p[1] * k]],
    [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], (p) => [p[2] * k, p[1] * k]],
    [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], (p) => [p[0] * k, -p[2] * k]],
    [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], (p) => [p[0] * k, p[2] * k]],
    [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], (p) => [p[0] * k, p[1] * k]],
    [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], (p) => [-p[0] * k, p[1] * k]],
  ];
  for (const [a, b_, c, d, n, uv] of F) {
    const base = acc.pos.length / 3;
    for (const p of [a, b_, c, d]) { acc.pos.push(p[0], p[1], p[2]); acc.nrm.push(n[0], n[1], n[2]); const u = uv(p); acc.uv.push(u[0], u[1]); }
    acc.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}
const WR = { group: new THREE.Group(), glass: null, glassBoxes: [], lights: [] };
scene.add(WR.group);
const glassMat = new THREE.MeshStandardMaterial({ color: 0x9fc8e0, transparent: true, opacity: 0.32, roughness: 0.05, metalness: 0.2, envMapIntensity: 1.6, depthWrite: false });
const carColors = [0x5a6b7c, 0x7a2d2a, 0x2f4a3a, 0xb8b0a0, 0x23262d, 0x6b5a3a];
// небо (цвета задаёт окружение карты) и звёзды
const sky = new THREE.Mesh(new THREE.SphereGeometry(250, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { top: { value: new THREE.Color(0x0b1026) }, mid: { value: new THREE.Color(0x2a2f45) }, low: { value: new THREE.Color(0xc0603a) } },
  vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 low; varying vec3 vP; void main(){ float h = vP.y; vec3 c = mix(mid, top, smoothstep(0.05, 0.6, h)); c = mix(c, low, smoothstep(0.18, -0.02, h) * 0.55); gl_FragColor = vec4(c, 1.0); }',
}));
sky.renderOrder = -1; scene.add(sky);
const stars = (() => {
  const n = 600, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const th = Math.random() * Math.PI * 2, y = rand(0.25, 1), r = Math.sqrt(1 - y * y); pos.set([Math.cos(th) * r * 240, y * 240, Math.sin(th) * r * 240], i * 3); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const st = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 1.2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.8 })); scene.add(st); return st;
})();
// время суток: небо, туман, солнце, рассеянный свет
const ENV_TIME = {
  dusk: { sky: [0x0b1026, 0x2a2f45, 0xc0603a], fog: [0x2a2f45, 50, 170], sun: [0xffd9b0, 2.1, [30, 60, -25]], hemi: [0xb8c6ff, 0x4a3a2a, 1.0], amb: 0.25, stars: 0.8, exp: 1 },
  overcast: { sky: [0x3a4250, 0x6a7280, 0x8a8a88], fog: [0x6a7280, 25, 120], sun: [0xd8dde6, 1.1, [-20, 70, 30]], hemi: [0xc8d0dc, 0x4a4640, 1.35], amb: 0.35, stars: 0, exp: 1 },
  night: { sky: [0x03050c, 0x0c1222, 0x1e2436], fog: [0x0c1222, 24, 120], sun: [0x9fb4ff, 0.7, [-40, 60, 20]], hemi: [0x5a6a90, 0x221c16, 0.8], amb: 0.28, stars: 1, exp: 1.2 },
  day: { sky: [0x3f7fd6, 0x9cc4ec, 0xdfe8ef], fog: [0xb8cde0, 60, 230], sun: [0xfff2dc, 3.0, [40, 80, 30]], hemi: [0xcfe2ff, 0x6a5a40, 1.2], amb: 0.3, stars: 0, exp: 0.95 },
  morning: { sky: [0x6c8fb8, 0xb9c6d2, 0xe8d8c0], fog: [0xc4ccd4, 18, 95], sun: [0xffe6c4, 2.0, [60, 35, -30]], hemi: [0xd8e2ee, 0x5a5048, 1.25], amb: 0.32, stars: 0, exp: 1 },
};
let skyline = null, outerGround = null, groundMesh = null, zoneObj = null;
function buildWorldRender() {
  // очистка прошлой карты
  for (const o of [...WR.group.children]) { WR.group.remove(o); o.traverse(c => { if (c.geometry) c.geometry.dispose(); }); }
  for (const L of WR.lights) { scene.remove(L); L.dispose(); } WR.lights = []; WR.glassBoxes = [];
  const W = WORLD, env = ENV_TIME[W.env.time] || ENV_TIME.dusk;
  // геометрия: все коробки одного материала — один меш (статическое объединение = мало вызовов отрисовки)
  const acc = {};
  for (const b of W.boxes) {
    if (b.hidden || b.glass) continue;
    const key = b.car ? 'car' + (Math.abs(Math.floor(b.x0 * 7 + b.z0 * 13)) % carColors.length) : b.m;
    const a = acc[key] || (acc[key] = { pos: [], nrm: [], uv: [], idx: [], m: b.m, car: b.car });
    pushBoxGeo(b, a, worldMat(b.m).userData.rep || 2);
  }
  for (const [key, a] of Object.entries(acc)) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(a.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(a.nrm, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(a.uv, 2));
    g.setIndex(a.idx); g.computeBoundingSphere();
    let mat = worldMat(a.m);
    if (a.car) { mat = worldMat('car').clone(); mat.color.setHex(carColors[+key.slice(3)]); }
    const mesh = new THREE.Mesh(g, mat); mesh.castShadow = mesh.receiveShadow = true; mesh.layers.enable(1); WR.group.add(mesh);
  }
  // стекло — отдельные стёкла (можно разбить)
  const gl = W.boxes.filter(b => b.glass);
  if (gl.length) {
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), glassMat, gl.length), m4 = new THREE.Matrix4();
    gl.forEach((b, i) => { b.gi = i; m4.compose(new THREE.Vector3((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2), new THREE.Quaternion(), new THREE.Vector3(b.x1 - b.x0, b.y1 - b.y0, b.z1 - b.z0)); im.setMatrixAt(i, m4); });
    im.renderOrder = 1; WR.group.add(im); WR.glass = im; WR.glassBoxes = gl;
  } else WR.glass = null;
  // деревья (крона) и колёса машин — только вид
  const treeGeo = new THREE.ConeGeometry(1.6, 4.2, 9), treeMat = new THREE.MeshStandardMaterial({ color: 0x2f4a32, roughness: 0.9 });
  const trees = W.props.filter(p => p.kind === 'tree');
  if (trees.length) { const im = new THREE.InstancedMesh(treeGeo, treeMat, trees.length), m4 = new THREE.Matrix4(); trees.forEach((t, i) => im.setMatrixAt(i, m4.compose(new THREE.Vector3(t.x, 2.6 * t.s + 1.4, t.z), new THREE.Quaternion(), new THREE.Vector3(t.s, t.s, t.s)))); im.castShadow = true; WR.group.add(im); WR.trees = im; }
  const wheels = W.props.filter(p => p.kind === 'wheels');
  if (wheels.length) {
    const im = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.34, 0.34, 0.24, 14), new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.8 }), wheels.length * 4), m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
    wheels.forEach((w, i) => { const ax = w.alongX; q.setFromEuler(new THREE.Euler(ax ? Math.PI / 2 : 0, 0, ax ? 0 : Math.PI / 2)); [[-1.4, -0.85], [1.4, -0.85], [-1.4, 0.85], [1.4, 0.85]].forEach(([a, c], k) => im.setMatrixAt(i * 4 + k, m4.compose(new THREE.Vector3(w.x + (ax ? a : c), 0.34, w.z + (ax ? c : a)), q, new THREE.Vector3(1, 1, 1)))); });
    WR.group.add(im);
  }
  // земля
  if (groundMesh) { scene.remove(groundMesh); groundMesh.geometry.dispose(); groundMesh = null; }
  if (W.groundPlane) {
    const gm = worldMat(W.env.ground || 'tile'), g = new THREE.PlaneGeometry(W.W, W.D), rep = gm.userData.rep || 4;
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * W.W / rep, uv.getY(i) * W.D / rep);
    groundMesh = new THREE.Mesh(g, gm); groundMesh.rotation.x = -Math.PI / 2; groundMesh.position.set(W.W / 2, 0, W.D / 2); groundMesh.receiveShadow = true; groundMesh.layers.enable(1); scene.add(groundMesh);
  }
  // окрестности: земля вокруг и силуэты вдали
  if (outerGround) scene.remove(outerGround);
  const R0 = Math.hypot(W.W, W.D) * 0.5 + 2;
  outerGround = new THREE.Mesh(new THREE.RingGeometry(R0 - 6, 300, 48, 1), new THREE.MeshStandardMaterial({ color: env === ENV_TIME.day ? 0x6a6048 : 0x232838, roughness: 1 }));
  outerGround.rotation.x = -Math.PI / 2; outerGround.position.set(W.W / 2, -0.05, W.D / 2); scene.add(outerGround);
  if (skyline) { scene.remove(skyline); skyline = null; }
  {
    const mountain = W.id === 'village' || W.id === 'base';
    const winTex = canvasTex(64, 128, (g, w, h) => { g.fillStyle = '#141824'; g.fillRect(0, 0, w, h); for (let y = 6; y < h; y += 12) for (let x = 5; x < w; x += 12) { g.fillStyle = rnd01() < 0.22 ? `rgba(255,${190 + rnd01() * 50 | 0},120,${0.5 + rnd01() * 0.5})` : 'rgba(40,48,66,.8)'; g.fillRect(x, y, 6, 7); } });
    const bm = mountain ? new THREE.MeshStandardMaterial({ color: W.id === 'village' ? 0x5a6470 : 0x6b6a5a, roughness: 1, flatShading: true }) : new THREE.MeshStandardMaterial({ color: 0x1a1f2c, roughness: 0.9, emissive: 0xffffff, emissiveMap: winTex, emissiveIntensity: env.stars ? 0.55 : 0.08, map: winTex });
    const n = mountain ? 40 : 70, geo = mountain ? new THREE.ConeGeometry(1, 1, 6) : new THREE.BoxGeometry(1, 1, 1), sk = new THREE.InstancedMesh(geo, bm, n), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2 + rnd01() * 0.05, r = R0 + 45 + rnd01() * 70, hgt = mountain ? 40 + rnd01() * 70 : 14 + rnd01() * 46;
      ps.set(W.W / 2 + Math.cos(a) * r, hgt / 2, W.D / 2 + Math.sin(a) * r); sc.set(mountain ? 40 + rnd01() * 40 : 8 + rnd01() * 14, hgt, mountain ? 40 + rnd01() * 40 : 8 + rnd01() * 14); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd01() * 3);
      sk.setMatrixAt(i, m4.compose(ps, q, sc));
    }
    scene.add(sk); skyline = sk;
  }
  // небо, туман, солнце
  sky.position.set(W.W / 2, 0, W.D / 2); stars.position.copy(sky.position); stars.material.opacity = env.stars; stars.visible = env.stars > 0;
  sky.material.uniforms.top.value.setHex(env.sky[0]); sky.material.uniforms.mid.value.setHex(env.sky[1]); sky.material.uniforms.low.value.setHex(env.sky[2]);
  scene.background = new THREE.Color(env.fog[0]); scene.fog.color.setHex(env.fog[0]); WORLD.fogBase = [env.fog[1], env.fog[2]];
  sun.color.setHex(env.sun[0]); sun.intensity = env.sun[1]; sun.position.set(W.W / 2 + env.sun[2][0], env.sun[2][1], W.D / 2 + env.sun[2][2]); sun.target.position.set(W.W / 2, 0, W.D / 2);
  const ext = Math.max(W.W, W.D) * 0.62; Object.assign(sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: 260 }); sun.shadow.camera.updateProjectionMatrix();
  hemi.color.setHex(env.hemi[0]); hemi.groundColor.setHex(env.hemi[1]); hemi.intensity = env.hemi[2]; amb.intensity = env.amb;
  WORLD.exposure = env.exp;
  // локальные источники света карты (не больше 8 — ограничение по производительности)
  for (const l of W.lights.slice(0, 8)) { const L = new THREE.PointLight(l.color, l.intensity, l.dist); L.position.set(l.x, l.y, l.z); scene.add(L); WR.lights.push(L); }
  for (const t of [0, 1]) { const s = W.spawns[t][Math.floor(W.spawns[t].length / 2)]; if (!s) continue; const L = new THREE.PointLight(t ? 0xff8a3d : 0x4fb3ff, 20, 12); L.position.set(s[0], (s[2] || 0) + 3, s[1]); scene.add(L); WR.lights.push(L); }
  // узел связи
  zoneObj.place();
  if (typeof applySettings === 'function' && typeof buildPost === 'function') { try { applySettings(); } catch (e) {} }
}
// разбить стекло: стекло исчезает, летят осколки
function breakGlass(b, p) {
  if (!b || !b.glass || !b.alive) return;
  b.alive = false;
  if (WR.glass && b.gi !== undefined) { const m4 = new THREE.Matrix4().makeScale(0, 0, 0); WR.glass.setMatrixAt(b.gi, m4); WR.glass.instanceMatrix.needsUpdate = true; }
  if (typeof glassFx === 'function') glassFx(b, p);
  netEvent && NET && NET.mode === 'host' && netEvent({ k: 'gl', i: b.i });
}
function restoreGlass() {
  if (!WR.glass) return; const m4 = new THREE.Matrix4();
  for (const b of WR.glassBoxes) { if (b.alive) continue; b.alive = true; m4.compose(new THREE.Vector3((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2), new THREE.Quaternion(), new THREE.Vector3(b.x1 - b.x0, b.y1 - b.y0, b.z1 - b.z0)); WR.glass.setMatrixAt(b.gi, m4); }
  WR.glass.instanceMatrix.needsUpdate = true;
}
// узел связи: площадка, луч и кольцо (переставляются при смене карты)
const zoneMat = new THREE.MeshBasicMaterial({ color: 0xc7a6ff, transparent: true, opacity: 0.18, depthWrite: false });
const zonePlane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), zoneMat); zonePlane.rotation.x = -Math.PI / 2; scene.add(zonePlane);
const zoneEdge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 0.05, 1)), new THREE.LineBasicMaterial({ color: 0xc7a6ff })); scene.add(zoneEdge);
const beamMat = new THREE.MeshBasicMaterial({ color: 0xc7a6ff, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, 40, 16, 1, true), beamMat); scene.add(beam);
const ring = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.06, 8, 48), new THREE.MeshBasicMaterial({ color: 0xc7a6ff })); ring.rotation.x = Math.PI / 2; scene.add(ring);
const zoneLight = new THREE.PointLight(0xc7a6ff, 30, 16); scene.add(zoneLight);
zoneObj = { place() {
  const w = zone.x1 - zone.x0, d = zone.z1 - zone.z0, y = zone.y;
  zonePlane.scale.set(w, d, 1); zonePlane.position.set(zone.cx, y + 0.03, zone.cz);
  zoneEdge.scale.set(w, 1, d); zoneEdge.position.set(zone.cx, y + 0.05, zone.cz);
  beam.position.set(zone.cx, y + 20, zone.cz); ring.position.set(zone.cx, y + 1.5, zone.cz); zoneLight.position.set(zone.cx, y + 3, zone.cz);
} };
onWorld(buildWorldRender);
bootMark('06_renderer_scene');
