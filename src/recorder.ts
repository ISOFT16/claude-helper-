// Запись с микрофона. Каждые 5 секунд кусочек записи сохраняется в память
// телефона, поэтому при случайном закрытии приложения запись не пропадает.

import { useCallback, useEffect, useRef, useState } from 'react';
import { saveDraftMeta, store, type DraftMeta } from './db.ts';

export type RecState = 'idle' | 'recording' | 'paused';

/** Результат записи: аудио (обычная версия) или сразу текст (диктовка на claude.ai). */
export interface Recorded {
  blob?: Blob;
  text?: string;
  durationSec: number;
  subject: string;
}

export interface Recorder {
  state: RecState;
  elapsedMs: number;
  /** Громкость от 0 до 1 — для индикатора микрофона. */
  level: number;
  subject: string;
  start(subject: string): Promise<void>;
  pause(): void;
  resume(): void;
  stop(): Promise<Recorded>;
  discard(): Promise<void>;
  /** Только для диктовки: распознанный текст прямо во время записи. */
  live?: {
    text: string;
    partial: string;
    note: string | null;
    available: boolean | null;
  };
}

interface Internals {
  rec?: MediaRecorder;
  stream?: MediaStream;
  audioCtx?: AudioContext;
  raf?: number;
  timer?: number;
  wake?: WakeLockSentinel;
  meta?: DraftMeta;
  acc: number; // сколько уже записано до последней паузы
  since: number; // когда запись была продолжена
  running: boolean;
  writes: Promise<unknown>;
}

export function useRecorder(): Recorder {
  const [state, setState] = useState<RecState>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [level, setLevel] = useState(0);
  const [subject, setSubject] = useState('');
  const r = useRef<Internals>({ acc: 0, since: 0, running: false, writes: Promise.resolve() }).current;

  const elapsed = () => r.acc + (r.running ? Date.now() - r.since : 0);

  const requestWake = async () => {
    try {
      r.wake = await navigator.wakeLock?.request('screen');
    } catch {
      // не страшно: экран просто может погаснуть
    }
  };

  const cleanup = useCallback(() => {
    r.stream?.getTracks().forEach((t) => t.stop());
    if (r.raf) cancelAnimationFrame(r.raf);
    if (r.timer) clearInterval(r.timer);
    void r.audioCtx?.close().catch(() => {});
    void r.wake?.release().catch(() => {});
    r.rec = r.stream = r.audioCtx = r.wake = r.meta = undefined;
    r.acc = 0;
    r.running = false;
    setState('idle');
    setElapsedMs(0);
    setLevel(0);
  }, [r]);

  useEffect(() => {
    // Если пользователь свернул и снова открыл приложение — снова просим не гасить экран.
    const onVisible = () => {
      if (document.visibilityState === 'visible' && r.rec) void requestWake();
    };
    const onUnload = (e: BeforeUnloadEvent) => {
      if (r.rec) e.preventDefault();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('beforeunload', onUnload);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('beforeunload', onUnload);
    };
  }, [r]);

  const start = useCallback(
    async (subj: string) => {
      if (r.rec) throw new Error('micBusy');
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
        throw new Error('micInsecure');
      }
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { channelCount: 1, noiseSuppression: true, autoGainControl: true },
        });
      } catch {
        throw new Error('micDenied');
      }
      const mime =
        ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((m) =>
          MediaRecorder.isTypeSupported(m),
        ) ?? '';
      await store.clearDraft();
      const rec = new MediaRecorder(stream, { mimeType: mime || undefined, audioBitsPerSecond: 32_000 });
      r.rec = rec;
      r.stream = stream;
      r.meta = { subject: subj, startedAt: Date.now(), elapsedMs: 0, mime: rec.mimeType || mime };
      r.acc = 0;
      r.since = Date.now();
      r.running = true;
      r.writes = Promise.resolve();
      saveDraftMeta(r.meta);

      rec.ondataavailable = (e) => {
        if (!e.data.size) return;
        r.writes = r.writes.then(() => store.addDraftChunk(e.data)).catch(console.error);
        if (r.meta) saveDraftMeta({ ...r.meta, elapsedMs: elapsed() });
      };
      rec.start(5000);

      // Индикатор микрофона: измеряем громкость.
      try {
        const audioCtx = new AudioContext();
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        audioCtx.createMediaStreamSource(stream).connect(analyser);
        const data = new Uint8Array(analyser.fftSize);
        let last = 0;
        const tick = (now: number) => {
          r.raf = requestAnimationFrame(tick);
          if (now - last < 100) return;
          last = now;
          analyser.getByteTimeDomainData(data);
          let sum = 0;
          for (const v of data) sum += ((v - 128) / 128) ** 2;
          setLevel(Math.min(1, Math.sqrt(sum / data.length) * 4));
        };
        r.audioCtx = audioCtx;
        r.raf = requestAnimationFrame(tick);
      } catch {
        // индикатор необязателен
      }

      r.timer = window.setInterval(() => setElapsedMs(elapsed()), 500);
      void requestWake();
      setSubject(subj);
      setState('recording');
    },
    [r],
  );

  const pause = useCallback(() => {
    if (r.rec?.state !== 'recording') return;
    r.rec.pause();
    r.acc = elapsed();
    r.running = false;
    setElapsedMs(r.acc);
    setState('paused');
  }, [r]);

  const resume = useCallback(() => {
    if (r.rec?.state !== 'paused') return;
    r.rec.resume();
    r.since = Date.now();
    r.running = true;
    setState('recording');
  }, [r]);

  const stop = useCallback(
    () =>
      new Promise<Recorded>((resolve, reject) => {
        const rec = r.rec;
        const meta = r.meta;
        if (!rec || !meta) return reject(new Error('not recording'));
        const durationSec = Math.round(elapsed() / 1000);
        rec.onstop = async () => {
          await r.writes;
          const blob = await store.draftBlob(meta.mime);
          saveDraftMeta({ ...meta, elapsedMs: durationSec * 1000 });
          cleanup();
          resolve({ blob, durationSec, subject: meta.subject });
        };
        rec.stop();
      }),
    [r, cleanup],
  );

  const discard = useCallback(async () => {
    if (r.rec) {
      r.rec.ondataavailable = null;
      r.rec.onstop = null;
      if (r.rec.state !== 'inactive') r.rec.stop();
    }
    await r.writes;
    cleanup();
    await store.clearDraft();
    saveDraftMeta(null);
  }, [r, cleanup]);

  return { state, elapsedMs, level, subject, start, pause, resume, stop, discard };
}

export function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
