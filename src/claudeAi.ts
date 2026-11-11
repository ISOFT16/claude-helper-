// ИИ для версии «одна ссылка»: Claude вызывается прямо со страницы на claude.ai,
// через аккаунт самого ученика. Используются те же инструкции, что и на сервере,
// и тот же строгий разбор ответа.

import type { ChatAnswer, ChatTurn, Lang, Notes, Segment } from '../shared/types.ts';
import { segmentsToMarkedText } from '../shared/types.ts';
import {
  CHAT_JSON_HINT,
  NOTES_JSON_HINT,
  chatSystem,
  notesSystem,
  notesUser,
} from '../server/prompts.ts';
import { ChatSchema, NotesSchema, cleanChat, cleanNotes } from '../server/schema.ts';
import { ApiError } from './api.ts';
import { capability } from './env.ts';

interface Sample {
  json<T = unknown>(
    input: string | { role: 'user' | 'assistant'; content: string }[],
    options?: Record<string, unknown>,
  ): Promise<T>;
}

const MAX_TRANSCRIPT = 120_000;

function errorCode(e: unknown): string {
  if (e instanceof ApiError) return e.code;
  const code = (e as { code?: string })?.code;
  switch (code) {
    case 'not_granted':
    case 'sampling_disabled':
    case 'not_declared':
    case 'capability_disabled':
    case 'capability_removed':
      return 'ai_not_granted';
    case 'rate_limited':
      return 'llm_busy';
    case 'refused':
      return 'llm_refused';
    case 'prompt_too_large':
      return 'transcript_too_long';
    case 'session_expired':
      return 'ai_signin';
    default:
      return 'llm_failed';
  }
}

async function getSample(): Promise<Sample> {
  const sample = await capability<Sample>('sample');
  if (!sample) throw new ApiError('ai_unavailable');
  return sample;
}

export const claudeAi = {
  async notes(segments: Segment[], subject: string, lang: Lang): Promise<Notes> {
    const text = segmentsToMarkedText(segments);
    if (text.replace(/[^\p{L}]/gu, '').length < 40) throw new ApiError('empty_transcript');
    if (text.length > MAX_TRANSCRIPT) throw new ApiError('transcript_too_long');
    const sample = await getSample();
    const prompt = `${notesSystem(lang)}\n\n${NOTES_JSON_HINT}\n\n${notesUser(subject, text)}`;
    try {
      const raw = await sample.json(prompt, { modelTier: 'default' });
      const parsed = NotesSchema.safeParse(raw);
      if (!parsed.success) throw new ApiError('llm_failed');
      return cleanNotes(parsed.data);
    } catch (e) {
      throw new ApiError(errorCode(e));
    }
  },

  async chat(lessonMaterial: string, subject: string, lang: Lang, history: ChatTurn[]): Promise<ChatAnswer> {
    const sample = await getSample();
    const rules = `${chatSystem(lang, subject, lessonMaterial.slice(0, MAX_TRANSCRIPT))}\n\n${CHAT_JSON_HINT}`;
    const turns = [
      { role: 'user' as const, content: rules },
      ...history.map((m) => ({ role: m.role, content: m.text })),
    ];
    try {
      const raw = await sample.json(turns, { modelTier: 'default', effort: 'low', cache: false });
      const parsed = ChatSchema.safeParse(raw);
      if (!parsed.success) throw new ApiError('llm_failed');
      return cleanChat(parsed.data);
    } catch (e) {
      throw new ApiError(errorCode(e));
    }
  },
};
