// ИИ для Android-приложения. Ключ Claude вводит пользователь (родитель) в настройках,
// он хранится только в телефоне и в коде приложения его нет.
// Без ключа конспект собирается простыми правилами (демо), но по настоящему тексту урока.

import type { ChatAnswer, ChatTurn, Lang, Notes, Segment } from '../shared/types.ts';
import { HttpError, loadConfig } from '../server/config.ts';
import { createLlm } from '../server/llm.ts';
import { ApiError } from './api.ts';
import { loadSettings } from './db.ts';

function llm() {
  const key = loadSettings().claudeKey?.trim() ?? '';
  const cfg = loadConfig({ ANTHROPIC_API_KEY: key, LLM_FROM_DEVICE: '1', LLM_PROVIDER: key ? 'anthropic' : 'demo' });
  return { llm: createLlm(cfg), demo: !key };
}

async function wrap<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof HttpError) throw new ApiError(e.code);
    if (e instanceof ApiError) throw e;
    console.error(e);
    throw new ApiError('llm_failed');
  }
}

export const deviceAi = {
  async notes(segments: Segment[], subject: string, lang: Lang): Promise<{ notes: Notes; demo: boolean }> {
    const text = segments.map((s) => s.text).join(' ');
    if (text.replace(/[^\p{L}]/gu, '').length < 40) throw new ApiError('empty_transcript');
    if (text.length > 150_000) throw new ApiError('transcript_too_long');
    const { llm: ai, demo } = llm();
    return { notes: await wrap(() => ai.notes({ segments, subject, lang })), demo };
  },

  async chat(material: string, subject: string, lang: Lang, history: ChatTurn[]): Promise<{ answer: ChatAnswer; demo: boolean }> {
    const { llm: ai, demo } = llm();
    return { answer: await wrap(() => ai.chat({ lessonMaterial: material, subject, lang, history })), demo };
  },
};
