// Общие типы: ими пользуются и сервер, и приложение в браузере.

export type Lang = 'ru' | 'kk';

/** Кусочек распознанной речи. uncertain = распознано неуверенно. */
export interface Segment {
  text: string;
  uncertain?: boolean;
}

export interface KeyPoint {
  text: string;
  uncertain: boolean;
}

export interface Definition {
  term: string;
  definition: string;
  uncertain: boolean;
}

export interface Fact {
  kind: 'formula' | 'date' | 'rule';
  text: string;
  uncertain: boolean;
}

export interface Homework {
  found: boolean;
  task: string;
  due: string;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface Flashcard {
  front: string;
  back: string;
}

/** Всё, что ИИ создаёт по одному уроку. */
export interface Notes {
  title: string;
  description: string;
  keyPoints: KeyPoint[];
  definitions: Definition[];
  facts: Fact[];
  examples: string[];
  summary: string;
  homework: Homework;
  quiz: QuizQuestion[];
  flashcards: Flashcard[];
  reviewTopics: string[];
}

/** Ответ чата: отдельно то, что было на уроке, и отдельно добавка от ИИ. */
export interface ChatAnswer {
  fromLesson: string;
  extra: string;
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface ServerStatus {
  stt: 'openai' | 'demo';
  llm: 'anthropic' | 'openai' | 'demo';
  needsCode: boolean;
  maxMinutes: number;
  maxUploadMb: number;
}

export interface TranscribeResponse {
  segments: Segment[];
  durationSec: number;
  demo: boolean;
}

export interface NotesResponse {
  notes: Notes;
  demo: boolean;
}

export interface ChatResponse {
  answer: ChatAnswer;
  demo: boolean;
}

/** Превращает сегменты в текст для ИИ: неуверенные куски помечены ⟦?…⟧. */
export function segmentsToMarkedText(segments: Segment[]): string {
  return segments
    .map((s) => (s.uncertain ? `⟦?${s.text.trim()}⟧` : s.text.trim()))
    .filter(Boolean)
    .join(' ');
}
