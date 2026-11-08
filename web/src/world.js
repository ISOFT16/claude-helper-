// Rendering, physics world, procedural textures, the map, effects and sounds.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { G, GROUP } from './state.js';

// ---------- Procedural textures ----------
const texCache = new Map();

function canvasTex(size, draw, repeat = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function noise(g, s, amount, alpha) {
  for (let i = 0; i < amount; i++) {
    const v = Math.random() * 255 | 0;
    g.fillStyle = `rgba(${v},${v},${v},${alpha})`;
    g.fillRect(Math.random() * s, Math.random() * s, 2, 2);
  }
}

const TEX = {
  // Ground: teal-grey tiles with a soft grid (our own look, not a dev texture copy)
  floor: () => canvasTex(256, (g, s) => {
    g.fillStyle = '#5d6b70'; g.fillRect(0, 0, s, s);
    noise(g, s, 1500, 0.06);
    g.strokeStyle = '#47555a'; g.lineWidth = 4; g.strokeRect(0, 0, s, s);
    g.strokeStyle = '#6f7f84'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(s / 2, 0); g.lineTo(s / 2, s); g.moveTo(0, s / 2); g.lineTo(s, s / 2); g.stroke();
    g.fillStyle = '#7d8f95'; g.font = 'bold 22px sans-serif'; g.fillText('SF', 10, 30);
  }),
  wall: () => canvasTex(256, (g, s) => {
    g.fillStyle = '#c9b48f'; g.fillRect(0, 0, s, s);
    noise(g, s, 2000, 0.07);
    g.strokeStyle = '#a8946e'; g.lineWidth = 3;
    for (let y = 0; y < s; y += 32) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(s, y); g.stroke();
      const off = (y / 32) % 2 ? 32 : 0;
      for (let x = off; x < s; x += 64) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 32); g.stroke(); }
    }
  }),
  concrete: () => canvasTex(256, (g, s) => {
    g.fillStyle = '#8d9196'; g.fillRect(0, 0, s, s);
    noise(g, s, 4000, 0.08);
    g.strokeStyle = '#7a7e83'; g.lineWidth = 2; g.strokeRect(1, 1, s - 2, s - 2);
  }),
  wood: () => canvasTex(128, (g, s) => {
    g.fillStyle = '#b07a42'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 40; i++) {
      g.strokeStyle = `rgba(90,50,20,${Math.random() * 0.25})`;
      g.beginPath(); const y = Math.random() * s; g.moveTo(0, y); g.bezierCurveTo(s / 3, y + 4, s / 2, y - 4, s, y + 2); g.stroke();
    }
    g.strokeStyle = '#6e4520'; g.lineWidth = 8; g.strokeRect(4, 4, s - 8, s - 8);
    g.beginPath(); g.moveTo(8, 8); g.lineTo(s - 8, s - 8); g.stroke();
  }),
  plank: () => canvasTex(128, (g, s) => {
    g.fillStyle = '#c08a52'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 50; i++) {
      g.strokeStyle = `rgba(100,60,25,${Math.random() * 0.3})`;
      g.beginPath(); const y = Math.random() * s; g.moveTo(0, y); g.lineTo(s, y + Math.random() * 6 - 3); g.stroke();
    }
  }),
  metal: () => canvasTex(128, (g, s) => {
    const gr = g.createLinearGradient(0, 0, s, s);
    gr.addColorStop(0, '#d5d9dd'); gr.addColorStop(1, '#9aa1a8');
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
    noise(g, s, 800, 0.08);
    g.fillStyle = '#7d848b';
    for (const [x, y] of [[10, 10], [s - 14, 10], [10, s - 14], [s - 14, s - 14]]) { g.beginPath(); g.arc(x + 2, y + 2, 4, 0, 7); g.fill(); }
  }),
  stripes: () => canvasTex(128, (g, s) => {
    g.fillStyle = '#e8e8e8'; g.fillRect(0, 0, s, s);
    g.fillStyle = '#d9412b';
    for (let i = -s; i < s * 2; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 16, 0); g.lineTo(i + 16 - s, s); g.lineTo(i - s, s); g.fill(); }
  }),
  hazard: () => canvasTex(128, (g, s) => {
    g.fillStyle = '#d23a2a'; g.fillRect(0, 0, s, s);
    g.fillStyle = '#f2d23a'; g.fillRect(0, s * 0.4, s, s * 0.2);
    g.fillStyle = '#222'; g.font = 'bold 40px sans-serif'; g.fillText('!', s / 2 - 6, s * 0.56);
  }),
  checker: () => canvasTex(64, (g, s) => {
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      g.fillStyle = (x + y) % 2 ? '#ffffff' : '#c8c8c8'; g.fillRect(x * 16, y * 16, 16, 16);
    }
  }),
};

export function getTexture(name) {
  if (!name || !TEX[name]) return null;
  if (!texCache.has(name)) texCache.set(name, TEX[name]());
  return texCache.get(name);
}

const matCache = new Map();
export function getMaterial(color, tex, opts = {}) {
  const key = `${color}|${tex}|${opts.emissive || ''}|${opts.opacity || 1}|${opts.metal || 0}`;
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color ?? 0xffffff),
    map: getTexture(tex),
    roughness: opts.metal ? 0.35 : 0.8,
    metalness: opts.metal || 0,
  });
  if (opts.emissive) { m.emissive = new THREE.Color(opts.emissive); m.emissiveIntensity = 0.8; }
  if (opts.opacity && opts.opacity < 1) { m.transparent = true; m.opacity = opts.opacity; }
  matCache.set(key, m);
  return m;
}

// ---------- Setup ----------
export const physMat = {
  default: new CANNON.Material('default'),
  player: new CANNON.Material('player'),
  bouncy: new CANNON.Material('bouncy'),
};

export function initWorld(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);
  G.renderer = renderer;

  const scene = new THREE.Scene();
  G.scene = scene;
  scene.fog = new THREE.Fog(0xa9c8de, 60, 220);

  // Sky dome with a gradient
  const skyGeo = new THREE.SphereGeometry(400, 24, 12);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x3b7fc4) }, bottom: { value: new THREE.Color(0xd9ecf5) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float h = clamp(normalize(vP).y*1.6+0.2,0.0,1.0); gl_FragColor = vec4(mix(bottom, top, h),1.0); }',
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.renderOrder = -1;
  scene.add(sky);
  G.sky = sky;

  G.camera = new THREE.PerspectiveCamera(75, 1, 0.05, 600);
  scene.add(G.camera);

  scene.add(new THREE.HemisphereLight(0xdcefff, 0x5a5040, 0.9));
  const sun = new THREE.DirectionalLight(0xfff2dd, 1.6);
  sun.position.set(40, 70, 25);
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 200;
  sun.shadow.bias = -0.0005;
  scene.add(sun);
  scene.add(sun.target);
  G.sun = sun;

  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.allowSleep = true;
  world.solver.iterations = 12;
  world.defaultContactMaterial.friction = 0.45;
  world.defaultContactMaterial.restitution = 0.15;
  world.addContactMaterial(new CANNON.ContactMaterial(physMat.player, physMat.default, { friction: 0.0, restitution: 0 }));
  world.addContactMaterial(new CANNON.ContactMaterial(physMat.bouncy, physMat.default, { friction: 0.3, restitution: 0.9 }));
  world.addContactMaterial(new CANNON.ContactMaterial(physMat.bouncy, physMat.bouncy, { friction: 0.3, restitution: 0.9 }));
  G.world = world;

  applyQuality();
  buildMap();
  window.addEventListener('resize', resize);
  resize();
}

export function applyQuality() {
  const q = G.settings.quality;
  const r = G.renderer;
  r.setPixelRatio(Math.min(window.devicePixelRatio, q === 'high' ? 2 : q === 'medium' ? 1.25 : 0.85));
  r.shadowMap.enabled = q !== 'low';
  r.shadowMap.type = THREE.PCFSoftShadowMap;
  G.sun.castShadow = q !== 'low';
  G.sun.shadow.mapSize.set(q === 'high' ? 2048 : 1024, q === 'high' ? 2048 : 1024);
  if (G.sun.shadow.map) { G.sun.shadow.map.dispose(); G.sun.shadow.map = null; }
  G.scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
}

export function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  G.renderer.setSize(w, h);
  G.camera.aspect = w / h;
  G.camera.updateProjectionMatrix();
}

// ---------- Map ----------
export const mapMeshes = [];

function addStatic(size, pos, tex, color = 0xffffff, rotY = 0, texScale = 4) {
  const geo = new THREE.BoxGeometry(size[0], size[1], size[2]);
  // scale UVs so textures tile in world units
  const uv = geo.attributes.uv;
  const n = geo.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i));
    let su, sv;
    if (ny > 0.5) { su = size[0]; sv = size[2]; } else if (nx > 0.5) { su = size[2]; sv = size[1]; } else { su = size[0]; sv = size[1]; }
    uv.setXY(i, uv.getX(i) * su / texScale, uv.getY(i) * sv / texScale);
  }
  const mat = new THREE.MeshStandardMaterial({ color, map: getTexture(tex), roughness: 0.9 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(...pos);
  mesh.rotation.y = rotY;
  mesh.receiveShadow = true;
  mesh.castShadow = size[1] > 0.6;
  mesh.userData.map = true;
  G.scene.add(mesh);
  mapMeshes.push(mesh);

  const body = new CANNON.Body({ mass: 0, material: physMat.default, collisionFilterGroup: GROUP.MAP });
  body.addShape(new CANNON.Box(new CANNON.Vec3(size[0] / 2, size[1] / 2, size[2] / 2)));
  body.position.set(...pos);
  body.quaternion.setFromEuler(0, rotY, 0);
  body.isMap = true;
  G.world.addBody(body);
  return { mesh, body };
}

function addRamp(width, length, height, pos, rotY, tex, color) {
  const ang = Math.atan2(height, length);
  const len = Math.hypot(length, height);
  const geo = new THREE.BoxGeometry(width, 0.3, len);
  const mat = new THREE.MeshStandardMaterial({ color, map: getTexture(tex), roughness: 0.9 });
  const mesh = new THREE.Mesh(geo, mat);
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-ang, rotY, 0, 'YXZ'));
  mesh.quaternion.copy(q);
  mesh.position.set(pos[0], pos[1] + height / 2, pos[2]);
  mesh.receiveShadow = mesh.castShadow = true;
  G.scene.add(mesh);
  mapMeshes.push(mesh);
  const body = new CANNON.Body({ mass: 0, material: physMat.default, collisionFilterGroup: GROUP.MAP });
  body.addShape(new CANNON.Box(new CANNON.Vec3(width / 2, 0.15, len / 2)));
  body.position.copy(mesh.position);
  body.quaternion.set(q.x, q.y, q.z, q.w);
  body.isMap = true;
  G.world.addBody(body);
}

function buildMap() {
  // Ground
  addStatic([240, 2, 240], [0, -1, 0], 'floor', 0xffffff, 0, 6);
  // Border walls
  for (const [sx, sz, x, z] of [[240, 2, 0, -120], [240, 2, 0, 120], [2, 240, -120, 0], [2, 240, 120, 0]]) {
    addStatic([sx, 14, sz], [x, 7, z], 'concrete', 0xb8bcc2);
  }
  // Workshop building (hangar style) north side
  const bx = 0, bz = -40;
  addStatic([30, 0.6, 22], [bx, 8, bz], 'concrete', 0xa0a4a8);               // roof
  addStatic([30, 8, 0.6], [bx, 4, bz - 11], 'wall', 0xffffff);                // back wall
  addStatic([0.6, 8, 22], [bx - 15, 4, bz], 'wall', 0xffffff);                // left
  addStatic([0.6, 8, 22], [bx + 15, 4, bz], 'wall', 0xffffff);                // right
  addStatic([11, 8, 0.6], [bx - 9.5, 4, bz + 11], 'wall', 0xffffff);          // front left
  addStatic([11, 8, 0.6], [bx + 9.5, 4, bz + 11], 'wall', 0xffffff);          // front right
  addStatic([8, 2, 0.6], [bx, 7, bz + 11], 'wall', 0xffffff);                 // over door
  // Stairs up to the roof
  for (let i = 0; i < 16; i++) addStatic([3, 0.5, 1], [bx + 17, 0.25 + i * 0.5, bz + 8 - i], 'concrete', 0x9da2a7);
  addStatic([3, 0.4, 4], [bx + 17, 8.0, bz - 9], 'concrete', 0x9da2a7);
  // Ramps and platforms in the open area
  addRamp(6, 14, 4, [25, 0, 10], 0, 'concrete', 0xcfc6a8);
  addStatic([6, 4, 8], [25, 2, -1], 'concrete', 0xcfc6a8);
  addRamp(8, 30, 10, [-35, 0, 25], Math.PI / 2, 'concrete', 0xa8b8cf);
  addStatic([10, 10, 10], [-55, 5, 25], 'concrete', 0xa8b8cf);
  // Tower
  addStatic([6, 24, 6], [50, 12, -50], 'concrete', 0x9fa7ad);
  for (let i = 0; i < 12; i++) {
    const a = i * Math.PI / 3;
    addStatic([3, 0.4, 2], [50 + Math.cos(a) * 4.5, 1 + i * 2, -50 + Math.sin(a) * 4.5], 'concrete', 0xd08b4a, -a);
  }
  // Pool-like pit edges + small walls
  addStatic([20, 1, 1], [-30, 0.5, -15], 'concrete', 0x8f9aa4);
  addStatic([20, 1, 1], [-30, 0.5, -5], 'concrete', 0x8f9aa4);
  // Lamp posts for decoration
  for (const [x, z] of [[12, 20], [-12, 20], [12, -10], [-12, -10]]) {
    addStatic([0.3, 6, 0.3], [x, 3, z], 'metal', 0x606870, 0, 1);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 8), new THREE.MeshStandardMaterial({ color: 0xfff6d0, emissive: 0xfff0b0, emissiveIntensity: 1 }));
    lamp.position.set(x, 6.2, z);
    G.scene.add(lamp);
  }
}

// ---------- Effects ----------
const fxList = [];
export function spawnFx(kind, pos, extra = {}) {
  const p = new THREE.Vector3(...pos);
  if (kind === 'boom') {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffa030, transparent: true, opacity: 0.9 }));
    m.position.copy(p);
    G.scene.add(m);
    fxList.push({ m, t: 0, life: 0.6, kind });
    for (let i = 0; i < 14; i++) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), new THREE.MeshBasicMaterial({ color: i % 2 ? 0x444444 : 0xff7020 }));
      s.position.copy(p);
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random(), Math.random() - 0.5).normalize().multiplyScalar(8 + Math.random() * 8);
      G.scene.add(s);
      fxList.push({ m: s, t: 0, life: 1, kind: 'debris', v });
    }
    playSound('boom', p);
  } else if (kind === 'tracer') {
    const to = new THREE.Vector3(...extra.to);
    const g = new THREE.BufferGeometry().setFromPoints([p, to]);
    const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: extra.color || 0xffee88, transparent: true }));
    G.scene.add(l);
    fxList.push({ m: l, t: 0, life: 0.12, kind });
    const spark = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffaa }));
    spark.position.copy(to);
    G.scene.add(spark);
    fxList.push({ m: spark, t: 0, life: 0.15, kind: 'spark' });
  } else if (kind === 'zap') {
    const to = new THREE.Vector3(...extra.to);
    const pts = [];
    for (let i = 0; i <= 8; i++) {
      const q = p.clone().lerp(to, i / 8);
      if (i && i < 8) q.add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.25));
      pts.push(q);
    }
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x66ccff, transparent: true }));
    G.scene.add(l);
    fxList.push({ m: l, t: 0, life: 0.2, kind: 'tracer' });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.3, 16), new THREE.MeshBasicMaterial({ color: 0x66ccff, transparent: true, side: THREE.DoubleSide }));
    ring.position.copy(to);
    if (extra.normal) ring.lookAt(to.clone().add(new THREE.Vector3(...extra.normal)));
    G.scene.add(ring);
    fxList.push({ m: ring, t: 0, life: 0.35, kind: 'ring' });
  } else if (kind === 'pop') {
    const ring = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, wireframe: true }));
    ring.position.copy(p);
    G.scene.add(ring);
    fxList.push({ m: ring, t: 0, life: 0.3, kind: 'ring' });
  }
}

export function updateFx(dt) {
  for (let i = fxList.length - 1; i >= 0; i--) {
    const f = fxList[i];
    f.t += dt;
    const k = f.t / f.life;
    if (f.kind === 'boom') { f.m.scale.setScalar(1 + k * 6); f.m.material.opacity = 0.9 * (1 - k); }
    else if (f.kind === 'debris') { f.v.y -= 20 * dt; f.m.position.addScaledVector(f.v, dt); f.m.rotation.x += dt * 8; }
    else if (f.kind === 'ring') { f.m.scale.setScalar(1 + k * 3); f.m.material.opacity = 1 - k; }
    else if (f.m.material) { f.m.material.opacity = 1 - k; }
    if (f.t >= f.life) {
      G.scene.remove(f.m);
      f.m.geometry.dispose();
      f.m.material.dispose();
      fxList.splice(i, 1);
    }
  }
}

// ---------- Sounds (synthesized, no audio files needed) ----------
let actx = null;
export function unlockAudio() {
  if (!actx) {
    try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
  }
  if (actx.state === 'suspended') actx.resume();
}

export function playSound(kind, pos) {
  if (!actx) return;
  let vol = 0.4;
  if (pos && G.camera) {
    const d = G.camera.position.distanceTo(pos);
    vol *= Math.max(0, 1 - d / 80);
    if (vol <= 0.01) return;
  }
  const t = actx.currentTime;
  const gain = actx.createGain();
  gain.connect(actx.destination);
  const osc = (type, f0, f1, dur) => {
    const o = actx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    o.connect(gain);
    o.start(t); o.stop(t + dur);
  };
  const noiseBurst = (dur, freq) => {
    const len = actx.sampleRate * dur;
    const buf = actx.createBuffer(1, len, actx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = actx.createBufferSource();
    src.buffer = buf;
    const f = actx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = freq;
    src.connect(f); f.connect(gain);
    src.start(t);
  };
  switch (kind) {
    case 'boom': gain.gain.setValueAtTime(vol * 2, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 1.2); noiseBurst(1.2, 600); osc('sine', 90, 30, 0.8); break;
    case 'shoot': gain.gain.setValueAtTime(vol, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15); osc('square', 900, 120, 0.15); noiseBurst(0.08, 3000); break;
    case 'zap': gain.gain.setValueAtTime(vol * 0.6, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2); osc('sawtooth', 1400, 2400, 0.2); break;
    case 'spawn': gain.gain.setValueAtTime(vol * 0.5, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15); osc('sine', 300, 900, 0.15); break;
    case 'grab': gain.gain.setValueAtTime(vol * 0.3, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25); osc('triangle', 200, 500, 0.25); break;
    case 'drop': gain.gain.setValueAtTime(vol * 0.3, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2); osc('triangle', 500, 150, 0.2); break;
    case 'pop': gain.gain.setValueAtTime(vol, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1); noiseBurst(0.1, 5000); break;
    case 'click': gain.gain.setValueAtTime(vol * 0.3, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05); osc('square', 1200, 800, 0.05); break;
    case 'error': gain.gain.setValueAtTime(vol * 0.4, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25); osc('square', 220, 160, 0.25); break;
    default: break;
  }
}
