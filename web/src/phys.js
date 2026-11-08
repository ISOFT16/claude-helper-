// Physics facade. The game code uses a cannon-es style API (World, Body, Vec3 ...).
// When WebAssembly is available, World/Body/joints are backed by the Rust physics core
// (physics/ folder, Rapier engine compiled to WebAssembly). Otherwise cannon-es (JavaScript) is used.
import * as CANNONJS from 'cannon-es';
import wasmBytes from './physics.wasm';

const { Vec3, Quaternion } = CANNONJS;

// Mutable namespace: starts as plain cannon-es, switched to the Rust backend by initPhysics()
export const CANNON = { ...CANNONJS };
export const physicsInfo = { engine: 'JavaScript (cannon-es)' };

let W = null;    // wasm exports
let mem = null;  // wasm memory

const DYNAMIC = 1, STATIC = 2, KINEMATIC = 4;
const damp = d => -Math.log(1 - Math.min(Math.max(d || 0, 0), 0.99));   // cannon damping -> rapier coefficient

// ---------- Body ----------
class RBody {
  constructor(o = {}) {
    this.id = -1;
    this.world = null;
    this.mass = o.mass ?? 0;
    this.type = o.type ?? (this.mass > 0 ? DYNAMIC : STATIC);
    this.material = o.material || null;
    this.collisionFilterGroup = o.collisionFilterGroup ?? 1;
    this.collisionFilterMask = o.collisionFilterMask ?? -1;
    this.linearDamping = o.linearDamping ?? 0.01;
    this.angularDamping = o.angularDamping ?? 0.01;
    this.fixedRotation = !!o.fixedRotation;
    this.allowSleep = o.allowSleep ?? true;
    this.collisionResponse = o.collisionResponse ?? true;
    this.sleepSpeedLimit = o.sleepSpeedLimit ?? 0.1;
    this.sleepTimeLimit = o.sleepTimeLimit ?? 1;
    this.sleepState = 0;
    this.position = new Vec3(); this.quaternion = new Quaternion();
    this.velocity = new Vec3(); this.angularVelocity = new Vec3();
    if (o.position) this.position.copy(o.position);
    if (o.quaternion) this.quaternion.copy(o.quaternion);
    this.shapes = []; this.shapeOffsets = []; this.shapeOrientations = [];
    this._last = new Float64Array(13).fill(NaN);
    this._cfg = {};
  }
  addShape(shape, offset, orientation) {
    this.shapes.push(shape);
    this.shapeOffsets.push(offset ? offset.clone() : new Vec3());
    this.shapeOrientations.push(orientation ? orientation.clone() : new Quaternion());
    if (this.world) this.world._addCollider(this, this.shapes.length - 1);
    return this;
  }
  // cannon-es semantics: the point is relative to the body's centre, in world orientation
  applyForce(force, rel) {
    if (this.id < 0) return;
    const p = this.position;
    W.sf_body_force(this.id, force.x, force.y, force.z, p.x + (rel ? rel.x : 0), p.y + (rel ? rel.y : 0), p.z + (rel ? rel.z : 0));
  }
  applyImpulse(imp, rel) {
    if (this.id < 0) return;
    const p = this.position;
    if (rel) W.sf_body_impulse(this.id, imp.x, imp.y, imp.z, p.x + rel.x, p.y + rel.y, p.z + rel.z, 1);
    else W.sf_body_impulse(this.id, imp.x, imp.y, imp.z, 0, 0, 0, 0);
  }
  applyLocalForce(f, localPoint) { this.applyForce(this.quaternion.vmult(f), localPoint ? this.quaternion.vmult(localPoint) : undefined); }
  wakeUp() { if (this.id >= 0) W.sf_body_wake(this.id); this.sleepState = 0; }
  sleep() {}
  updateMassProperties() { if (this.world) this.world._syncConfig(this); }
  pointToWorldFrame(local, result = new Vec3()) { this.quaternion.vmult(local, result); result.vadd(this.position, result); return result; }
  pointToLocalFrame(world, result = new Vec3()) { world.vsub(this.position, result); this.quaternion.conjugate().vmult(result, result); return result; }
  vectorToWorldFrame(v, result = new Vec3()) { return this.quaternion.vmult(v, result); }
  vectorToLocalFrame(v, result = new Vec3()) { return this.quaternion.conjugate().vmult(v, result); }
  getVelocityAtWorldPoint(world, result = new Vec3()) {
    const r = world.vsub(this.position);
    this.angularVelocity.cross(r, result);
    return result.vadd(this.velocity, result);
  }
}
RBody.DYNAMIC = DYNAMIC; RBody.STATIC = STATIC; RBody.KINEMATIC = KINEMATIC;
RBody.AWAKE = 0; RBody.SLEEPY = 1; RBody.SLEEPING = 2;

// ---------- shapes (parameter holders) ----------
class RBox { constructor(h) { this.type = 'box'; this.halfExtents = h.clone ? h.clone() : new Vec3(h.x, h.y, h.z); } }
class RSphere { constructor(r) { this.type = 'sphere'; this.radius = r; } }
class RCylinder { constructor(rt, rb, h) { this.type = 'cylinder'; this.radiusTop = rt; this.radiusBottom = rb; this.height = h; } }

// ---------- joints ----------
class RJoint { constructor() { this.id = -1; this.collideConnected = true; } }
class RLock extends RJoint { constructor(a, b) { super(); this.bodyA = a; this.bodyB = b; } _make() { return W.sf_joint_fixed(this.bodyA.id, this.bodyB.id); } }
class RConeTwist extends RJoint {
  constructor(a, b, o = {}) { super(); this.bodyA = a; this.bodyB = b; this.o = o; }
  _make() { const o = this.o, pa = o.pivotA || new Vec3(), pb = o.pivotB || new Vec3(); return W.sf_joint_spherical(this.bodyA.id, this.bodyB.id, pa.x, pa.y, pa.z, pb.x, pb.y, pb.z, o.angle ?? 0.6, o.twistAngle ?? 0.3); }
}
class RPointToPoint extends RJoint {
  constructor(a, pa, b, pb) { super(); this.bodyA = a; this.bodyB = b; this.pa = pa || new Vec3(); this.pb = pb || new Vec3(); }
  _make() { return W.sf_joint_spherical(this.bodyA.id, this.bodyB.id, this.pa.x, this.pa.y, this.pa.z, this.pb.x, this.pb.y, this.pb.z, -1, -1); }
}
class RHinge extends RJoint {
  constructor(a, b, o = {}) { super(); this.bodyA = a; this.bodyB = b; this.o = o; }
  _make() { const o = this.o, pa = o.pivotA || new Vec3(), pb = o.pivotB || new Vec3(), ax = o.axisA || new Vec3(0, 1, 0); return W.sf_joint_revolute(this.bodyA.id, this.bodyB.id, pa.x, pa.y, pa.z, pb.x, pb.y, pb.z, ax.x, ax.y, ax.z); }
}

// ---------- World ----------
class RWorld {
  constructor(o = {}) {
    this.gravity = new Vec3(0, -9.82, 0);
    if (o.gravity) this.gravity.copy(o.gravity);
    this.bodies = [];
    this.byId = new Map();
    this.constraints = [];
    this.solver = { iterations: 10 };
    this.defaultContactMaterial = { friction: 0.3, restitution: 0 };
    this.contactMaterials = [];
    this.allowSleep = true;
    this.broadphase = null;
    this._g = [NaN, NaN, NaN];
  }
  addContactMaterial(cm) { this.contactMaterials.push(cm); }

  _surface(body) {
    const name = body.material && body.material.name;
    if (name === 'player') return { f: 0, r: 0, combine: 1 | (0 << 2) };          // friction: min
    if (name === 'bouncy') return { f: 0.3, r: 0.9, combine: 0 | (2 << 2) };      // restitution: max
    return { f: this.defaultContactMaterial.friction, r: this.defaultContactMaterial.restitution, combine: 0 };
  }
  _addCollider(b, i) {
    const s = b.shapes[i], o = b.shapeOffsets[i], q = b.shapeOrientations[i];
    let kind = 0, a = 0.5, bb = 0.5, c = 0.5;
    if (s.type === 'sphere' || s instanceof CANNONJS.Sphere) { kind = 1; a = s.radius; }
    else if (s.type === 'cylinder') { kind = 2; a = s.radiusTop; bb = s.radiusBottom; c = s.height; }
    else if (s.halfExtents) { a = s.halfExtents.x; bb = s.halfExtents.y; c = s.halfExtents.z; }
    const surf = this._surface(b);
    W.sf_collider_add(b.id, kind, a, bb, c, o.x, o.y, o.z, q.x, q.y, q.z, q.w, surf.f, surf.r, surf.combine,
      b.collisionFilterGroup >>> 0, b.collisionFilterMask >>> 0, b.collisionResponse ? 0 : 1);
  }
  addBody(b) {
    if (b.world) return;
    const p = b.position, q = b.quaternion;
    b.id = W.sf_body_create(b.type, p.x, p.y, p.z, q.x, q.y, q.z, q.w, damp(b.linearDamping), damp(b.angularDamping), b.allowSleep && this.allowSleep ? 1 : 0, b.fixedRotation ? 1 : 0);
    b.world = this;
    for (let i = 0; i < b.shapes.length; i++) this._addCollider(b, i);
    if (b.type === DYNAMIC && b.mass > 0) W.sf_body_set_mass(b.id, b.mass);
    if (b.velocity.lengthSquared() > 0) W.sf_body_set_linvel(b.id, b.velocity.x, b.velocity.y, b.velocity.z);
    this._remember(b);
    this.bodies.push(b);
    this.byId.set(b.id, b);
  }
  removeBody(b) {
    if (b.world !== this) return;
    W.sf_body_remove(b.id);
    this.byId.delete(b.id);
    const i = this.bodies.indexOf(b);
    if (i >= 0) this.bodies.splice(i, 1);
    b.world = null; b.id = -1;
  }
  addConstraint(c) {
    if (c.bodyA.id < 0 || c.bodyB.id < 0) return;
    c.id = c._make();
    this.constraints.push(c);
  }
  removeConstraint(c) {
    if (c.id >= 0) W.sf_joint_remove(c.id);
    c.id = -1;
    const i = this.constraints.indexOf(c);
    if (i >= 0) this.constraints.splice(i, 1);
  }

  _remember(b) {
    const L = b._last, p = b.position, q = b.quaternion, v = b.velocity, w = b.angularVelocity;
    L[0] = p.x; L[1] = p.y; L[2] = p.z; L[3] = q.x; L[4] = q.y; L[5] = q.z; L[6] = q.w;
    L[7] = v.x; L[8] = v.y; L[9] = v.z; L[10] = w.x; L[11] = w.y; L[12] = w.z;
    const c = b._cfg;
    c.type = b.type; c.mass = b.mass; c.fixedRotation = b.fixedRotation; c.collisionResponse = b.collisionResponse;
    c.ld = b.linearDamping; c.ad = b.angularDamping; c.g = b.collisionFilterGroup; c.m = b.collisionFilterMask;
  }
  _syncConfig(b) {
    if (b.id < 0) return;
    const c = b._cfg;
    if (c.type !== b.type) { W.sf_body_set_type(b.id, b.type); c.type = b.type; if (b.type === DYNAMIC) c.mass = -1; }
    if (c.mass !== b.mass && b.type === DYNAMIC && b.mass > 0) { W.sf_body_set_mass(b.id, b.mass); c.mass = b.mass; }
    if (c.fixedRotation !== b.fixedRotation) { W.sf_body_lock_rotations(b.id, b.fixedRotation ? 1 : 0); c.fixedRotation = b.fixedRotation; }
    if (c.collisionResponse !== b.collisionResponse) { W.sf_body_set_sensor(b.id, b.collisionResponse ? 0 : 1); c.collisionResponse = b.collisionResponse; }
    if (c.ld !== b.linearDamping || c.ad !== b.angularDamping) { W.sf_body_set_damping(b.id, damp(b.linearDamping), damp(b.angularDamping)); c.ld = b.linearDamping; c.ad = b.angularDamping; }
    if (c.g !== b.collisionFilterGroup || c.m !== b.collisionFilterMask) { W.sf_body_set_groups(b.id, b.collisionFilterGroup >>> 0, b.collisionFilterMask >>> 0); c.g = b.collisionFilterGroup; c.m = b.collisionFilterMask; }
  }

  step(dt) {
    const g = this.gravity;
    if (g.x !== this._g[0] || g.y !== this._g[1] || g.z !== this._g[2]) { W.sf_set_gravity(g.x, g.y, g.z); this._g = [g.x, g.y, g.z]; }
    // push changes the game made to bodies since the last step
    for (const b of this.bodies) {
      this._syncConfig(b);
      if (b.type === STATIC) {
        const L = b._last, p = b.position, q = b.quaternion;
        if (p.x !== L[0] || p.y !== L[1] || p.z !== L[2] || q.x !== L[3] || q.y !== L[4] || q.z !== L[5] || q.w !== L[6]) {
          W.sf_body_set_pose(b.id, p.x, p.y, p.z, q.x, q.y, q.z, q.w);
          L[0] = p.x; L[1] = p.y; L[2] = p.z; L[3] = q.x; L[4] = q.y; L[5] = q.z; L[6] = q.w;
        }
        continue;
      }
      const L = b._last, p = b.position, q = b.quaternion, v = b.velocity, w = b.angularVelocity;
      if (p.x !== L[0] || p.y !== L[1] || p.z !== L[2] || q.x !== L[3] || q.y !== L[4] || q.z !== L[5] || q.w !== L[6]) {
        const n = Math.hypot(q.x, q.y, q.z, q.w) || 1;
        W.sf_body_set_pose(b.id, p.x, p.y, p.z, q.x / n, q.y / n, q.z / n, q.w / n);
      }
      if (v.x !== L[7] || v.y !== L[8] || v.z !== L[9]) W.sf_body_set_linvel(b.id, v.x, v.y, v.z);
      if (w.x !== L[10] || w.y !== L[11] || w.z !== L[12]) W.sf_body_set_angvel(b.id, w.x, w.y, w.z);
    }
    W.sf_step(dt);
    // read back the new state of every moving body in one pass
    const n = W.sf_sync_out();
    const buf = new Float32Array(mem.buffer, W.sf_out_ptr(), n * 15);
    for (let i = 0, o = 0; i < n; i++, o += 15) {
      const b = this.byId.get(buf[o]);
      if (!b) continue;
      const L = b._last;
      b.position.x = L[0] = buf[o + 1]; b.position.y = L[1] = buf[o + 2]; b.position.z = L[2] = buf[o + 3];
      b.quaternion.x = L[3] = buf[o + 4]; b.quaternion.y = L[4] = buf[o + 5]; b.quaternion.z = L[5] = buf[o + 6]; b.quaternion.w = L[6] = buf[o + 7];
      b.velocity.x = L[7] = buf[o + 8]; b.velocity.y = L[8] = buf[o + 9]; b.velocity.z = L[9] = buf[o + 10];
      b.angularVelocity.x = L[10] = buf[o + 11]; b.angularVelocity.y = L[11] = buf[o + 12]; b.angularVelocity.z = L[12] = buf[o + 13];
      b.sleepState = buf[o + 14] ? 2 : 0;
    }
  }

  raycastClosest(from, to, opts = {}, result) {
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
    const len = Math.hypot(dx, dy, dz) || 1e-6;
    const mask = (opts.collisionFilterMask ?? -1) >>> 0;
    const id = W.sf_ray_cast(from.x, from.y, from.z, dx / len, dy / len, dz / len, len, mask);
    result.reset?.();
    if (id < 0) { result.hasHit = false; return false; }
    const r = new Float32Array(mem.buffer, W.sf_ray_ptr(), 4);
    const t = r[0];
    result.hasHit = true;
    result.body = this.byId.get(id) || null;
    result.distance = t;
    result.hitPointWorld.set(from.x + dx / len * t, from.y + dy / len * t, from.z + dz / len * t);
    result.hitNormalWorld.set(r[1], r[2], r[3]);
    return true;
  }
}

// Load the Rust core. Falls back to cannon-es (JavaScript) if WebAssembly is unavailable.
export async function initPhysics(prefer = 'rust') {
  if (prefer !== 'rust' || typeof WebAssembly === 'undefined') return physicsInfo;
  try {
    const { instance } = await WebAssembly.instantiate(wasmBytes, {});
    W = instance.exports;
    mem = W.memory;
    Object.assign(CANNON, {
      World: RWorld, Body: RBody, Box: RBox, Sphere: RSphere, Cylinder: RCylinder,
      LockConstraint: RLock, ConeTwistConstraint: RConeTwist, PointToPointConstraint: RPointToPoint, HingeConstraint: RHinge,
      SAPBroadphase: function SAPBroadphase() {}, NaiveBroadphase: function NaiveBroadphase() {},
    });
    physicsInfo.engine = 'Rust (Rapier, WebAssembly)';
  } catch (e) {
    console.warn('Rust physics unavailable, using cannon-es', e);
  }
  return physicsInfo;
}
