// Приложение собирается в двух вариантах:
// - обычный (PWA + свой сервер с ключами);
// - «одна ссылка» (STANDALONE): страница на claude.ai, где речь распознаёт
//   и конспект пишет Claude через аккаунт самого ученика — без сервера и ключей.
export const STANDALONE = import.meta.env.VITE_STANDALONE === '1';

// Третий вариант — Android-приложение (APK, Capacitor). Речь распознаёт сам телефон,
// а конспект пишет Claude по ключу, который вводится в настройках (без ключа — демо).
export const NATIVE = import.meta.env.VITE_NATIVE === '1';

/** Запись сразу превращается в текст (звук нигде не хранится). */
export const TEXT_RECORDER = STANDALONE || NATIVE;

type ClaudeRuntime = { use(name: string): Promise<unknown> };

/** Возможность страницы на claude.ai (диктовка, Claude) или null, если её здесь нет. */
export async function capability<T>(name: string): Promise<T | null> {
  const claude = (window as unknown as { claude?: ClaudeRuntime }).claude;
  if (!claude?.use) return null;
  try {
    return ((await claude.use(name)) as T) ?? null;
  } catch {
    return null;
  }
}
