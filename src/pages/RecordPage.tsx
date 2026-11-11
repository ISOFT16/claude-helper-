import { useRef, useState } from 'react';
import { useApp } from '../App.tsx';
import { Icon } from '../components/Icon.tsx';
import { SUBJECTS, subjectOf, type Key } from '../i18n.ts';
import { formatTime } from '../recorder.ts';

/** Экран записи урока. Перед записью обязательно спрашиваем про разрешение учителя. */
export function RecordPage({ presetSubject }: { presetSubject?: string }) {
  const { t, settings, rec, status, createLesson, finishRecording } = useApp();
  const [subject, setSubject] = useState(
    SUBJECTS.some((s) => s.id === presetSubject) ? presetSubject! : 'math',
  );
  const [consentFor, setConsentFor] = useState<'record' | 'upload' | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const maxMinutes = status?.maxMinutes ?? 75;

  const confirmConsent = async () => {
    const mode = consentFor;
    setConsentFor(null);
    setAgreed(false);
    setError('');
    if (mode === 'upload') {
      fileRef.current?.click();
      return;
    }
    try {
      await rec.start(subject);
    } catch (e) {
      setError(t(((e as Error).message as Key) in { micDenied: 1, micInsecure: 1, micBusy: 1 } ? ((e as Error).message as Key) : 'err_unknown'));
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > (status?.maxUploadMb ?? 200) * 1024 * 1024) {
      setError(t('err_too_big'));
      return;
    }
    await createLesson(file, subject, 0);
  };

  const finish = async () => {
    setBusy(true);
    try {
      await finishRecording();
    } finally {
      setBusy(false);
    }
  };

  // ----- Идёт запись -----
  if (rec.state !== 'idle') {
    const s = subjectOf(rec.subject);
    const paused = rec.state === 'paused';
    const heard = rec.level > 0.02;
    return (
      <div className="recording-screen">
        <div className={`rec-status ${paused ? 'is-paused' : ''}`}>
          <span className={`rec-dot ${paused ? 'is-paused' : ''}`} />
          {paused ? t('paused') : t('recording')}
        </div>
        <p className="muted">
          {s.emoji} {s[settings.lang]}
        </p>
        <div className="timer" aria-live="off">
          {formatTime(rec.elapsedMs)}
        </div>

        <div className="meter" aria-hidden="true">
          {Array.from({ length: 16 }, (_, i) => (
            <span key={i} className={!paused && rec.level * 16 > i ? 'is-on' : ''} />
          ))}
        </div>
        <p className={`mic-state ${paused || heard ? '' : 'is-silent'}`}>
          {paused ? t('paused') : heard ? `🎙️ ${t('micWorks')}` : `⚠️ ${t('micSilent')}`}
        </p>

        <div className="btn-row big">
          {paused ? (
            <button className="btn ghost" onClick={rec.resume}>
              <Icon name="play" /> {t('resume')}
            </button>
          ) : (
            <button className="btn ghost" onClick={rec.pause}>
              <Icon name="pause" /> {t('pause')}
            </button>
          )}
          <button className="btn danger" onClick={finish} disabled={busy}>
            <Icon name="stop" /> {t('finish')}
          </button>
        </div>

        <p className="muted small">{t('keepOpen')}</p>
        <p className="muted small">{t('maxLength', { n: maxMinutes })}</p>
        <button
          className="link danger-text"
          onClick={() => {
            if (confirm(t('discardConfirm'))) void rec.discard();
          }}
        >
          {t('discard')}
        </button>
      </div>
    );
  }

  // ----- Подготовка к записи -----
  return (
    <>
      <header className="hero">
        <h1>{t('recordLesson')}</h1>
        <p className="muted">{t('chooseSubject')}</p>
      </header>

      <div className="subject-grid">
        {SUBJECTS.map((s) => (
          <button
            key={s.id}
            className={`subject ${subject === s.id ? 'is-active' : ''}`}
            onClick={() => setSubject(s.id)}
            aria-pressed={subject === s.id}
          >
            <span>{s.emoji}</span>
            {s[settings.lang]}
          </button>
        ))}
      </div>

      {error && <p className="error">{error}</p>}

      <div className="sticky-actions">
        <button className="btn primary huge" onClick={() => setConsentFor('record')}>
          <Icon name="mic" /> {t('startLesson')}
        </button>
        <button className="btn ghost" onClick={() => setConsentFor('upload')}>
          <Icon name="upload" /> {t('uploadAudio')}
        </button>
        <p className="muted small center">{t('uploadHint')}</p>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="audio/*,video/webm,video/mp4,.m4a,.mp3,.wav,.ogg,.webm"
        hidden
        onChange={(e) => {
          void onFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      {consentFor && (
        <div className="sheet-backdrop" onClick={() => setConsentFor(null)}>
          <div className="sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2>🎙️ {t('consentTitle')}</h2>
            <p>{t('consentText')}</p>
            <label className="check big">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
              {t('consentCheck')}
            </label>
            <div className="btn-row">
              <button className="btn ghost" onClick={() => setConsentFor(null)}>
                {t('cancel')}
              </button>
              <button className="btn primary" disabled={!agreed} onClick={confirmConsent}>
                {t('continue')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
