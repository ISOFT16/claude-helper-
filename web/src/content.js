// Built-in props, NPCs and toolgun modes. Everything here uses the same API that addons use.
import * as CANNON from 'cannon-es';
import { G } from './state.js';
import {
  registerProp, registerTool, hostSpawn, hostRemove, hostConstraint, hostRemoveConstraint,
  hostSetColor, hostSetFrozen, hostFx, explode,
} from './entities.js';

const box = (size, o = {}) => ({ type: 'box', size, ...o });
const sph = (r, o = {}) => ({ type: 'sphere', r, ...o });
const cyl = (r, h, o = {}) => ({ type: 'cylinder', r, h, ...o });

export function registerBuiltins() {
  // ----- Предметы -----
  registerProp('crate', { name: 'Ящик', icon: '📦', mass: 20, shape: box([1, 1, 1], { tex: 'wood', color: 0xffffff }) });
  registerProp('crate_big', { name: 'Большой ящик', icon: '🗃️', mass: 70, shape: box([2, 2, 2], { tex: 'wood', color: 0xe8d6b8 }) });
  registerProp('barrel', { name: 'Бочка', icon: '🛢️', mass: 30, shape: cyl(0.45, 1.3, { tex: 'metal', color: 0x4f7fb0, metal: 0.4 }) });
  registerProp('barrel_boom', {
    name: 'Взрывная бочка', icon: '💥', mass: 30, health: 40,
    explosive: { radius: 8, force: 1200, damage: 150 },
    shape: cyl(0.45, 1.3, { tex: 'hazard', color: 0xffffff, tint: false }),
  });
  registerProp('ball', { name: 'Мяч', icon: '⚽', mass: 3, bouncy: true, angularDamping: 0.3, shape: sph(0.4, { tex: 'checker', color: 0xff5050 }) });
  registerProp('beachball', { name: 'Пляжный мяч', icon: '🏐', mass: 0.8, bouncy: true, damping: 0.25, shape: sph(1, { tex: 'stripes', color: 0xffffff }) });
  registerProp('cone', { name: 'Конус', icon: '🚧', mass: 4, shape: { type: 'cylinder', rt: 0.06, rb: 0.4, h: 1, tex: 'stripes', color: 0xff8030 } });
  registerProp('wheel', { name: 'Колесо', icon: '🛞', mass: 12, shape: cyl(0.7, 0.35, { rot: [0, 0, Math.PI / 2], color: 0x2a2a2a }) });
  registerProp('brick', { name: 'Кирпич', icon: '🧱', mass: 5, shape: box([0.5, 0.25, 0.25], { tex: 'wall', color: 0xd06040 }) });
  registerProp('melon', { name: 'Арбуз', icon: '🍉', mass: 6, health: 15, shape: sph(0.35, { color: 0x2f8f3a }) });

  // ----- Строительство -----
  registerProp('plank', { name: 'Доска', icon: '🪵', category: 'Строительство', mass: 15, shape: box([4, 0.2, 1], { tex: 'plank', color: 0xffffff }) });
  registerProp('plank_long', { name: 'Длинная доска', icon: '📏', category: 'Строительство', mass: 30, shape: box([8, 0.2, 1], { tex: 'plank', color: 0xffffff }) });
  registerProp('plate', { name: 'Металлическая плита', icon: '⬜', category: 'Строительство', mass: 60, shape: box([4, 0.15, 4], { tex: 'metal', color: 0xffffff, metal: 0.5 }) });
  registerProp('wall', { name: 'Стена', icon: '🧱', category: 'Строительство', mass: 120, shape: box([4, 3, 0.3], { tex: 'concrete', color: 0xffffff }) });
  registerProp('beam', { name: 'Балка', icon: '➖', category: 'Строительство', mass: 25, shape: box([0.3, 0.3, 6], { tex: 'metal', color: 0xc05030, metal: 0.4 }) });
  registerProp('cube_metal', { name: 'Стальной куб', icon: '🔲', category: 'Строительство', mass: 150, shape: box([1.5, 1.5, 1.5], { tex: 'metal', color: 0xffffff, metal: 0.6 }) });
  registerProp('trampoline', { name: 'Батут', icon: '🤸', category: 'Строительство', mass: 40, bouncy: true, shapes: [box([3, 0.2, 3], { color: 0x30c070 }), box([3.2, 0.3, 0.2], { offset: [0, 0, 1.6], color: 0x333333 }), box([3.2, 0.3, 0.2], { offset: [0, 0, -1.6], color: 0x333333 })] });

  // ----- Мебель -----
  registerProp('chair', {
    name: 'Стул', icon: '🪑', category: 'Мебель', mass: 8,
    shapes: [
      box([0.9, 0.12, 0.9], { offset: [0, 0, 0], tex: 'plank' }),
      box([0.9, 0.9, 0.12], { offset: [0, 0.5, -0.4], tex: 'plank' }),
      ...[[-0.38, -0.38], [0.38, -0.38], [-0.38, 0.38], [0.38, 0.38]].map(([x, z]) => box([0.1, 0.8, 0.1], { offset: [x, -0.45, z], color: 0x6e4520 })),
    ],
  });
  registerProp('table', {
    name: 'Стол', icon: '🍽️', category: 'Мебель', mass: 25,
    shapes: [
      box([2.4, 0.12, 1.4], { tex: 'plank' }),
      ...[[-1.05, -0.55], [1.05, -0.55], [-1.05, 0.55], [1.05, 0.55]].map(([x, z]) => box([0.12, 1, 0.12], { offset: [x, -0.55, z], color: 0x6e4520 })),
    ],
  });
  registerProp('tv', {
    name: 'Телевизор', icon: '📺', category: 'Мебель', mass: 15, health: 30,
    shapes: [box([1.6, 1, 0.3], { color: 0x222222 }), box([1.4, 0.8, 0.02], { offset: [0, 0, 0.16], color: 0x113355, emissive: 0x2266aa, tint: false })],
  });
  registerProp('fridge', {
    name: 'Холодильник', icon: '🧊', category: 'Мебель', mass: 80,
    shapes: [box([1, 2, 0.9], { color: 0xf0f0f0, metal: 0.2 }), box([0.06, 0.5, 0.06], { offset: [0.35, 0.3, 0.48], color: 0x888888, tint: false })],
  });

  // ----- Забавное -----
  registerProp('balloon', {
    name: 'Воздушный шар', icon: '🎈', category: 'Забавное', mass: 0.3, lift: 40, health: 1, damping: 0.4, angularDamping: 0.6,
    shapes: [sph(0.5, { color: 0xff3355 }), { type: 'cylinder', rt: 0.02, rb: 0.12, h: 0.15, offset: [0, -0.52, 0], color: 0xff3355 }],
    onDeath(ent, api) { api.fx('pop', api.pos(ent)); api.remove(ent.id); },
  });
  registerProp('dynamite', {
    name: 'Динамит', icon: '🧨', category: 'Забавное', mass: 2, health: 10,
    explosive: { radius: 7, force: 1000, damage: 120 },
    shapes: [cyl(0.12, 0.6, { color: 0xc02020, offset: [-0.13, 0, 0] }), cyl(0.12, 0.6, { color: 0xc02020, offset: [0.13, 0, 0] }), box([0.5, 0.08, 0.3], { color: 0x222222 })],
  });
  registerProp('grenade', {
    name: 'Граната', icon: '💣', category: 'Забавное', mass: 1, fuse: 2.5, hidden: false,
    explosive: { radius: 7, force: 1000, damage: 120 },
    shapes: [sph(0.18, { color: 0x3d5a2a }), cyl(0.05, 0.12, { offset: [0, 0.2, 0], color: 0x888888 })],
  });
  registerProp('thruster', {
    name: 'Ускоритель', icon: '🚀', category: 'Забавное', mass: 5,
    shapes: [cyl(0.25, 0.6, { color: 0x888899, metal: 0.6 }), { type: 'cylinder', rt: 0.25, rb: 0.15, h: 0.2, offset: [0, -0.4, 0], color: 0xff6020, emissive: 0xff4010, tint: false }],
    think(ent, dt) {
      const b = ent.parts[0].body;
      if (b.type !== CANNON.Body.DYNAMIC) return;
      const up = b.quaternion.vmult(new CANNON.Vec3(0, 1, 0));
      b.applyForce(up.scale(400), b.position);
    },
  });

  // ----- Персонажи -----
  const robotColor = 0x9aa7b5;
  const robotParts = (c) => ({
    torso: { mass: 25, offset: [0, 1.1, 0], shapes: [box([0.7, 0.8, 0.4], { color: c }), box([0.4, 0.15, 0.05], { offset: [0, 0.15, 0.21], color: 0xffcc00, emissive: 0x996600, tint: false })] },
    head: { mass: 5, offset: [0, 1.75, 0], shapes: [box([0.45, 0.42, 0.42], { color: c }), box([0.36, 0.12, 0.05], { offset: [0, 0.03, 0.22], color: 0x22ddff, emissive: 0x22ddff, tint: false }), cyl(0.02, 0.25, { offset: [0, 0.32, 0], color: 0x555555, tint: false }), sph(0.05, { offset: [0, 0.46, 0], color: 0xff3030, emissive: 0xff2020, tint: false })] },
    armL: { mass: 4, offset: [-0.5, 1.15, 0], shapes: [box([0.2, 0.75, 0.2], { color: c })] },
    armR: { mass: 4, offset: [0.5, 1.15, 0], shapes: [box([0.2, 0.75, 0.2], { color: c })] },
    legL: { mass: 6, offset: [-0.18, 0.37, 0], shapes: [box([0.24, 0.74, 0.26], { color: 0x4a5560, tint: false })] },
    legR: { mass: 6, offset: [0.18, 0.37, 0], shapes: [box([0.24, 0.74, 0.26], { color: 0x4a5560, tint: false })] },
  });
  const rp = robotParts(robotColor);
  registerProp('ragdoll', {
    name: 'Робот-манекен', icon: '🤖', category: 'Персонажи', damping: 0.1, angularDamping: 0.4,
    parts: [rp.torso, rp.head, rp.armL, rp.armR, rp.legL, rp.legR],
    joints: [
      { type: 'cone', a: 0, b: 1, pivotA: [0, 0.42, 0], pivotB: [0, -0.23, 0], angle: 0.6, twist: 0.6 },
      { type: 'cone', a: 0, b: 2, pivotA: [-0.4, 0.35, 0], pivotB: [0, 0.35, 0], axisA: [0, -1, 0], axisB: [0, -1, 0], angle: 1.6, twist: 0.5 },
      { type: 'cone', a: 0, b: 3, pivotA: [0.4, 0.35, 0], pivotB: [0, 0.35, 0], axisA: [0, -1, 0], axisB: [0, -1, 0], angle: 1.6, twist: 0.5 },
      { type: 'cone', a: 0, b: 4, pivotA: [-0.18, -0.42, 0], pivotB: [0, 0.35, 0], axisA: [0, -1, 0], axisB: [0, -1, 0], angle: 1.0, twist: 0.3 },
      { type: 'cone', a: 0, b: 5, pivotA: [0.18, -0.42, 0], pivotB: [0, 0.35, 0], axisA: [0, -1, 0], axisB: [0, -1, 0], angle: 1.0, twist: 0.3 },
    ],
  });
  registerProp('walker', {
    name: 'Бот-бродяга', icon: '🚶', category: 'Персонажи', health: 60, fixedRotation: true, damping: 0.3,
    parts: [{
      mass: 50, offset: [0, 1, 0],
      shapes: [
        box([0.7, 0.8, 0.4], { offset: [0, 0.1, 0], color: 0x6fb36a }),
        box([0.45, 0.42, 0.42], { offset: [0, 0.75, 0], color: 0x6fb36a }),
        box([0.36, 0.12, 0.05], { offset: [0, 0.78, 0.22], color: 0xffaa22, emissive: 0xff8800, tint: false }),
        box([0.6, 0.65, 0.26], { offset: [0, -0.62, 0], color: 0x4a5560, tint: false }),
      ],
    }],
    think(ent, dt, api) {
      const b = ent.parts[0].body;
      const d = ent.data;
      if (b.type !== CANNON.Body.DYNAMIC) return;
      if (!d.next || api.time > d.next) {
        d.next = api.time + 2 + Math.random() * 3;
        d.dir = Math.random() < 0.25 ? null : Math.random() * Math.PI * 2;
      }
      if (d.dir != null) {
        b.velocity.x = Math.sin(d.dir) * 2.2;
        b.velocity.z = Math.cos(d.dir) * 2.2;
        b.quaternion.setFromEuler(0, d.dir, 0);
        b.wakeUp();
      }
    },
    onDeath(ent, api, dir) {
      const p = api.pos(ent);
      const r = api.spawn('ragdoll', [p[0], p[1] - 1, p[2]], api.quat(ent), { color: 0x6fb36a, owner: ent.owner, undo: false });
      if (r && dir) for (const part of r.parts) part.body.velocity.set(dir[0] * 6, 2, dir[2] * 6);
      api.remove(ent.id);
    },
  });

  // ----- Toolgun modes -----
  registerTool('push', {
    hidden: true, name: 'Толчок',
    onPrimary(c) {
      if (!c.ent || c.hit.dist > 4) return;
      const b = c.ent.parts[c.hit.part].body;
      if (b.type !== CANNON.Body.DYNAMIC) return;
      b.applyImpulse(new CANNON.Vec3(c.dir[0] * 25, c.dir[1] * 25 + 5, c.dir[2] * 25), new CANNON.Vec3(...c.hit.point));
      b.wakeUp();
    },
  });
  registerTool('remove', {
    icon: '🗑️', name: 'Удалитель', desc: 'ЛКМ / Огонь: удалить предмет. Альт: снять сварки и верёвки.',
    onPrimary(c) { if (c.ent) { hostFx('pop', c.hit.point); hostRemove(c.ent.id); } },
    onSecondary(c) {
      if (!c.ent) return;
      for (const [id, con] of G.cons) if (con.a === c.ent.id || con.b === c.ent.id) hostRemoveConstraint(id);
    },
  });
  registerTool('weld', {
    icon: '🔩', name: 'Сварка', desc: 'Огонь по первому предмету, затем по второму — они скрепятся. Альт: приварить к миру (заморозить).',
    onPrimary(c, api) {
      if (!c.ent) { c.state.first = null; return; }
      if (!c.state.first || !G.ents.has(c.state.first.id) || c.state.first.id === c.ent.id) {
        c.state.first = { id: c.ent.id, part: c.hit.part };
        api.tell(c.pid, 'Сварка: выберите второй предмет');
        return;
      }
      hostConstraint({ kind: 'weld', a: c.state.first.id, pa: c.state.first.part, b: c.ent.id, pb: c.hit.part }, c.pid);
      api.tell(c.pid, 'Сварено!');
      c.state.first = null;
    },
    onSecondary(c) { if (c.ent) hostSetFrozen(c.ent, true); },
  });
  registerTool('rope', {
    icon: '🪢', name: 'Верёвка', desc: 'Огонь по двум точкам — между ними натянется верёвка. Можно цеплять к стенам и полу.',
    onPrimary(c, api) {
      if (!c.hit) return;
      const pt = { id: c.ent ? c.ent.id : null, part: c.hit.part, local: c.hit.local, wp: c.hit.point };
      if (!c.state.first) { c.state.first = pt; api.tell(c.pid, 'Верёвка: выберите вторую точку'); return; }
      let A = c.state.first, B = pt;
      c.state.first = null;
      if (A.id == null) [A, B] = [B, A];
      if (A.id == null || (A.id != null && !G.ents.has(A.id))) { api.tell(c.pid, 'Хотя бы один конец должен быть на предмете'); return; }
      const len = Math.hypot(A.wp[0] - B.wp[0], A.wp[1] - B.wp[1], A.wp[2] - B.wp[2]);
      const rec = { kind: 'rope', a: A.id, pa: A.part, la: A.local, len: Math.max(0.3, len) };
      if (B.id != null) { rec.b = B.id; rec.pb = B.part; rec.lb = B.local; } else { rec.b = null; rec.wp = B.wp; }
      hostConstraint(rec, c.pid);
    },
    onSecondary(c) { c.state.first = null; },
  });
  registerTool('balloon', {
    icon: '🎈', name: 'Шарики', desc: 'Огонь: привязать воздушный шар к предмету. Альт: просто выпустить шар.',
    onPrimary(c, api) {
      if (!c.hit) return;
      const p = c.hit.point;
      const color = c.opts.color || randomColor();
      const b = api.spawn('balloon', [p[0], p[1] + 3, p[2]], null, { owner: c.pid, color });
      if (!b) return;
      const rec = { kind: 'rope', a: b.id, pa: 0, la: [0, -0.6, 0], len: 3, color: 0xffffff };
      if (c.ent) { rec.b = c.ent.id; rec.pb = c.hit.part; rec.lb = c.hit.local; } else { rec.b = null; rec.wp = p; }
      hostConstraint(rec, c.pid);
    },
    onSecondary(c, api) {
      const p = c.hit ? c.hit.point : [c.origin[0] + c.dir[0] * 3, c.origin[1] + c.dir[1] * 3, c.origin[2] + c.dir[2] * 3];
      api.spawn('balloon', [p[0], p[1] + 1, p[2]], null, { owner: c.pid, color: c.opts.color || randomColor() });
    },
  });
  registerTool('color', {
    icon: '🎨', name: 'Краска', desc: 'Огонь: покрасить предмет выбранным цветом. Альт: вернуть исходный цвет.',
    onPrimary(c) { if (c.ent) hostSetColor(c.ent, c.opts.color || randomColor()); },
    onSecondary(c) { if (c.ent) hostSetColor(c.ent, null); },
  });
  registerTool('freeze', {
    icon: '❄️', name: 'Заморозка', desc: 'Огонь: заморозить/разморозить предмет на месте.',
    onPrimary(c) { if (c.ent) hostSetFrozen(c.ent, !c.ent.frozen); },
  });
  registerTool('dynamite', {
    icon: '🧨', name: 'Динамит', desc: 'Огонь: заложить динамит (приваривается к предмету). Альт: взорвать весь свой динамит.',
    onPrimary(c, api) {
      if (!c.hit) return;
      const p = c.hit.point, n = c.hit.normal;
      const d = api.spawn('dynamite', [p[0] + n[0] * 0.2, p[1] + n[1] * 0.2, p[2] + n[2] * 0.2], null, { owner: c.pid });
      if (d && c.ent) hostConstraint({ kind: 'weld', a: d.id, pa: 0, b: c.ent.id, pb: c.hit.part }, null);
      else if (d) hostSetFrozen(d, true);
    },
    onSecondary(c) {
      for (const ent of [...G.ents.values()]) if (ent.type === 'dynamite' && ent.owner === c.pid) explode(ent);
    },
  });
  registerTool('thruster', {
    icon: '🚀', name: 'Ускоритель', desc: 'Огонь: приварить реактивный ускоритель к предмету (толкает от поверхности).',
    onPrimary(c, api) {
      if (!c.ent) return;
      const p = c.hit.point, n = c.hit.normal;
      // orient thruster so that its up axis points away from the surface
      const q = new CANNON.Quaternion();
      q.setFromVectors(new CANNON.Vec3(0, 1, 0), new CANNON.Vec3(-n[0], -n[1], -n[2]));
      const t = api.spawn('thruster', [p[0] + n[0] * 0.3, p[1] + n[1] * 0.3, p[2] + n[2] * 0.3], [q.x, q.y, q.z, q.w], { owner: c.pid });
      if (t) hostConstraint({ kind: 'weld', a: t.id, pa: 0, b: c.ent.id, pb: c.hit.part }, null);
    },
  });
}

export function randomColor() {
  const h = Math.random();
  const c = hsl(h, 0.75, 0.55);
  return c;
}
function hsl(h, s, l) {
  const f = n => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return (f(0) << 16) | (f(8) << 8) | f(4);
}
