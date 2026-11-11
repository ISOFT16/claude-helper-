import { useState } from 'react';
import { useApp } from '../App.tsx';
import { SUBJECTS, subjectOf } from '../i18n.ts';

/** Настройки: язык, тема, расписание, приватность и удаление данных. */
export function SettingsPage() {
  const { t, settings, updateSettings, status, wipe } = useApp();
  const [deleted, setDeleted] = useState(false);
  const days = t('days').split(',');
  const lang = settings.lang;

  const setDay = (day: number, list: string[]) =>
    updateSettings({ schedule: { ...settings.schedule, [day]: list } });

  const mode = (v: string | undefined) => (v === 'demo' ? t('modeDemo') : t('modeOn'));

  return (
    <>
      <header className="hero">
        <h1>{t('navSettings')}</h1>
      </header>

      <section className="card">
        <h2>{t('language')}</h2>
        <div className="segmented">
          <button className={lang === 'ru' ? 'is-active' : ''} onClick={() => updateSettings({ lang: 'ru' })}>
            Русский
          </button>
          <button className={lang === 'kk' ? 'is-active' : ''} onClick={() => updateSettings({ lang: 'kk' })}>
            Қазақша
          </button>
        </div>
        <h2>{t('theme')}</h2>
        <div className="segmented">
          {(['auto', 'light', 'dark'] as const).map((th) => (
            <button
              key={th}
              className={settings.theme === th ? 'is-active' : ''}
              onClick={() => updateSettings({ theme: th })}
            >
              {t(th === 'auto' ? 'themeAuto' : th === 'light' ? 'themeLight' : 'themeDark')}
            </button>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>{t('schedule')}</h2>
        {days.map((name, i) => {
          const day = i + 1;
          const list = settings.schedule[day] ?? [];
          return (
            <div key={day} className="day">
              <b>{name}</b>
              <div className="chips">
                {list.map((id, n) => (
                  <button
                    key={n}
                    className="chip"
                    onClick={() => setDay(day, list.filter((_, k) => k !== n))}
                    aria-label={`${subjectOf(id)[lang]} ✕`}
                  >
                    {subjectOf(id).emoji} {subjectOf(id)[lang]} ✕
                  </button>
                ))}
                <select
                  className="chip add"
                  value=""
                  onChange={(e) => e.target.value && setDay(day, [...list, e.target.value])}
                  aria-label={`${name}: ${t('addSubject')}`}
                >
                  <option value="">{t('addSubject')}</option>
                  {SUBJECTS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s[lang]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          );
        })}
      </section>

      <section className="card">
        <h2>{t('privacy')}</h2>
        <p className="muted">{t('privacyText')}</p>
        <label className="check big">
          <input
            type="checkbox"
            checked={settings.keepAudio}
            onChange={(e) => updateSettings({ keepAudio: e.target.checked })}
          />
          {t('keepAudio')}
        </label>
        <p className="muted small">{t('keepAudioHint')}</p>
        <button
          className="btn danger-outline"
          onClick={async () => {
            if (!confirm(t('deleteAllConfirm'))) return;
            await wipe();
            setDeleted(true);
          }}
        >
          {t('deleteAll')}
        </button>
        {deleted && <p className="ok">{t('deleted')}</p>}
      </section>

      <section className="card">
        <h2>{t('server')}</h2>
        {status ? (
          <>
            <p className="kv">
              <span>{t('serverStt')}</span>
              <b className={status.stt === 'demo' ? 'tag demo' : 'tag on'}>{mode(status.stt)}</b>
            </p>
            <p className="kv">
              <span>{t('serverLlm')}</span>
              <b className={status.llm === 'demo' ? 'tag demo' : 'tag on'}>{mode(status.llm)}</b>
            </p>
          </>
        ) : (
          <p className="error">{t('serverOffline')}</p>
        )}
        <label className="field">
          <span>{t('accessCode')}</span>
          <input
            value={settings.accessCode}
            onChange={(e) => updateSettings({ accessCode: e.target.value })}
            autoComplete="off"
          />
        </label>
        <p className="muted small">{t('accessCodeHint')}</p>
      </section>

      <p className="muted small center">Умный урок — AI School · v0.1</p>
    </>
  );
}
