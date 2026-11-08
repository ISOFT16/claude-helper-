// Local player controller, first-person view model and remote player avatars.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { G, GROUP } from './state.js';
import { physMat, followSun } from './world.js';
import { buildHumanoid, buildWeapon, buildHand, applyTint, updateToolScreen } from './models.js';

export const SPAWN = [0, 2, 12];

export const player = {
  body: null,
  yaw: 0, pitch: 0,
  noclip: false,
  grounded: false,
  input: { f: 0, s: 0, jump: false, run: false, up: 0 },
  eye: new THREE.Vector3(),
  dir: new THREE.Vector3(0, 0, -1),
};

export function initPlayer() {
  const body = new CANNON.Body({
    mass: 70, fixedRotation: true, material: physMat.player, linearDamping: 0,
    collisionFilterGroup: GROUP.PLAYER, collisionFilterMask: GROUP.PROP | GROUP.MAP | GROUP.PLAYER,
    allowSleep: false,
  });
  body.addShape(new CANNON.Sphere(0.35), new CANNON.Vec3(0, -0.55, 0));
  body.addShape(new CANNON.Sphere(0.35), new CANNON.Vec3(0, 0.3, 0));
  body.isPlayer = true;
  G.world.addBody(body);
  player.body = body;
  respawn();
  buildViewModel();
}

export function respawn() {
  const b = player.body;
  b.position.set(SPAWN[0] + (Math.random() - 0.5) * 4, SPAWN[1], SPAWN[2] + (Math.random() - 0.5) * 4);
  b.velocity.setZero();
  player.yaw = 0; player.pitch = 0;
}

export function setNoclip(v) {
  player.noclip = v;
  const b = player.body;
  b.type = v ? CANNON.Body.KINEMATIC : CANNON.Body.DYNAMIC;
  b.collisionResponse = !v;
  b.velocity.setZero();
  b.updateMassProperties();
}

const ray = new CANNON.RaycastResult();
export function updatePlayer(dt) {
  const b = player.body;
  const inp = player.input;
  const sy = Math.sin(player.yaw), cy = Math.cos(player.yaw);
  // forward is -Z when yaw = 0
  const fx = -sy, fz = -cy, rx = cy, rz = -sy;
  let wx = fx * inp.f + rx * inp.s, wz = fz * inp.f + rz * inp.s;
  const wl = Math.hypot(wx, wz);
  if (wl > 1) { wx /= wl; wz /= wl; }

  if (player.noclip) {
    const sp = inp.run ? 30 : 12;
    const cp = Math.cos(player.pitch), spch = Math.sin(player.pitch);
    const vx = (fx * cp * inp.f + rx * inp.s) * sp;
    const vy = (spch * inp.f + inp.up) * sp;
    const vz = (fz * cp * inp.f + rz * inp.s) * sp;
    b.position.x += vx * dt; b.position.y += vy * dt; b.position.z += vz * dt;
    b.velocity.setZero();
  } else {
    ray.reset();
    G.world.raycastClosest(
      new CANNON.Vec3(b.position.x, b.position.y - 0.5, b.position.z),
      new CANNON.Vec3(b.position.x, b.position.y - 1.0, b.position.z),
      { collisionFilterMask: GROUP.MAP | GROUP.PROP, skipBackfaces: true }, ray,
    );
    player.grounded = ray.hasHit;
    const speed = inp.run ? 9 : 5.5;
    const accel = player.grounded ? 12 : 2.5;
    const k = Math.min(1, accel * dt);
    b.velocity.x += (wx * speed - b.velocity.x) * k;
    b.velocity.z += (wz * speed - b.velocity.z) * k;
    if (inp.jump && player.grounded && b.velocity.y < 2) {
      b.velocity.y = 5.6;
      player.grounded = false;
    }
    if (b.position.y < -30) respawn();
  }
}

export function updateCamera() {
  const b = player.body;
  player.pitch = Math.max(-1.55, Math.min(1.55, player.pitch));
  player.eye.set(b.position.x, b.position.y + 0.7, b.position.z);
  G.camera.position.copy(player.eye);
  G.camera.quaternion.setFromEuler(new THREE.Euler(player.pitch, player.yaw, 0, 'YXZ'));
  player.dir.set(0, 0, -1).applyQuaternion(G.camera.quaternion);
  followSun(b.position.x, b.position.z);
}

// ---------- View model (weapon in hands) ----------
let vm = null;
const vmModels = {};
let tipMarker = null;
export function buildViewModel() {
  vm = new THREE.Group();
  vm.scale.setScalar(0.7);
  G.camera.add(vm);
  for (const k of ['physgun', 'toolgun', 'pistol', 'launcher']) {
    const w = buildWeapon(k);
    w.add(buildHand(G.me.color));
    vmModels[k] = w;
  }
  const hands = new THREE.Group();
  const h = buildHand(G.me.color); h.position.set(0.02, 0.02, -0.08);
  hands.add(h);
  vmModels.hands = hands;
  for (const k in vmModels) {
    vmModels[k].visible = false;
    vmModels[k].traverse(o => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = false; } });
    vm.add(vmModels[k]);
  }
  tipMarker = new THREE.Object3D();
  tipMarker.position.set(0, 0.02, -0.55);
  vm.add(tipMarker);
}
export function setToolScreen(text) { if (vmModels.toolgun) updateToolScreen(vmModels.toolgun, text); }
export function tintViewModel(color) { for (const k in vmModels) applyTint(vmModels[k], new THREE.Color(color).getHex()); }

let bob = 0, kick = 0;
export function setViewModel(name) {
  for (const k in vmModels) vmModels[k].visible = k === name;
}
export function viewKick() { kick = 1; }
export function updateViewModel(dt) {
  if (!vm) return;
  const v = player.body.velocity;
  const sp = player.noclip ? 0 : Math.hypot(v.x, v.z);
  bob += dt * sp * 1.6;
  kick = Math.max(0, kick - dt * 6);
  vm.position.set(0.26 + Math.cos(bob) * 0.012 * Math.min(sp, 6) / 6, -0.24 + Math.abs(Math.sin(bob)) * 0.015 * Math.min(sp, 6) / 6, -0.5 + kick * 0.06);
  vm.rotation.x = kick * 0.15;
}
export function gunTip() {
  const p = new THREE.Vector3();
  tipMarker.getWorldPosition(p);
  return p;
}

// ---------- Physgun beam ----------
export function makeBeam(color = 0x55bbff) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * 16), 3));
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }));
  line.frustumCulled = false;
  line.visible = false;
  G.scene.add(line);
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshBasicMaterial({ color }));
  glow.visible = false;
  G.scene.add(glow);
  return { line, glow };
}
export function setBeam(beam, from, mid, to) {
  if (!from || !to) { beam.line.visible = beam.glow.visible = false; return; }
  const pos = beam.line.geometry.attributes.position;
  const curve = new THREE.QuadraticBezierCurve3(from, mid || from.clone().lerp(to, 0.5), to);
  for (let i = 0; i < 16; i++) {
    const p = curve.getPoint(i / 15);
    pos.setXYZ(i, p.x + (Math.random() - 0.5) * 0.02, p.y + (Math.random() - 0.5) * 0.02, p.z + (Math.random() - 0.5) * 0.02);
  }
  pos.needsUpdate = true;
  beam.line.visible = beam.glow.visible = true;
  beam.glow.position.copy(to);
}

// ---------- Avatars for other players ----------
function nameSprite(text, color) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,0.45)';
  g.beginPath(); g.roundRect ? g.roundRect(8, 8, 240, 48, 14) : g.rect(8, 8, 240, 48); g.fill();
  g.font = '700 30px "Exo 2", sans-serif'; g.textAlign = 'center'; g.fillStyle = color;
  g.fillText(text.slice(0, 16), 128, 43);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false }));
  s.scale.set(1.6, 0.4, 1);
  s.renderOrder = 10;
  return s;
}

export function buildAvatar(color) {
  const av = buildHumanoid(0xffffff);
  applyTint(av.group, new THREE.Color(color).getHex());
  return av;
}

export function createRemotePlayer(id, name, color) {
  const av = buildAvatar(color);
  G.scene.add(av.group);
  const tag = nameSprite(name, color);
  tag.position.set(0, 2.3, 0);
  av.group.add(tag);
  const body = new CANNON.Body({
    mass: 0, type: CANNON.Body.KINEMATIC, collisionFilterGroup: GROUP.PLAYER,
    collisionFilterMask: GROUP.PROP | GROUP.PLAYER,
  });
  body.addShape(new CANNON.Sphere(0.35), new CANNON.Vec3(0, -0.55, 0));
  body.addShape(new CANNON.Sphere(0.35), new CANNON.Vec3(0, 0.3, 0));
  G.world.addBody(body);
  const rp = {
    id, name, color, av, tag, body, beam: makeBeam(),
    target: new THREE.Vector3(SPAWN[0], SPAWN[1], SPAWN[2]), pos: new THREE.Vector3(SPAWN[0], SPAWN[1], SPAWN[2]),
    yaw: 0, pitch: 0, walk: 0, weapon: 'physgun', beamTo: null, noclip: false,
  };
  G.players.set(id, rp);
  return rp;
}

export function updateRemotePlayer(rp, s) {
  rp.target.set(s.p[0], s.p[1], s.p[2]);
  rp.yaw = s.y; rp.pitch = s.pi;
  rp.weapon = s.w; rp.beamTo = s.b || null; rp.noclip = !!s.n;
  if (s.c && s.c !== rp.color) { rp.color = s.c; applyTint(rp.av.group, new THREE.Color(s.c).getHex()); }
}

export function removeRemotePlayer(id) {
  const rp = G.players.get(id);
  if (!rp) return;
  G.scene.remove(rp.av.group);
  G.world.removeBody(rp.body);
  G.scene.remove(rp.beam.line); G.scene.remove(rp.beam.glow);
  G.players.delete(id);
}

export function animateRemotePlayers(dt) {
  const k = Math.min(1, dt * 12);
  for (const rp of G.players.values()) {
    const prev = rp.pos.clone();
    rp.pos.lerp(rp.target, k);
    const vel = rp.pos.clone().sub(prev).divideScalar(Math.max(dt, 1e-3));
    rp.body.position.set(rp.pos.x, rp.pos.y, rp.pos.z);
    rp.body.velocity.set(vel.x, vel.y, vel.z);
    const g = rp.av.group;
    g.position.set(rp.pos.x, rp.pos.y - 0.9, rp.pos.z);
    g.rotation.y = rp.yaw + Math.PI;
    rp.av.head.rotation.x = -rp.pitch * 0.7;
    const sp = Math.hypot(vel.x, vel.z);
    rp.walk += dt * sp * 2;
    const sw = Math.sin(rp.walk) * Math.min(1, sp / 4) * 0.7;
    rp.av.legL.rotation.x = sw; rp.av.legR.rotation.x = -sw;
    rp.av.armL.rotation.x = -sw; rp.av.armR.rotation.x = rp.beamTo ? -1.4 : sw;
    if (rp.weapon === 'physgun' && rp.beamTo) {
      const from = new THREE.Vector3(0.47, 1.0, -0.6).applyEuler(new THREE.Euler(0, rp.yaw, 0)).add(g.position);
      setBeam(rp.beam, from, null, new THREE.Vector3(...rp.beamTo));
    } else setBeam(rp.beam, null, null, null);
  }
}

export function clearRemotePlayers() {
  for (const id of [...G.players.keys()]) removeRemotePlayer(id);
}
