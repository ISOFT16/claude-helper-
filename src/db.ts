// Локальное хранилище. Все уроки лежат прямо в телефоне (IndexedDB) —
// на сервере ничего не хранится.

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { DEFAULT_SETTINGS, type Lesson, type Settings } from './types.ts';

interface Schema extends DBSchema {
  lessons: { key: string; value: Lesson };
  audio: { key: string; value: Blob };
  // Кусочки записи, которая идёт прямо сейчас (по 5 секунд).
  draft: { key: number; value: Blob };
}

let dbPromise: Promise<IDBPDatabase<Schema>> | null = null;

function db() {
  dbPromise ??= openDB<Schema>('umny-urok', 1, {
    upgrade(d) {
      d.createObjectStore('lessons', { keyPath: 'id' });
      d.createObjectStore('audio');
      d.createObjectStore('draft', { autoIncrement: true });
    },
  });
  return dbPromise;
}

export const store = {
  async lessons(): Promise<Lesson[]> {
    return (await (await db()).getAll('lessons')).sort((a, b) => b.createdAt - a.createdAt);
  },
  async saveLesson(lesson: Lesson) {
    await (await db()).put('lessons', lesson);
  },
  async deleteLesson(id: string) {
    const d = await db();
    await d.delete('lessons', id);
    await d.delete('audio', id);
  },
  async saveAudio(id: string, blob: Blob) {
    await (await db()).put('audio', blob, id);
  },
  async audio(id: string) {
    return (await db()).get('audio', id);
  },
  async deleteAudio(id: string) {
    await (await db()).delete('audio', id);
  },
  async addDraftChunk(blob: Blob) {
    await (await db()).add('draft', blob);
  },
  async draftBlob(type: string): Promise<Blob> {
    return new Blob(await (await db()).getAll('draft'), { type });
  },
  async clearDraft() {
    await (await db()).clear('draft');
  },
  async wipeEverything() {
    const d = await db();
    await Promise.all([d.clear('lessons'), d.clear('audio'), d.clear('draft')]);
    localStorage.clear();
  },
};

// ----- Настройки и сведения о незавершённой записи (маленькие, лежат в localStorage) -----

export function loadSettings(): Settings {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem('settings') ?? '{}') };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: Settings) {
  localStorage.setItem('settings', JSON.stringify(s));
}

export interface DraftMeta {
  subject: string;
  startedAt: number;
  elapsedMs: number;
  mime: string;
}

export function loadDraftMeta(): DraftMeta | null {
  try {
    return JSON.parse(localStorage.getItem('draft') ?? 'null');
  } catch {
    return null;
  }
}

export function saveDraftMeta(meta: DraftMeta | null) {
  if (meta) localStorage.setItem('draft', JSON.stringify(meta));
  else localStorage.removeItem('draft');
}
