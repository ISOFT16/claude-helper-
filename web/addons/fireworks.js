// Аддон для SandForge: фейерверк. Пример think() — кода, который выполняется каждый кадр.
addon({
  name: 'Фейерверки',
  author: 'SandForge',
  version: '1.0',
  init(api) {
    api.registerProp('firework', {
      name: 'Фейерверк', category: 'Забавное', mass: 1,
      shapes: [
        { type: 'cylinder', r: 0.12, h: 0.8, color: 0xffcc00 },
        { type: 'cylinder', rt: 0.01, rb: 0.12, h: 0.25, offset: [0, 0.52, 0], color: 0xff2040 },
      ],
      think(ent, dt, api) {
        const b = ent.parts[0].body;
        const age = api.time - ent.born;
        if (age > 1 && age < 3.2 && b.type === api.CANNON.Body.DYNAMIC) {
          const up = b.quaternion.vmult(new api.CANNON.Vec3(0, 1, 0));
          b.applyForce(up.scale(45));
          b.wakeUp();
        }
        if (age > 3.2) {
          const p = api.pos(ent);
          api.remove(ent.id);
          api.fx('boom', p);
          for (let i = 0; i < 6; i++) {
            const ball = api.spawn('beachball', [p[0] + Math.random() * 2 - 1, p[1], p[2] + Math.random() * 2 - 1], null,
              { color: Math.floor(Math.random() * 0xffffff), undo: false, owner: ent.owner });
            if (ball) ball.parts[0].body.velocity.set(Math.random() * 16 - 8, Math.random() * 8, Math.random() * 16 - 8);
          }
        }
      },
    });
  },
});
