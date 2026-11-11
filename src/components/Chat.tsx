import { useEffect, useRef, useState } from 'react';
import { ApiError, api } from '../api.ts';
import { useApp } from '../App.tsx';
import { errorText, subjectOf, type Key } from '../i18n.ts';
import type { ChatMessage, Lesson } from '../types.ts';
import { Icon } from './Icon.tsx';

const SUGGESTIONS: Key[] = ['q1', 'q2', 'q3', 'q4', 'q5'];

/** Чат «Объясни мне»: ответ всегда делится на «из урока» и «добавка от ИИ». */
export function Chat({ lesson }: { lesson: Lesson }) {
  const { t, settings, saveLesson } = useApp();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const notes = lesson.notes;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [lesson.chat.length, busy]);

  if (!notes) return null;

  const send = async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    setText('');
    setError('');
    setBusy(true);
    const chat: ChatMessage[] = [...lesson.chat, { role: 'user', text: q }];
    await saveLesson({ ...lesson, chat });
    try {
      // Отправляем только последние сообщения — так дешевле.
      const history = chat.slice(-8).map((m) => ({ role: m.role, text: m.text }));
      const res = await api.chat(lesson.segments, notes, subjectOf(lesson.subject)[settings.lang], settings.lang, history);
      const a = res.answer;
      await saveLesson({
        ...lesson,
        chat: [
          ...chat,
          { role: 'assistant', text: [a.fromLesson, a.extra].filter(Boolean).join('\n\n'), answer: a, demo: res.demo },
        ],
      });
    } catch (e) {
      setError(errorText(t, e instanceof ApiError ? e.code : 'unknown'));
      await saveLesson({ ...lesson, chat: lesson.chat });
      setText(q);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="chat">
      {lesson.chat.length === 0 && <p className="muted center">{t('chatIntro')}</p>}
      {lesson.chat.map((m, i) =>
        m.role === 'user' ? (
          <div key={i} className="bubble me">
            {m.text}
          </div>
        ) : (
          <div key={i} className="bubble ai">
            {m.answer?.fromLesson && (
              <div className="ai-part from-lesson">
                <b>📘 {t('chatFromLesson')}</b>
                <p>{m.answer.fromLesson}</p>
              </div>
            )}
            {m.answer?.extra && (
              <div className="ai-part extra">
                <b>💡 {t('chatExtra')}</b>
                <p>{m.answer.extra}</p>
              </div>
            )}
          </div>
        ),
      )}
      {busy && <div className="bubble ai muted">{t('chatThinking')}</div>}
      {error && <p className="error">{error}</p>}

      <div className="chips">
        {SUGGESTIONS.map((k) => (
          <button key={k} className="chip" disabled={busy} onClick={() => send(t(k))}>
            {t(k)}
          </button>
        ))}
      </div>
      {lesson.chat.length > 0 && !busy && (
        <button className="link center" onClick={() => saveLesson({ ...lesson, chat: [] })}>
          {t('chatClear')}
        </button>
      )}
      <div ref={endRef} />

      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          void send(text);
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('chatPlaceholder')}
          maxLength={1000}
        />
        <button className="btn primary icon" disabled={busy || !text.trim()} aria-label={t('chatSend')}>
          <Icon name="send" />
        </button>
      </form>
    </div>
  );
}
