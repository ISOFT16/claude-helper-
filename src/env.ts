// Приложение собирается в двух вариантах:
// - обычный (PWA + свой сервер с ключами);
// - «одна ссылка» (STANDALONE): страница на claude.ai, где речь распознаёт
//   и конспект пишет Claude через аккаунт самого ученика — без сервера и ключей.
export const STANDALONE = import.meta.env.VITE_STANDALONE === '1';

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
