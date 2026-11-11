import { useState } from 'react';
import { useApp } from '../App.tsx';
import type { Lesson } from '../types.ts';

/** Тест: один ответ из четырёх, объяснение после каждого вопроса, итог в конце. */
export function Quiz({ lesson }: { lesson: Lesson }) {
  const { t, saveLesson } = useApp();
  const quiz = lesson.notes?.quiz ?? [];
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);

  if (quiz.length === 0) return <p className="muted center">{t('quizEmpty')}</p>;

  const best = lesson.quizResults.reduce((m, r) => Math.max(m, Math.round((r.score / r.total) * 100)), -1);

  const restart = () => {
    setIndex(0);
    setPicked(null);
    setScore(0);
    setDone(false);
  };

  if (done) {
    const percent = Math.round((score / quiz.length) * 100);
    return (
      <div className="card center quiz-result">
        <h2>{t('quizResult')}</h2>
        <div className="big-score">
          {score} / {quiz.length}
        </div>
        <p>{percent >= 80 ? t('quizGreat') : percent >= 50 ? t('quizOk') : t('quizBad')}</p>
        {best >= 0 && <p className="muted">{t('quizBest', { a: `${best}%` })}</p>}
        <button className="btn primary" onClick={restart}>
          {t('quizAgain')}
        </button>
      </div>
    );
  }

  const q = quiz[index];
  const pick = (i: number) => {
    if (picked !== null) return;
    setPicked(i);
    if (i === q.correctIndex) setScore((s) => s + 1);
  };
  const next = async () => {
    if (index + 1 < quiz.length) {
      setIndex(index + 1);
      setPicked(null);
      return;
    }
    setDone(true);
    await saveLesson({
      ...lesson,
      quizResults: [...lesson.quizResults, { date: Date.now(), score, total: quiz.length }],
    });
  };

  return (
    <div className="quiz">
      <div className="progress">
        <div style={{ width: `${(index / quiz.length) * 100}%` }} />
      </div>
      <p className="muted">{t('quizQuestion', { a: index + 1, b: quiz.length })}</p>
      <h2 className="question">{q.question}</h2>
      <div className="options">
        {q.options.map((o, i) => {
          let cls = 'option';
          if (picked !== null) {
            if (i === q.correctIndex) cls += ' is-right';
            else if (i === picked) cls += ' is-wrong';
          }
          return (
            <button key={i} className={cls} onClick={() => pick(i)} disabled={picked !== null}>
              <span className="option-letter">{'ABCD'[i]}</span>
              {o}
            </button>
          );
        })}
      </div>
      {picked !== null && (
        <div className={`card feedback ${picked === q.correctIndex ? 'is-right' : 'is-wrong'}`}>
          <b>
            {picked === q.correctIndex ? t('quizRight') : t('quizWrong', { a: q.options[q.correctIndex] })}
          </b>
          {q.explanation && <p>{q.explanation}</p>}
          <button className="btn primary" onClick={next}>
            {index + 1 < quiz.length ? t('next') : t('quizResult')}
          </button>
        </div>
      )}
    </div>
  );
}
