import { useApp } from '../App.tsx';
import { HomeworkCard } from '../components/HomeworkCard.tsx';

/** Все домашние задания: сначала те, что нужно сделать, потом выполненные. */
export function HomeworkPage() {
  const { t, lessons } = useApp();
  const withHw = lessons.filter((l) => l.status === 'ready' && l.notes?.homework.found);
  const active = withHw.filter((l) => !l.homeworkDone);
  const done = withHw.filter((l) => l.homeworkDone);

  return (
    <>
      <header className="hero">
        <h1>{t('homework')}</h1>
      </header>
      <section>
        <h2>{t('hwActive')}</h2>
        {active.length === 0 && <p className="muted">{t('noHomework')}</p>}
        {active.map((l) => (
          <HomeworkCard key={l.id} lesson={l} showLink />
        ))}
      </section>
      {done.length > 0 && (
        <section>
          <h2>{t('hwFinished')}</h2>
          {done.map((l) => (
            <HomeworkCard key={l.id} lesson={l} showLink />
          ))}
        </section>
      )}
    </>
  );
}
