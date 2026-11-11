// Ограничители расходов. ИИ стоит денег, поэтому сервер считает,
// сколько уроков и вопросов обработано за сегодня, и останавливается на лимите.

import fs from 'node:fs';
import path from 'node:path';
import { HttpError, type Config } from './config.ts';

type Kind = 'lessons' | 'chats' | 'audioMinutes';

interface Usage {
  date: string;
  lessons: number;
  chats: number;
  audioMinutes: number;
}

const today = () => new Date().toISOString().slice(0, 10);

export class Limits {
  private file: string;
  private usage: Usage;
  private hits = new Map<string, number[]>();

  constructor(private cfg: Config) {
    this.file = path.join(cfg.dataDir, 'usage.json');
    this.usage = this.read();
  }

  private read(): Usage {
    try {
      const u = JSON.parse(fs.readFileSync(this.file, 'utf8')) as Usage;
      if (u.date === today()) return u;
    } catch {
      // файла ещё нет — это нормально
    }
    return { date: today(), lessons: 0, chats: 0, audioMinutes: 0 };
  }

  private max(kind: Kind): number {
    const l = this.cfg.limits;
    return kind === 'lessons' ? l.dailyLessons : kind === 'chats' ? l.dailyChats : l.dailyAudioMinutes;
  }

  /** Проверить, что лимит на сегодня ещё не исчерпан. */
  check(kind: Kind, amount = 1): void {
    if (this.usage.date !== today()) this.usage = this.read();
    if (this.usage[kind] + amount > this.max(kind)) {
      throw new HttpError(429, 'daily_limit', 'Дневной лимит исчерпан. Попробуйте завтра.');
    }
  }

  /** Записать расход (вызывается после успешной работы). */
  add(kind: Kind, amount = 1): void {
    if (this.usage.date !== today()) this.usage = this.read();
    this.usage[kind] += amount;
    try {
      fs.mkdirSync(this.cfg.dataDir, { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.usage));
    } catch (e) {
      console.warn('Не удалось сохранить счётчик расходов:', e);
    }
  }

  /** Защита от слишком частых запросов с одного адреса. */
  rate(ip: string): void {
    const now = Date.now();
    const list = (this.hits.get(ip) ?? []).filter((t) => now - t < 60_000);
    if (list.length >= this.cfg.limits.requestsPerMinute) {
      throw new HttpError(429, 'rate_limited', 'Слишком много запросов. Подождите минуту.');
    }
    list.push(now);
    this.hits.set(ip, list);
    if (this.hits.size > 5000) this.hits.clear();
  }
}
