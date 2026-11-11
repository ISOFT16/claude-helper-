// ДЕМО-режим: работает без ключей и без ИИ, чтобы приложение можно было
// попробовать сразу. Вместо распознавания подставляется учебный пример урока,
// а «конспект» собирается простыми правилами из готового текста (ничего не выдумывая).

import type { ChatAnswer, Lang, Notes, Segment } from '../shared/types.ts';

const SAMPLE: Record<Lang, Segment[]> = {
  ru: [
    { text: 'Здравствуйте, ребята. Тема сегодняшнего урока — площадь прямоугольника и квадрата.' },
    { text: 'Площадь — это величина, которая показывает, сколько места занимает фигура на плоскости.' },
    { text: 'Прямоугольник — это четырёхугольник, у которого все углы прямые.' },
    { text: 'Квадрат — это прямоугольник, у которого все стороны равны.' },
    { text: 'Чтобы найти площадь прямоугольника, нужно длину умножить на ширину. Формула: S = a · b.' },
    { text: 'Площадь квадрата равна стороне, умноженной на саму себя. Формула: S = a · a.' },
    { text: 'Площадь измеряется в квадратных единицах: квадратных сантиметрах, квадратных метрах.' },
    { text: 'Например, если длина комнаты 5 метров, а ширина 4 метра, то её площадь равна 20 квадратным метрам.' },
    { text: 'Например, у квадрата со стороной 3 сантиметра площадь равна 9 квадратным сантиметрам.' },
    { text: 'Периметр квадрата со стороной кажется шесть будет двадцать с чем-то.', uncertain: true },
    { text: 'Запомните правило: площадь и периметр — это разные величины, их нельзя путать.' },
    { text: 'Запишите домашнее задание: параграф 18, номера 571 и 573, сдать к четвергу.' },
    { text: 'Итак, сегодня мы узнали, что такое площадь и как её находить для прямоугольника и квадрата.' },
  ],
  kk: [
    { text: 'Сәлеметсіздер ме, балалар. Бүгінгі сабақтың тақырыбы — тіктөртбұрыш пен шаршының ауданы.' },
    { text: 'Аудан — бұл фигураның жазықтықта қанша орын алатынын көрсететін шама.' },
    { text: 'Тіктөртбұрыш — бұл барлық бұрыштары тік болатын төртбұрыш.' },
    { text: 'Шаршы — бұл барлық қабырғалары тең тіктөртбұрыш.' },
    { text: 'Тіктөртбұрыштың ауданын табу үшін ұзындығын еніне көбейту керек. Формула: S = a · b.' },
    { text: 'Шаршының ауданы қабырғасын өзіне көбейткенге тең. Формула: S = a · a.' },
    { text: 'Аудан квадрат бірліктермен өлшенеді: квадрат сантиметр, квадрат метр.' },
    { text: 'Мысалы, бөлменің ұзындығы 5 метр, ені 4 метр болса, оның ауданы 20 квадрат метрге тең.' },
    { text: 'Мысалы, қабырғасы 3 сантиметр шаршының ауданы 9 квадрат сантиметрге тең.' },
    { text: 'Қабырғасы алты сияқты шаршының периметрі жиырма шамасында болады.', uncertain: true },
    { text: 'Ережені есте сақтаңдар: аудан мен периметр — әртүрлі шамалар, оларды шатастыруға болмайды.' },
    { text: 'Үй тапсырмасын жазып алыңдар: 18-параграф, 571 және 573 нөмірлер, бейсенбіге дейін тапсыру.' },
    { text: 'Сонымен, бүгін біз ауданның не екенін және оны қалай табуға болатынын білдік.' },
  ],
};

export function demoSegments(lang: Lang): Segment[] {
  return SAMPLE[lang].map((s) => ({ ...s }));
}

const L = {
  ru: {
    whatIs: (t: string) => `Что такое «${t}»?`,
    explain: (t: string) => `Так на уроке было дано определение: ${t}.`,
    lesson: 'Урок',
    desc: 'Демо-конспект: собран простыми правилами без ИИ.',
    homework: /домашн|на дом\b|задани[ея] на/i,
    due: /(?:сдать\s+)?(к\s+[а-яё]+(?:\s+уроку)?|до\s+[а-яё0-9 ]+|на завтра|завтра)/i,
    example: /^например|к примеру/i,
    rule: /правил|запомните/i,
    notFound: 'В расшифровке урока я не нашёл ничего похожего на этот вопрос.',
    found: 'Вот что говорилось на уроке:',
    extra: 'Это демо-режим: дополнительные объяснения появятся, когда к серверу подключат ИИ (см. README).',
  },
  kk: {
    whatIs: (t: string) => `«${t}» дегеніміз не?`,
    explain: (t: string) => `Сабақта осындай анықтама берілді: ${t}.`,
    lesson: 'Сабақ',
    desc: 'Демо-конспект: ЖИ-сіз, қарапайым ережелермен жиналған.',
    homework: /үй тапсырма|үйге/i,
    due: /([а-яәіңғүұқөһё]+ге дейін|ертеңге)/i,
    example: /^мысалы/i,
    rule: /ереже|есте сақта/i,
    notFound: 'Сабақ мәтінінен бұл сұраққа ұқсас ештеңе таппадым.',
    found: 'Сабақта былай айтылды:',
    extra: 'Бұл демо-режим: қосымша түсіндірмелер серверге ЖИ қосылғанда пайда болады (README қараңыз).',
  },
};

function splitSentences(segments: Segment[]): Segment[] {
  const out: Segment[] = [];
  for (const s of segments) {
    for (const part of s.text.split(/(?<=[.!?…])\s+(?=[А-ЯЁӘІҢҒҮҰҚӨҺA-Z])/u)) {
      if (part.trim()) out.push({ text: part.trim(), uncertain: s.uncertain });
    }
  }
  return out;
}

export function demoNotes(segments: Segment[], subject: string, lang: Lang): Notes {
  const l = L[lang];
  const sentences = splitSentences(segments);
  const definitions: Notes['definitions'] = [];
  const facts: Notes['facts'] = [];
  const examples: string[] = [];
  const keyPoints: Notes['keyPoints'] = [];
  const homework = { found: false, task: '', due: '' };

  for (const s of sentences) {
    const uncertain = !!s.uncertain;
    if (l.homework.test(s.text)) {
      homework.found = true;
      homework.task = (homework.task + ' ' + s.text).trim();
      const due = s.text.match(l.due);
      if (due && !homework.due) homework.due = due[1].replace(/[.,!]+$/, '');
      continue;
    }
    if (l.example.test(s.text)) {
      examples.push(s.text);
      continue;
    }
    const def = s.text.match(/^([^—.,:]{2,40}?)\s+—\s+(?:это|бұл)\s+(.+?)[.!]?$/u);
    if (def) {
      definitions.push({ term: def[1].trim(), definition: def[2].trim(), uncertain });
    }
    if (/[=]/.test(s.text)) facts.push({ kind: 'formula', text: s.text, uncertain });
    else if (/\b1\d{3}\b|\b20\d{2}\b/.test(s.text)) facts.push({ kind: 'date', text: s.text, uncertain });
    else if (l.rule.test(s.text)) facts.push({ kind: 'rule', text: s.text, uncertain });
    if (s.text.length > 25 && keyPoints.length < 8) keyPoints.push({ text: s.text, uncertain });
  }

  const sure = definitions.filter((d) => !d.uncertain);
  const quiz: Notes['quiz'] = [];
  if (sure.length >= 4) {
    sure.slice(0, 10).forEach((d, i) => {
      const wrong = sure.filter((x) => x !== d).slice(0, 3).map((x) => x.definition);
      const pos = i % 4;
      const options = [...wrong];
      options.splice(pos, 0, d.definition);
      quiz.push({
        question: l.whatIs(d.term),
        options,
        correctIndex: pos,
        explanation: l.explain(`${d.term} — ${d.definition}`),
      });
    });
  }

  const title = (sentences.find((s) => /тема|тақырыб/i.test(s.text))?.text ?? `${l.lesson}: ${subject}`)
    .replace(/^.*?(?:—|:)\s*/u, '')
    .replace(/[.!]$/, '');

  return {
    title: title.charAt(0).toUpperCase() + title.slice(1),
    description: l.desc,
    keyPoints,
    definitions,
    facts,
    examples,
    summary: sentences.length ? sentences[sentences.length - 1].text : '',
    homework,
    quiz,
    flashcards: [
      ...sure.map((d) => ({ front: d.term, back: d.definition })),
    ].slice(0, 12),
    reviewTopics: sure.slice(0, 4).map((d) => d.term),
  };
}

/** Демо-чат: просто ищет в уроке предложения, похожие на вопрос. */
export function demoChat(question: string, lessonText: string, lang: Lang): ChatAnswer {
  const l = L[lang];
  const words = question
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 3)
    .map((w) => w.slice(0, 5));
  const sentences = lessonText.split(/(?<=[.!?])\s+/).filter((s) => s.trim());
  const scored = sentences
    .map((s) => ({ s, score: words.filter((w) => s.toLowerCase().includes(w)).length }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  return {
    fromLesson: scored.length ? `${l.found}\n${scored.map((x) => '• ' + x.s).join('\n')}` : l.notFound,
    extra: l.extra,
  };
}
