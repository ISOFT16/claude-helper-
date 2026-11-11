import 'dotenv/config';
import { createApp } from './app.ts';
import { findFfmpeg } from './audio.ts';
import { loadConfig } from './config.ts';

const cfg = loadConfig();
const server = createApp(cfg).listen(cfg.port, async () => {
  const ffmpeg = await findFfmpeg(cfg.ffmpegPath);
  console.log(`\n  Умный урок — сервер запущен: http://localhost:${cfg.port}`);
  console.log(`  Распознавание речи: ${cfg.stt.provider === 'demo' ? 'ДЕМО (нужен STT_API_KEY)' : cfg.stt.baseUrl}`);
  console.log(`  ИИ-конспект:        ${cfg.llm.provider === 'demo' ? 'ДЕМО (нужен ANTHROPIC_API_KEY)' : cfg.llm.provider}`);
  console.log(`  ffmpeg:             ${ffmpeg ?? 'не найден — длинные записи не обработать'}`);
  console.log(`  Код доступа:        ${cfg.accessCode ? 'включён' : 'выключен'}\n`);
});

// Распознавание часового урока может идти несколько минут — не обрываем соединение.
server.requestTimeout = 0;
server.headersTimeout = 0;
server.setTimeout(0);
