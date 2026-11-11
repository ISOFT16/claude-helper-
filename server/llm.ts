// Работа с ИИ, который пишет конспект и отвечает в чате.
// Основной вариант — Claude (Anthropic). Запасной — любой сервис,
// совместимый с OpenAI. Без ключей включается демо-режим.

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { z } from 'zod';
import type { ChatAnswer, ChatTurn, Lang, Notes, Segment } from '../shared/types.ts';
import { segmentsToMarkedText } from '../shared/types.ts';
import { HttpError, type Config } from './config.ts';
import { demoChat, demoNotes } from './demo.ts';
import { CHAT_JSON_HINT, NOTES_JSON_HINT, chatSystem, notesSystem, notesUser } from './prompts.ts';
import { ChatSchema, NotesSchema, cleanChat, cleanNotes } from './schema.ts';

export interface NotesInput {
  segments: Segment[];
  subject: string;
  lang: Lang;
}

export interface ChatInput {
  lessonMaterial: string;
  subject: string;
  lang: Lang;
  history: ChatTurn[];
}

export interface Llm {
  notes(input: NotesInput): Promise<Notes>;
  chat(input: ChatInput): Promise<ChatAnswer>;
}

interface Call<S extends z.ZodType> {
  schema: S;
  system: string;
  messages: ChatTurn[];
  jsonHint: string;
  maxTokens: number;
  effort: 'low' | 'medium';
}

// ---------- Claude ----------

function anthropicError(e: unknown): HttpError {
  if (e instanceof HttpError) return e;
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
    return new HttpError(502, 'llm_key', 'Ключ ИИ-сервиса не подходит.');
  }
  if (e instanceof Anthropic.RateLimitError) {
    return new HttpError(429, 'llm_busy', 'ИИ сейчас перегружен. Попробуйте через минуту.');
  }
  if (e instanceof Anthropic.APIConnectionError) {
    return new HttpError(502, 'llm_failed', 'Не удалось связаться с ИИ-сервисом.');
  }
  if (e instanceof Anthropic.APIError) {
    console.error('Anthropic API error', e.status, e.message);
    return new HttpError(502, 'llm_failed', 'ИИ-сервис вернул ошибку.');
  }
  console.error(e);
  return new HttpError(502, 'llm_failed', 'ИИ вернул непонятный ответ.');
}

function createAnthropic(cfg: Config): Llm {
  // Ключ берётся из ANTHROPIC_API_KEY в файле .env — он есть только на сервере.
  const client = new Anthropic({ apiKey: cfg.llm.anthropicKey });

  async function call<S extends z.ZodType>(c: Call<S>): Promise<z.infer<S>> {
    try {
      const res = await client.beta.messages.create({
        model: cfg.llm.anthropicModel,
        max_tokens: c.maxTokens,
        // Если защитный фильтр по ошибке отклонит обычный школьный урок
        // (например, по биологии), запрос автоматически повторится на запасной модели.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        // Инструкция и материалы урока кешируются: повторные вопросы в чате стоят дешевле.
        system: [{ type: 'text', text: c.system, cache_control: { type: 'ephemeral' } }],
        messages: c.messages.map((m) => ({ role: m.role, content: m.text })),
        output_config: { effort: c.effort, format: zodOutputFormat(c.schema) },
      });
      if (res.stop_reason === 'refusal') {
        throw new HttpError(422, 'llm_refused', 'ИИ отказался обрабатывать этот текст.');
      }
      if (res.stop_reason === 'max_tokens') {
        throw new HttpError(502, 'llm_failed', 'Ответ ИИ получился слишком длинным.');
      }
      const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
      return c.schema.parse(JSON.parse(text));
    } catch (e) {
      throw anthropicError(e);
    }
  }

  return wrap(call);
}

// ---------- OpenAI-совместимые сервисы ----------

function createOpenAiCompatible(cfg: Config): Llm {
  async function call<S extends z.ZodType>(c: Call<S>): Promise<z.infer<S>> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      let res: Response;
      try {
        res = await fetch(`${cfg.llm.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${cfg.llm.apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: cfg.llm.model,
            max_tokens: c.maxTokens,
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: `${c.system}\n\n${c.jsonHint}` },
              ...c.messages.map((m) => ({ role: m.role, content: m.text })),
            ],
          }),
          signal: AbortSignal.timeout(5 * 60_000),
        });
      } catch {
        throw new HttpError(502, 'llm_failed', 'Не удалось связаться с ИИ-сервисом.');
      }
      if (res.status === 401 || res.status === 403) {
        throw new HttpError(502, 'llm_key', 'Ключ ИИ-сервиса не подходит.');
      }
      if (res.status === 429) {
        throw new HttpError(429, 'llm_busy', 'ИИ сейчас перегружен. Попробуйте через минуту.');
      }
      if (!res.ok) {
        console.error('LLM error', res.status, (await res.text()).slice(0, 300));
        throw new HttpError(502, 'llm_failed', 'ИИ-сервис вернул ошибку.');
      }
      try {
        const json = (await res.json()) as { choices: { message: { content: string } }[] };
        return c.schema.parse(JSON.parse(json.choices[0].message.content));
      } catch (e) {
        lastError = e; // ответ не той формы — пробуем ещё один раз
      }
    }
    console.error(lastError);
    throw new HttpError(502, 'llm_failed', 'ИИ вернул непонятный ответ.');
  }

  return wrap(call);
}

function wrap(call: <S extends z.ZodType>(c: Call<S>) => Promise<z.infer<S>>): Llm {
  return {
    async notes({ segments, subject, lang }) {
      const raw = await call({
        schema: NotesSchema,
        system: notesSystem(lang),
        messages: [{ role: 'user', text: notesUser(subject, segmentsToMarkedText(segments)) }],
        jsonHint: NOTES_JSON_HINT,
        maxTokens: 16000,
        effort: 'medium',
      });
      return cleanNotes(raw);
    },
    async chat({ lessonMaterial, subject, lang, history }) {
      const raw = await call({
        schema: ChatSchema,
        system: chatSystem(lang, subject, lessonMaterial),
        messages: history,
        jsonHint: CHAT_JSON_HINT,
        maxTokens: 4000,
        effort: 'low',
      });
      return cleanChat(raw);
    },
  };
}

// ---------- Демо ----------

const demo: Llm = {
  async notes({ segments, subject, lang }) {
    return demoNotes(segments, subject, lang);
  },
  async chat({ lessonMaterial, lang, history }) {
    return demoChat(history[history.length - 1]?.text ?? '', lessonMaterial, lang);
  },
};

export function createLlm(cfg: Config): Llm {
  if (cfg.llm.provider === 'anthropic') return createAnthropic(cfg);
  if (cfg.llm.provider === 'openai') {
    if (!cfg.llm.model) throw new Error('Укажите LLM_MODEL в файле .env');
    return createOpenAiCompatible(cfg);
  }
  return demo;
}
