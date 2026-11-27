// As contas do teste de desempenho: o roteiro de cada partida simulada, os números dos quadros medidos (FPS médio, 1% mais lentos, travadas), a nota e o aparelho.

/** Um passo do roteiro: o que o laboratório joga (o mesmo texto do ?jogar) e quanto esperar depois, em ms (sem número: o tempo da jogada e uma folga). */
export type Step = [play: string, waitMs?: number];
export interface Scene { name: string; steps: Step[] }
export type Mode = 'duelo' | 'commander';

/** Folga depois de cada jogada simulada, para os efeitos dela terminarem antes da próxima. */
export const PLAY_GAP_MS = 1800;

/**
 * Os roteiros, fixos para os números de um aparelho poderem ser comparados com os de outro (e com o mesmo depois de
 * uma versão nova). Cerca de um minuto e meio cada. No Commander a mesa tem 4 jogadores e os dois oponentes a mais
 * ficam o tempo todo de campo cheio (labSeats.ts).
 */
export const SCRIPTS: Record<Mode, Scene[]> = {
  duelo: [
    { name: 'Abertura', steps: [['turno', 1500], ['land', 1600], ['creature', 2200], ['jogada:upkeep'], ['jogada:develop']] },
    { name: 'Mágicas', steps: [['jogada:bolt'], ['jogada:counter'], ['jogada:storm']] },
    { name: 'Combate', steps: [['jogada:combat'], ['jogada:swing']] },
    { name: 'Campo cheio', steps: [['cheio', 2500], ['tokens:20', 3000], ['move:attack', 2500], ['x:fight', 2500], ['pausa', 4000]] },
    { name: 'Limpa campo', steps: [['jogada:wrath'], ['jogada:pyroclasm']] },
    { name: 'Fim de jogo', steps: [['jogada:lethal', 9000]] },
  ],
  commander: [
    { name: 'Abertura', steps: [['jogada:commander'], ['jogada:develop']] },
    { name: 'Mágicas', steps: [['jogada:gameChanger'], ['jogada:cascade']] },
    { name: 'Combate', steps: [['jogada:commanderStrike'], ['jogada:combat']] },
    { name: 'Campo cheio', steps: [['cheio', 2500], ['tokens:20', 3000], ['move:attack', 2500], ['pausa', 4000]] },
    { name: 'Valor', steps: [['jogada:tokens'], ['jogada:walker']] },
    { name: 'Limpa campo', steps: [['jogada:wrath']] },
    { name: 'Fim de jogo', steps: [['jogada:commanderLethal']] },
  ],
};

/** Quanto esperar depois do passo: o que o roteiro diz ou, numa jogada simulada, o tempo dela mais a folga. */
export function stepWait([play, wait]: Step, duration: (key: string) => number) {
  if (wait !== undefined) return wait;
  return play.startsWith('jogada:') ? duration(play.slice('jogada:'.length)) + PLAY_GAP_MS : 2500;
}

/** Acima disto (ms) um quadro conta como travada: o olho vê a mesa parar. */
export const HITCH_MS = 50;

export interface FrameStats { fps: number; fps1: number; travadas: number; quadros: number; duracaoMs: number }

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Os números de uma lista de intervalos entre quadros (ms): FPS médio, o FPS do 1% de quadros mais lentos (a média deles),
 * quantos passaram de {@link HITCH_MS}, quantos quadros e quanto tempo.
 */
export function frameStats(intervals: number[]): FrameStats {
  const quadros = intervals.length, duracaoMs = intervals.reduce((a, b) => a + b, 0);
  if (!quadros || duracaoMs <= 0) return { fps: 0, fps1: 0, travadas: 0, quadros, duracaoMs: Math.round(duracaoMs) };
  const worst = [...intervals].sort((a, b) => b - a).slice(0, Math.max(1, Math.ceil(quadros * 0.01)));
  const worstAvg = worst.reduce((a, b) => a + b, 0) / worst.length;
  return {
    fps: round1(quadros / (duracaoMs / 1000)),
    fps1: round1(1000 / worstAvg),
    travadas: intervals.filter(ms => ms > HITCH_MS).length,
    quadros,
    duracaoMs: Math.round(duracaoMs),
  };
}

/**
 * Nota de 0 a 100: metade pelo FPS médio, 30% pelo 1% mais lento e 20% pelas travadas por minuto (30 ou mais zeram
 * essa parte). O FPS conta até 60, o que a mesa pede: uma tela de 120 Hz não ganha nota a mais por isso.
 */
export function score({ fps, fps1, travadas, duracaoMs }: FrameStats) {
  if (!duracaoMs) return 0;
  const perMinute = travadas / (duracaoMs / 60000);
  const value = 0.5 * Math.min(fps, 60) / 60 + 0.3 * Math.min(fps1, 60) / 60 + 0.2 * Math.max(0, 1 - perMinute / 30);
  return Math.max(0, Math.min(100, Math.round(value * 100)));
}

/** O que a nota quer dizer para quem joga, e o que fazer. */
export function verdict(nota: number): { label: string; tip: string; quality: 'good' | 'fair' | 'poor' } {
  if (nota >= 85) return { label: 'Ótimo', tip: 'A mesa roda lisa neste aparelho, com todos os efeitos.', quality: 'good' };
  if (nota >= 65) return { label: 'Bom', tip: 'A mesa roda bem; nas jogadas mais cheias pode dar uma engasgada.', quality: 'good' };
  if (nota >= 45) return { label: 'Razoável', tip: 'A mesa pesa nas jogadas grandes. Em Opções › Aparência, Efeitos leves deixam mais leve.', quality: 'fair' };
  return { label: 'Pesado', tip: 'A mesa pesa neste aparelho. Em Opções › Aparência, use Efeitos leves; fechar outros apps também ajuda.', quality: 'poor' };
}

/** A taxa da tela pelos intervalos com a página parada: a mediana, encaixada na taxa comum mais perto. */
export function displayHz(intervals: number[]): number | null {
  const sorted = intervals.filter(ms => ms > 2 && ms < 100).sort((a, b) => a - b);
  if (sorted.length < 10) return null;
  const hz = 1000 / sorted[Math.floor(sorted.length / 2)]!;
  return [30, 48, 50, 60, 72, 75, 90, 100, 120, 144, 165, 240].reduce((best, n) => Math.abs(n - hz) < Math.abs(best - hz) ? n : best);
}

/** O navegador e o sistema pelo user agent, no formato curto que a área de admin mostra ("Chrome 131", "Android 14"). */
export function parseAgent(ua: string): { navegador: string; sistema: string } {
  const pick = (re: RegExp) => ua.match(re)?.[1];
  const navegador = pick(/SamsungBrowser\/(\d+)/) ? `Samsung Internet ${pick(/SamsungBrowser\/(\d+)/)}`
    : pick(/EdgA?\/(\d+)/) ? `Edge ${pick(/EdgA?\/(\d+)/)}`
    : pick(/OPR\/(\d+)/) ? `Opera ${pick(/OPR\/(\d+)/)}`
    : pick(/Firefox\/(\d+)/) ? `Firefox ${pick(/Firefox\/(\d+)/)}`
    : pick(/CriOS\/(\d+)/) ? `Chrome ${pick(/CriOS\/(\d+)/)}`
    : pick(/Chrome\/(\d+)/) ? `Chrome ${pick(/Chrome\/(\d+)/)}`
    : pick(/Version\/([\d.]+).*Safari/) ? `Safari ${pick(/Version\/([\d.]+).*Safari/)}`
    : 'Outro';
  const ios = pick(/(?:iPhone|iPad|iPod).*? OS (\d+(?:_\d+)?)/);
  const sistema = pick(/Android (\d+(?:\.\d+)?)/) ? `Android ${pick(/Android (\d+(?:\.\d+)?)/)}`
    : ios ? `iOS ${ios.replace('_', '.')}`
    : /Windows NT/.test(ua) ? 'Windows'
    : /CrOS/.test(ua) ? 'ChromeOS'
    : /Mac OS X/.test(ua) ? (/Mobile\//.test(ua) ? 'iPadOS' : 'macOS')
    : /Linux/.test(ua) ? 'Linux' : 'Outro';
  return { navegador, sistema };
}
