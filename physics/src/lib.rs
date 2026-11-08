//! SandForge physics core.
//!
//! Rigid-body simulation (Rapier) compiled to WebAssembly. The game talks to it through a small
//! C-style API: bodies and joints are addressed by integer ids, and after every step the state of
//! all moving bodies is written into one shared f32 buffer that JavaScript reads in a single pass.
#![allow(static_mut_refs)]

use rapier3d::prelude::*;
use rapier3d::na::{Quaternion, UnitQuaternion};

const STRIDE: usize = 15; // id, pos(3), rot(4), linvel(3), angvel(3), sleeping

struct State {
    gravity: Vector<Real>,
    params: IntegrationParameters,
    pipeline: PhysicsPipeline,
    islands: IslandManager,
    broad: DefaultBroadPhase,
    narrow: NarrowPhase,
    bodies: RigidBodySet,
    colliders: ColliderSet,
    joints: ImpulseJointSet,
    multibody: MultibodyJointSet,
    ccd: CCDSolver,
    query: QueryPipeline,
    body_ids: Vec<Option<RigidBodyHandle>>,
    free_bodies: Vec<u32>,
    joint_ids: Vec<Option<ImpulseJointHandle>>,
    free_joints: Vec<u32>,
    out: Vec<f32>,
    ray_out: [f32; 4],
    query_dirty: bool,
}

static mut STATE: Option<State> = None;

fn st() -> &'static mut State {
    unsafe {
        if STATE.is_none() {
            STATE = Some(State {
                gravity: vector![0.0, -9.82, 0.0],
                params: IntegrationParameters::default(),
                pipeline: PhysicsPipeline::new(),
                islands: IslandManager::new(),
                broad: DefaultBroadPhase::new(),
                narrow: NarrowPhase::new(),
                bodies: RigidBodySet::new(),
                colliders: ColliderSet::new(),
                joints: ImpulseJointSet::new(),
                multibody: MultibodyJointSet::new(),
                ccd: CCDSolver::new(),
                query: QueryPipeline::new(),
                body_ids: Vec::new(),
                free_bodies: Vec::new(),
                joint_ids: Vec::new(),
                free_joints: Vec::new(),
                out: Vec::new(),
                ray_out: [0.0; 4],
                query_dirty: true,
            });
        }
        STATE.as_mut().unwrap()
    }
}

fn body(id: u32) -> Option<&'static mut RigidBody> {
    let s = st();
    let h = (*s.body_ids.get(id as usize)?)?;
    s.bodies.get_mut(h)
}

fn iso(px: f32, py: f32, pz: f32, qx: f32, qy: f32, qz: f32, qw: f32) -> Isometry<Real> {
    let q = UnitQuaternion::from_quaternion(Quaternion::new(qw, qx, qy, qz));
    Isometry::from_parts(Translation::new(px, py, pz), q)
}

fn body_type(kind: u32) -> RigidBodyType {
    // same numbers as cannon-es: 1 dynamic, 2 static, 4 kinematic
    match kind {
        2 => RigidBodyType::Fixed,
        4 => RigidBodyType::KinematicPositionBased,
        _ => RigidBodyType::Dynamic,
    }
}

fn groups(member: u32, filter: u32) -> InteractionGroups {
    InteractionGroups::new(Group::from_bits_truncate(member), Group::from_bits_truncate(filter))
}

// ------------------------------------------------------------------ world

#[no_mangle]
pub extern "C" fn sf_set_gravity(x: f32, y: f32, z: f32) {
    st().gravity = vector![x, y, z];
}

#[no_mangle]
pub extern "C" fn sf_step(dt: f32) {
    let s = st();
    s.params.dt = dt.clamp(1.0 / 480.0, 1.0 / 20.0);
    s.pipeline.step(
        &s.gravity, &s.params, &mut s.islands, &mut s.broad, &mut s.narrow, &mut s.bodies,
        &mut s.colliders, &mut s.joints, &mut s.multibody, &mut s.ccd, Some(&mut s.query), &(), &(),
    );
    s.query_dirty = false;
    // user forces last for one step, like in cannon-es
    for (_, b) in s.bodies.iter_mut() {
        if b.user_force().norm_squared() > 0.0 || b.user_torque().norm_squared() > 0.0 {
            b.reset_forces(false);
            b.reset_torques(false);
        }
    }
}

/// Writes all non-fixed bodies into the output buffer; returns how many were written.
#[no_mangle]
pub extern "C" fn sf_sync_out() -> u32 {
    let s = st();
    s.out.clear();
    let mut n = 0u32;
    for (id, slot) in s.body_ids.iter().enumerate() {
        let Some(h) = slot else { continue };
        let Some(b) = s.bodies.get(*h) else { continue };
        if b.is_fixed() { continue; }
        let p = b.translation();
        let q = b.rotation();
        let v = b.linvel();
        let w = b.angvel();
        s.out.extend_from_slice(&[
            id as f32, p.x, p.y, p.z, q.i, q.j, q.k, q.w, v.x, v.y, v.z, w.x, w.y, w.z,
            if b.is_sleeping() { 1.0 } else { 0.0 },
        ]);
        n += 1;
    }
    n
}

#[no_mangle]
pub extern "C" fn sf_out_ptr() -> *const f32 { st().out.as_ptr() }

#[no_mangle]
pub extern "C" fn sf_stride() -> u32 { STRIDE as u32 }

// ------------------------------------------------------------------ bodies

#[no_mangle]
pub extern "C" fn sf_body_create(kind: u32, px: f32, py: f32, pz: f32, qx: f32, qy: f32, qz: f32, qw: f32,
                                 lin_damp: f32, ang_damp: f32, can_sleep: u32, lock_rot: u32) -> u32 {
    let s = st();
    let mut b = RigidBodyBuilder::new(body_type(kind))
        .position(iso(px, py, pz, qx, qy, qz, qw))
        .linear_damping(lin_damp)
        .angular_damping(ang_damp)
        .can_sleep(can_sleep != 0)
        .build();
    if lock_rot != 0 { b.lock_rotations(true, false); }
    let h = s.bodies.insert(b);
    s.query_dirty = true;
    if let Some(id) = s.free_bodies.pop() {
        s.body_ids[id as usize] = Some(h);
        id
    } else {
        s.body_ids.push(Some(h));
        (s.body_ids.len() - 1) as u32
    }
}

/// shape: 0 box (a,b,c = half extents), 1 sphere (a = radius), 2 cylinder/frustum (a = top r, b = bottom r, c = height)
#[no_mangle]
pub extern "C" fn sf_collider_add(id: u32, shape: u32, a: f32, b: f32, c: f32,
                                  ox: f32, oy: f32, oz: f32, qx: f32, qy: f32, qz: f32, qw: f32,
                                  friction: f32, restitution: f32, combine: u32,
                                  member: u32, filter: u32, sensor: u32) -> u32 {
    let s = st();
    let Some(h) = s.body_ids.get(id as usize).copied().flatten() else { return 0 };
    let builder = match shape {
        1 => ColliderBuilder::ball(a.max(0.001)),
        2 => {
            if (a - b).abs() < 1e-4 {
                ColliderBuilder::cylinder(c * 0.5, a.max(0.005))
            } else {
                // frustum (e.g. a traffic cone): convex hull of two circles
                let mut pts = Vec::with_capacity(32);
                for i in 0..16 {
                    let t = i as f32 / 16.0 * std::f32::consts::TAU;
                    pts.push(point![t.cos() * a.max(0.005), c * 0.5, t.sin() * a.max(0.005)]);
                    pts.push(point![t.cos() * b.max(0.005), -c * 0.5, t.sin() * b.max(0.005)]);
                }
                match ColliderBuilder::convex_hull(&pts) {
                    Some(cb) => cb,
                    None => ColliderBuilder::cylinder(c * 0.5, (a + b) * 0.5),
                }
            }
        }
        _ => ColliderBuilder::cuboid(a.max(0.001), b.max(0.001), c.max(0.001)),
    };
    let rule = |k: u32| match k { 1 => CoefficientCombineRule::Min, 2 => CoefficientCombineRule::Max, _ => CoefficientCombineRule::Average };
    let col = builder
        .position(iso(ox, oy, oz, qx, qy, qz, qw))
        .friction(friction)
        .restitution(restitution)
        .friction_combine_rule(rule(combine & 3))
        .restitution_combine_rule(rule((combine >> 2) & 3))
        .collision_groups(groups(member, filter))
        .sensor(sensor != 0)
        .build();
    s.colliders.insert_with_parent(col, h, &mut s.bodies);
    s.query_dirty = true;
    1
}

#[no_mangle]
pub extern "C" fn sf_body_remove(id: u32) {
    let s = st();
    if let Some(Some(h)) = s.body_ids.get(id as usize).copied() {
        s.bodies.remove(h, &mut s.islands, &mut s.colliders, &mut s.joints, &mut s.multibody, true);
        s.body_ids[id as usize] = None;
        s.free_bodies.push(id);
        s.query_dirty = true;
    }
}

#[no_mangle]
pub extern "C" fn sf_body_set_type(id: u32, kind: u32) {
    if let Some(b) = body(id) { b.set_body_type(body_type(kind), true); }
}

#[no_mangle]
pub extern "C" fn sf_body_set_pose(id: u32, px: f32, py: f32, pz: f32, qx: f32, qy: f32, qz: f32, qw: f32) {
    let s = st();
    if let Some(b) = body(id) {
        let p = iso(px, py, pz, qx, qy, qz, qw);
        if b.is_kinematic() { b.set_next_kinematic_position(p); } else { b.set_position(p, false); }
        s.query_dirty = true;
    }
}

#[no_mangle]
pub extern "C" fn sf_body_set_linvel(id: u32, x: f32, y: f32, z: f32) {
    if let Some(b) = body(id) { b.set_linvel(vector![x, y, z], true); }
}

#[no_mangle]
pub extern "C" fn sf_body_set_angvel(id: u32, x: f32, y: f32, z: f32) {
    if let Some(b) = body(id) { b.set_angvel(vector![x, y, z], true); }
}

#[no_mangle]
pub extern "C" fn sf_body_set_damping(id: u32, lin: f32, ang: f32) {
    if let Some(b) = body(id) { b.set_linear_damping(lin); b.set_angular_damping(ang); }
}

#[no_mangle]
pub extern "C" fn sf_body_lock_rotations(id: u32, lock: u32) {
    if let Some(b) = body(id) { b.lock_rotations(lock != 0, true); }
}

/// Sets the total mass, split between the body's colliders by volume.
#[no_mangle]
pub extern "C" fn sf_body_set_mass(id: u32, mass: f32) {
    let s = st();
    let Some(Some(h)) = s.body_ids.get(id as usize).copied() else { return };
    let Some(b) = s.bodies.get(h) else { return };
    let handles: Vec<ColliderHandle> = b.colliders().to_vec();
    let total: f32 = handles.iter().filter_map(|c| s.colliders.get(*c)).map(|c| c.volume().max(1e-6)).sum();
    for ch in handles {
        if let Some(c) = s.colliders.get_mut(ch) {
            let share = c.volume().max(1e-6) / total.max(1e-6);
            c.set_mass((mass * share).max(1e-4));
        }
    }
    if let Some(b) = s.bodies.get_mut(h) { b.wake_up(true); }
}

#[no_mangle]
pub extern "C" fn sf_body_set_sensor(id: u32, sensor: u32) {
    let s = st();
    let Some(Some(h)) = s.body_ids.get(id as usize).copied() else { return };
    let Some(b) = s.bodies.get(h) else { return };
    for ch in b.colliders().to_vec() {
        if let Some(c) = s.colliders.get_mut(ch) { c.set_sensor(sensor != 0); }
    }
}

#[no_mangle]
pub extern "C" fn sf_body_set_groups(id: u32, member: u32, filter: u32) {
    let s = st();
    let Some(Some(h)) = s.body_ids.get(id as usize).copied() else { return };
    let Some(b) = s.bodies.get(h) else { return };
    for ch in b.colliders().to_vec() {
        if let Some(c) = s.colliders.get_mut(ch) { c.set_collision_groups(groups(member, filter)); }
    }
}

#[no_mangle]
pub extern "C" fn sf_body_wake(id: u32) {
    if let Some(b) = body(id) { b.wake_up(true); }
}

#[no_mangle]
pub extern "C" fn sf_body_impulse(id: u32, x: f32, y: f32, z: f32, px: f32, py: f32, pz: f32, at_point: u32) {
    if let Some(b) = body(id) {
        if !b.is_dynamic() { return; }
        if at_point != 0 { b.apply_impulse_at_point(vector![x, y, z], point![px, py, pz], true); }
        else { b.apply_impulse(vector![x, y, z], true); }
    }
}

#[no_mangle]
pub extern "C" fn sf_body_force(id: u32, x: f32, y: f32, z: f32, px: f32, py: f32, pz: f32) {
    if let Some(b) = body(id) {
        if !b.is_dynamic() { return; }
        b.add_force_at_point(vector![x, y, z], point![px, py, pz], true);
    }
}

// ------------------------------------------------------------------ joints

fn joint_insert(a: u32, b: u32, joint: GenericJoint) -> u32 {
    let s = st();
    let (Some(Some(ha)), Some(Some(hb))) = (s.body_ids.get(a as usize).copied(), s.body_ids.get(b as usize).copied()) else { return u32::MAX };
    let h = s.joints.insert(ha, hb, joint, true);
    if let Some(id) = s.free_joints.pop() {
        s.joint_ids[id as usize] = Some(h);
        id
    } else {
        s.joint_ids.push(Some(h));
        (s.joint_ids.len() - 1) as u32
    }
}

/// Weld: keeps the current relative pose of the two bodies.
#[no_mangle]
pub extern "C" fn sf_joint_fixed(a: u32, b: u32) -> u32 {
    let s = st();
    let (Some(Some(ha)), Some(Some(hb))) = (s.body_ids.get(a as usize).copied(), s.body_ids.get(b as usize).copied()) else { return u32::MAX };
    let (Some(ba), Some(bb)) = (s.bodies.get(ha), s.bodies.get(hb)) else { return u32::MAX };
    let rel = bb.position().inverse() * ba.position();
    let j = FixedJointBuilder::new()
        .local_frame1(Isometry::identity())
        .local_frame2(rel)
        .contacts_enabled(false)
        .build();
    joint_insert(a, b, j.into())
}

/// Ball joint; when swing/twist >= 0 the rotation is limited (ragdoll shoulders, hips, neck).
#[no_mangle]
pub extern "C" fn sf_joint_spherical(a: u32, b: u32, ax: f32, ay: f32, az: f32, bx: f32, by: f32, bz: f32, swing: f32, twist: f32) -> u32 {
    let mut jb = SphericalJointBuilder::new()
        .local_anchor1(point![ax, ay, az])
        .local_anchor2(point![bx, by, bz])
        .contacts_enabled(false);
    if swing >= 0.0 {
        jb = jb.limits(JointAxis::AngX, [-swing, swing]).limits(JointAxis::AngZ, [-swing, swing]);
    }
    if twist >= 0.0 {
        jb = jb.limits(JointAxis::AngY, [-twist, twist]);
    }
    joint_insert(a, b, jb.build().into())
}

#[no_mangle]
pub extern "C" fn sf_joint_revolute(a: u32, b: u32, ax: f32, ay: f32, az: f32, bx: f32, by: f32, bz: f32, nx: f32, ny: f32, nz: f32) -> u32 {
    let axis = UnitVector::try_new(vector![nx, ny, nz], 1e-6).unwrap_or(Vector::y_axis());
    let j = RevoluteJointBuilder::new(axis)
        .local_anchor1(point![ax, ay, az])
        .local_anchor2(point![bx, by, bz])
        .contacts_enabled(false)
        .build();
    joint_insert(a, b, j.into())
}

#[no_mangle]
pub extern "C" fn sf_joint_remove(id: u32) {
    let s = st();
    if let Some(Some(h)) = s.joint_ids.get(id as usize).copied() {
        s.joints.remove(h, true);
        s.joint_ids[id as usize] = None;
        s.free_joints.push(id);
    }
}

// ------------------------------------------------------------------ queries

/// Ray cast. Returns the id of the body hit or -1. Hit distance and normal: sf_ray_ptr() -> [toi, nx, ny, nz].
#[no_mangle]
pub extern "C" fn sf_ray_cast(ox: f32, oy: f32, oz: f32, dx: f32, dy: f32, dz: f32, max_toi: f32, mask: u32) -> i32 {
    let s = st();
    if s.query_dirty {
        s.query.update(&s.colliders);
        s.query_dirty = false;
    }
    let ray = Ray::new(point![ox, oy, oz], vector![dx, dy, dz]);
    let filter = QueryFilter::new().groups(InteractionGroups::new(Group::ALL, Group::from_bits_truncate(mask))).exclude_sensors();
    if let Some((ch, hit)) = s.query.cast_ray_and_get_normal(&s.bodies, &s.colliders, &ray, max_toi, true, filter) {
        s.ray_out = [hit.time_of_impact, hit.normal.x, hit.normal.y, hit.normal.z];
        if let Some(parent) = s.colliders.get(ch).and_then(|c| c.parent()) {
            for (id, slot) in s.body_ids.iter().enumerate() {
                if *slot == Some(parent) { return id as i32; }
            }
        }
    }
    -1
}

#[no_mangle]
pub extern "C" fn sf_ray_ptr() -> *const f32 { st().ray_out.as_ptr() }

#[no_mangle]
pub extern "C" fn sf_body_count() -> u32 { st().bodies.len() as u32 }
