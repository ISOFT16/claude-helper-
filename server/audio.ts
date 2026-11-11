// Подготовка аудио. Урок на 40–60 минут слишком большой, чтобы отправить
// его на распознавание одним файлом, поэтому программа ffmpeg сжимает запись
// (моно, 16 кГц) и режет её на части по 10 минут.

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { HttpError } from './config.ts';

function run(cmd: string, args: string[]): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    let stderr = '';
    const child = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    child.stderr.on('data', (d: Buffer) => {
      stderr += d.toString();
      if (stderr.length > 200_000) stderr = stderr.slice(-100_000);
    });
    child.on('error', () => resolve({ code: -1, stderr }));
    child.on('close', (code) => resolve({ code: code ?? -1, stderr }));
  });
}

let cached: string | null | undefined;

/** Ищет ffmpeg: сначала FFMPEG_PATH, потом пакет ffmpeg-static, потом системный. */
export async function findFfmpeg(explicit = ''): Promise<string | null> {
  if (cached !== undefined) return cached;
  const candidates: string[] = [];
  if (explicit) candidates.push(explicit);
  try {
    const mod = (await import('ffmpeg-static')) as { default: string | null };
    if (mod.default) candidates.push(mod.default);
  } catch {
    // пакет необязательный
  }
  candidates.push('ffmpeg');
  for (const c of candidates) {
    if ((await run(c, ['-version'])).code === 0) return (cached = c);
  }
  return (cached = null);
}

export interface Prepared {
  files: string[];
  durationSec: number;
}

export async function prepareAudio(
  ffmpeg: string,
  input: string,
  outDir: string,
  chunkSec: number,
  maxSec: number,
): Promise<Prepared> {
  const { code, stderr } = await run(ffmpeg, [
    '-hide_banner', '-nostdin', '-y',
    '-i', input,
    '-vn', '-ac', '1', '-ar', '16000', '-b:a', '32k',
    // Берём чуть больше лимита: если запись длиннее — узнаем об этом и откажем.
    '-t', String(maxSec + 10),
    '-f', 'segment', '-segment_time', String(chunkSec),
    path.join(outDir, 'part_%03d.mp3'),
  ]);
  if (code !== 0) {
    throw new HttpError(400, 'bad_audio', 'Не удалось прочитать аудиофайл.');
  }
  const times = [...stderr.matchAll(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/g)];
  const last = times[times.length - 1];
  const durationSec = last ? Number(last[1]) * 3600 + Number(last[2]) * 60 + Number(last[3]) : 0;
  if (durationSec > maxSec) {
    throw new HttpError(413, 'too_long', `Запись длиннее ${Math.round(maxSec / 60)} минут.`);
  }
  if (durationSec < 1) {
    throw new HttpError(400, 'bad_audio', 'В файле нет звука.');
  }
  const files = (await fs.readdir(outDir))
    .filter((f) => f.startsWith('part_'))
    .sort()
    .map((f) => path.join(outDir, f));
  return { files, durationSec };
}
