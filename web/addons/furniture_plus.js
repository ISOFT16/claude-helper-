// Аддон для SandForge: дополнительная мебель.
// Пример того, как добавлять свои предметы из простых фигур (box / sphere / cylinder).
addon({
  name: 'Мебель+',
  author: 'SandForge',
  version: '1.0',
  description: 'Диван, шкаф, лампа и кровать.',
  init(api) {
    const box = (size, o) => Object.assign({ type: 'box', size }, o || {});
    api.registerProp('sofa', {
      name: 'Диван', category: 'Мебель', mass: 40,
      shapes: [
        box([2.4, 0.5, 1], { color: 0x8a3b52 }),
        box([2.4, 0.8, 0.25], { offset: [0, 0.55, -0.4], color: 0x8a3b52 }),
        box([0.25, 0.5, 1], { offset: [-1.2, 0.35, 0], color: 0x6d2b40 }),
        box([0.25, 0.5, 1], { offset: [1.2, 0.35, 0], color: 0x6d2b40 }),
      ],
    });
    api.registerProp('wardrobe', {
      name: 'Шкаф', category: 'Мебель', mass: 60,
      shapes: [
        box([1.6, 2.4, 0.7], { tex: 'plank', color: 0xd0a070 }),
        box([0.05, 2.2, 0.02], { offset: [0, 0, 0.36], color: 0x5a3a20, tint: false }),
      ],
    });
    api.registerProp('lamp', {
      name: 'Лампа', category: 'Мебель', mass: 4,
      shapes: [
        { type: 'cylinder', r: 0.3, h: 0.08, offset: [0, -0.8, 0], color: 0x333333 },
        { type: 'cylinder', r: 0.04, h: 1.5, color: 0x888888 },
        { type: 'cylinder', rt: 0.15, rb: 0.35, h: 0.4, offset: [0, 0.85, 0], color: 0xfff2c0, emissive: 0xffdd88, tint: false },
      ],
    });
    api.registerProp('bed', {
      name: 'Кровать', category: 'Мебель', mass: 50,
      shapes: [
        box([1.6, 0.4, 2.6], { tex: 'plank', color: 0xc09060 }),
        box([1.5, 0.25, 2.4], { offset: [0, 0.3, 0.05], color: 0xeeeeff }),
        box([1.6, 1, 0.15], { offset: [0, 0.3, -1.3], tex: 'plank', color: 0xc09060 }),
        box([0.6, 0.15, 0.4], { offset: [0, 0.5, -0.9], color: 0xffffff }),
      ],
    });
  },
});
