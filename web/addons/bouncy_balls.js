// Аддон для SandForge: супермячи.
addon({
  name: 'Прыгучие мячи',
  author: 'SandForge',
  version: '1.0',
  init(api) {
    const sizes = [['Маленький', 0.2, 0.5], ['Средний', 0.5, 2], ['Огромный', 1.5, 20]];
    sizes.forEach(([label, r, mass], i) => {
      api.registerProp('superball_' + i, {
        name: 'Супермяч: ' + label.toLowerCase(), category: 'Забавное', mass, bouncy: true,
        damping: 0.01, angularDamping: 0.05,
        shape: { type: 'sphere', r, color: [0xff3060, 0x30ff90, 0x3090ff][i], emissive: [0x660010, 0x006630, 0x002266][i] },
      });
    });
  },
});
