import { useState } from 'react';
import { go, useApp } from '../App.tsx';
import { subjectOf } from '../i18n.ts';
import type { Lesson } from '../types.ts';

/** Домашнее задание одного урока: показать, отметить сделанным, исправить вручную. */
export function HomeworkCard({ lesson, showLink }: { lesson: Lesson; showLink?: boolean }) {
  const { t, settings, saveLesson } = useApp();
  const notes = lesson.notes;
  const [editing, setEditing] = useState(false);
  const [task, setTask] = useState('');
  const [due, setDue] = useState('');
  if (!notes) return null;
  const hw = notes.homework;
  const subj = subjectOf(lesson.subject);

  const startEdit = () => {
    setTask(hw.task);
    setDue(hw.due);
    setEditing(true);
  };
  const save = async () => {
    const clean = task.trim();
    await saveLesson({
      ...lesson,
      notes: { ...notes, homework: { found: !!clean, task: clean, due: clean ? due.trim() : '' } },
    });
    setEditing(false);
  };

  return (
    <div className={`card hw ${lesson.homeworkDone ? 'is-done' : ''}`}>
      <div className="hw-head">
        <span className="chip-static">
          {subj.emoji} {subj[settings.lang]}
        </span>
        {showLink && (
          <button className="link" onClick={() => go(`/lesson/${lesson.id}`)}>
            {notes.title} ›
          </button>
        )}
      </div>

      {editing ? (
        <>
          <label className="field">
            <span>{t('hwTask')}</span>
            <textarea value={task} onChange={(e) => setTask(e.target.value)} rows={3} autoFocus />
          </label>
          <label className="field">
            <span>{t('hwDue')}</span>
            <input value={due} onChange={(e) => setDue(e.target.value)} />
          </label>
          <div className="btn-row">
            <button className="btn ghost" onClick={() => setEditing(false)}>
              {t('cancel')}
            </button>
            <button className="btn primary" onClick={save}>
              {t('save')}
            </button>
          </div>
        </>
      ) : hw.found ? (
        <>
          <p className="hw-task">{hw.task}</p>
          <p className="muted">
            {t('hwDue')}: {hw.due || t('hwNoDue')}
          </p>
          <div className="btn-row">
            <label className="check">
              <input
                type="checkbox"
                checked={lesson.homeworkDone}
                onChange={(e) => saveLesson({ ...lesson, homeworkDone: e.target.checked })}
              />
              {t('hwDone')}
            </label>
            <button className="btn ghost small" onClick={startEdit}>
              {t('hwEdit')}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="hw-task">{t('hwNotFound')}</p>
          <p className="muted">{t('hwNotFoundHint')}</p>
          <button className="btn ghost" onClick={startEdit}>
            {t('hwAdd')}
          </button>
        </>
      )}
    </div>
  );
}
