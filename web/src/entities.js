// Entities (props, NPCs, ragdolls), constraints, explosions and the host-side action handler.
import * as THREE from 'three';
import { CANNON } from './phys.js';
import { G, GROUP, emit } from './state.js';
import { physMat, spawnFx, playSound } from './world.js';
import { shapeVisual, MODELS, applyTint, collapseModel, meshFromCollapsed } from './models.js';

// ---------- Definitions ----------
function normalizeDef(def) {
  if (!def.parts) {
    const shapes = def.shapes || [def.shape];
    def.parts = [{ mass: def.mass ?? 10, shapes, bouncy: def.bouncy }];
  }
  for (const p of def.parts) {
    if (!p.shapes) p.shapes = [p.shape];
    p.offset ||= [0, 0, 0];
    p.mass ??= 10;
  }
  def.joints ||= [];
  def.category ||= 'Предметы';
  return def;
}

export function registerProp(type, def) {
  def.type = type;
  clearVisualCache(type);
  G.propDefs.set(type, normalizeDef(def));
  emit('defsChanged');
}

export function registerTool(id, def) {
  def.id = id;
  G.toolDefs.set(id, def);
  emit('defsChanged');
}

// ---------- Geometry helpers ----------
function makeCannonShape(s) {
  if (s.type === 'box') return new CANNON.Box(new CANNON.Vec3(s.size[0] / 2, s.size[1] / 2, s.size[2] / 2));
  if (s.type === 'sphere') return new CANNON.Sphere(s.r);
  if (s.type === 'cylinder') return new CANNON.Cylinder(Math.max(0.02, s.rt ?? s.r), Math.max(0.02, s.rb ?? s.r), s.h, 10);
  return new CANNON.Box(new CANNON.Vec3(0.5, 0.5, 0.5));
}

function eulerQuat(rot) {
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(...(rot || [0, 0, 0])));
}

// ---------- Entity creation ----------
// desc: { id, type, color, frozen, owner, pos:[x,y,z], quat:[x,y,z,w], parts?: [[px,py,pz,qx,qy,qz,qw]], vel? }
export function createEntity(desc) {
  const def = G.propDefs.get(desc.type);
  if (!def) { console.warn('Unknown prop type', desc.type); return null; }
  const ent = {
    id: desc.id, type: desc.type, def, owner: desc.owner, color: desc.color || null,
    frozen: false, parts: [], joints: [], health: def.health ?? 0, data: {}, born: G.time,
  };
  const baseQ = new THREE.Quaternion(...(desc.quat || [0, 0, 0, 1]));
  const basePos = new THREE.Vector3(...(desc.pos || [0, 0, 0]));

  def.parts.forEach((p, i) => {
    const group = new THREE.Group();
    const body = new CANNON.Body({
      mass: G.isHost ? p.mass : 0,
      type: G.isHost ? CANNON.Body.DYNAMIC : CANNON.Body.KINEMATIC,
      material: p.bouncy || def.bouncy ? physMat.bouncy : physMat.default,
      collisionFilterGroup: GROUP.PROP,
      collisionFilterMask: GROUP.PROP | GROUP.PLAYER | GROUP.MAP,
      linearDamping: p.damping ?? def.damping ?? 0.05,
      angularDamping: p.angularDamping ?? def.angularDamping ?? 0.1,
      sleepSpeedLimit: 0.15,
      sleepTimeLimit: 0.8,
    });
    if (p.fixedRotation || def.fixedRotation) body.fixedRotation = true;
    for (const s of p.shapes) {
      const q = eulerQuat(s.rot);
      body.addShape(makeCannonShape(s), new CANNON.Vec3(...(s.offset || [0, 0, 0])), new CANNON.Quaternion(q.x, q.y, q.z, q.w));
    }
    addPartVisual(group, def, p, i);
    group.traverse((o) => {
      if (!o.isMesh) return;
      o.userData.entId = ent.id;
      o.userData.part = i;
    });
    body.updateMassProperties();
    // place part
    let pos, quat;
    if (desc.parts && desc.parts[i]) {
      const d = desc.parts[i];
      pos = new THREE.Vector3(d[0], d[1], d[2]);
      quat = new THREE.Quaternion(d[3], d[4], d[5], d[6]);
    } else {
      pos = new THREE.Vector3(...p.offset).applyQuaternion(baseQ).add(basePos);
      quat = baseQ.clone();
      if (p.rot) quat.multiply(eulerQuat(p.rot));
    }
    body.position.set(pos.x, pos.y, pos.z);
    body.quaternion.set(quat.x, quat.y, quat.z, quat.w);
    if (desc.vel && G.isHost) body.velocity.set(...desc.vel);
    body.entId = ent.id;
    body.partIdx = i;
    group.position.copy(pos);
    group.quaternion.copy(quat);
    G.world.addBody(body);
    G.scene.add(group);
    ent.parts.push({ body, group, def: p, target: { p: pos.clone(), q: quat.clone() } });
  });

  // internal joints (ragdolls)
  if (G.isHost) {
    for (const j of def.joints) {
      const a = ent.parts[j.a].body, b = ent.parts[j.b].body;
      let c;
      const pa = new CANNON.Vec3(...j.pivotA), pb = new CANNON.Vec3(...j.pivotB);
      if (j.type === 'cone') {
        c = new CANNON.ConeTwistConstraint(a, b, {
          pivotA: pa, pivotB: pb,
          axisA: new CANNON.Vec3(...(j.axisA || [0, 1, 0])), axisB: new CANNON.Vec3(...(j.axisB || [0, 1, 0])),
          angle: j.angle ?? Math.PI / 4, twistAngle: j.twist ?? Math.PI / 8,
        });
      } else if (j.type === 'hinge') {
        c = new CANNON.HingeConstraint(a, b, { pivotA: pa, pivotB: pb, axisA: new CANNON.Vec3(...j.axisA), axisB: new CANNON.Vec3(...j.axisB) });
      } else {
        c = new CANNON.PointToPointConstraint(a, pa, b, pb);
      }
      c.collideConnected = false;
      G.world.addConstraint(c);
      ent.joints.push(c);
    }
  }
  G.ents.set(ent.id, ent);
  applyColor(ent);
  if (desc.frozen) setFrozen(ent, true);
  if (G.isHost && def.onSpawn) safeCall(() => def.onSpawn(ent, G.api));
  emit('spawn', ent);
  return ent;
}

// Visual of one part: built once per prop type, collapsed to one mesh per material and cached
const visualCache = new Map();
function buildPartVisual(p) {
  const g = new THREE.Group();
  for (const s of p.shapes) {
    if (p.model || s.hidden) continue;
    const vis = shapeVisual(s);
    vis.position.set(...(s.offset || [0, 0, 0]));
    if (s.rot) vis.quaternion.copy(eulerQuat(s.rot));
    g.add(vis);
  }
  if (p.model && MODELS[p.model]) g.add(MODELS[p.model]({ color: p.modelColor, ...(p.modelArgs || {}) }));
  return g;
}
function addPartVisual(group, def, p, i) {
  if (p.model && p.model.startsWith('custom_')) { group.add(buildPartVisual(p)); return; } // player models: keep as is
  const key = def.type + '|' + i;
  let c = visualCache.get(key);
  if (!c) { c = collapseModel(buildPartVisual(p)); visualCache.set(key, c); }
  for (const cp of c.parts) group.add(meshFromCollapsed(cp));
  for (const k of c.keep) group.add(k.clone());
}
export function clearVisualCache(type) { for (const k of [...visualCache.keys()]) if (!type || k.startsWith(type + '|')) visualCache.delete(k); }

// Visual-only model of a definition (used for spawn-menu previews)
export function buildDefVisual(def, color) {
  const root = new THREE.Group();
  for (const p of def.parts) {
    const group = new THREE.Group();
    group.position.set(...p.offset);
    for (const s of p.shapes) {
      if (p.model || s.hidden) continue;
      const vis = shapeVisual(s);
      vis.position.set(...(s.offset || [0, 0, 0]));
      if (s.rot) vis.quaternion.copy(eulerQuat(s.rot));
      group.add(vis);
    }
    if (p.model && MODELS[p.model]) group.add(MODELS[p.model]({ color: p.modelColor, ...(p.modelArgs || {}) }));
    root.add(group);
  }
  applyTint(root, color ?? null);
  return root;
}

function safeCall(fn) { try { return fn(); } catch (e) { console.error(e); return undefined; } }

// Player-chosen picture for bots/mannequins (kept only on this device)
let botSkin = null;
export function setBotSkin(tex) {
  botSkin = tex;
  for (const ent of G.ents.values()) if (ent.def.skinnable) applyColor(ent);
}
export function applyColor(ent) {
  const skin = ent.def.skinnable ? botSkin : null;
  for (const part of ent.parts) applyTint(part.group, ent.color, skin);
}

export function setFrozen(ent, frozen) {
  ent.frozen = frozen;
  if (!G.isHost) return;
  for (const part of ent.parts) {
    const b = part.body;
    if (frozen) {
      b.type = CANNON.Body.STATIC;
      b.mass = 0;
      b.velocity.setZero(); b.angularVelocity.setZero();
    } else {
      b.type = CANNON.Body.DYNAMIC;
      b.mass = part.def.mass * (ent.massMul || 1);
      b.wakeUp();
    }
    b.updateMassProperties();
    b.aabbNeedsUpdate = true;
  }
}

// Developer menu: mass multiplier
export function applyMass(ent) {
  if (!G.isHost || ent.frozen) return;
  for (const p of ent.parts) { p.body.mass = p.def.mass * (ent.massMul || 1); p.body.updateMassProperties(); p.body.wakeUp(); }
}

export function removeEntity(id) {
  const ent = G.ents.get(id);
  if (!ent) return;
  emit('remove', ent);
  for (const c of ent.joints) G.world.removeConstraint(c);
  for (const [cid, con] of G.cons) if (con.a === id || con.b === id) removeConstraint(cid);
  for (const part of ent.parts) {
    G.world.removeBody(part.body);
    G.scene.remove(part.group);
  }
  G.ents.delete(id);
}

// ---------- Constraints (welds and ropes) ----------
// rec: { id, kind: 'weld'|'rope', a, pa, la:[x,y,z], b (id or null for world), pb, lb or wp (world point), len }
export function createConstraint(rec) {
  const ea = G.ents.get(rec.a);
  if (!ea) return null;
  const eb = rec.b != null ? G.ents.get(rec.b) : null;
  if (rec.b != null && !eb) return null;
  const con = { ...rec };
  if (G.isHost && rec.kind === 'weld' && eb) {
    con.c = new CANNON.LockConstraint(ea.parts[rec.pa].body, eb.parts[rec.pb].body);
    con.c.collideConnected = false;
    G.world.addConstraint(con.c);
  }
  if (rec.kind === 'rope') {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    con.line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: rec.color ?? 0x3a2a1a }));
    con.line.frustumCulled = false;
    G.scene.add(con.line);
  }
  G.cons.set(con.id, con);
  return con;
}

export function removeConstraint(id) {
  const con = G.cons.get(id);
  if (!con) return;
  if (con.c) G.world.removeConstraint(con.c);
  if (con.line) { G.scene.remove(con.line); con.line.geometry.dispose(); }
  G.cons.delete(id);
}

const _v1 = new CANNON.Vec3(), _v2 = new CANNON.Vec3();
function ropeEnds(con) {
  const ea = G.ents.get(con.a);
  const ba = ea.parts[con.pa].body;
  ba.pointToWorldFrame(new CANNON.Vec3(...con.la), _v1);
  if (con.b != null) {
    const bb = G.ents.get(con.b).parts[con.pb].body;
    bb.pointToWorldFrame(new CANNON.Vec3(...con.lb), _v2);
    return [ba, bb];
  }
  _v2.set(...con.wp);
  return [ba, null];
}

// Host: apply rope forces before each physics step
export function stepRopes() {
  for (const con of G.cons.values()) {
    if (con.kind !== 'rope') continue;
    const [ba, bb] = ropeEnds(con);
    const d = _v2.vsub(_v1);
    const dist = d.length();
    if (dist <= con.len || dist < 1e-4) continue;
    d.scale(1 / dist, d);
    const stretch = dist - con.len;
    // relative velocity along rope
    const va = ba.getVelocityAtWorldPoint(_v1, new CANNON.Vec3());
    const vb = bb ? bb.getVelocityAtWorldPoint(_v2, new CANNON.Vec3()) : new CANNON.Vec3();
    const rel = vb.vsub(va).dot(d);
    const ma = ba.mass || 0, mb = bb ? (bb.mass || 0) : 0;
    const mEff = ma && mb ? (ma * mb) / (ma + mb) : (ma || mb || 1);
    const f = Math.min(mEff * (stretch * 400 + rel * 25), mEff * 3000);
    if (f <= 0) continue;
    if (ba.type === CANNON.Body.DYNAMIC) { ba.applyForce(d.scale(f), _v1.vsub(ba.position)); ba.wakeUp(); }
    if (bb && bb.type === CANNON.Body.DYNAMIC) { bb.applyForce(d.scale(-f), _v2.vsub(bb.position)); bb.wakeUp(); }
  }
}

export function updateRopeLines() {
  for (const con of G.cons.values()) {
    if (!con.line) continue;
    const ea = G.ents.get(con.a);
    if (!ea) continue;
    const ga = ea.parts[con.pa].group;
    const pA = new THREE.Vector3(...con.la).applyMatrix4(ga.matrixWorld);
    let pB;
    if (con.b != null) {
      const eb = G.ents.get(con.b);
      if (!eb) continue;
      pB = new THREE.Vector3(...con.lb).applyMatrix4(eb.parts[con.pb].group.matrixWorld);
    } else pB = new THREE.Vector3(...con.wp);
    const pos = con.line.geometry.attributes.position;
    pos.setXYZ(0, pA.x, pA.y, pA.z);
    pos.setXYZ(1, pB.x, pB.y, pB.z);
    pos.needsUpdate = true;
  }
}

// ---------- Visual sync ----------
export function syncEntityMeshes(dt) {
  const k = Math.min(1, dt * 15);
  for (const ent of G.ents.values()) {
    for (const part of ent.parts) {
      const b = part.body;
      if (G.isHost) {
        part.group.position.set(b.position.x, b.position.y, b.position.z);
        part.group.quaternion.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
      } else {
        // clients interpolate towards the latest snapshot and drive kinematic bodies
        const t = part.target;
        const prev = part.group.position.clone();
        part.group.position.lerp(t.p, k);
        part.group.quaternion.slerp(t.q, k);
        b.position.set(part.group.position.x, part.group.position.y, part.group.position.z);
        b.quaternion.set(part.group.quaternion.x, part.group.quaternion.y, part.group.quaternion.z, part.group.quaternion.w);
        if (dt > 0) b.velocity.set((part.group.position.x - prev.x) / dt, (part.group.position.y - prev.y) / dt, (part.group.position.z - prev.z) / dt);
      }
    }
  }
}

// ---------- Serialization ----------
const r3 = v => Math.round(v * 1000) / 1000;
export function serializeEntity(ent) {
  return {
    id: ent.id, type: ent.type, color: ent.color, frozen: ent.frozen, owner: ent.owner,
    parts: ent.parts.map(p => [r3(p.body.position.x), r3(p.body.position.y), r3(p.body.position.z),
      r3(p.body.quaternion.x), r3(p.body.quaternion.y), r3(p.body.quaternion.z), r3(p.body.quaternion.w)]),
  };
}
export function serializeConstraint(con) {
  const { c, line, ...rest } = con;
  return rest;
}

export function buildSnapshot(full) {
  const out = [];
  for (const ent of G.ents.values()) {
    ent.parts.forEach((p, i) => {
      const b = p.body;
      const ls = p.lastSent;
      const moved = !ls || Math.abs(ls[0] - b.position.x) > 0.002 || Math.abs(ls[1] - b.position.y) > 0.002 || Math.abs(ls[2] - b.position.z) > 0.002 ||
        Math.abs(ls[3] - b.quaternion.x) > 0.002 || Math.abs(ls[4] - b.quaternion.y) > 0.002 || Math.abs(ls[5] - b.quaternion.z) > 0.002 || Math.abs(ls[6] - b.quaternion.w) > 0.002;
      if (!moved && !full) return;
      p.lastSent = [b.position.x, b.position.y, b.position.z, b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w];
      out.push(ent.id, i, ...p.lastSent.map(r3));
    });
  }
  return out;
}

export function applySnapshot(arr) {
  for (let i = 0; i < arr.length; i += 9) {
    const ent = G.ents.get(arr[i]);
    if (!ent) continue;
    const part = ent.parts[arr[i + 1]];
    if (!part) continue;
    part.target.p.set(arr[i + 2], arr[i + 3], arr[i + 4]);
    part.target.q.set(arr[i + 5], arr[i + 6], arr[i + 7], arr[i + 8]);
  }
}

// ---------- Host-side game logic ----------
const pstates = new Map(); // playerId -> { grab, tools: {}, undo: [] }
export function pstate(pid) {
  if (!pstates.has(pid)) pstates.set(pid, { grab: null, tools: {}, undo: [] });
  return pstates.get(pid);
}
export function dropPlayerState(pid) {
  const ps = pstates.get(pid);
  if (ps && ps.grab) releaseGrab(pid, false);
  pstates.delete(pid);
}

// Host helper used by actions, tools and addons
export function hostSpawn(type, pos, quat, opts = {}) {
  if (!G.propDefs.has(type)) return null;
  const desc = { id: G.nextId++, type, pos, quat: quat || [0, 0, 0, 1], color: opts.color || null, owner: opts.owner || 'world', vel: opts.vel, frozen: opts.frozen };
  const ent = createEntity(desc);
  if (!ent) return null;
  G.net?.broadcast({ t: 'spawn', e: serializeEntity(ent) });
  if (opts.owner && opts.undo !== false) pstate(opts.owner).undo.push({ kind: 'ent', id: ent.id });
  return ent;
}

export function hostRemove(id) {
  if (!G.ents.has(id)) return;
  for (const ps of pstates.values()) if (ps.grab && ps.grab.id === id) ps.grab = null;
  removeEntity(id);
  G.net?.broadcast({ t: 'remove', id });
}

export function hostConstraint(rec, owner) {
  rec.id = G.nextId++;
  const con = createConstraint(rec);
  if (!con) return null;
  G.net?.broadcast({ t: 'con', c: serializeConstraint(con) });
  if (owner) pstate(owner).undo.push({ kind: 'con', id: con.id });
  return con;
}

export function hostRemoveConstraint(id) {
  removeConstraint(id);
  G.net?.broadcast({ t: 'uncon', id });
}

export function hostSetColor(ent, color) {
  ent.color = color;
  applyColor(ent);
  G.net?.broadcast({ t: 'ent', id: ent.id, color, frozen: ent.frozen });
}

export function hostSetFrozen(ent, v) {
  setFrozen(ent, v);
  G.net?.broadcast({ t: 'ent', id: ent.id, color: ent.color, frozen: ent.frozen });
}

export function hostFx(kind, pos, extra) {
  spawnFx(kind, pos, extra);
  G.net?.broadcast({ t: 'fx', k: kind, p: pos, x: extra });
}

export function damage(ent, amount, from, dir) {
  if (!ent || ent.dead) return;
  const def = ent.def;
  if (def.onDamage) safeCall(() => def.onDamage(ent, amount, G.api));
  if (!def.health) return;
  ent.health -= amount;
  if (ent.health <= 0) {
    ent.dead = true;
    if (def.explosive) setTimeout(() => explode(ent), 120);
    else if (def.onDeath) safeCall(() => def.onDeath(ent, G.api, dir));
    else hostRemove(ent.id);
  }
}

export function explode(ent, at) {
  const ex = ent?.def.explosive || { radius: 7, force: 900, damage: 120 };
  let pos = at;
  if (ent) {
    if (!G.ents.has(ent.id)) return;
    const b = ent.parts[0].body.position;
    pos = [b.x, b.y, b.z];
    ent.dead = true;
    hostRemove(ent.id);
  }
  const center = new CANNON.Vec3(...pos);
  hostFx('boom', pos);
  for (const other of [...G.ents.values()]) {
    for (const part of other.parts) {
      const d = part.body.position.vsub(center);
      const dist = d.length();
      if (dist > ex.radius) continue;
      const k = 1 - dist / ex.radius;
      if (other.frozen && k > 0.6) hostSetFrozen(other, false);
      if (part.body.type === CANNON.Body.DYNAMIC) {
        d.normalize();
        d.y += 0.5;
        part.body.applyImpulse(d.scale(ex.force * k * Math.min(part.body.mass, 60) / 10));
        part.body.wakeUp();
      }
    }
    if (other.def.health) {
      const p0 = other.parts[0].body.position;
      const dist = p0.distanceTo(center);
      if (dist < ex.radius) damage(other, ex.damage * (1 - dist / ex.radius));
    }
  }
  emit('explode', pos, ex);
}

// physgun grab
export function startGrab(pid, msg) {
  const ent = G.ents.get(msg.id);
  if (!ent) return;
  const ps = pstate(pid);
  for (const other of pstates.values()) if (other.grab && other.grab.id === msg.id) return; // already held
  if (ent.frozen) hostSetFrozen(ent, false);
  const body = ent.parts[msg.part].body;
  ps.grab = {
    id: ent.id, part: msg.part, local: msg.local, dist: msg.dist, o: msg.o, d: msg.d,
    q: body.quaternion.clone(),
  };
}

export function releaseGrab(pid, freeze) {
  const ps = pstate(pid);
  if (!ps.grab) return;
  const ent = G.ents.get(ps.grab.id);
  ps.grab = null;
  if (ent && freeze) hostSetFrozen(ent, true);
}

const _qd = new CANNON.Quaternion();
export function stepGrabs() {
  for (const [pid, ps] of pstates) {
    const g = ps.grab;
    if (!g) continue;
    const ent = G.ents.get(g.id);
    if (!ent) { ps.grab = null; continue; }
    const body = ent.parts[g.part].body;
    if (body.type !== CANNON.Body.DYNAMIC) continue;
    const target = new CANNON.Vec3(g.o[0] + g.d[0] * g.dist, g.o[1] + g.d[1] * g.dist, g.o[2] + g.d[2] * g.dist);
    const wp = body.pointToWorldFrame(new CANNON.Vec3(...g.local));
    const delta = target.vsub(wp);
    const v = delta.scale(14);
    const maxV = 40;
    if (v.length() > maxV) v.scale(maxV / v.length(), v);
    body.velocity.copy(v);
    // keep orientation
    g.q.mult(body.quaternion.conjugate(), _qd);
    if (_qd.w < 0) { _qd.x = -_qd.x; _qd.y = -_qd.y; _qd.z = -_qd.z; _qd.w = -_qd.w; }
    const angle = 2 * Math.acos(Math.min(1, _qd.w));
    const s = Math.sqrt(1 - _qd.w * _qd.w);
    if (s > 1e-4) body.angularVelocity.set(_qd.x / s * angle * 12, _qd.y / s * angle * 12, _qd.z / s * angle * 12);
    else body.angularVelocity.setZero();
    body.wakeUp();
  }
}

export function grabbedBy(id) {
  for (const [pid, ps] of pstates) if (ps.grab && ps.grab.id === id) return pid;
  return null;
}

export function hostUndo(pid) {
  const ps = pstate(pid);
  while (ps.undo.length) {
    const u = ps.undo.pop();
    if (u.kind === 'ent' && G.ents.has(u.id)) { hostRemove(u.id); return true; }
    if (u.kind === 'con' && G.cons.has(u.id)) { hostRemoveConstraint(u.id); return true; }
  }
  return false;
}

export function hostCleanup(pid) {
  for (const ent of [...G.ents.values()]) if (!pid || ent.owner === pid) hostRemove(ent.id);
  for (const id of [...G.cons.keys()]) hostRemoveConstraint(id);
}

// Raycast against the physics world (host side, used by guns and tools)
export function physRay(o, d, len = 200) {
  const from = new CANNON.Vec3(...o);
  const to = new CANNON.Vec3(o[0] + d[0] * len, o[1] + d[1] * len, o[2] + d[2] * len);
  const res = new CANNON.RaycastResult();
  G.world.raycastClosest(from, to, { collisionFilterMask: GROUP.PROP | GROUP.MAP, skipBackfaces: true }, res);
  if (!res.hasHit) return null;
  const b = res.body;
  const hit = { point: [res.hitPointWorld.x, res.hitPointWorld.y, res.hitPointWorld.z], normal: [res.hitNormalWorld.x, res.hitNormalWorld.y, res.hitNormalWorld.z], dist: res.distance };
  if (b.entId != null) {
    hit.id = b.entId; hit.part = b.partIdx;
    const l = b.pointToLocalFrame(res.hitPointWorld);
    hit.local = [l.x, l.y, l.z];
  }
  return hit;
}

// Process an action coming from a player (local or remote). Runs on the host only.
export function hostAction(pid, m) {
  const ps = pstate(pid);
  switch (m.a) {
    case 'spawn': {
      const ent = hostSpawn(m.type, m.pos, m.quat, { owner: pid, vel: m.vel, color: m.color });
      if (ent) hostFx('pop', m.pos);
      break;
    }
    case 'grab': startGrab(pid, m); break;
    case 'drag':
      if (ps.grab) { ps.grab.o = m.o; ps.grab.d = m.d; ps.grab.dist = Math.max(1.2, Math.min(60, m.dist)); }
      break;
    case 'grot':
      if (ps.grab) {
        const qy = new CANNON.Quaternion(); qy.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), m.dx);
        const right = new CANNON.Vec3(-m.d[2], 0, m.d[0]); right.normalize();
        const qx = new CANNON.Quaternion(); qx.setFromAxisAngle(right, m.dy);
        ps.grab.q = qy.mult(qx).mult(ps.grab.q);
        ps.grab.q.normalize();
      }
      break;
    case 'release': releaseGrab(pid, m.freeze); break;
    case 'unfreeze': {
      const ent = G.ents.get(m.id);
      if (ent && ent.frozen) { hostSetFrozen(ent, false); hostFx('pop', m.p || [0, 0, 0]); }
      break;
    }
    case 'tool': {
      const tool = G.toolDefs.get(m.tool);
      if (!tool) break;
      const hit = physRay(m.o, m.d, 200);
      const ctx = {
        pid, hit, ent: hit && hit.id != null ? G.ents.get(hit.id) : null,
        origin: m.o, dir: m.d, opts: m.opts || {}, state: (ps.tools[m.tool] ||= {}), api: G.api,
      };
      const fn = m.btn === 2 ? tool.onSecondary : tool.onPrimary;
      if (fn) safeCall(() => fn(ctx, G.api));
      if (hit) hostFx('zap', [m.o[0] + m.d[0] * 0.5, m.o[1] - 0.3 + m.d[1] * 0.5, m.o[2] + m.d[2] * 0.5], { to: hit.point, normal: hit.normal });
      break;
    }
    case 'shoot': {
      const hit = physRay(m.o, m.d, 300);
      const to = hit ? hit.point : [m.o[0] + m.d[0] * 300, m.o[1] + m.d[1] * 300, m.o[2] + m.d[2] * 300];
      hostFx('tracer', [m.o[0] + m.d[0], m.o[1] - 0.25 + m.d[1], m.o[2] + m.d[2]], { to });
      if (hit && hit.id != null) {
        const ent = G.ents.get(hit.id);
        const body = ent.parts[hit.part].body;
        if (body.type === CANNON.Body.DYNAMIC) {
          body.applyImpulse(new CANNON.Vec3(m.d[0] * 60, m.d[1] * 60, m.d[2] * 60), new CANNON.Vec3(...hit.point).vsub(body.position));
          body.wakeUp();
        }
        damage(ent, 25, pid, m.d);
      }
      break;
    }
    case 'undo': hostUndo(pid); break;
    case 'cleanup': hostCleanup(m.all ? null : pid); break;
    case 'cmd': {
      const c = G.commands.get(m.name);
      if (c) safeCall(() => c(pid, m.args || [], G.api));
      break;
    }
    default: emit('action', pid, m);
  }
}

// Host step: thinking entities
export function stepThink(dt) {
  for (const ent of [...G.ents.values()]) {
    const def = ent.def;
    if (def.lift) {
      for (const part of ent.parts) {
        const b = part.body;
        if (b.type !== CANNON.Body.DYNAMIC) continue;
        b.applyForce(new CANNON.Vec3(0, def.lift - b.mass * G.world.gravity.y, 0));
      }
    }
    if (ent.float) for (const part of ent.parts) {
      const b = part.body;
      if (b.type === CANNON.Body.DYNAMIC) { b.applyForce(new CANNON.Vec3(0, -G.world.gravity.y * b.mass, 0)); b.velocity.scale(0.995, b.velocity); }
    }
    if (def.fuse && G.time - ent.born > def.fuse) { explode(ent); continue; }
    if (def.think) safeCall(() => def.think(ent, dt, G.api));
    // fell out of the world
    if (ent.parts[0].body.position.y < -50) hostRemove(ent.id);
  }
}

// Client: apply host messages about entities
export function clientEntityMessage(m) {
  switch (m.t) {
    case 'spawn': if (!G.ents.has(m.e.id)) createEntity(m.e); break;
    case 'remove': removeEntity(m.id); break;
    case 'con': createConstraint(m.c); break;
    case 'uncon': removeConstraint(m.id); break;
    case 'ent': {
      const ent = G.ents.get(m.id);
      if (ent) { ent.color = m.color; ent.frozen = m.frozen; applyColor(ent); }
      break;
    }
    case 's': applySnapshot(m.d); break;
    case 'fx': spawnFx(m.k, m.p, m.x || {}); if (m.k === 'zap') playSound('zap', new THREE.Vector3(...m.p)); break;
    default: break;
  }
}

export function clearAll() {
  for (const id of [...G.ents.keys()]) removeEntity(id);
  for (const id of [...G.cons.keys()]) removeConstraint(id);
  pstates.clear();
}
