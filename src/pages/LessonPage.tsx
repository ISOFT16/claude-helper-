import { go, swap, useApp } from '../App.tsx';
import { Cards } from '../components/Cards.tsx';
import { Chat } from '../components/Chat.tsx';
import { HomeworkCard } from '../components/HomeworkCard.tsx';
import { Icon } from '../components/Icon.tsx';
import { formatDate } from '../components/LessonRow.tsx';
import { Quiz } from '../components/Quiz.tsx';
import { store } from '../db.ts';
import { errorText, subjectOf, type Key } from '../i18n.ts';
import type { Lesson, Stage } from '../types.ts';

const TABS: { id: string; label: Key }[] = [
  { id: 'notes', label: 'tabNotes' },
  { id: 'homework', label: 'tabHomework' },
  { id: 'chat', label: 'tabChat' },
  { id: 'quiz', label: 'tabQuiz' },
  { id: 'cards', label: 'tabCards' },
  { id: 'text', label: 'tabText' },
];

const STAGES: { id: Stage; label: Key }[] = [
  { id: 'upload', label: 'stageUpload' },
  { id: 'stt', label: 'stageStt' },
  { id: 'notes', label: 'stageNotes' },
];

export function LessonPage({ id, tab = 'notes' }: { id?: string; tab?: string }) {
  const { t, settings, lessons, loaded, stages, processLesson, deleteLesson, saveLesson, ask } = useApp();
  const lesson = lessons.find((l) => l.id === id);

  if (!lesson) {
    return (
      <>
        <BackBar />
        {loaded && <p className="muted center">{t('nothingFound')}</p>}
      </>
    );
  }
  const subj = subjectOf(lesson.subject);
  const remove = async () => {
    if (!(await ask(t('deleteLessonConfirm'), t('deleteLesson')))) return;
    await deleteLesson(lesson.id);
    go('/diary');
  };

  // ----- Урок ещё обрабатывается -----
  if (lesson.status === 'processing') {
    const current = STAGES.findIndex((s) => s.id === (stages[lesson.id] ?? 'upload'));
    return (
      <>
        <BackBar />
        <div className="card center processing">
          <div className="spinner" />
          <h2>
            {subj.emoji} {subj[settings.lang]}
          </h2>
          <ol className="steps">
            {STAGES.map((s, i) => (
              <li key={s.id} className={i < current ? 'is-done' : i === current ? 'is-now' : ''}>
                {t(s.label)}
              </li>
            ))}
          </ol>
          <p className="muted small">{t('stageHint')}</p>
        </div>
      </>
    );
  }

  // ----- Ошибка -----
  if (lesson.status === 'error' || !lesson.notes) {
    return (
      <>
        <BackBar />
        <div className="card center">
          <div className="big-score">😕</div>
          <p className="error">{errorText(t, lesson.error)}</p>
          {(lesson.hasAudio || lesson.segments.length > 0) && (
            <button className="btn primary" onClick={() => processLesson(lesson.id)}>
              {t('retry')}
            </button>
          )}
          <button className="btn ghost" onClick={remove}>
            <Icon name="trash" size={20} /> {t('deleteLesson')}
          </button>
        </div>
      </>
    );
  }

  const notes = lesson.notes;
  return (
    <>
      <BackBar />
      <header className="lesson-head">
        <p className="muted">
          {subj.emoji} {subj[settings.lang]} · {formatDate(lesson.createdAt, settings.lang)}
        </p>
        <h1>{notes.title}</h1>
      </header>

      <div className="tabs" role="tablist">
        {TABS.map((x) => (
          <button
            key={x.id}
            role="tab"
            aria-selected={tab === x.id}
            className={tab === x.id ? 'is-active' : ''}
            onClick={() => swap(`/lesson/${lesson.id}/${x.id}`)}
          >
            {t(x.label)}
          </button>
        ))}
      </div>

      {lesson.demoStt && <p className="banner demo">{t('demoBanner')}</p>}

      <div className="tab-body" key={tab}>
        {tab === 'notes' && <NotesTab lesson={lesson} />}
        {tab === 'homework' && <HomeworkCard lesson={lesson} />}
        {tab === 'chat' && <Chat lesson={lesson} />}
        {tab === 'quiz' && <Quiz lesson={lesson} />}
        {tab === 'cards' && <Cards lesson={lesson} />}
        {tab === 'text' && (
          <div className="card transcript">
            <p className="muted small">
              <mark className="unsure">abc</mark> — {t('uncertainLegend')}
            </p>
            <p>
              {lesson.segments.map((s, i) =>
                s.uncertain ? (
                  <mark key={i} className="unsure" title={t('uncertain')}>
                    {s.text}{' '}
                  </mark>
                ) : (
                  <span key={i}>{s.text} </span>
                ),
              )}
            </p>
          </div>
        )}
      </div>

      {(tab === 'notes' || tab === 'text') && (
        <footer className="lesson-foot">
          {lesson.hasAudio && (
            <p className="muted small">
              🔊 {t('audioKept')} ·{' '}
              <button
                className="link"
                onClick={async () => {
                  await store.deleteAudio(lesson.id);
                  await saveLesson({ ...lesson, hasAudio: false });
                }}
              >
                {t('deleteAudio')}
              </button>
            </p>
          )}
          <button className="link danger-text" onClick={remove}>
            {t('deleteLesson')}
          </button>
        </footer>
      )}
    </>
  );
}

function BackBar() {
  const { t } = useApp();
  return (
    <button className="back" onClick={() => go('/diary')}>
      <Icon name="back" size={20} /> {t('navDiary')}
    </button>
  );
}

function Unsure({ on }: { on: boolean }) {
  const { t } = useApp();
  return on ? <span className="unsure-tag">⚠ {t('uncertain')}</span> : null;
}

function NotesTab({ lesson }: { lesson: Lesson }) {
  const { t } = useApp();
  const n = lesson.notes!;
  const kind = { formula: t('formula'), date: t('date'), rule: t('rule') };
  const empty = <p className="muted">{t('emptySection')}</p>;
  return (
    <>
      {lesson.demoNotes && <p className="banner demo">{t('demoNotesBanner')}</p>}
      {n.description && <p className="lead">{n.description}</p>}

      <section className="card">
        <h2>💡 {t('keyPoints')}</h2>
        {n.keyPoints.length === 0 && empty}
        <ol className="points">
          {n.keyPoints.map((k, i) => (
            <li key={i} className={k.uncertain ? 'is-unsure' : ''}>
              {k.text} <Unsure on={k.uncertain} />
            </li>
          ))}
        </ol>
      </section>

      <section className="card">
        <h2>📖 {t('definitions')}</h2>
        {n.definitions.length === 0 && empty}
        <dl className="defs">
          {n.definitions.map((d, i) => (
            <div key={i} className={d.uncertain ? 'is-unsure' : ''}>
              <dt>{d.term}</dt>
              <dd>
                {d.definition} <Unsure on={d.uncertain} />
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="card">
        <h2>📐 {t('facts')}</h2>
        {n.facts.length === 0 && empty}
        <ul className="facts">
          {n.facts.map((f, i) => (
            <li key={i} className={f.uncertain ? 'is-unsure' : ''}>
              <span className={`tag ${f.kind}`}>{kind[f.kind]}</span>
              {f.text} <Unsure on={f.uncertain} />
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>✏️ {t('examples')}</h2>
        {n.examples.length === 0 && empty}
        <ul className="plain">
          {n.examples.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      </section>

      {n.summary && (
        <section className="card accent">
          <h2>🏁 {t('summary')}</h2>
          <p>{n.summary}</p>
        </section>
      )}
    </>
  );
}
