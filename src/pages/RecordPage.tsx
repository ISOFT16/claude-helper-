import { useEffect, useRef, useState } from 'react';
import { useApp } from '../App.tsx';
import { Icon } from '../components/Icon.tsx';
import { STANDALONE } from '../env.ts';
import { SUBJECTS, subjectOf, type Key } from '../i18n.ts';
import { formatTime } from '../recorder.ts';

const START_ERRORS = [
  'micDenied',
  'micInsecure',
  'micBusy',
  'dictUnavailable',
  'dictNoKazakh',
  'dictDismissed',
  'dictFailed',
];

/** Экран записи урока. Перед записью обязательно спрашиваем про разрешение учителя. */
export function RecordPage({ presetSubject }: { presetSubject?: string }) {
  const { t, settings, rec, status, createLesson, finishRecording, ask } = useApp();
  const [subject, setSubject] = useState(
    SUBJECTS.some((s) => s.id === presetSubject) ? presetSubject! : 'math',
  );
  const [consentFor, setConsentFor] = useState<'record' | 'upload' | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const liveRef = useRef<HTMLDivElement>(null);
  // Диктовка на claude.ai длится не больше 60 минут за раз.
  const maxMinutes = STANDALONE ? 60 : (status?.maxMinutes ?? 75);
  const live = rec.live;
  const noDictation = STANDALONE && live?.available === false;

  useEffect(() => {
    const el = liveRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [live?.text, live?.partial]);

  const startError = (e: unknown) => {
    const msg = (e as Error).message;
    setError(t(START_ERRORS.includes(msg) ? (msg as Key) : 'err_unknown'));
  };

  const confirmConsent = () => {
    const mode = consentFor;
    setConsentFor(null);
    setAgreed(false);
    setError('');
    if (mode === 'upload') {
      fileRef.current?.click();
      return;
    }
    // Запуск записи — прямо из нажатия на кнопку, без ожиданий перед ним.
    rec.start(subject).catch(startError);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > (status?.maxUploadMb ?? 200) * 1024 * 1024) {
      setError(t('err_too_big'));
      return;
    }
    await createLesson({ blob: file }, subject, 0);
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

        {live ? (
          <>
            {live.note && <p className="card warn note">{t(live.note as Key)}</p>}
            <div className="live-text" ref={liveRef} aria-live="polite">
              {live.text || live.partial ? (
                <>
                  {live.text} <span className="partial">{live.partial}</span>
                </>
              ) : (
                <span className="muted">{paused ? t('paused') : t('liveWaiting')}</span>
              )}
            </div>
            <p className="muted small">{t('liveHint')}</p>
          </>
        ) : (
          <>
            <div className="meter" aria-hidden="true">
              {Array.from({ length: 16 }, (_, i) => (
                <span key={i} className={!paused && rec.level * 16 > i ? 'is-on' : ''} />
              ))}
            </div>
            <p className={`mic-state ${paused || heard ? '' : 'is-silent'}`}>
              {paused ? t('paused') : heard ? `🎙️ ${t('micWorks')}` : `⚠️ ${t('micSilent')}`}
            </p>
          </>
        )}

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
          onClick={async () => {
            if (await ask(t('discardConfirm'), t('discard'))) void rec.discard();
          }}
        >
          {t('discard')}
        </button>
      </div>
    );
  }

  // ----- Ввод текста урока вручную -----
  if (pasting) {
    return (
      <>
        <header className="hero">
          <h1>{t('pasteTitle')}</h1>
          <p className="muted">
            {subjectOf(subject).emoji} {subjectOf(subject)[settings.lang]}
          </p>
        </header>
        <label className="field">
          <span>{t('pasteHint')}</span>
          <textarea
            id="lesson-text"
            rows={12}
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            autoFocus
          />
        </label>
        <div className="btn-row">
          <button className="btn ghost" onClick={() => setPasting(false)}>
            {t('cancel')}
          </button>
          <button
            className="btn primary"
            disabled={pasted.trim().length < 40}
            onClick={() => createLesson({ text: pasted.trim() }, subject, 0)}
          >
            {t('draftMake')}
          </button>
        </div>
      </>
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

      {noDictation && <p className="card warn">{t('dictUnavailable')}</p>}
      {error && <p className="error">{error}</p>}

      <div className="sticky-actions">
        {!noDictation && (
          <button className="btn primary huge" onClick={() => setConsentFor('record')}>
            <Icon name="mic" /> {t('startLesson')}
          </button>
        )}
        {!STANDALONE && (
          <button className="btn ghost" onClick={() => setConsentFor('upload')}>
            <Icon name="upload" /> {t('uploadAudio')}
          </button>
        )}
        <button className={`btn ${noDictation ? 'primary huge' : 'ghost'}`} onClick={() => setPasting(true)}>
          <Icon name="book" /> {t('pasteText')}
        </button>
        {!STANDALONE && <p className="muted small center">{t('uploadHint')}</p>}
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
            <p>{t(STANDALONE ? 'consentTextLink' : 'consentText')}</p>
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
