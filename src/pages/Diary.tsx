import { useMemo, useState } from 'react';
import { useApp } from '../App.tsx';
import { Icon } from '../components/Icon.tsx';
import { LessonRow } from '../components/LessonRow.tsx';
import { subjectOf } from '../i18n.ts';
import type { Lesson } from '../types.ts';

/** Учебный дневник: все уроки, поиск по темам и список «что повторить». */
export function Diary() {
  const { t, settings, lessons } = useApp();
  const [query, setQuery] = useState('');
  const [subject, setSubject] = useState('');
  const lang = settings.lang;

  const subjects = useMemo(() => [...new Set(lessons.map((l) => l.subject))], [lessons]);

  const found = useMemo(() => {
    const q = query.trim().toLowerCase();
    return lessons.filter((l) => {
      if (subject && l.subject !== subject) return false;
      if (!q) return true;
      const n = l.notes;
      const haystack = [
        subjectOf(l.subject)[lang],
        n?.title,
        n?.description,
        n?.summary,
        ...(n?.keyPoints.map((k) => k.text) ?? []),
        ...(n?.definitions.map((d) => d.term) ?? []),
        ...(n?.reviewTopics ?? []),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [lessons, query, subject, lang]);

  // Что повторить: уроки без теста, с низким баллом или с карточками «Повторить».
  const review = useMemo(() => {
    const out: { lesson: Lesson; reason: string }[] = [];
    for (const l of lessons) {
      if (l.status !== 'ready' || !l.notes) continue;
      const reasons: string[] = [];
      const last = l.quizResults[l.quizResults.length - 1];
      if (l.notes.quiz.length > 0) {
        if (!last) reasons.push(t('reasonNoQuiz'));
        else if (last.score / last.total < 0.7) {
          reasons.push(t('reasonLowQuiz', { a: Math.round((last.score / last.total) * 100) }));
        }
      }
      const repeat = Object.values(l.cards).filter((v) => v === 'repeat').length;
      if (repeat) reasons.push(t('reasonCards', { a: repeat }));
      if (reasons.length) {
        const topics = l.notes.reviewTopics.slice(0, 3).join(', ');
        out.push({ lesson: l, reason: reasons.join(' · ') + (topics ? ` — ${topics}` : '') });
      }
    }
    return out.slice(0, 5);
  }, [lessons, t]);

  return (
    <>
      <header className="hero">
        <h1>{t('navDiary')}</h1>
      </header>

      <label className="search">
        <Icon name="search" size={20} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('search')} type="search" />
      </label>

      {subjects.length > 1 && (
        <div className="chips scroll">
          <button className={`chip ${subject === '' ? 'is-active' : ''}`} onClick={() => setSubject('')}>
            {t('all')}
          </button>
          {subjects.map((id) => (
            <button key={id} className={`chip ${subject === id ? 'is-active' : ''}`} onClick={() => setSubject(id)}>
              {subjectOf(id).emoji} {subjectOf(id)[lang]}
            </button>
          ))}
        </div>
      )}

      {!query && !subject && lessons.length > 0 && (
        <section>
          <h2>🔁 {t('review')}</h2>
          {review.length === 0 && <p className="muted">{t('reviewNone')}</p>}
          <div className="list">
            {review.map((r) => (
              <LessonRow key={r.lesson.id} lesson={r.lesson} note={r.reason} />
            ))}
          </div>
        </section>
      )}

      <section>
        {!query && !subject && lessons.length > 0 && <h2>{t('recentNotes')}</h2>}
        {lessons.length === 0 && <p className="muted">{t('noNotes')}</p>}
        {lessons.length > 0 && found.length === 0 && <p className="muted">{t('nothingFound')}</p>}
        <div className="list">
          {found.map((l) => (
            <LessonRow key={l.id} lesson={l} />
          ))}
        </div>
      </section>
    </>
  );
}
