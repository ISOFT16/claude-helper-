// Распознавание речи (speech-to-text, STT).
// Сервис «подключаемый»: подойдёт любой, совместимый с OpenAI Whisper API
// (OpenAI, Groq и другие) — достаточно поменять адрес и ключ в .env.

import fs from 'node:fs/promises';
import path from 'node:path';
import type { Lang, Segment } from '../shared/types.ts';
import { HttpError, type Config } from './config.ts';

interface WhisperSegment {
  text: string;
  avg_logprob?: number;
  no_speech_prob?: number;
}

interface WhisperResponse {
  text?: string;
  segments?: WhisperSegment[];
}

// Ниже этих порогов считаем, что фраза распознана неуверенно.
const LOW_CONFIDENCE = -1.0;
const MAYBE_SILENCE = 0.6;

export async function transcribeFile(cfg: Config, file: string, lang: Lang): Promise<Segment[]> {
  const form = new FormData();
  const data = await fs.readFile(file);
  form.append('file', new Blob([data]), path.basename(file));
  form.append('model', cfg.stt.model);
  form.append('language', lang);
  form.append('response_format', 'verbose_json');

  let res: Response;
  try {
    res = await fetch(`${cfg.stt.baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.stt.apiKey}` },
      body: form,
      signal: AbortSignal.timeout(5 * 60_000),
    });
  } catch {
    throw new HttpError(502, 'stt_failed', 'Сервис распознавания речи не отвечает.');
  }
  if (res.status === 401 || res.status === 403) {
    throw new HttpError(502, 'stt_key', 'Ключ сервиса распознавания речи не подходит.');
  }
  if (!res.ok) {
    console.error('STT error', res.status, (await res.text()).slice(0, 300));
    throw new HttpError(502, 'stt_failed', 'Сервис распознавания речи вернул ошибку.');
  }
  const json = (await res.json()) as WhisperResponse;
  if (json.segments?.length) {
    return json.segments
      .map((s) => ({
        text: s.text.trim(),
        uncertain:
          (s.avg_logprob ?? 0) < LOW_CONFIDENCE || (s.no_speech_prob ?? 0) > MAYBE_SILENCE || undefined,
      }))
      .filter((s) => s.text);
  }
  return json.text?.trim() ? [{ text: json.text.trim() }] : [];
}

/** Склеивает мелкие соседние сегменты, чтобы текст было удобно читать и хранить. */
export function mergeSegments(segments: Segment[], maxChars = 400): Segment[] {
  const out: Segment[] = [];
  for (const s of segments) {
    const prev = out[out.length - 1];
    if (prev && !!prev.uncertain === !!s.uncertain && prev.text.length + s.text.length < maxChars) {
      prev.text += ' ' + s.text;
    } else {
      out.push({ ...s });
    }
  }
  return out;
}
