// Запись урока через диктовку claude.ai: микрофон держит сама платформа
// (и сама показывает, что идёт запись), а странице приходят уже готовые слова.
// Звук при этом нигде не сохраняется — только текст.

import { useCallback, useEffect, useRef, useState } from 'react';
import { saveDraftMeta, type DraftMeta } from './db.ts';
import type { Lang } from '../shared/types.ts';
import { capability } from './env.ts';
import type { Recorded, Recorder } from './recorder.ts';

interface Dictation {
  start(o?: { language?: string }): Promise<void>;
  stop(): Promise<void>;
  onPartial(h: (e: { text: string }) => void): () => void;
  onFinal(h: (e: { text: string }) => void): () => void;
  onState(h: (e: { state: string; reason?: string }) => void): () => void;
}

/** Почему запись остановилась сама — ключ перевода для подсказки. */
export type StopNote = 'noteHidden' | 'noteTimeLimit' | 'noteError' | 'noteViewerStopped' | null;

export function useDictationRecorder(lang: Lang): Recorder {
  const [state, setState] = useState<Recorder['state']>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [subject, setSubject] = useState('');
  const [text, setText] = useState('');
  const [partial, setPartial] = useState('');
  const [note, setNote] = useState<StopNote>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const r = useRef({
    d: null as Dictation | null,
    text: '',
    acc: 0,
    since: 0,
    running: false,
    timer: 0,
    meta: null as DraftMeta | null,
    // true — когда остановку вызвали мы сами (пауза/завершение), а не платформа
    selfStop: false,
    finishing: null as null | ((text: string) => void),
    wake: null as WakeLockSentinel | null,
  }).current;

  const elapsed = () => r.acc + (r.running ? Date.now() - r.since : 0);

  const freeze = useCallback(() => {
    if (r.running) r.acc += Date.now() - r.since;
    r.running = false;
    setElapsedMs(r.acc);
  }, [r]);

  const saveDraft = useCallback(() => {
    if (r.meta) saveDraftMeta({ ...r.meta, elapsedMs: elapsed(), text: r.text });
  }, [r]);

  useEffect(() => {
    let alive = true;
    const offs: (() => void)[] = [];
    void capability<Dictation>('dictation').then((d) => {
      if (!alive) return;
      r.d = d;
      setAvailable(!!d);
      if (!d) return;
      offs.push(
        d.onFinal(({ text: piece }) => {
          r.text = (r.text + piece).replace(/^\s+/, '');
          setText(r.text);
          setPartial('');
          saveDraft();
        }),
        d.onPartial(({ text: p }) => setPartial(p)),
        d.onState(({ state: s, reason }) => {
          if (s !== 'idle' || !r.meta) return;
          // Слушать перестали. Если это не наша пауза — значит, экран погас,
          // пользователь переключился или вышло время. Ставим на паузу, ничего не теряя.
          freeze();
          saveDraft();
          if (r.finishing) {
            const done = r.finishing;
            r.finishing = null;
            done(r.text);
            return;
          }
          if (!r.selfStop) {
            setState('paused');
            setNote(
              reason === 'hidden'
                ? 'noteHidden'
                : reason === 'time_limit'
                  ? 'noteTimeLimit'
                  : reason === 'viewer_stopped'
                    ? 'noteViewerStopped'
                    : 'noteError',
            );
          }
          r.selfStop = false;
        }),
      );
    });
    return () => {
      alive = false;
      offs.forEach((off) => off());
    };
  }, [r, freeze, saveDraft]);

  const listen = useCallback(async () => {
    const d = r.d;
    if (!d) throw new Error('dictUnavailable');
    // start() нужно вызвать сразу из нажатия, ничего не дожидаясь перед ним.
    const started = d.start({ language: lang });
    try {
      await started;
    } catch (e) {
      const code = (e as { code?: string }).code;
      throw new Error(
        code === 'not_granted'
          ? 'micDenied'
          : code === 'unavailable'
            ? lang === 'kk'
              ? 'dictNoKazakh'
              : 'dictUnavailable'
            : code === 'dismissed' || code === 'stopped'
              ? 'dictDismissed'
              : 'dictFailed',
      );
    }
    r.since = Date.now();
    r.running = true;
    setNote(null);
    setState('recording');
    try {
      r.wake = (await navigator.wakeLock?.request('screen')) ?? null;
    } catch {
      // не страшно
    }
  }, [r, lang]);

  const start = useCallback(
    async (subj: string) => {
      if (r.meta) throw new Error('micBusy');
      r.text = '';
      r.acc = 0;
      r.meta = { subject: subj, startedAt: Date.now(), elapsedMs: 0, mime: 'text', text: '' };
      setText('');
      setPartial('');
      setSubject(subj);
      try {
        await listen();
      } catch (e) {
        r.meta = null;
        throw e;
      }
      saveDraft();
      window.clearInterval(r.timer);
      r.timer = window.setInterval(() => setElapsedMs(elapsed()), 500);
    },
    [r, listen, saveDraft],
  );

  const pause = useCallback(() => {
    if (state !== 'recording') return;
    r.selfStop = true;
    freeze();
    setState('paused');
    void r.d?.stop();
  }, [r, state, freeze]);

  const resume = useCallback(() => {
    if (state !== 'paused') return;
    listen().catch((e: Error) => setNote(e.message as StopNote));
  }, [state, listen]);

  const reset = useCallback(() => {
    window.clearInterval(r.timer);
    void r.wake?.release().catch(() => {});
    r.meta = null;
    r.text = '';
    r.acc = 0;
    r.running = false;
    setState('idle');
    setElapsedMs(0);
    setText('');
    setPartial('');
    setNote(null);
  }, [r]);

  const stop = useCallback(async (): Promise<Recorded> => {
    const meta = r.meta;
    if (!meta) throw new Error('not recording');
    const durationSec = Math.round(elapsed() / 1000);
    let finalText = r.text;
    if (r.running && r.d) {
      // Ждём последние слова, которые ещё распознаются.
      finalText = await new Promise<string>((resolve) => {
        r.finishing = resolve;
        r.selfStop = true;
        void r.d!.stop();
        setTimeout(() => {
          if (r.finishing) {
            r.finishing = null;
            resolve(r.text);
          }
        }, 8000);
      });
    }
    reset();
    return { text: finalText.trim(), durationSec, subject: meta.subject };
  }, [r, reset]);

  const discard = useCallback(async () => {
    r.selfStop = true;
    if (r.running) await r.d?.stop().catch(() => {});
    reset();
    saveDraftMeta(null);
  }, [r, reset]);

  return {
    state,
    elapsedMs,
    level: partial ? 1 : 0,
    subject,
    start,
    pause,
    resume,
    stop,
    discard,
    live: { text, partial, note, available },
  };
}
