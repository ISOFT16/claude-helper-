// Аддон для SandForge: новый режим тулгана.
// Инструменты работают на хосте: ctx.hit — куда попал луч, ctx.ent — предмет, ctx.pid — игрок.
addon({
  name: 'Гравимагнит',
  author: 'SandForge',
  version: '1.0',
  init(api) {
    const pull = (ctx, sign) => {
      if (!ctx.hit) return;
      const [cx, cy, cz] = ctx.hit.point;
      for (const ent of api.ents()) {
        for (const part of ent.parts) {
          const b = part.body;
          if (b.type !== api.CANNON.Body.DYNAMIC) continue;
          const dx = cx - b.position.x, dy = cy - b.position.y, dz = cz - b.position.z;
          const d = Math.hypot(dx, dy, dz);
          if (d > 15 || d < 0.1) continue;
          const k = sign * b.mass * 12 * (1 - d / 15) / d;
          b.applyImpulse(new api.CANNON.Vec3(dx * k, dy * k + Math.abs(k) * 0.2, dz * k));
          b.wakeUp();
        }
      }
      api.fx('pop', ctx.hit.point);
    };
    api.registerTool('magnet', {
      name: 'Гравимагнит',
      desc: 'Огонь: притянуть всё к точке. Альт: оттолкнуть.',
      onPrimary(ctx) { pull(ctx, 1); },
      onSecondary(ctx) { pull(ctx, -1); },
    });
  },
});
