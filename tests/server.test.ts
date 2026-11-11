// Автотесты сервера. Настоящие ИИ-сервисы стоят денег и требуют ключей,
// поэтому здесь их заменяют маленькие «поддельные» серверы (моки),
// которые отвечают в том же формате.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import type { Notes } from '../shared/types.ts';
import { createApp } from '../server/app.ts';
import { findFfmpeg } from '../server/audio.ts';
import { loadConfig } from '../server/config.ts';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'umny-test-'));
const audio = path.join(tmp, 'lesson.webm');
const servers: http.Server[] = [];

function listen(handler: http.RequestListener): Promise<string> {
  return new Promise((resolve) => {
    const s = http.createServer(handler).listen(0, '127.0.0.1', () => {
      servers.push(s);
      resolve(`http://127.0.0.1:${(s.address() as AddressInfo).port}`);
    });
  });
}

function readBody(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

async function startApp(env: Record<string, string>) {
  const dataDir = fs.mkdtempSync(path.join(tmp, 'data-'));
  const cfg = loadConfig({ DATA_DIR: dataDir, ...env });
  return listen(createApp(cfg));
}

async function sendAudio(base: string, headers: Record<string, string> = {}) {
  const form = new FormData();
  form.append('audio', new Blob([fs.readFileSync(audio)]), 'lesson.webm');
  form.append('lang', 'ru');
  return fetch(`${base}/api/transcribe`, { method: 'POST', body: form, headers });
}

const postJson = (url: string, body: unknown) =>
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

before(async () => {
  // Тестовая запись: 25 секунд звука в том же формате, что пишет телефон (webm/opus).
  const ffmpeg = await findFfmpeg();
  assert.ok(ffmpeg, 'для тестов нужен ffmpeg');
  execFileSync(ffmpeg, [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=25',
    '-c:a', 'libopus', '-b:a', '32k', audio,
  ]);
});

after(() => {
  servers.forEach((s) => s.close());
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('демо-режим: аудио -> текст -> конспект -> чат', async () => {
  const base = await startApp({});
  const status = await (await fetch(`${base}/api/status`)).json();
  assert.deepEqual([status.stt, status.llm, status.needsCode], ['demo', 'demo', false]);

  const tr = await (await sendAudio(base)).json();
  assert.equal(tr.demo, true);
  assert.equal(tr.durationSec, 25);
  assert.ok(tr.segments.some((s: { uncertain?: boolean }) => s.uncertain));

  const res = await postJson(`${base}/api/notes`, { segments: tr.segments, subject: 'Математика', lang: 'ru' });
  const { notes } = (await res.json()) as { notes: Notes };
  assert.match(notes.title, /площадь/i);
  assert.ok(notes.keyPoints.length >= 5);
  assert.ok(notes.definitions.length >= 3);
  assert.ok(notes.facts.some((f) => f.kind === 'formula'));
  assert.equal(notes.homework.found, true);
  assert.match(notes.homework.task, /571/);
  assert.match(notes.homework.due, /четвергу/);
  assert.ok(notes.keyPoints.some((k) => k.uncertain), 'неуверенная фраза должна быть помечена');
  assert.ok(notes.quiz.length >= 5, 'в тесте не меньше 5 вопросов');
  assert.ok(notes.flashcards.length >= 5);
  for (const q of notes.quiz) {
    assert.equal(q.options.length, 4);
    assert.equal(new Set(q.options).size, 4);
  }

  const chat = await postJson(`${base}/api/chat`, {
    segments: tr.segments,
    notesText: notes.summary,
    subject: 'Математика',
    lang: 'ru',
    history: [{ role: 'user', text: 'Как найти площадь квадрата?' }],
  });
  const { answer } = await chat.json();
  assert.match(answer.fromLesson, /квадрат/i);
});

test('урок без домашнего задания -> «не обнаружено»; тишина -> ошибка, а не выдумка', async () => {
  const base = await startApp({});
  const segments = [
    { text: 'Тема урока — круговорот воды в природе.' },
    { text: 'Испарение — это переход воды из жидкого состояния в пар.' },
  ];
  const res = await postJson(`${base}/api/notes`, { segments, subject: 'География', lang: 'ru' });
  const { notes } = (await res.json()) as { notes: Notes };
  assert.deepEqual(notes.homework, { found: false, task: '', due: '' });

  const empty = await postJson(`${base}/api/notes`, { segments: [{ text: '...' }], subject: 'x', lang: 'ru' });
  assert.equal(empty.status, 422);
  assert.equal((await empty.json()).error, 'empty_transcript');
});

test('настоящий режим (моки): длинная запись режется на части, ответ ИИ проверяется', async () => {
  let sttCalls = 0;
  const stt = await listen(async (req, res) => {
    const body = await readBody(req);
    assert.equal(req.url, '/v1/audio/transcriptions');
    assert.equal(req.headers.authorization, 'Bearer stt-secret');
    assert.ok(body.includes('verbose_json'));
    sttCalls++;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        text: '',
        segments: [
          { text: `Часть ${sttCalls}: фотосинтез — это процесс образования органических веществ на свету.`, avg_logprob: -0.2 },
          { text: 'хлоро что-то там пласты', avg_logprob: -1.6 },
        ],
      }),
    );
  });

  const aiNotes = {
    title: 'Фотосинтез',
    description: 'О том, как растения питаются.',
    keyPoints: [{ text: 'Фотосинтез идёт на свету.', uncertain: false }],
    definitions: [{ term: 'Фотосинтез', definition: 'процесс образования органических веществ на свету', uncertain: false }],
    facts: [],
    examples: [],
    summary: 'Мы узнали, что такое фотосинтез.',
    homework: { found: true, task: '   ', due: 'к пятнице' },
    quiz: [
      { question: 'Где идёт фотосинтез?', options: ['На свету', 'В темноте', 'Под водой', 'Нигде'], correctIndex: 0, explanation: 'Так сказано на уроке.' },
      { question: 'Сломанный вопрос', options: ['только', 'три', 'варианта'], correctIndex: 5, explanation: '' },
    ],
    flashcards: [{ front: 'Фотосинтез', back: 'Процесс образования органических веществ на свету' }],
    reviewTopics: ['Фотосинтез'],
  };
  let aiRequest: Record<string, any> = {};
  const ai = await listen(async (req, res) => {
    aiRequest = { url: req.url, key: req.headers.authorization, ...JSON.parse((await readBody(req)).toString()) };
    const isChat = aiRequest.max_tokens === 4000;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        id: 'msg_test', type: 'message', role: 'assistant', model: aiRequest.model,
        content: [{ type: 'text', text: JSON.stringify(isChat ? { fromLesson: 'Было на уроке.', extra: 'Добавка ИИ.' } : aiNotes) }],
        stop_reason: 'end_turn', stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 10 },
      }),
    );
  });

  process.env.ANTHROPIC_BASE_URL = ai;
  const base = await startApp({
    ANTHROPIC_API_KEY: 'ai-secret',
    STT_API_KEY: 'stt-secret',
    STT_BASE_URL: `${stt}/v1`,
    CHUNK_SECONDS: '10',
  });

  const tr = await (await sendAudio(base)).json();
  assert.equal(sttCalls, 3, '25 секунд при частях по 10 секунд = 3 запроса');
  assert.equal(tr.demo, false);
  assert.equal(tr.segments.filter((s: { uncertain?: boolean }) => s.uncertain).length, 3);

  const res = await postJson(`${base}/api/notes`, { segments: tr.segments, subject: 'Биология', lang: 'ru' });
  assert.equal(res.status, 200);
  const { notes, demo } = (await res.json()) as { notes: Notes; demo: boolean };
  assert.equal(demo, false);
  assert.equal(notes.title, 'Фотосинтез');
  assert.equal(notes.quiz.length, 1, 'сломанный вопрос теста отброшен');
  assert.equal(notes.homework.found, false, 'пустое задание = не обнаружено');
  assert.equal(aiRequest.key, 'Bearer ai-secret');
  assert.equal(aiRequest.model, 'claude-opus-5-5');
  assert.equal(aiRequest.output_config.format.type, 'json_schema');
  assert.match(aiRequest.messages[0].content, /⟦\?хлоро что-то там пласты⟧/);

  const chat = await postJson(`${base}/api/chat`, {
    segments: tr.segments, notesText: 'Фотосинтез', subject: 'Биология', lang: 'ru',
    history: [{ role: 'user', text: 'Объясни проще' }],
  });
  assert.deepEqual((await chat.json()).answer, { fromLesson: 'Было на уроке.', extra: 'Добавка ИИ.' });
  assert.match(aiRequest.system[0].text, /материалы_урока/);
});

test('защита: код доступа, лимит длины записи и дневной лимит', async () => {
  const locked = await startApp({ ACCESS_CODE: 'school42' });
  assert.equal((await sendAudio(locked)).status, 401);
  assert.equal((await sendAudio(locked, { 'x-access-code': 'wrong' })).status, 401);
  assert.equal((await sendAudio(locked, { 'x-access-code': 'school42' })).status, 200);

  const short = await startApp({ MAX_AUDIO_MINUTES: '0.2' });
  const tooLong = await sendAudio(short);
  assert.equal(tooLong.status, 413);
  assert.equal((await tooLong.json()).error, 'too_long');

  const limited = await startApp({ DAILY_LESSON_LIMIT: '1' });
  const body = { segments: [{ text: 'Испарение — это переход воды из жидкого состояния в пар. Конденсация — это обратный процесс.' }], subject: 'x', lang: 'ru' };
  assert.equal((await postJson(`${limited}/api/notes`, body)).status, 200);
  const second = await postJson(`${limited}/api/notes`, body);
  assert.equal(second.status, 429);
  assert.equal((await second.json()).error, 'daily_limit');
});

test('временные аудиофайлы удаляются с сервера', async () => {
  const dir = path.join(os.tmpdir(), 'umny-urok-uploads');
  const leftovers = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  assert.deepEqual(leftovers, []);
});
