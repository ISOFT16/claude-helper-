import { go, useApp } from '../App.tsx';
import { HomeworkCard } from '../components/HomeworkCard.tsx';
import { Icon } from '../components/Icon.tsx';
import { formatDate, LessonRow } from '../components/LessonRow.tsx';
import { subjectOf } from '../i18n.ts';
import { formatTime } from '../recorder.ts';

/** Главный экран: расписание на сегодня, кнопка записи, задания и последние конспекты. */
export function Home() {
  const { t, settings, lessons, draft, restoreDraft, discardDraft, rec } = useApp();
  const weekday = new Date().getDay(); // 0 = воскресенье
  const today = settings.schedule[weekday] ?? [];
  const hasSchedule = Object.values(settings.schedule).some((d) => d.length > 0);
  const ready = lessons.filter((l) => l.status === 'ready' && l.notes);
  const homework = ready.filter((l) => l.notes!.homework.found && !l.homeworkDone);

  const results = ready.flatMap((l) => l.quizResults.slice(-1));
  const avg = results.length
    ? Math.round((results.reduce((s, r) => s + r.score / r.total, 0) / results.length) * 100)
    : null;
  const known = ready.reduce((s, l) => s + Object.values(l.cards).filter((v) => v === 'know').length, 0);

  return (
    <>
      <header className="hero">
        <p className="muted">{formatDate(Date.now(), settings.lang)}</p>
        <h1>{t('hello')} 👋</h1>
      </header>

      {draft && (
        <div className="card warn">
          <b>
            {t('draftFound')} · {subjectOf(draft.subject)[settings.lang]} · {formatTime(draft.elapsedMs)}
          </b>
          <div className="btn-row">
            <button className="btn ghost" onClick={discardDraft}>
              {t('draftDelete')}
            </button>
            <button className="btn primary" onClick={restoreDraft}>
              {t('draftMake')}
            </button>
          </div>
        </div>
      )}

      <button className="record-cta" onClick={() => go('/record')}>
        <span className="record-cta-icon">
          <Icon name="mic" size={30} />
        </span>
        <span>
          <b>{rec.state === 'idle' ? t('recordLesson') : `${t('recording')} · ${formatTime(rec.elapsedMs)}`}</b>
          <small>{t('uploadAudio')}</small>
        </span>
      </button>

      <section>
        <h2>{t('todayLessons')}</h2>
        {today.length > 0 ? (
          <div className="chips scroll">
            {today.map((id, i) => {
              const s = subjectOf(id);
              return (
                <button key={i} className="chip big" onClick={() => go(`/record/${id}`)}>
                  <span>{s.emoji}</span> {s[settings.lang]}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="muted">{hasSchedule ? t('noLessonsToday') : t('noSchedule')}</p>
        )}
      </section>

      {ready.length > 0 && (
        <div className="stats">
          <div>
            <b>{ready.length}</b>
            <span>{t('statLessons')}</span>
          </div>
          <div>
            <b>{avg === null ? '—' : `${avg}%`}</b>
            <span>{t('statQuiz')}</span>
          </div>
          <div>
            <b>{known}</b>
            <span>{t('statCards')}</span>
          </div>
        </div>
      )}

      <section>
        <div className="section-head">
          <h2>{t('homework')}</h2>
          {homework.length > 0 && (
            <button className="link" onClick={() => go('/homework')}>
              {t('all')} ›
            </button>
          )}
        </div>
        {homework.length === 0 && <p className="muted">{t('noHomework')}</p>}
        {homework.slice(0, 2).map((l) => (
          <HomeworkCard key={l.id} lesson={l} showLink />
        ))}
      </section>

      <section>
        <div className="section-head">
          <h2>{t('recentNotes')}</h2>
          {lessons.length > 3 && (
            <button className="link" onClick={() => go('/diary')}>
              {t('all')} ›
            </button>
          )}
        </div>
        {lessons.length === 0 && <p className="muted">{t('noNotes')}</p>}
        <div className="list">
          {lessons.slice(0, 3).map((l) => (
            <LessonRow key={l.id} lesson={l} />
          ))}
        </div>
      </section>
    </>
  );
}
