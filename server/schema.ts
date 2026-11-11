// «Схема» — точное описание формы ответа ИИ. Благодаря ей ИИ возвращает
// не свободный текст, а аккуратные данные: список мыслей, тест, карточки…

import { z } from 'zod';
import type { ChatAnswer, Notes } from '../shared/types.ts';

export const NotesSchema = z.object({
  title: z.string(),
  description: z.string(),
  keyPoints: z.array(z.object({ text: z.string(), uncertain: z.boolean() })),
  definitions: z.array(z.object({ term: z.string(), definition: z.string(), uncertain: z.boolean() })),
  facts: z.array(
    z.object({ kind: z.enum(['formula', 'date', 'rule']), text: z.string(), uncertain: z.boolean() }),
  ),
  examples: z.array(z.string()),
  summary: z.string(),
  homework: z.object({ found: z.boolean(), task: z.string(), due: z.string() }),
  quiz: z.array(
    z.object({
      question: z.string(),
      options: z.array(z.string()),
      correctIndex: z.number(),
      explanation: z.string(),
    }),
  ),
  flashcards: z.array(z.object({ front: z.string(), back: z.string() })),
  reviewTopics: z.array(z.string()),
});

export const ChatSchema = z.object({
  fromLesson: z.string(),
  extra: z.string(),
});

/** Наводит порядок в ответе ИИ: убирает пустое и сломанные вопросы теста. */
export function cleanNotes(raw: z.infer<typeof NotesSchema>): Notes {
  const quiz = raw.quiz
    .filter(
      (q) =>
        q.question.trim() &&
        q.options.length === 4 &&
        q.options.every((o) => o.trim()) &&
        Number.isInteger(q.correctIndex) &&
        q.correctIndex >= 0 &&
        q.correctIndex < 4,
    )
    .slice(0, 10);
  const homeworkFound = raw.homework.found && raw.homework.task.trim().length > 0;
  return {
    title: raw.title.trim(),
    description: raw.description.trim(),
    keyPoints: raw.keyPoints.filter((k) => k.text.trim()).slice(0, 10),
    definitions: raw.definitions.filter((d) => d.term.trim() && d.definition.trim()).slice(0, 20),
    facts: raw.facts.filter((f) => f.text.trim()).slice(0, 20),
    examples: raw.examples.filter((e) => e.trim()).slice(0, 10),
    summary: raw.summary.trim(),
    homework: {
      found: homeworkFound,
      task: homeworkFound ? raw.homework.task.trim() : '',
      due: homeworkFound ? raw.homework.due.trim() : '',
    },
    quiz,
    flashcards: raw.flashcards.filter((c) => c.front.trim() && c.back.trim()).slice(0, 20),
    reviewTopics: raw.reviewTopics.filter((t) => t.trim()).slice(0, 6),
  };
}

export function cleanChat(raw: z.infer<typeof ChatSchema>): ChatAnswer {
  return { fromLesson: raw.fromLesson.trim(), extra: raw.extra.trim() };
}
