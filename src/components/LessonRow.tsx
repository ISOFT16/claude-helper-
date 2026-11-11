import { go, useApp } from '../App.tsx';
import { subjectOf } from '../i18n.ts';
import type { Lesson } from '../types.ts';

const KK_MONTHS = ['қаңтар', 'ақпан', 'наурыз', 'сәуір', 'мамыр', 'маусым', 'шілде', 'тамыз', 'қыркүйек', 'қазан', 'қараша', 'желтоқсан'];
const KK_DAYS = ['жс', 'дс', 'сс', 'ср', 'бс', 'жм', 'сб'];

export function formatDate(ts: number, lang: string): string {
  const d = new Date(ts);
  // Не все браузеры умеют писать даты по-казахски, поэтому названия заданы здесь.
  if (lang === 'kk') return `${KK_DAYS[d.getDay()]}, ${d.getDate()} ${KK_MONTHS[d.getMonth()]}`;
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'short' });
}

/** Строка урока в списках (главная и дневник). */
export function LessonRow({ lesson, note }: { lesson: Lesson; note?: string }) {
  const { t, settings } = useApp();
  const subj = subjectOf(lesson.subject);
  const title =
    lesson.status === 'ready'
      ? lesson.notes?.title || subj[settings.lang]
      : lesson.status === 'processing'
        ? t('processing')
        : t('failed');
  return (
    <button className="row" onClick={() => go(`/lesson/${lesson.id}`)}>
      <span className="row-emoji">{subj.emoji}</span>
      <span className="row-main">
        <span className="row-title">{title}</span>
        <span className="row-sub">
          {subj[settings.lang]} · {formatDate(lesson.createdAt, settings.lang)}
          {lesson.durationSec > 0 && ` · ${Math.max(1, Math.round(lesson.durationSec / 60))} ${t('minutes')}`}
        </span>
        {note && <span className="row-note">{note}</span>}
      </span>
    </button>
  );
}
