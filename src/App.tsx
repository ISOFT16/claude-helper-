import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ServerStatus } from '../shared/types.ts';
import { ApiError, api } from './api.ts';
import { Icon } from './components/Icon.tsx';
import { loadDraftMeta, loadSettings, saveDraftMeta, saveSettings, store, type DraftMeta } from './db.ts';
import { makeT, subjectOf, type T } from './i18n.ts';
import { Diary } from './pages/Diary.tsx';
import { Home } from './pages/Home.tsx';
import { HomeworkPage } from './pages/HomeworkPage.tsx';
import { LessonPage } from './pages/LessonPage.tsx';
import { RecordPage } from './pages/RecordPage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';
import { useDictationRecorder } from './dictation.ts';
import { NATIVE, STANDALONE } from './env.ts';
import { useNativeSpeechRecorder } from './nativeSpeech.ts';
import { formatTime, useRecorder, type Recorded, type Recorder } from './recorder.ts';
import type { Lesson, Settings, Stage } from './types.ts';

interface AppCtx {
  lessons: Lesson[];
  loaded: boolean;
  saveLesson(lesson: Lesson): Promise<void>;
  deleteLesson(id: string): Promise<void>;
  settings: Settings;
  updateSettings(patch: Partial<Settings>): void;
  t: T;
  status: ServerStatus | null;
  rec: Recorder;
  stages: Record<string, Stage>;
  /** Создать урок из аудио или готового текста и запустить обработку. */
  createLesson(source: Pick<Recorded, 'blob' | 'text'>, subject: string, durationSec: number): Promise<void>;
  processLesson(id: string): Promise<void>;
  finishRecording(): Promise<void>;
  draft: DraftMeta | null;
  restoreDraft(): Promise<void>;
  discardDraft(): Promise<void>;
  wipe(): Promise<void>;
  /** Окно подтверждения «Да / Отмена» (обычный confirm() на claude.ai не показывается). */
  ask(text: string, yes: string): Promise<boolean>;
}

const Ctx = createContext<AppCtx | null>(null);

export function useApp(): AppCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('no app context');
  return ctx;
}

// Какой экран открыт. В обычной версии адрес хранится после # — так работает кнопка
// «Назад». На claude.ai такие адреса запрещены, поэтому там экран хранится в памяти.
let memoryRoute = '/home';
const routeListeners = new Set<() => void>();
const readRoute = () => (STANDALONE ? memoryRoute : location.hash);

/** Переход на другой экран. */
export function go(path: string) {
  if (STANDALONE) {
    memoryRoute = path;
    routeListeners.forEach((f) => f());
  } else {
    location.hash = path;
  }
}

/** Сменить экран без новой записи в истории (для вкладок внутри урока). */
export function swap(path: string) {
  if (STANDALONE) return go(path);
  history.replaceState(null, '', `#${path}`);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

function useRoute(): string[] {
  const [hash, setHash] = useState(readRoute);
  useEffect(() => {
    const on = () => setHash(readRoute());
    window.addEventListener('hashchange', on);
    routeListeners.add(on);
    return () => {
      window.removeEventListener('hashchange', on);
      routeListeners.delete(on);
    };
  }, []);
  return hash.replace(/^#?\/?/, '').split('/').map(decodeURIComponent);
}

export function App() {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [stages, setStages] = useState<Record<string, Stage>>({});
  const [draft, setDraft] = useState<DraftMeta | null>(loadDraftMeta);
  const lessonsRef = useRef<Lesson[]>([]);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  // Вариант сборки не меняется во время работы, поэтому выбор хука здесь безопасен.
  const rec = STANDALONE
    ? useDictationRecorder(settings.lang)
    : NATIVE
      ? useNativeSpeechRecorder(settings.lang)
      : useRecorder();
  const [question, setQuestion] = useState<{ text: string; yes: string; done(v: boolean): void } | null>(null);
  const ask = useCallback(
    (text: string, yes: string) => new Promise<boolean>((done) => setQuestion({ text, yes, done })),
    [],
  );
  const route = useRoute();
  const t = useMemo(() => makeT(settings.lang), [settings.lang]);

  const saveLesson = useCallback(async (lesson: Lesson) => {
    const rest = lessonsRef.current.filter((l) => l.id !== lesson.id);
    lessonsRef.current = [lesson, ...rest].sort((a, b) => b.createdAt - a.createdAt);
    setLessons(lessonsRef.current);
    await store.saveLesson(lesson);
  }, []);

  const deleteLesson = useCallback(async (id: string) => {
    lessonsRef.current = lessonsRef.current.filter((l) => l.id !== id);
    setLessons(lessonsRef.current);
    await store.deleteLesson(id);
  }, []);

  // Загрузка при старте.
  useEffect(() => {
    void (async () => {
      const all = await store.lessons();
      // Если приложение закрыли во время обработки — даём возможность повторить.
      for (const l of all) {
        if (l.status === 'processing') {
          l.status = 'error';
          l.error = 'interrupted';
          await store.saveLesson(l);
        }
      }
      lessonsRef.current = all;
      setLessons(all);
      setLoaded(true);
    })();
    if (!STANDALONE && !NATIVE) api.status().then(setStatus).catch(() => setStatus(null));
  }, []);

  // Тема и язык страницы.
  useEffect(() => {
    const root = document.documentElement;
    // На claude.ai тему «как в телефоне» задаёт сама платформа — её не трогаем.
    if (settings.theme === 'auto') {
      if (!STANDALONE) root.removeAttribute('data-theme');
    }
    else root.setAttribute('data-theme', settings.theme);
    root.lang = settings.lang;
    document.title = `${t('appName')} — AI School`;
  }, [settings.theme, settings.lang, t]);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  const processLesson = useCallback(
    async (id: string) => {
      let l = lessonsRef.current.find((x) => x.id === id);
      if (!l) return;
      const { lang, keepAudio } = settingsRef.current;
      const setStage = (s: Stage | null) =>
        setStages((prev) => {
          const next = { ...prev };
          if (s) next[id] = s;
          else delete next[id];
          return next;
        });
      try {
        l = { ...l, status: 'processing', error: undefined };
        await saveLesson(l);
        if (!l.segments.length) {
          setStage('upload');
          const blob = await store.audio(id);
          if (!blob) throw new ApiError('no_audio');
          const timer = setTimeout(() => setStage('stt'), 2500);
          const tr = await api.transcribe(blob, lang).finally(() => clearTimeout(timer));
          l = { ...l, segments: tr.segments, durationSec: tr.durationSec || l.durationSec, demoStt: tr.demo };
          await saveLesson(l);
        }
        setStage('notes');
        const res = await api.notes(l.segments, subjectOf(l.subject)[lang], lang);
        l = { ...l, notes: res.notes, demoNotes: res.demo, status: 'ready' };
        // По умолчанию исходное аудио удаляется сразу после успешного конспекта.
        if (!keepAudio) {
          await store.deleteAudio(id);
          l.hasAudio = false;
        }
        await saveLesson(l);
      } catch (e) {
        const code = e instanceof ApiError ? e.code : 'unknown';
        if (!(e instanceof ApiError)) console.error(e);
        await saveLesson({ ...l, status: 'error', error: code });
      } finally {
        setStage(null);
      }
    },
    [saveLesson],
  );

  const createLesson = useCallback(
    async (source: Pick<Recorded, 'blob' | 'text'>, subject: string, durationSec: number) => {
      const lesson: Lesson = {
        id: crypto.randomUUID?.() ?? String(Date.now()),
        subject,
        createdAt: Date.now(),
        durationSec,
        status: 'processing',
        segments: source.text ? [{ text: source.text }] : [],
        hasAudio: !!source.blob,
        homeworkDone: false,
        chat: [],
        quizResults: [],
        cards: {},
      };
      if (source.blob) await store.saveAudio(lesson.id, source.blob);
      await saveLesson(lesson);
      // Аудио уже в уроке — черновик записи больше не нужен.
      await store.clearDraft();
      saveDraftMeta(null);
      setDraft(null);
      go(`/lesson/${lesson.id}`);
      void processLesson(lesson.id);
    },
    [saveLesson, processLesson],
  );

  const finishing = useRef(false);
  const finishRecording = useCallback(async () => {
    if (finishing.current) return;
    finishing.current = true;
    try {
      const { blob, text, durationSec, subject } = await rec.stop();
      await createLesson({ blob, text }, subject, durationSec);
    } finally {
      finishing.current = false;
    }
  }, [rec, createLesson]);

  // Запись сама останавливается на максимальной длине.
  const maxMs = (status?.maxMinutes ?? 75) * 60_000;
  useEffect(() => {
    if (rec.state !== 'idle' && rec.elapsedMs >= maxMs - 5000) void finishRecording();
  }, [rec.state, rec.elapsedMs, maxMs, finishRecording]);

  const restoreDraft = useCallback(async () => {
    if (!draft) return;
    const seconds = Math.round(draft.elapsedMs / 1000);
    if (draft.text?.trim()) return createLesson({ text: draft.text.trim() }, draft.subject, seconds);
    const blob = draft.mime === 'text' ? null : await store.draftBlob(draft.mime);
    if (blob?.size) await createLesson({ blob }, draft.subject, seconds);
    else {
      saveDraftMeta(null);
      setDraft(null);
    }
  }, [draft, createLesson]);

  const discardDraft = useCallback(async () => {
    await store.clearDraft();
    saveDraftMeta(null);
    setDraft(null);
  }, []);

  const wipe = useCallback(async () => {
    if (rec.state !== 'idle') await rec.discard();
    await store.wipeEverything();
    lessonsRef.current = [];
    setLessons([]);
    setDraft(null);
    saveDraftMeta(null);
    setSettings(loadSettings());
  }, [rec]);

  const ctx: AppCtx = {
    lessons, loaded, saveLesson, deleteLesson, settings, updateSettings, t, status, rec, stages,
    createLesson, processLesson, finishRecording,
    draft: rec.state === 'idle' ? draft : null,
    restoreDraft, discardDraft, wipe, ask,
  };

  const page = route[0] || 'home';
  const screen = route.slice(0, 2).join('/');
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screen]);
  const isRecording = rec.state !== 'idle';

  return (
    <Ctx.Provider value={ctx}>
      {isRecording && page !== 'record' && (
        <button className="rec-banner" onClick={() => go('/record')}>
          <span className={`rec-dot ${rec.state === 'paused' ? 'is-paused' : ''}`} />
          {rec.state === 'paused' ? t('paused') : t('recording')} · {formatTime(rec.elapsedMs)}
        </button>
      )}
      <main className="page" key={screen}>
        {page === 'home' && <Home />}
        {page === 'record' && <RecordPage presetSubject={route[1]} />}
        {page === 'diary' && <Diary />}
        {page === 'homework' && <HomeworkPage />}
        {page === 'settings' && <SettingsPage />}
        {page === 'lesson' && <LessonPage id={route[1]} tab={route[2]} />}
      </main>
      <nav className="tabbar">
        <NavButton to="/home" icon="home" label={t('navHome')} active={page === 'home'} />
        <NavButton to="/diary" icon="book" label={t('navDiary')} active={page === 'diary' || page === 'lesson'} />
        <button
          className={`tab-record ${isRecording ? 'is-on' : ''}`}
          onClick={() => go('/record')}
          aria-label={t('navRecord')}
        >
          <Icon name="mic" size={28} />
        </button>
        <NavButton to="/homework" icon="check" label={t('navHomework')} active={page === 'homework'} />
        <NavButton to="/settings" icon="gear" label={t('navSettings')} active={page === 'settings'} />
      </nav>
      {question && (
        <div className="sheet-backdrop" onClick={() => (question.done(false), setQuestion(null))}>
          <div className="sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <p className="sheet-text">{question.text}</p>
            <div className="btn-row">
              <button className="btn ghost" onClick={() => (question.done(false), setQuestion(null))}>
                {t('cancel')}
              </button>
              <button className="btn danger" onClick={() => (question.done(true), setQuestion(null))}>
                {question.yes}
              </button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

function NavButton(p: { to: string; icon: 'home' | 'book' | 'check' | 'gear'; label: string; active: boolean }) {
  return (
    <button className={`tab ${p.active ? 'is-active' : ''}`} onClick={() => go(p.to)}>
      <Icon name={p.icon} />
      <span>{p.label}</span>
    </button>
  );
}
