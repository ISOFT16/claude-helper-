# ПЕРЕХВАТ — заметки для работы над проектом

## Нумерация версий
- Текущая версия: **10** (3D-мир с этажами, 5 карт, баллистика и отдача, стекло, выносливость/спринт/перекат, новые бойцы, раскладка кнопок). Версия 9 — аудит и производительность. Версия 8 — лёжа, уклонение, захват, броня, карта мира. Версия 7 — радар, автострельба, 100 000 $. Версия 6 — серверы, арсенал, монеты, подарки.
- Каждый новый выпуск получает следующее целое число: 7, 8, 9…
- При выпуске новой версии обновить номер:
  - `src/body.html` — `<div class="ver">vN</div>`;
  - `android/AndroidManifest.xml` — `versionCode="N"` и `versionName="N"`;
  - `README.md` — раздел «Новое в версии N»;
  - строку «Текущая версия» в этом файле.

## Сборка
- `python3 tools/build.py` собирает `index.html` из `src/`.
- `bash android/build.sh` собирает APK в `android/build/Perehvat.apk`; APK в репозиторий не коммитить.

## Устройство кода (v8)
- `src/js/02b_move_config.js` — все числа передвижения (позы, уклонение, выступы) и таблица переходов состояний `MOVE_TR`.
- `src/js/15b_moves.js` — состояния передвижения (ground/air/dodge/ledgeGrab/hanging/climbing/climbFinish), позы, проверки места.
- `src/js/08c_gear.js` — броня: предметы описаны данными в `GEAR_ITEMS`, расчёт поглощения по зонам, износ.
- `src/js/17b_worldmap.js` — карта мира; точки интереса — данные в `WORLD_MARKERS`.
- `src/js/06b_post.js` — постобработка; `src/js/18b_lod.js` — LOD бойцов.
- Мир (v10): `src/js/02_map.js` — коробки-коллайдеры `WORLD.boxes`, сетка `eachBox`/`solidRect`/`floorAt`, луч `rayWorld` (03), навигация `buildNav`/`nearestNode`/`navPath`, загрузка `loadWorld(id)` и подписка систем `onWorld(fn)`.
- Карты: `src/js/02c_maps.js` — конструктор (`building`, `stairs`, `slab`, `wallX/Z` с проёмами и стеклом, `container`, `car`, `tower`, `perimeter`…) и `MAPS`/`MAP_ORDER`. Лестница: подъём 0,2 м на ступень, марш вдоль оси; проём в перекрытии — ровно до верхней ступени.
- Рендер мира: `buildWorldRender` в `06_renderer_scene.js` (геометрия объединена по материалам, стекло — инстансы, окружение `ENV_TIME`); погода и эхо — `07b_weather.js`.
- Стрельба: `BALLISTICS`, `traceBullet`, `recoilOf` в `13_combat.js`; выносливость и перекат — `15b_moves.js`; раскладка кнопок — `21b_touch_layout.js`.
- `src/js/06c_perf.js` — менеджер производительности: предел плотности пикселей, авто-качество (`PERF`), статистика кадров.
- Аудит и план модернизации 3.0 — `docs/AUDIT_AND_PLAN.md`; журнал — `CHANGELOG.md`.

## Тесты
- `cd tests && npm install && npm test` — автотесты (сначала `python3 tools/build.py`); `npm run perf` — замеры.
- После каждого этапа: прогнать тесты и замеры, записать цифры в `docs/AUDIT_AND_PLAN.md` и `CHANGELOG.md`.
