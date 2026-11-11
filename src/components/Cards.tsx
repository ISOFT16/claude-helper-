import { useState } from 'react';
import { useApp } from '../App.tsx';
import type { Lesson } from '../types.ts';

/** Карточки для запоминания: нажми — перевернётся; «Знаю» убирает карточку из колоды. */
export function Cards({ lesson }: { lesson: Lesson }) {
  const { t, saveLesson } = useApp();
  const cards = lesson.notes?.flashcards ?? [];
  const [flipped, setFlipped] = useState(false);
  const [pos, setPos] = useState(0);

  if (cards.length === 0) return <p className="muted center">{t('cardsEmpty')}</p>;

  // В колоде остаются карточки, которые ещё не отмечены «Знаю».
  const left = cards.map((_, i) => i).filter((i) => lesson.cards[i] !== 'know');

  if (left.length === 0) {
    return (
      <div className="card center">
        <div className="big-score">🎉</div>
        <p>{t('cardsDone')}</p>
        <button className="btn primary" onClick={() => saveLesson({ ...lesson, cards: {} })}>
          {t('cardsReset')}
        </button>
      </div>
    );
  }

  const current = left[pos % left.length];
  const card = cards[current];

  const mark = async (value: 'know' | 'repeat') => {
    setFlipped(false);
    // «Повторить» — переходим к следующей; «Знаю» — карточка уходит, позиция остаётся.
    if (value === 'repeat') setPos((pos + 1) % left.length);
    else setPos(left.length > 1 ? pos % (left.length - 1) : 0);
    await saveLesson({ ...lesson, cards: { ...lesson.cards, [current]: value } });
  };

  return (
    <div className="cards">
      <p className="muted center">{t('cardsLeft', { a: left.length, b: cards.length })}</p>
      <button
        className={`flashcard ${flipped ? 'is-flipped' : ''}`}
        onClick={() => setFlipped(!flipped)}
        key={current}
      >
        <span className="flash-face flash-front">
          {card.front}
          <small>{t('cardTap')}</small>
        </span>
        <span className="flash-face flash-back">{card.back}</span>
      </button>
      <div className="btn-row big">
        <button className="btn repeat" onClick={() => mark('repeat')}>
          ↻ {t('cardRepeat')}
        </button>
        <button className="btn know" onClick={() => mark('know')}>
          ✓ {t('cardKnow')}
        </button>
      </div>
    </div>
  );
}
