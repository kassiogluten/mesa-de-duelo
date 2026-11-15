// O regulador dos efeitos (Efeitos: automático): com os quadros caindo, desce um degrau depressa; estável e com algo animando, sobe devagar, travando o degrau que já falhou.
import type { EffectsTier } from './gpuSupport';

/**
 * Os limites, escolhidos em 15/11/2026 para proteger os efeitos: desce com 3 s abaixo de 30 quadros por segundo,
 * sobe com 6 s acima de 50, animando. Depois de cada troca, 5 s sem outra; a subida que cai de novo em até 20 s trava
 * aquele degrau por 20 s, e o tempo dobra a cada nova recaída (até 160 s). Os 5 s do começo da mesa não contam
 * (imagens chegando, camada carregando). Com mais de 40 permanentes, a mesa não passa do degrau 1.
 */
export const GOVERNOR = { lowFps: 30, lowMs: 3000, highFps: 50, highMs: 6000, coolMs: 5000, relapseMs: 20000, lockMs: 20000, maxLockMs: 160000, warmupMs: 5000, crowded: 40 };

/** Uma medida: quando (ms), os quadros por segundo do pior quarto da janela, se algo animava e as permanentes na mesa. */
export interface GovernorSample { at: number; fps: number; busy: boolean; permanents: number }

export function createGovernor(limits = GOVERNOR) {
  let tier: EffectsTier = 0, since = 0, lastChange = -Infinity, lastClimb = -Infinity;
  // lowSince: desde quando está abaixo do limite; busyHighSince: desde quando, acima do limite, algo começou a animar.
  let lowSince: number | null = null, busyHighSince: number | null = null;
  let lockUntil = -Infinity, lock = limits.lockMs;
  const clamp = (n: number) => Math.max(0, Math.min(3, n)) as EffectsTier;

  return {
    get tier() { return tier; },
    /** A mesa abriu (ou o automático voltou): recomeça do degrau 0, com a espera do começo. */
    reset(at: number) {
      tier = 0; since = at; lastChange = lastClimb = lockUntil = -Infinity; lock = limits.lockMs;
      lowSince = busyHighSince = null;
    },
    /** Devolve o degrau depois desta medida. */
    sample(s: GovernorSample): EffectsTier {
      if (s.at - since < limits.warmupMs) return tier;
      const floor: EffectsTier = s.permanents > limits.crowded ? 1 : 0;
      if (tier < floor) { tier = floor; lastChange = s.at; }
      if (s.fps < limits.lowFps) lowSince ??= s.at; else lowSince = null;
      // A subida conta do primeiro instante animando: a mesa parada a 60 não prova que aguenta efeito.
      if (s.fps < limits.highFps) busyHighSince = null; else if (s.busy) busyHighSince ??= s.at;
      const cooled = s.at - lastChange >= limits.coolMs;
      if (lowSince !== null && s.at - lowSince >= limits.lowMs && cooled && tier < 3) {
        // Caiu logo depois de subir: o degrau de cima ainda não aguenta; espera mais antes de tentar de novo.
        if (s.at - lastClimb < limits.relapseMs) { lockUntil = s.at + lock; lock = Math.min(lock * 2, limits.maxLockMs); }
        tier = clamp(tier + 1); lastChange = s.at; lowSince = busyHighSince = null;
      } else if (busyHighSince !== null && s.at - busyHighSince >= limits.highMs && cooled && tier > floor && s.at >= lockUntil) {
        tier = clamp(tier - 1); lastChange = lastClimb = s.at; busyHighSince = null;
      }
      return tier;
    },
  };
}
