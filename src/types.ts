import type { ChatAnswer, Lang, Notes, Segment } from '../shared/types.ts';

export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string; // для ответа ИИ — обе части, склеенные (для истории)
  answer?: ChatAnswer;
  demo?: boolean;
}

export interface QuizResult {
  date: number;
  score: number;
  total: number;
}

/** Один урок в дневнике. */
export interface Lesson {
  id: string;
  subject: string;
  createdAt: number;
  durationSec: number;
  status: 'processing' | 'ready' | 'error';
  error?: string;
  segments: Segment[];
  notes?: Notes;
  demoStt?: boolean;
  demoNotes?: boolean;
  hasAudio: boolean;
  homeworkDone: boolean;
  chat: ChatMessage[];
  quizResults: QuizResult[];
  cards: Record<number, 'know' | 'repeat'>;
}

export interface Settings {
  lang: Lang;
  theme: 'auto' | 'light' | 'dark';
  keepAudio: boolean;
  accessCode: string;
  /** Расписание: день недели (1 = понедельник … 6 = суббота) -> предметы. */
  schedule: Record<number, string[]>;
}

export const DEFAULT_SETTINGS: Settings = {
  lang: 'ru',
  theme: 'auto',
  keepAudio: false,
  accessCode: '',
  schedule: {},
};

export type Stage = 'upload' | 'stt' | 'notes';
