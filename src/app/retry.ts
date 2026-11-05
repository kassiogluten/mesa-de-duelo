/** Intervalos crescentes (~40 s no total) para voltar sozinho a uma partida antes de oferecer o botão. */
export const RECONNECT_DELAYS = [300, 1000, 2000, 3000, 5000, 8000, 8000, 10000];
/** Assistindo, desiste antes: a partida dos outros continua sem quem assiste. */
export const REWATCH_DELAYS = [300, 1000, 2000, 3000, 5000, 8000];

export interface RetryStep {
  /** A tentativa ainda vale (a partida é a mesma de quando começou). */
  alive(): boolean;
  /** Antes de cada espera: a mesa mostra a tentativa n (começando em 1). */
  onTry(n: number): void;
  /** Uma tentativa; true para de tentar. */
  attempt(): Promise<boolean>;
}
/**
 * Espera cada intervalo e tenta de novo, até dar certo ou a partida mudar. 'done': deu certo; 'stopped': a partida
 * mudou no meio; 'exhausted': acabaram as tentativas (a mesa oferece o botão).
 */
export async function retryWithDelays(delays: readonly number[], step: RetryStep, wait = (ms: number) => new Promise(r => setTimeout(r, ms))): Promise<'done' | 'stopped' | 'exhausted'> {
  for (let i = 0; i < delays.length; i++) {
    if (!step.alive()) return 'stopped';
    step.onTry(i + 1);
    await wait(delays[i]);
    if (!step.alive()) return 'stopped';
    if (await step.attempt()) return 'done';
  }
  return 'exhausted';
}
