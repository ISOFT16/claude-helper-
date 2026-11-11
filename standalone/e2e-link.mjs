// Проверка версии «одна ссылка» в браузере с экраном телефона.
// Диктовка и Claude на claude.ai здесь заменены «поддельными» (как в тестах сервера):
// поддельная диктовка присылает фразы урока, поддельный Claude отвечает готовым конспектом.
// Запуск: npm run build:link && node standalone/e2e-link.mjs

import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium, devices } = require(
  require.resolve('playwright', { paths: [process.cwd(), process.env.NODE_PATH ?? ''] }),
);

const page = fs.readFileSync(path.join(import.meta.dirname, 'umny-urok.html'), 'utf8');
// Так же, как claude.ai оборачивает страницу при публикации.
const wrapped = `<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>${page}</body></html>`;
const shots = process.env.SHOTS_DIR ?? fs.mkdtempSync(path.join(os.tmpdir(), 'link-shots-'));

const server = http.createServer((_req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(wrapped);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

// Поддельные возможности claude.ai. options.dictation=false — диктовки нет (как в приложении Claude).
function fakeClaude(options) {
  const PHRASES = [
    'Тема урока — фотосинтез.',
    ' Фотосинтез — это процесс, при котором растения на свету создают органические вещества из воды и углекислого газа.',
    ' Он идёт в хлоропластах.',
    ' Запишите домашнее задание: параграф 12, вопросы 1–3, к пятнице.',
  ];
  const NOTES = {
    title: 'Фотосинтез',
    description: 'Как растения создают питательные вещества на свету.',
    keyPoints: [
      { text: 'Фотосинтез идёт только на свету.', uncertain: false },
      { text: 'Нужны вода и углекислый газ.', uncertain: false },
      { text: 'Процесс идёт в хлоропластах.', uncertain: true },
      { text: 'Растения создают органические вещества.', uncertain: false },
      { text: 'При этом выделяется кислород.', uncertain: false },
    ],
    definitions: [{ term: 'Фотосинтез', definition: 'создание органических веществ на свету', uncertain: false }],
    facts: [{ kind: 'rule', text: 'Без света фотосинтез не идёт.', uncertain: false }],
    examples: ['Листья на солнце.'],
    summary: 'Растения на свету делают себе пищу.',
    homework: { found: true, task: 'Параграф 12, вопросы 1–3', due: 'к пятнице' },
    quiz: Array.from({ length: 5 }, (_, i) => ({
      question: `Вопрос ${i + 1}: где идёт фотосинтез?`,
      options: ['В хлоропластах', 'В корнях', 'В воздухе', 'В почве'],
      correctIndex: 0,
      explanation: 'На уроке сказали: в хлоропластах.',
    })),
    flashcards: [
      { front: 'Фотосинтез', back: 'Создание органических веществ на свету' },
      { front: 'Хлоропласт', back: 'Место, где идёт фотосинтез' },
    ],
    reviewTopics: ['Фотосинтез'],
  };
  const calls = (window.__sampleCalls = []);

  const dictation = {
    _h: { partial: [], final: [], state: [] },
    _timer: 0,
    start() {
      if (!navigator.userActivation?.isActive) return Promise.reject({ code: 'no_gesture' });
      const emit = (k, v) => this._h[k].forEach((f) => f(v));
      emit('state', { state: 'listening' });
      let i = 0;
      this._timer = setInterval(() => {
        if (i >= PHRASES.length) return;
        emit('partial', { text: PHRASES[i].slice(0, 12) });
        emit('final', { text: PHRASES[i++] });
      }, 300);
      window.__dictEmit = emit;
      return Promise.resolve();
    },
    stop() {
      clearInterval(this._timer);
      this._h.state.forEach((f) => f({ state: 'idle', reason: 'stopped' }));
      return Promise.resolve();
    },
    onPartial(f) { this._h.partial.push(f); return () => {}; },
    onFinal(f) { this._h.final.push(f); return () => {}; },
    onState(f) { this._h.state.push(f); return () => {}; },
  };

  const sample = () => Promise.reject({ code: 'invalid_request' });
  sample.json = async (input, opts) => {
    calls.push({ input, opts });
    await new Promise((r) => setTimeout(r, 300));
    if (Array.isArray(input)) {
      return { fromLesson: 'На уроке сказали: фотосинтез идёт в хлоропластах.', extra: 'Представь лист как маленькую кухню.' };
    }
    return NOTES;
  };

  window.claude = {
    use: async (name) => (name === 'sample' ? sample : name === 'dictation' && options.dictation ? dictation : null),
  };
}

let step = 0;
const ok = (name) => console.log(`  ✓ ${++step}. ${name}`);
let browser;
try {
  browser = await chromium.launch();
  // Если cdnjs недоступен (закрытая сеть), REACT_UMD_DIR указывает на локальную копию
  // тех же файлов React 18.3.1 из npm.
  const umd = process.env.REACT_UMD_DIR;
  const routeCdn = async (ctx) => {
    if (!umd) return;
    await ctx.route('https://cdnjs.cloudflare.com/**', (route) => {
      const name = route.request().url().includes('react-dom') ? 'react-dom' : 'react';
      route.fulfill({
        contentType: 'text/javascript',
        body: fs.readFileSync(path.join(umd, name, 'umd', `${name}.production.min.js`)),
      });
    });
  };
  const context = await browser.newContext({ ...devices['Pixel 7'], locale: 'ru-RU' });
  await routeCdn(context);
  await context.addInitScript(fakeClaude, { dictation: true });
  const p = await context.newPage();
  const errors = (globalThis.linkErrors = []);
  p.on('pageerror', (e) => errors.push(String(e)));
  p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  p.setDefaultTimeout(10000);
  const nav = (name) => p.getByRole('navigation').getByRole('button', { name, exact: true });

  await p.goto(BASE);
  await p.getByText('Записать урок').first().waitFor();
  await p.screenshot({ path: path.join(shots, 'link-01-home.png') });
  ok('страница открывается, React загрузился с cdnjs');

  await nav('Запись').click();
  await p.getByRole('button', { name: 'Биология' }).click();
  await p.getByRole('button', { name: 'Начать урок' }).click();
  await p.getByLabel('Учитель разрешил запись этого урока').check();
  await p.getByRole('button', { name: 'Продолжить' }).click();
  await p.locator('.rec-status').waitFor();
  await p.getByText('Он идёт в хлоропластах.').waitFor();
  await p.screenshot({ path: path.join(shots, 'link-02-recording.png') });
  ok('диктовка запускается прямо из нажатия, слова учителя видны во время записи');

  await p.getByRole('button', { name: 'Пауза' }).click();
  await p.getByRole('button', { name: 'Продолжить' }).click();
  await p.getByRole('button', { name: 'Пауза' }).waitFor();
  ok('пауза и продолжение');

  // Платформа сама остановила запись (экран погас) — должна стать пауза с подсказкой.
  await p.evaluate(() => window.__dictEmit('state', { state: 'idle', reason: 'hidden' }));
  await p.locator('.card.note', { hasText: 'экран погас' }).waitFor();
  ok('если экран погас — запись встаёт на паузу и ничего не теряется');

  await p.getByRole('button', { name: 'Завершить' }).click();
  await p.locator('.lesson-head h1', { hasText: 'Фотосинтез' }).waitFor();
  const calls = await p.evaluate(() => window.__sampleCalls);
  assert.equal(calls.length, 1);
  assert.match(calls[0].input, /хлоропластах/);
  assert.match(calls[0].input, /Верни один JSON-объект/);
  assert.ok((await p.locator('.unsure-tag').count()) >= 1);
  await p.screenshot({ path: path.join(shots, 'link-03-notes.png') });
  ok('Claude получает текст урока и возвращает конспект');

  await p.getByRole('tab', { name: 'ДЗ' }).click();
  await p.getByText('Параграф 12').waitFor();
  await p.getByRole('tab', { name: 'Объясни' }).click();
  await p.getByRole('button', { name: 'Объясни эту тему проще' }).click();
  await p.locator('.ai-part.extra').waitFor();
  const chatCall = (await p.evaluate(() => window.__sampleCalls))[1];
  assert.equal(chatCall.opts.cache, false);
  assert.match(chatCall.input[0].content, /материалы_урока/);
  ok('домашнее задание и чат «Объясни мне»');

  await p.getByRole('tab', { name: 'Тест' }).click();
  for (let i = 0; i < 5; i++) {
    await p.locator('.option').first().click();
    await p.locator('.feedback .btn').click();
  }
  await p.getByText('5 / 5').waitFor();
  ok('тест проходится до конца');

  await p.getByRole('tab', { name: 'Текст' }).click();
  await p.getByRole('button', { name: 'Удалить урок' }).click();
  await p.getByRole('dialog').getByRole('button', { name: 'Удалить урок' }).click();
  await p.getByText('Здесь появятся конспекты').waitFor();
  ok('удаление через своё окно подтверждения (confirm на claude.ai не работает)');

  await nav('Запись').click();
  await p.getByRole('button', { name: 'Вставить текст урока' }).click();
  await p.locator('#lesson-text').fill('Тема урока — дроби. Дробь — это часть целого. Числитель показывает, сколько частей взяли.');
  await p.getByRole('button', { name: 'Создать конспект' }).click();
  await p.locator('.lesson-head h1').waitFor();
  ok('урок можно создать из вставленного текста');

  // Черновик: запись «оборвалась» — после перезагрузки текст можно превратить в конспект.
  await nav('Запись').click();
  await p.getByRole('button', { name: 'Начать урок' }).click();
  await p.getByLabel('Учитель разрешил запись этого урока').check();
  await p.getByRole('button', { name: 'Продолжить' }).click();
  await p.getByText('Он идёт в хлоропластах.').waitFor();
  await p.reload();
  await p.getByText('Найдена незавершённая запись').waitFor();
  await p.getByRole('button', { name: 'Создать конспект' }).click();
  await p.locator('.lesson-head h1').waitFor();
  ok('незаконченная запись восстанавливается после перезагрузки');

  await nav('Настройки').click();
  await p.getByText('через твой аккаунт claude.ai').first().waitFor();
  assert.equal(await p.getByText('Код доступа').count(), 0);
  await p.getByRole('button', { name: 'Тёмная' }).click();
  await p.getByRole('button', { name: 'Қазақша' }).click();
  await p.getByRole('navigation').getByRole('button', { name: 'Басты бет' }).click();
  await p.screenshot({ path: path.join(shots, 'link-04-kk-dark.png') });
  ok('настройки без сервера, тёмная тема, казахский язык');

  const width = await p.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(width <= 412, `нет горизонтальной прокрутки (${width})`);
  assert.deepEqual(errors, []);

  // Без диктовки (например, в приложении Claude на телефоне) — понятная подсказка и ввод текста.
  const ctx2 = await browser.newContext({ ...devices['Pixel 7'], locale: 'ru-RU' });
  await routeCdn(ctx2);
  await ctx2.addInitScript(fakeClaude, { dictation: false });
  const p2 = await ctx2.newPage();
  await p2.goto(BASE);
  await p2.getByRole('navigation').getByRole('button', { name: 'Запись', exact: true }).click();
  await p2.getByText('Распознавание речи здесь недоступно').waitFor();
  assert.equal(await p2.getByRole('button', { name: 'Начать урок' }).count(), 0);
  await p2.screenshot({ path: path.join(shots, 'link-05-no-dictation.png') });
  ok('без диктовки — подсказка открыть в Chrome и ввод текста');

  console.log(`\n  Все ${step} проверок пройдены. Скриншоты: ${shots}\n`);
} catch (e) {
  console.error('\n  ✗ ПРОВЕРКА НЕ ПРОЙДЕНА:', e);
  console.error('  Ошибки в браузере:', globalThis.linkErrors);
  process.exitCode = 1;
} finally {
  await browser?.close();
  server.close();
}
