// Сервер: принимает аудио и запросы от приложения, обращается к ИИ
// и возвращает результат. Аудио на сервере НЕ хранится — временные файлы
// удаляются сразу после распознавания.

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import type {
  ChatResponse,
  NotesResponse,
  ServerStatus,
  TranscribeResponse,
} from '../shared/types.ts';
import { segmentsToMarkedText } from '../shared/types.ts';
import { findFfmpeg, prepareAudio } from './audio.ts';
import { HttpError, type Config } from './config.ts';
import { demoSegments } from './demo.ts';
import { Limits } from './limits.ts';
import { createLlm } from './llm.ts';
import { mergeSegments, transcribeFile } from './stt.ts';

const Lang = z.enum(['ru', 'kk']);
const Segments = z.array(z.object({ text: z.string(), uncertain: z.boolean().optional() }));

const NotesBody = z.object({
  segments: Segments,
  subject: z.string().max(100),
  lang: Lang,
});

const ChatBody = z.object({
  segments: Segments,
  notesText: z.string().max(40_000),
  subject: z.string().max(100),
  lang: Lang,
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().max(4000) }))
    .min(1)
    .max(20),
});

function sameCode(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function createApp(cfg: Config) {
  const app = express();
  const limits = new Limits(cfg);
  const llm = createLlm(cfg);
  const upload = multer({
    dest: path.join(os.tmpdir(), 'umny-urok-uploads'),
    limits: { fileSize: cfg.limits.maxUploadMb * 1024 * 1024, files: 1 },
  });

  app.set('trust proxy', 1);
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/status', (_req, res) => {
    const status: ServerStatus = {
      stt: cfg.stt.provider,
      llm: cfg.llm.provider,
      needsCode: !!cfg.accessCode,
      maxMinutes: cfg.limits.maxAudioMinutes,
      maxUploadMb: cfg.limits.maxUploadMb,
    };
    res.json(status);
  });

  // Всё остальное в /api — только с кодом доступа (если он задан) и с ограничением частоты.
  app.use('/api', (req, _res, next) => {
    limits.rate(req.ip ?? 'unknown');
    if (cfg.accessCode && !sameCode(String(req.headers['x-access-code'] ?? ''), cfg.accessCode)) {
      throw new HttpError(401, 'bad_code', 'Неверный код доступа.');
    }
    next();
  });

  // 1) Аудио -> текст
  app.post('/api/transcribe', upload.single('audio'), async (req, res) => {
    const file = req.file;
    const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'umny-urok-'));
    try {
      if (!file) throw new HttpError(400, 'no_audio', 'Аудиофайл не получен.');
      const lang = Lang.parse(req.body.lang ?? 'ru');
      limits.check('lessons');

      const ffmpeg = await findFfmpeg(cfg.ffmpegPath);
      let files = [file.path];
      let durationSec = 0;
      if (ffmpeg) {
        const prepared = await prepareAudio(
          ffmpeg,
          file.path,
          workDir,
          cfg.limits.chunkSeconds,
          cfg.limits.maxAudioMinutes * 60,
        );
        files = prepared.files;
        durationSec = Math.round(prepared.durationSec);
      } else if (cfg.stt.provider !== 'demo' && file.size > 24 * 1024 * 1024) {
        throw new HttpError(500, 'no_ffmpeg', 'На сервере нет ffmpeg — длинные записи обработать нельзя.');
      }
      const minutes = Math.max(1, Math.ceil(durationSec / 60));
      limits.check('audioMinutes', minutes);

      let segments;
      if (cfg.stt.provider === 'demo') {
        segments = demoSegments(lang);
      } else {
        segments = [];
        // Части распознаются по очереди, чтобы не превысить лимиты сервиса.
        for (const part of files) segments.push(...(await transcribeFile(cfg, part, lang)));
        segments = mergeSegments(segments);
      }
      limits.add('audioMinutes', minutes);
      const body: TranscribeResponse = { segments, durationSec, demo: cfg.stt.provider === 'demo' };
      res.json(body);
    } finally {
      // Удаляем аудио с сервера в любом случае — и при успехе, и при ошибке.
      await fs.rm(workDir, { recursive: true, force: true });
      if (file) await fs.rm(file.path, { force: true });
    }
  });

  // 2) Текст -> конспект, домашнее задание, тест и карточки (одним запросом к ИИ)
  app.post('/api/notes', async (req, res) => {
    const body = NotesBody.parse(req.body);
    const text = segmentsToMarkedText(body.segments);
    if (text.replace(/[^\p{L}]/gu, '').length < 40) {
      throw new HttpError(422, 'empty_transcript', 'Речь не распознана — конспект не из чего составить.');
    }
    if (text.length > cfg.limits.maxTranscriptChars) {
      throw new HttpError(413, 'transcript_too_long', 'Текст урока слишком длинный.');
    }
    limits.check('lessons');
    const notes = await llm.notes(body);
    limits.add('lessons');
    const out: NotesResponse = { notes, demo: cfg.llm.provider === 'demo' };
    res.json(out);
  });

  // 3) Чат «Объясни мне»
  app.post('/api/chat', async (req, res) => {
    const body = ChatBody.parse(req.body);
    const transcript = segmentsToMarkedText(body.segments);
    if (transcript.length > cfg.limits.maxTranscriptChars) {
      throw new HttpError(413, 'transcript_too_long', 'Текст урока слишком длинный.');
    }
    limits.check('chats');
    const answer = await llm.chat({
      lessonMaterial: `КОНСПЕКТ:\n${body.notesText}\n\nРАСШИФРОВКА:\n${transcript}`,
      subject: body.subject,
      lang: body.lang,
      history: body.history,
    });
    limits.add('chats');
    const out: ChatResponse = { answer, demo: cfg.llm.provider === 'demo' };
    res.json(out);
  });

  app.use('/api', (_req, _res) => {
    throw new HttpError(404, 'not_found', 'Нет такого адреса.');
  });

  // Готовое приложение (после `npm run build`) раздаётся этим же сервером.
  const dist = path.resolve('dist');
  app.use(express.static(dist, { maxAge: '1h', setHeaders: noCacheForShell }));
  app.get(/^(?!\/api).*/, (_req, res, next) => {
    res.sendFile(path.join(dist, 'index.html'), (err) => (err ? next() : undefined));
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.code, message: err.message });
    } else if (err instanceof multer.MulterError) {
      res.status(413).json({ error: 'too_big', message: 'Файл слишком большой.' });
    } else if (err instanceof z.ZodError || err instanceof SyntaxError) {
      res.status(400).json({ error: 'bad_request', message: 'Неправильный запрос.' });
    } else {
      console.error(err);
      res.status(500).json({ error: 'server_error', message: 'Ошибка сервера.' });
    }
  });

  return app;
}

function noCacheForShell(res: Response, file: string) {
  if (/(index\.html|sw\.js|manifest\.webmanifest)$/.test(file)) {
    res.setHeader('Cache-Control', 'no-cache');
  }
}
