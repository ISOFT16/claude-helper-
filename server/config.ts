// Настройки сервера. Все секретные ключи живут ТОЛЬКО здесь, на сервере
// (в файле .env), и никогда не попадают в браузер.

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface Config {
  port: number;
  accessCode: string;
  dataDir: string;
  ffmpegPath: string;
  llm: {
    provider: 'anthropic' | 'openai' | 'demo';
    anthropicKey: string;
    /** Запрос к Claude идёт прямо из приложения на телефоне (ключ ввёл сам пользователь). */
    browser: boolean;
    anthropicModel: string;
    apiKey: string;
    baseUrl: string;
    model: string;
  };
  stt: {
    provider: 'openai' | 'demo';
    apiKey: string;
    baseUrl: string;
    model: string;
  };
  limits: {
    maxAudioMinutes: number;
    maxUploadMb: number;
    maxTranscriptChars: number;
    chunkSeconds: number;
    dailyLessons: number;
    dailyChats: number;
    dailyAudioMinutes: number;
    requestsPerMinute: number;
  };
}

type Env = Record<string, string | undefined>;

function num(env: Env, key: string, fallback: number): number {
  const v = Number(env[key]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

export function loadConfig(env: Env = process.env): Config {
  const str = (key: string, fallback = '') => (env[key] ?? '').trim() || fallback;

  // Какой ИИ пишет конспект: выбирается по тому, какой ключ указан.
  let llmProvider: Config['llm']['provider'] = 'demo';
  if (str('ANTHROPIC_API_KEY')) llmProvider = 'anthropic';
  else if (str('LLM_API_KEY')) llmProvider = 'openai';
  const llmForced = str('LLM_PROVIDER');
  if (llmForced === 'demo' || llmForced === 'anthropic' || llmForced === 'openai') {
    llmProvider = llmForced;
  }

  let sttProvider: Config['stt']['provider'] = str('STT_API_KEY') ? 'openai' : 'demo';
  const sttForced = str('STT_PROVIDER');
  if (sttForced === 'demo' || sttForced === 'openai') sttProvider = sttForced;

  return {
    port: num(env, 'PORT', 8787),
    accessCode: str('ACCESS_CODE'),
    dataDir: str('DATA_DIR', 'data'),
    ffmpegPath: str('FFMPEG_PATH'),
    llm: {
      provider: llmProvider,
      anthropicKey: str('ANTHROPIC_API_KEY'),
      browser: str('LLM_FROM_DEVICE') === '1',
      anthropicModel: str('AI_MODEL', 'claude-opus-5-5'),
      apiKey: str('LLM_API_KEY'),
      baseUrl: str('LLM_BASE_URL', 'https://api.openai.com/v1').replace(/\/$/, ''),
      model: str('LLM_MODEL'),
    },
    stt: {
      provider: sttProvider,
      apiKey: str('STT_API_KEY'),
      baseUrl: str('STT_BASE_URL', 'https://api.openai.com/v1').replace(/\/$/, ''),
      model: str('STT_MODEL', 'whisper-1'),
    },
    limits: {
      maxAudioMinutes: num(env, 'MAX_AUDIO_MINUTES', 75),
      maxUploadMb: num(env, 'MAX_UPLOAD_MB', 200),
      maxTranscriptChars: num(env, 'MAX_TRANSCRIPT_CHARS', 150_000),
      chunkSeconds: num(env, 'CHUNK_SECONDS', 600),
      dailyLessons: num(env, 'DAILY_LESSON_LIMIT', 10),
      dailyChats: num(env, 'DAILY_CHAT_LIMIT', 100),
      dailyAudioMinutes: num(env, 'DAILY_AUDIO_MINUTES', 300),
      requestsPerMinute: num(env, 'REQUESTS_PER_MINUTE', 40),
    },
  };
}
