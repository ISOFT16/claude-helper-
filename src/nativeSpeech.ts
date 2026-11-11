// Запись урока в Android-приложении: речь распознаёт сам телефон
// (системное распознавание речи Android). Странице приходят только слова,
// звук не сохраняется.
//
// Распознавание на Android слушает одну фразу и останавливается на паузе.
// Поэтому после каждой паузы мы сохраняем фразу и сразу запускаем его снова —
// так получается запись всего урока.

import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Lang } from '../shared/types.ts';
import { saveDraftMeta, type DraftMeta } from './db.ts';
import type { Recorded, Recorder } from './recorder.ts';

const LOCALE: Record<Lang, string> = { ru: 'ru-RU', kk: 'kk-KZ' };

export function useNativeSpeechRecorder(lang: Lang): Recorder {
  const [state, setState] = useState<Recorder['state']>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [subject, setSubject] = useState('');
  const [text, setText] = useState('');
  const [partial, setPartial] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const r = useRef({
    text: '',
    current: '',
    acc: 0,
    since: 0,
    running: false, // идёт запись (не пауза)
    starting: false,
    restartTimer: 0,
    timer: 0,
    watchdog: 0,
    meta: null as DraftMeta | null,
    wake: null as WakeLockSentinel | null,
  }).current;

  const elapsed = () => r.acc + (r.running ? Date.now() - r.since : 0);

  const saveDraft = useCallback(() => {
    if (r.meta) saveDraftMeta({ ...r.meta, elapsedMs: elapsed(), text: r.text });
  }, [r]);

  /** Перенести распознанную фразу в общий текст урока. */
  const commit = useCallback(() => {
    const phrase = r.current.trim();
    r.current = '';
    setPartial('');
    if (!phrase) return;
    r.text = r.text ? `${r.text} ${phrase}` : phrase;
    setText(r.text);
    saveDraft();
  }, [r, saveDraft]);

  const listenOnce = useCallback(async () => {
    if (!r.running || r.starting) return;
    r.starting = true;
    try {
      await SpeechRecognition.start({ language: LOCALE[lang], partialResults: true, popup: false, maxResults: 1 });
    } catch (e) {
      console.warn('speech start', e);
    } finally {
      r.starting = false;
    }
  }, [r, lang]);

  const scheduleRestart = useCallback(() => {
    window.clearTimeout(r.restartTimer);
    // Небольшая задержка: последняя (окончательная) версия фразы приходит сразу после паузы.
    r.restartTimer = window.setTimeout(() => {
      commit();
      void listenOnce();
    }, 700);
  }, [r, commit, listenOnce]);

  useEffect(() => {
    let alive = true;
    const handles: Promise<{ remove(): Promise<void> }>[] = [];
    SpeechRecognition.available()
      .then(({ available: ok }) => alive && setAvailable(ok))
      .catch(() => alive && setAvailable(false));
    handles.push(
      SpeechRecognition.addListener('partialResults', ({ matches }) => {
        const best = matches?.[0];
        if (best) {
          r.current = best;
          setPartial(best);
        }
      }),
      SpeechRecognition.addListener('listeningState', ({ status }) => {
        if (status === 'stopped' && r.running) scheduleRestart();
      }),
    );
    return () => {
      alive = false;
      handles.forEach((h) => void h.then((x) => x.remove()));
    };
  }, [r, scheduleRestart]);

  // Сторож: если распознавание тихо остановилось из-за ошибки (например, долгая тишина),
  // запускаем его снова.
  const startWatchdog = useCallback(() => {
    window.clearInterval(r.watchdog);
    r.watchdog = window.setInterval(async () => {
      if (!r.running || r.starting) return;
      try {
        const { listening } = await SpeechRecognition.isListening();
        if (!listening && r.running) scheduleRestart();
      } catch {
        // ничего
      }
    }, 3000);
  }, [r, scheduleRestart]);

  const begin = useCallback(async () => {
    r.since = Date.now();
    r.running = true;
    setNote(null);
    setState('recording');
    await listenOnce();
    startWatchdog();
    try {
      r.wake = (await navigator.wakeLock?.request('screen')) ?? null;
    } catch {
      // не страшно
    }
  }, [r, listenOnce, startWatchdog]);

  const halt = useCallback(async () => {
    if (r.running) r.acc += Date.now() - r.since;
    r.running = false;
    window.clearInterval(r.watchdog);
    window.clearTimeout(r.restartTimer);
    setElapsedMs(r.acc);
    try {
      await SpeechRecognition.stop();
    } catch {
      // уже остановлено
    }
    await new Promise((res) => setTimeout(res, 700));
    commit();
  }, [r, commit]);

  const start = useCallback(
    async (subj: string) => {
      if (r.meta) throw new Error('micBusy');
      if (available === false) throw new Error('nativeNoSpeech');
      const perm = await SpeechRecognition.requestPermissions().catch(() => null);
      if (perm?.speechRecognition !== 'granted') throw new Error('micDenied');
      r.text = '';
      r.current = '';
      r.acc = 0;
      r.meta = { subject: subj, startedAt: Date.now(), elapsedMs: 0, mime: 'text', text: '' };
      setText('');
      setPartial('');
      setSubject(subj);
      saveDraft();
      window.clearInterval(r.timer);
      r.timer = window.setInterval(() => setElapsedMs(elapsed()), 500);
      await begin();
    },
    [r, available, begin, saveDraft],
  );

  const pause = useCallback(() => {
    if (state !== 'recording') return;
    setState('paused');
    void halt();
  }, [state, halt]);

  const resume = useCallback(() => {
    if (state !== 'paused') return;
    void begin();
  }, [state, begin]);

  const reset = useCallback(() => {
    window.clearInterval(r.timer);
    window.clearInterval(r.watchdog);
    window.clearTimeout(r.restartTimer);
    void r.wake?.release().catch(() => {});
    r.meta = null;
    r.text = '';
    r.current = '';
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
    await halt();
    const durationSec = Math.round(r.acc / 1000);
    const result = { text: r.text.trim(), durationSec, subject: meta.subject };
    reset();
    return result;
  }, [r, halt, reset]);

  const discard = useCallback(async () => {
    r.running = false;
    await SpeechRecognition.stop().catch(() => {});
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
