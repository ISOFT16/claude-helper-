// Аддон для SandForge: тулган стреляет предметами.
addon({
  name: 'Пушка предметов',
  author: 'SandForge',
  version: '1.0',
  init(api) {
    const types = ['crate', 'barrel', 'ball', 'melon', 'cone', 'chair', 'brick'];
    api.registerTool('propcannon', {
      name: 'Пушка предметов',
      desc: 'Огонь: выстрелить случайным предметом. Альт: выстрелить взрывной бочкой.',
      onPrimary(ctx) { shoot(ctx, types[Math.floor(Math.random() * types.length)]); },
      onSecondary(ctx) { shoot(ctx, 'barrel_boom'); },
    });
    function shoot(ctx, type) {
      const o = ctx.origin, d = ctx.dir;
      const e = api.spawn(type, [o[0] + d[0] * 2.5, o[1] + d[1] * 2.5, o[2] + d[2] * 2.5], null, { owner: ctx.pid });
      if (e) for (const p of e.parts) p.body.velocity.set(d[0] * 30, d[1] * 30, d[2] * 30);
    }
  },
});
