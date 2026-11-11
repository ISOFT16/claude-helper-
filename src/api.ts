// Общение с сервером. В браузере нет никаких секретных ключей —
// только (необязательный) код доступа, который вводит сам пользователь.

import type {
  ChatResponse,
  ChatTurn,
  Lang,
  Notes,
  NotesResponse,
  Segment,
  ServerStatus,
  TranscribeResponse,
} from '../shared/types.ts';
import { loadSettings } from './db.ts';

export class ApiError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { ...init.headers, 'x-access-code': encodeURIComponent(loadSettings().accessCode) },
    });
  } catch {
    throw new ApiError('network');
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(body.error ?? 'unknown');
  }
  return (await res.json()) as T;
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

/** Краткий текст конспекта — чтобы чат знал, что уже есть в конспекте. */
export function notesToText(n: Notes): string {
  return [
    n.title,
    n.description,
    ...n.keyPoints.map((k) => '- ' + k.text),
    ...n.definitions.map((d) => `${d.term} — ${d.definition}`),
    ...n.facts.map((f) => f.text),
    ...n.examples,
    n.summary,
    n.homework.found ? `ДЗ: ${n.homework.task} ${n.homework.due}` : '',
  ]
    .filter(Boolean)
    .join('\n')
    .slice(0, 30_000);
}

export const api = {
  status: () => call<ServerStatus>('/api/status'),

  transcribe(audio: Blob, lang: Lang) {
    const form = new FormData();
    form.append('audio', audio, 'lesson');
    form.append('lang', lang);
    return call<TranscribeResponse>('/api/transcribe', { method: 'POST', body: form });
  },

  notes: (segments: Segment[], subject: string, lang: Lang) =>
    call<NotesResponse>('/api/notes', json({ segments, subject, lang })),

  chat: (segments: Segment[], notes: Notes, subject: string, lang: Lang, history: ChatTurn[]) =>
    call<ChatResponse>('/api/chat', json({ segments, notesText: notesToText(notes), subject, lang, history })),
};
