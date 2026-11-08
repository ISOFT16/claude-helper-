// Аддон для SandForge: меняет гравитацию на сервере.
// Показывает, как добавлять команды чата (!луна) и кнопки в раздел «Утилиты».
addon({
  name: 'Лунная гравитация',
  author: 'SandForge',
  version: '1.0',
  init(api) {
    api.registerCommand('луна', () => { api.setGravity(-1.62); api.chat('Гравитация: Луна (1.62 м/с²)'); });
    api.registerCommand('марс', () => { api.setGravity(-3.71); api.chat('Гравитация: Марс (3.71 м/с²)'); });
    api.registerCommand('земля', () => { api.setGravity(-9.82); api.chat('Гравитация: Земля (9.82 м/с²)'); });
    api.registerCommand('невесомость', () => { api.setGravity(0); api.chat('Невесомость!'); });
    api.registerUtility('🌙 Луна', 'луна');
    api.registerUtility('🔴 Марс', 'марс');
    api.registerUtility('🌍 Земля', 'земля');
    api.registerUtility('🛰️ Невесомость', 'невесомость');
  },
});
