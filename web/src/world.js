// Rendering (PBR + sky + image based lighting + post-processing), the map, effects and sounds.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { G, GROUP } from './state.js';
import { material, setTextureQuality, smokeTexture, leafTexture } from './textures.js';
import { roundedBox, boxUV, bevelCylinder } from './models.js';

export const physMat = {
  default: new CANNON.Material('default'),
  player: new CANNON.Material('player'),
  bouncy: new CANNON.Material('bouncy'),
};

const SUN_DIR = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(52), THREE.MathUtils.degToRad(140));
let hemi = null;
export const env = { tod: 13, fog: 1 };
let composer = null, gtao = null, bloom = null;

// ---------- setup ----------
export function initWorld(container) {
  setTextureQuality(G.settings.quality);
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', stencil: false });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.85;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);
  G.renderer = renderer;

  const scene = new THREE.Scene();
  G.scene = scene;

  // physically based sky
  const sky = new Sky();
  sky.scale.setScalar(5000);
  const u = sky.material.uniforms;
  u.turbidity.value = 4; u.rayleigh.value = 1.4; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.8;
  u.sunPosition.value.copy(SUN_DIR);
  scene.add(sky);
  G.sky = sky;

  // image based lighting from the same sky
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const envSky = new Sky(); envSky.scale.setScalar(1000);
  Object.assign(envSky.material.uniforms.sunPosition.value, SUN_DIR);
  for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG']) envSky.material.uniforms[k].value = u[k].value;
  envScene.add(envSky);
  // a ground disc in the env so reflections below the horizon are not black
  const envGround = new THREE.Mesh(new THREE.CircleGeometry(900, 32), new THREE.MeshBasicMaterial({ color: 0x4a5040 }));
  envGround.rotation.x = -Math.PI / 2; envGround.position.y = -5;
  envScene.add(envGround);
  scene.environment = pmrem.fromScene(envScene, 0.02).texture;
  scene.environmentIntensity = 0.9;
  scene.fog = new THREE.FogExp2(0xbcd0de, 0.0032);

  G.camera = new THREE.PerspectiveCamera(72, 1, 0.03, 4000);
  scene.add(G.camera);

  const sun = new THREE.DirectionalLight(0xfff1dc, 3.2);
  sun.position.copy(SUN_DIR).multiplyScalar(80);
  const sc = sun.shadow.camera;
  sc.left = -40; sc.right = 40; sc.top = 40; sc.bottom = -40; sc.near = 1; sc.far = 220;
  sun.shadow.bias = -0.0002;
  sun.shadow.normalBias = 0.03;
  scene.add(sun);
  scene.add(sun.target);
  G.sun = sun;
  hemi = new THREE.HemisphereLight(0xc9dcff, 0x5b5040, 0.25);
  scene.add(hemi);

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

  buildMap();
  applyQuality();
  window.addEventListener('resize', resize);
  resize();
}

export function applyQuality() {
  const q = G.settings.quality;
  const r = G.renderer;
  const dpr = window.devicePixelRatio || 1;
  r.setPixelRatio({ low: Math.min(dpr, 0.8), medium: Math.min(dpr, 1.1), high: Math.min(dpr, 1.5), ultra: Math.min(dpr, 2) }[q] || 1);
  r.shadowMap.enabled = q !== 'low';
  G.sun.castShadow = q !== 'low';
  const sm = { low: 512, medium: 1024, high: 2048, ultra: 4096 }[q] || 2048;
  G.sun.shadow.mapSize.set(sm, sm);
  if (G.sun.shadow.map) { G.sun.shadow.map.dispose(); G.sun.shadow.map = null; }
  G.scene.fog.density = (q === 'low' ? 0.006 : 0.0032) * env.fog;
  G.scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => { m.needsUpdate = true; }); });
  setupComposer();
}

function setupComposer() {
  if (composer) { composer.dispose?.(); composer = null; gtao = null; bloom = null; }
  const q = G.settings.quality;
  if (q !== 'high' && q !== 'ultra') return;
  const r = G.renderer;
  const size = r.getDrawingBufferSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
  composer = new EffectComposer(r, rt);
  composer.addPass(new RenderPass(G.scene, G.camera));
  if (q === 'ultra') {
    gtao = new GTAOPass(G.scene, G.camera, size.x, size.y);
    gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.5, thickness: 1, scale: 1 });
    gtao.blendIntensity = 0.85;
    composer.addPass(gtao);
  }
  bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.35, 0.5, 0.92);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
}

export function render() {
  if (composer) composer.render();
  else G.renderer.render(G.scene, G.camera);
}

export function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  G.renderer.setSize(w, h);
  G.camera.aspect = w / h;
  G.camera.updateProjectionMatrix();
  if (composer) {
    const pr = G.renderer.getPixelRatio();
    composer.setPixelRatio(pr);
    composer.setSize(w, h);
  }
}

// Time of day (0..24 h): moves the sun, dims the light at night
export function setTimeOfDay(h) {
  env.tod = ((h % 24) + 24) % 24;
  const dayT = (env.tod - 6) / 12;                       // 0 at sunrise, 1 at sunset
  const elev = Math.sin(Math.PI * dayT) * 62;            // degrees above horizon (negative at night)
  const az = 90 + dayT * 180;
  SUN_DIR.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - elev), THREE.MathUtils.degToRad(az));
  G.sky.material.uniforms.sunPosition.value.copy(SUN_DIR);
  const day = THREE.MathUtils.smoothstep(elev, -6, 12);  // 0 night .. 1 day
  const warm = 1 - THREE.MathUtils.smoothstep(elev, 2, 25);
  G.sun.intensity = 3.2 * day + 0.25;
  G.sun.color.setRGB(1, 0.95 - warm * 0.35, 0.86 - warm * 0.55);
  if (elev < 0) { // moonlight from the opposite side
    SUN_DIR.setFromSphericalCoords(1, THREE.MathUtils.degToRad(50), THREE.MathUtils.degToRad(az + 180));
    G.sun.color.setRGB(0.55, 0.65, 1.0);
  }
  G.scene.environmentIntensity = 0.12 + 0.78 * day;
  hemi.intensity = 0.08 + 0.17 * day;
  G.renderer.toneMappingExposure = 0.55 + 0.3 * day;
  G.scene.fog.color.setRGB(0.05 + 0.69 * day, 0.07 + 0.75 * day, 0.12 + 0.75 * day).lerp(new THREE.Color(0xd9a070), warm * day * 0.5);
}
export function setFog(mult) {
  env.fog = Math.max(0, mult);
  G.scene.fog.density = (G.settings.quality === 'low' ? 0.006 : 0.0032) * env.fog;
}

// Keep the sun's shadow box centred on the player
export function followSun(x, z) {
  G.sun.position.set(x + SUN_DIR.x * 80, SUN_DIR.y * 80, z + SUN_DIR.z * 80);
  G.sun.target.position.set(x, 0, z);
}

// ---------- map ----------
export const mapMeshes = [];

function addBody(halfExt, pos, quat) {
  const body = new CANNON.Body({ mass: 0, material: physMat.default, collisionFilterGroup: GROUP.MAP });
  body.addShape(new CANNON.Box(new CANNON.Vec3(...halfExt)));
  body.position.set(...pos);
  if (quat) body.quaternion.set(quat.x, quat.y, quat.z, quat.w);
  body.isMap = true;
  G.world.addBody(body);
  return body;
}

function addMesh(geo, mat, pos, quat, shadow = true) {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(...pos);
  if (quat) mesh.quaternion.copy(quat);
  mesh.receiveShadow = true;
  mesh.castShadow = shadow;
  mesh.userData.map = true;
  G.scene.add(mesh);
  mapMeshes.push(mesh);
  return mesh;
}

// solid static block: rounded edges, real-world-scaled PBR surface
function block(size, pos, surface, opts = {}) {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(opts.rx || 0, opts.rotY || 0, 0, 'YXZ'));
  const r = opts.round ?? Math.min(0.05, Math.min(...size) * 0.15);
  const g = roundedBox(size[0], size[1], size[2], surface, r);
  const m = addMesh(g, material(surface, opts.color != null ? { color: opts.color } : {}), pos, q, opts.shadow !== false);
  if (!opts.noPhysics) addBody([size[0] / 2, size[1] / 2, size[2] / 2], pos, q);
  return m;
}

function glass(size, pos, rotY = 0) {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotY, 0));
  const m = addMesh(new THREE.BoxGeometry(...size), material('glass', { glass: true }), pos, q, false);
  m.receiveShadow = false;
  addBody([size[0] / 2, size[1] / 2, size[2] / 2], pos, q);
}

function railing(from, to, height = 1.05) {
  const steel = material('steel');
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
  const len = a.distanceTo(b);
  const posts = Math.max(2, Math.round(len / 1.5) + 1);
  for (let i = 0; i < posts; i++) {
    const p = a.clone().lerp(b, i / (posts - 1));
    addMesh(bevelCylinder(0.03, 0.03, height, 0.01, 12), steel, [p.x, p.y + height / 2, p.z]);
  }
  const mid = a.clone().lerp(b, 0.5);
  const dir = b.clone().sub(a).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  for (const hh of [height, height * 0.5]) addMesh(bevelCylinder(0.025, 0.025, len, 0.008, 12), steel, [mid.x, mid.y + hh, mid.z], q);
  // physics: thin wall so props don't fall through
  const yaw = Math.atan2(dir.x, dir.z);
  const qq = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.asin(-dir.y) * 0, yaw, 0));
  if (Math.abs(dir.y) < 0.1) addBody([0.04, height / 2, len / 2], [mid.x, mid.y + height / 2, mid.z], qq);
}

function lampPost(x, z) {
  const steel = material('paint', { color: 0x3a4048, clearcoat: 0.3 });
  addMesh(bevelCylinder(0.07, 0.11, 6, 0.02, 16), steel, [x, 3, z]);
  addMesh(bevelCylinder(0.18, 0.22, 0.25, 0.03, 16), steel, [x, 0.12, z]);
  addMesh(roundedBox(0.1, 0.1, 1.2, 'paint', 0.03), steel, [x, 5.9, z + 0.55]);
  addMesh(roundedBox(0.36, 0.12, 0.6, 'paint', 0.04), steel, [x, 5.85, z + 1.1]);
  addMesh(roundedBox(0.3, 0.02, 0.5, 'plastic', 0.008), material('flat', { color: 0xfff4dc, emissive: 0xfff0d0, emissiveIntensity: 2 }), [x, 5.78, z + 1.1]);
  addBody([0.1, 3, 0.1], [x, 3, z]);
}

// tree: bark trunk, branches and alpha-tested leaf cards, merged into two meshes
let treeGeo = null;
function treeGeometry() {
  if (treeGeo) return treeGeo;
  const trunk = [];
  const t = new THREE.CylinderGeometry(0.16, 0.3, 5, 12, 4);
  t.translate(0, 2.5, 0);
  trunk.push(t);
  const leaves = [];
  const R = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  for (let i = 0; i < 5; i++) {
    const br = new THREE.CylinderGeometry(0.04, 0.09, 2.2, 6);
    br.translate(0, 1.1, 0);
    br.rotateZ(0.7 + R() * 0.4);
    br.rotateY(i * 1.3);
    br.translate(0, 2.6 + i * 0.45, 0);
    trunk.push(br);
  }
  for (let i = 0; i < 46; i++) {
    const p = new THREE.PlaneGeometry(2.2, 2.2);
    const a = R() * Math.PI * 2, rr = Math.sqrt(R()) * 2.1, hgt = 3.6 + R() * 3.6 - rr * 0.4;
    p.rotateX((R() - 0.5) * 1.2); p.rotateY(R() * Math.PI);
    p.translate(Math.cos(a) * rr, hgt, Math.sin(a) * rr);
    leaves.push(p);
  }
  treeGeo = { trunk: mergeGeometries(trunk), leaves: mergeGeometries(leaves) };
  return treeGeo;
}
function tree(x, z, s) {
  const geo = treeGeometry();
  const leafMat = treeGeometry.leafMat ||= new THREE.MeshStandardMaterial({ map: leafTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8 });
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(geo.trunk, material('bark'));
  const leaves = new THREE.Mesh(geo.leaves, leafMat);
  trunk.castShadow = leaves.castShadow = true;
  trunk.receiveShadow = leaves.receiveShadow = true;
  g.add(trunk, leaves);
  g.position.set(x, 0, z);
  g.scale.setScalar(s);
  g.rotation.y = x * 13.1 + z;
  G.scene.add(g);
  mapMeshes.push(trunk);
  addBody([0.25 * s, 2.5 * s, 0.25 * s], [x, 2.5 * s, z]);
}

function hills() {
  const geo = new THREE.RingGeometry(118, 900, 128, 24);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const d = Math.hypot(x, z);
    const k = THREE.MathUtils.smoothstep(d, 120, 260);
    const n = Math.sin(x * 0.013) * Math.cos(z * 0.017) * 0.5 + Math.sin(x * 0.031 + z * 0.023) * 0.3 + Math.sin(z * 0.05) * 0.2;
    pos.setY(i, k * (22 + n * 26) - 0.05);
  }
  geo.computeVertexNormals();
  boxUV(geo, 6);
  const m = new THREE.Mesh(geo, material('grass', { color: 0xd8e0c8 }));
  m.receiveShadow = true;
  G.scene.add(m);
}

function buildMap() {
  // ground: grass everywhere, concrete plaza in the middle, asphalt road around it
  const grass = new THREE.PlaneGeometry(240, 240, 1, 1); grass.rotateX(-Math.PI / 2); boxUV(grass, 5);
  addMesh(grass, material('grass'), [0, 0, 0], null, false);
  const plaza = new THREE.PlaneGeometry(90, 90); plaza.rotateX(-Math.PI / 2); boxUV(plaza, 6);
  addMesh(plaza, material('tiles'), [0, 0.012, -5], null, false);
  for (const [w, d, x, z] of [[106, 8, 0, -54], [106, 8, 0, 44], [8, 90, -49, -5], [8, 90, 49, -5]]) {
    const road = new THREE.PlaneGeometry(w, d); road.rotateX(-Math.PI / 2); boxUV(road, 4);
    addMesh(road, material('asphalt'), [x, 0.008, z], null, false);
  }
  // curbs
  for (const [w, d, x, z] of [[90, 0.3, 0, -50.15], [90, 0.3, 0, 40.15], [0.3, 90, -45.15, -5], [0.3, 90, 45.15, -5]]) {
    block([w, 0.15, d], [x, 0.075, z], 'concrete', { color: 0xd8d8d4, shadow: false, round: 0.04 });
  }
  addBody([120, 1, 120], [0, -1, 0]);                     // physical ground
  for (const [sx, sz, x, z] of [[240, 1, 0, -120], [240, 1, 0, 120], [1, 240, -120, 0], [1, 240, 120, 0]]) addBody([sx / 2, 30, sz / 2], [x, 30, z]); // invisible bounds
  hills();

  // ---- hangar / workshop (north) ----
  const bx = 0, bz = -38, W = 30, D = 22, H = 8;
  block([W, 0.5, D + 1], [bx, H + 0.25, bz], 'concrete', { color: 0xc8c8c8 });              // roof slab
  block([W + 0.6, 0.35, D + 1.6], [bx, H + 0.6, bz], 'paint', { color: 0x5b636b });        // roof trim
  // back wall with windows
  block([W, 2.4, 0.5], [bx, 1.2, bz - D / 2], 'brick');
  block([W, 1.8, 0.5], [bx, H - 0.9, bz - D / 2], 'brick');
  for (let i = 0; i <= 5; i++) block([1.2, 3.8, 0.5], [bx - W / 2 + 0.6 + i * ((W - 1.2) / 5), 4.3, bz - D / 2], 'brick');
  for (let i = 0; i < 5; i++) {
    const cx = bx - W / 2 + 0.6 + (i + 0.5) * ((W - 1.2) / 5);
    glass([(W - 1.2) / 5 - 1.2, 3.8, 0.06], [cx, 4.3, bz - D / 2]);
    block([(W - 1.2) / 5 - 1.2, 0.12, 0.6], [cx, 2.45, bz - D / 2], 'paint', { color: 0xe6e6e6, round: 0.03 });
  }
  // side walls
  for (const sx of [-1, 1]) block([0.5, H, D], [bx + sx * (W / 2 - 0.25), H / 2, bz], 'brick');
  // front wall with a big door
  block([10.5, H, 0.5], [bx - 9.75, H / 2, bz + D / 2], 'brick');
  block([10.5, H, 0.5], [bx + 9.75, H / 2, bz + D / 2], 'brick');
  block([9, 2.2, 0.5], [bx, H - 1.1, bz + D / 2], 'brick');
  for (const sx of [-1, 1]) block([0.3, 5.8, 0.7], [bx + sx * 4.35, 2.9, bz + D / 2], 'steel', { round: 0.04 });
  block([9, 0.3, 0.7], [bx, 5.8, bz + D / 2], 'steel', { round: 0.04 });
  // interior floor + ceiling lights
  const floor = new THREE.PlaneGeometry(W - 1, D - 1); floor.rotateX(-Math.PI / 2); boxUV(floor, 3);
  addMesh(floor, material('concrete', { color: 0xb8b8b8 }), [bx, 0.02, bz], null, false);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j += 2) {
    addMesh(roundedBox(4, 0.08, 0.5, 'plastic', 0.02), material('flat', { color: 0xffffff, emissive: 0xfff4e0, emissiveIntensity: 3 }), [bx + i * 9, H - 0.05, bz + j * 4], null, false);
  }
  const lamp = new THREE.PointLight(0xfff0dd, 30, 30, 2);
  lamp.position.set(bx, H - 1, bz);
  G.scene.add(lamp);
  // stairs to the roof with railing
  for (let i = 0; i < 16; i++) block([3, 0.5, 1.02], [bx + 17, 0.25 + i * 0.5, bz + 8 - i], 'concrete', { color: 0xc4c4c0, round: 0.03 });
  block([3, 0.4, 4], [bx + 17, 8.0, bz - 9.5], 'concrete', { color: 0xc4c4c0 });
  railing([bx + 18.45, 0.5, bz + 8.5], [bx + 18.45, 8.5, bz - 7.5]);
  railing([bx + 18.45, 8.2, bz - 7.5], [bx + 18.45, 8.2, bz - 11.4]);
  // roof parapet railing
  railing([bx - W / 2, H + 0.75, bz + D / 2 + 0.5], [bx + W / 2, H + 0.75, bz + D / 2 + 0.5]);

  // ---- ramps and platforms ----
  const ramp = (w, len, hgt, pos, rotY, color) => {
    const ang = Math.atan2(hgt, len), L = Math.hypot(len, hgt);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-ang, rotY, 0, 'YXZ'));
    const p = [pos[0], pos[1] + hgt / 2, pos[2]];
    addMesh(roundedBox(w, 0.35, L, 'concrete', 0.06), material('concrete', { color }), p, q);
    addBody([w / 2, 0.175, L / 2], p, q);
  };
  ramp(6, 14, 4, [25, 0, 10], 0, 0xd9d2bf);
  block([6, 4, 8], [25, 2, -1], 'concrete', { color: 0xd9d2bf });
  railing([22, 4, -4.9], [28, 4, -4.9]);
  ramp(8, 30, 10, [-35, 0, 25], Math.PI / 2, 0xc4ccd6);
  block([10, 10, 10], [-55, 5, 25], 'concrete', { color: 0xc4ccd6 });

  // ---- observation tower ----
  block([6, 24, 6], [50, 12, -50], 'concrete', { color: 0xbfc3c6 });
  for (let i = 0; i < 12; i++) {
    const a = i * Math.PI / 3;
    block([3, 0.4, 2], [50 + Math.cos(a) * 4.5, 1 + i * 2, -50 + Math.sin(a) * 4.5], 'paint', { rotY: -a, color: 0xc77c3a });
  }
  block([10, 0.5, 10], [50, 24.25, -50], 'concrete', { color: 0xbfc3c6 });
  for (const [a, b] of [[[45, 24.5, -55], [55, 24.5, -55]], [[45, 24.5, -45], [55, 24.5, -45]], [[45, 24.5, -55], [45, 24.5, -45]], [[55, 24.5, -55], [55, 24.5, -45]]]) railing(a, b);

  // low walls (props pit)
  block([20, 1, 1], [-30, 0.5, -15], 'brick');
  block([20, 1, 1], [-30, 0.5, -5], 'brick');

  for (const [x, z] of [[12, 20], [-12, 20], [12, -10], [-12, -10], [30, 35], [-30, 35]]) lampPost(x, z);

  // trees around the plaza
  const R = (() => { let s = 11; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  let placed = 0;
  while (placed < 34) {
    const x = (R() - 0.5) * 220, z = (R() - 0.5) * 220;
    if (Math.abs(x) < 56 && z > -62 && z < 52) continue;
    if (Math.hypot(x + 55, z - 25) < 10) continue;
    tree(x, z, 0.9 + R() * 0.6);
    placed++;
  }
}

// ---------- effects ----------
const fxList = [];
let flash = null;
function sprite(color, opacity, size, blending = THREE.NormalBlending) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTexture(), color, transparent: true, opacity, depthWrite: false, blending }));
  s.scale.setScalar(size);
  return s;
}
function addFx(obj, life, update) { G.scene.add(obj); fxList.push({ obj, t: 0, life, update }); }

export function spawnFx(kind, pos, extra = {}) {
  const p = new THREE.Vector3(...pos);
  if (kind === 'boom') {
    if (!flash) { flash = new THREE.PointLight(0xffa040, 0, 40, 2); G.scene.add(flash); }
    flash.position.copy(p); flash.intensity = 4000; flash.userData.t = 0;
    for (let i = 0; i < 10; i++) {   // fireball
      const s = sprite(0xffa040, 1, 1.5, THREE.AdditiveBlending);
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).multiplyScalar(5);
      s.position.copy(p);
      addFx(s, 0.7 + Math.random() * 0.3, (f, k, dt) => { s.position.addScaledVector(v, dt); s.scale.setScalar(1.5 + k * 5); s.material.opacity = 1 - k; s.material.color.setRGB(1, 0.6 - k * 0.4, 0.25 - k * 0.2); });
    }
    for (let i = 0; i < 14; i++) {   // smoke
      const s = sprite(0x2e2a28, 0.0, 2, THREE.NormalBlending);
      const v = new THREE.Vector3(Math.random() - 0.5, 0.6 + Math.random(), Math.random() - 0.5).multiplyScalar(2.5);
      s.position.copy(p);
      s.material.rotation = Math.random() * 6;
      addFx(s, 3 + Math.random() * 2, (f, k, dt) => { s.position.addScaledVector(v, dt); v.multiplyScalar(0.985); s.scale.setScalar(2 + k * 7); s.material.opacity = Math.min(k * 6, 1) * 0.7 * (1 - k); s.material.color.setScalar(0.18 + k * 0.25); });
    }
    const rock = roundedBox(0.18, 0.12, 0.15, 'concrete', 0.04);
    for (let i = 0; i < 16; i++) {   // debris
      const m = new THREE.Mesh(rock, material('concrete', { color: 0x777066 }));
      m.castShadow = true;
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9 + 0.2, Math.random() - 0.5).normalize().multiplyScalar(6 + Math.random() * 10);
      m.position.copy(p);
      addFx(m, 1.6, (f, k, dt) => { v.y -= 18 * dt; m.position.addScaledVector(v, dt); if (m.position.y < 0.05) { m.position.y = 0.05; v.multiplyScalar(0.4); v.y = Math.abs(v.y); } m.rotation.x += dt * 9; m.rotation.z += dt * 7; });
    }
    sparks(p, 30, 14);
    playSound('boom', p);
  } else if (kind === 'tracer') {
    const to = new THREE.Vector3(...extra.to);
    const geo = new THREE.BufferGeometry().setFromPoints([p, to]);
    const l = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe6a0, transparent: true, blending: THREE.AdditiveBlending }));
    addFx(l, 0.08, (f, k) => { l.material.opacity = 1 - k; });
    sparks(to, 8, 5);
    const puff = sprite(0xb8b0a0, 0.5, 0.3);
    puff.position.copy(to);
    addFx(puff, 0.8, (f, k, dt) => { puff.position.y += dt * 0.4; puff.scale.setScalar(0.3 + k * 1.2); puff.material.opacity = 0.5 * (1 - k); });
  } else if (kind === 'zap') {
    const to = new THREE.Vector3(...extra.to);
    const pts = [];
    for (let i = 0; i <= 10; i++) {
      const q = p.clone().lerp(to, i / 10);
      if (i && i < 10) q.add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.2));
      pts.push(q);
    }
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x8fe0ff, transparent: true, blending: THREE.AdditiveBlending }));
    addFx(l, 0.18, (f, k) => { l.material.opacity = 1 - k; });
    const glow = sprite(0x60c8ff, 1, 0.6, THREE.AdditiveBlending);
    glow.position.copy(to);
    addFx(glow, 0.35, (f, k) => { glow.scale.setScalar(0.6 + k * 1.5); glow.material.opacity = 1 - k; });
  } else if (kind === 'pop') {
    const s = sprite(0xffffff, 0.6, 0.6);
    s.position.copy(p);
    addFx(s, 0.4, (f, k) => { s.scale.setScalar(0.6 + k * 2); s.material.opacity = 0.6 * (1 - k); });
  }
}

function sparks(p, n, speed) {
  const geo = new THREE.BufferGeometry();
  const arr = new Float32Array(n * 3), vel = [];
  for (let i = 0; i < n; i++) {
    arr.set([p.x, p.y, p.z], i * 3);
    vel.push(new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.3 + Math.random())));
  }
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffc070, size: 0.08, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  addFx(pts, 0.6, (f, k, dt) => {
    const a = geo.attributes.position;
    for (let i = 0; i < n; i++) { vel[i].y -= 15 * dt; a.setXYZ(i, a.getX(i) + vel[i].x * dt, a.getY(i) + vel[i].y * dt, a.getZ(i) + vel[i].z * dt); }
    a.needsUpdate = true;
    pts.material.opacity = 1 - k;
  });
}

export function updateFx(dt) {
  if (flash && flash.intensity > 0) { flash.userData.t += dt; flash.intensity = Math.max(0, 4000 * (1 - flash.userData.t / 0.35)); }
  for (let i = fxList.length - 1; i >= 0; i--) {
    const f = fxList[i];
    f.t += dt;
    const k = Math.min(1, f.t / f.life);
    f.update(f, k, dt);
    if (f.t >= f.life) {
      G.scene.remove(f.obj);
      if (f.obj.isSprite || f.obj.isLine || f.obj.isPoints) { f.obj.material.dispose(); if (!f.obj.isSprite) f.obj.geometry.dispose(); }
      fxList.splice(i, 1);
    }
  }
}

// ---------- sounds (synthesized) ----------
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
    vol *= Math.max(0, 1 - d / 90);
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
    const len = Math.floor(actx.sampleRate * dur);
    const buf = actx.createBuffer(1, len, actx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    const src = actx.createBufferSource();
    src.buffer = buf;
    const f = actx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = freq;
    src.connect(f); f.connect(gain);
    src.start(t);
  };
  switch (kind) {
    case 'boom': gain.gain.setValueAtTime(vol * 2.5, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 2); noiseBurst(2, 500); osc('sine', 80, 25, 1.2); break;
    case 'shoot': gain.gain.setValueAtTime(vol, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2); noiseBurst(0.18, 2500); osc('square', 600, 90, 0.12); break;
    case 'zap': gain.gain.setValueAtTime(vol * 0.5, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2); osc('sawtooth', 1400, 2600, 0.2); break;
    case 'spawn': gain.gain.setValueAtTime(vol * 0.4, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15); osc('sine', 300, 900, 0.15); break;
    case 'grab': gain.gain.setValueAtTime(vol * 0.3, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25); osc('triangle', 200, 520, 0.25); break;
    case 'drop': gain.gain.setValueAtTime(vol * 0.3, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2); osc('triangle', 500, 150, 0.2); break;
    case 'pop': gain.gain.setValueAtTime(vol, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1); noiseBurst(0.1, 5000); break;
    case 'click': gain.gain.setValueAtTime(vol * 0.3, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05); osc('square', 1200, 800, 0.05); break;
    default: break;
  }
}
