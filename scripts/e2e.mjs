// Сквозная проверка: робот открывает приложение в настоящем браузере (как на телефоне)
// и нажимает все основные кнопки. Микрофон заменён тестовым сигналом.
// Запуск: npm run build && npm run e2e

import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium, devices } = require(
  require.resolve('playwright', { paths: [process.cwd(), process.env.NODE_PATH ?? ''] }),
);

const PORT = 8799;
const BASE = `http://localhost:${PORT}`;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'umny-e2e-'));
const shots = process.env.SHOTS_DIR ?? path.join(tmp, 'shots');
fs.mkdirSync(shots, { recursive: true });

const audioFile = path.join(tmp, 'lesson.mp3');
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=330:duration=20', audioFile]);

const server = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
  env: { ...process.env, PORT: String(PORT), DATA_DIR: path.join(tmp, 'data'), LLM_PROVIDER: 'demo', STT_PROVIDER: 'demo' },
  stdio: 'inherit',
});

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${BASE}/api/status`)).ok) return;
    } catch {
      // ещё не запустился
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('сервер не запустился');
}

let step = 0;
const ok = (name) => console.log(`  ✓ ${++step}. ${name}`);

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  });
  const context = await browser.newContext({ ...devices['Pixel 7'], permissions: ['microphone'], locale: 'ru-RU' });
  context.setDefaultTimeout(10000);
  const page = await context.newPage();
  const errors = (globalThis.browserErrors = []);
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('dialog', (d) => d.accept());
  const shot = (name) => page.screenshot({ path: path.join(shots, `${name}.png`) });
  const text = (s) => page.getByText(s, { exact: false }).first();

  // --- Главная ---
  await page.goto(BASE);
  await text('Записать урок').waitFor();
  await text('Расписание пока пустое').waitFor();
  await shot('01-home-empty');
  ok('главная страница открывается');

  // --- Запись: согласие обязательно ---
  await page.getByLabel('Запись', { exact: true }).click();
  await page.getByRole('button', { name: 'Физика' }).click();
  await page.getByRole('button', { name: 'Начать урок' }).click();
  const cont = page.getByRole('button', { name: 'Продолжить' });
  assert.equal(await cont.isDisabled(), true, 'без галочки запись не начинается');
  await shot('02-consent');
  await page.getByLabel('Учитель разрешил запись этого урока').check();
  await cont.click();
  await text('Идёт запись').waitFor();
  ok('запись начинается только после подтверждения разрешения');

  await text('Микрофон работает').waitFor({ timeout: 5000 });
  await page.waitForTimeout(2200);
  const t1 = await page.locator('.timer').innerText();
  assert.notEqual(t1, '00:00', 'таймер идёт');
  await shot('03-recording');
  ok(`таймер и индикатор микрофона работают (${t1})`);

  // --- Пауза / продолжить ---
  await page.getByRole('button', { name: 'Пауза' }).click();
  const paused = await page.locator('.timer').innerText();
  await page.waitForTimeout(1500);
  assert.equal(await page.locator('.timer').innerText(), paused, 'на паузе таймер стоит');
  await page.getByRole('button', { name: 'Продолжить' }).click();
  await page.waitForTimeout(1500);
  assert.notEqual(await page.locator('.timer').innerText(), paused, 'после паузы таймер снова идёт');
  ok('пауза и продолжение');

  // --- Красная плашка видна на других экранах ---
  await page.getByRole('navigation').getByRole('button', { name: 'Главная' }).click();
  await page.locator('.rec-banner').waitFor();
  await page.locator('.rec-banner').click();
  ok('индикатор записи виден на всех экранах');

  // --- Завершить -> конспект ---
  await page.getByRole('button', { name: 'Завершить' }).click();
  await page.locator('.lesson-head h1').waitFor({ timeout: 20000 });
  assert.match(await page.locator('.lesson-head h1').innerText(), /Площадь/i);
  await text('Основные мысли').waitFor();
  await text('Демо-режим').waitFor();
  assert.ok((await page.locator('.points li').count()) >= 5);
  assert.ok((await page.locator('.unsure-tag').count()) >= 1, 'неуверенные фразы помечены');
  await shot('04-notes');
  ok('после завершения создаётся конспект, неуверенные фразы помечены');

  const audioLeft = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const open = indexedDB.open('umny-urok');
        open.onsuccess = () => {
          const req = open.result.transaction('audio').objectStore('audio').count();
          req.onsuccess = () => resolve(req.result);
        };
      }),
  );
  assert.equal(audioLeft, 0);
  ok('исходное аудио удалено после создания конспекта');

  // --- Домашнее задание ---
  await page.getByRole('tab', { name: 'ДЗ' }).click();
  await text('номера 571 и 573').waitFor();
  await text('к четвергу').waitFor();
  await page.getByRole('button', { name: 'Изменить' }).click();
  await page.locator('textarea').fill('Параграф 18, № 571, 573 и 575');
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await text('573 и 575').waitFor();
  await shot('05-homework');
  ok('домашнее задание найдено и редактируется вручную');

  // --- Чат ---
  await page.getByRole('tab', { name: 'Объясни' }).click();
  await page.getByPlaceholder('Твой вопрос…').fill('Как найти площадь квадрата?');
  await page.getByLabel('Отправить').click();
  await page.locator('.ai-part.from-lesson').waitFor();
  await page.locator('.ai-part.extra').waitFor();
  await shot('06-chat');
  ok('чат отвечает и разделяет «из урока» и «объяснение ИИ»');

  // --- Тест ---
  await page.getByRole('tab', { name: 'Тест' }).click();
  const total = Number((await page.locator('.quiz .muted').first().innerText()).match(/из (\d+)/)[1]);
  for (let i = 0; i < total; i++) {
    await page.locator('.option').nth(i === 0 ? 3 : 0).click();
    await page.locator('.feedback').waitFor();
    if (i === 0) await shot('07-quiz');
    await page.locator('.feedback .btn').click();
  }
  await text('Результат').waitFor();
  const score = await page.locator('.big-score').innerText();
  assert.match(score, new RegExp(`\\d+ / ${total}`));
  await shot('08-quiz-result');
  await page.getByRole('button', { name: 'Пройти ещё раз' }).click();
  await page.locator('.option').first().waitFor();
  ok(`тест из ${total} вопросов: проверка, объяснение, результат ${score}, повтор`);

  // --- Карточки ---
  await page.getByRole('tab', { name: 'Карточки' }).click();
  const before = await page.locator('.cards .muted').first().innerText();
  await page.locator('.flashcard').click();
  await page.waitForTimeout(500);
  await shot('09-card');
  await page.getByRole('button', { name: 'Знаю' }).click();
  await page.getByRole('button', { name: 'Повторить' }).click();
  const afterCards = await page.locator('.cards .muted').first().innerText();
  assert.notEqual(before, afterCards);
  ok(`карточки: переворот, «Знаю», «Повторить» (${before} → ${afterCards})`);

  // --- Текст ---
  await page.getByRole('tab', { name: 'Текст' }).click();
  assert.ok((await page.locator('.transcript mark.unsure').count()) >= 2);
  ok('в тексте урока выделены неуверенные фразы');

  // --- Загрузка готового файла ---
  await page.getByLabel('Запись', { exact: true }).click();
  await page.getByRole('button', { name: 'История' }).click();
  await page.getByRole('button', { name: 'Загрузить аудиозапись' }).click();
  await page.getByLabel('Учитель разрешил запись этого урока').check();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Продолжить' }).click();
  await (await chooser).setFiles(audioFile);
  await page.locator('.lesson-head h1').waitFor({ timeout: 20000 });
  ok('загрузка готовой аудиозаписи');

  // --- Дневник, поиск, повторение ---
  await page.getByRole('navigation').getByRole('button', { name: 'Дневник' }).click();
  await text('Что повторить').waitFor();
  assert.equal(await page.locator('section:last-of-type .row').count(), 2);
  await shot('10-diary');
  await page.getByPlaceholder('Поиск по темам…').fill('прямоугольник');
  assert.equal(await page.locator('.row').count(), 2);
  await page.getByPlaceholder('Поиск по темам…').fill('динозавры');
  await text('Ничего не найдено').waitFor();
  ok('дневник, поиск по темам и список для повторения');

  // --- Задания ---
  await page.getByRole('navigation').getByRole('button', { name: 'Задания' }).click();
  await page.locator('.hw').first().waitFor();
  assert.equal(await page.locator('.hw').count(), 2);
  await page.getByLabel('Сделано').first().check();
  await text('Выполнено').waitFor();
  ok('список домашних заданий и отметка «Сделано»');

  // --- Восстановление записи после закрытия приложения ---
  await page.getByLabel('Запись', { exact: true }).click();
  await page.getByRole('button', { name: 'Начать урок' }).click();
  await page.getByLabel('Учитель разрешил запись этого урока').check();
  await page.getByRole('button', { name: 'Продолжить' }).click();
  await text('Идёт запись').waitFor();
  await page.waitForTimeout(6500); // первый кусочек сохраняется через 5 секунд
  await page.close({ runBeforeUnload: false });
  const page2 = await context.newPage();
  page2.on('dialog', (d) => d.accept());
  await page2.goto(BASE);
  await page2.getByText('Найдена незавершённая запись').waitFor();
  await page2.screenshot({ path: path.join(shots, '11-draft.png') });
  await page2.getByRole('button', { name: 'Создать конспект' }).click();
  await page2.locator('.lesson-head h1').waitFor({ timeout: 20000 });
  ok('запись восстановлена после «случайного закрытия» приложения');

  // --- Настройки: расписание, язык, тема ---
  await page2.getByRole('navigation').getByRole('button', { name: 'Настройки' }).click();
  const weekday = new Date().getDay();
  if (weekday !== 0) {
    await page2.locator('select.add').nth(weekday - 1).selectOption('biology');
    await page2.getByRole('navigation').getByRole('button', { name: 'Главная' }).click();
    await page2.locator('.chip.big', { hasText: 'Биология' }).waitFor();
    await page2.getByRole('navigation').getByRole('button', { name: 'Настройки' }).click();
  }
  ok('расписание показывает сегодняшние уроки на главной');

  await page2.getByRole('button', { name: 'Тёмная' }).click();
  assert.equal(await page2.evaluate(() => document.documentElement.dataset.theme), 'dark');
  await page2.getByRole('button', { name: 'Қазақша' }).click();
  await page2.getByText('Баптау').first().waitFor();
  await page2.getByRole('navigation').getByRole('button', { name: 'Басты бет' }).click();
  await page2.getByText('Сабақты жазу').waitFor();
  await page2.screenshot({ path: path.join(shots, '12-home-kk-dark.png') });
  ok('тёмная тема и казахский язык');

  // --- Удаление всех данных ---
  await page2.getByRole('navigation').getByRole('button', { name: 'Баптау' }).click();
  await page2.getByRole('button', { name: 'Барлық деректерімді жою' }).click();
  await page2.getByText('Все данные удалены').waitFor();
  await page2.getByRole('navigation').getByRole('button', { name: 'Дневник' }).click();
  await page2.getByPlaceholder('Поиск по темам…').waitFor();
  assert.equal(await page2.locator('.row').count(), 0);
  ok('удаление всех данных');

  // --- PWA ---
  const manifest = await (await fetch(`${BASE}/manifest.webmanifest`)).json();
  assert.equal(manifest.display, 'standalone');
  assert.ok((await fetch(`${BASE}/icon-512.png`)).ok && (await fetch(`${BASE}/sw.js`)).ok);
  assert.equal(await page2.evaluate(() => navigator.serviceWorker.ready.then((r) => !!r.active)), true);
  ok('приложение можно установить на телефон (манифест, иконки, service worker)');

  assert.deepEqual(errors, [], 'в консоли браузера не должно быть ошибок');
  console.log(`\n  Все ${step} проверок пройдены. Скриншоты: ${shots}\n`);
} catch (e) {
  console.error('\n  ✗ ПРОВЕРКА НЕ ПРОЙДЕНА:', e);
  console.error('  Ошибки в браузере:', globalThis.browserErrors);
  process.exitCode = 1;
} finally {
  await browser?.close();
  server.kill();
}
