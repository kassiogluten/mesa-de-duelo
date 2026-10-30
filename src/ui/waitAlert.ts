import type { FState } from '../forge/client';
import { turnTimeText } from './clock';

/**
 * Alerta de espera demorada. O relógio conta a espera de cada decisão: o tempo desde que a mesa começou a esperar um
 * jogador (prioridade, ataque, bloqueio, escolha), medido pela ponte. Zera a cada resposta e quando o turno passa,
 * e o alerta vai para quem precisa agir. A IA nunca entra: a ponte só lista jogadores humanos.
 *
 * Etapas: 1 (2 min) o relógio de espera aparece em âmbar; 2 (3 min) pulsa de leve e quem demora recebe um aviso
 * próprio, com um som curto; 3 (5 min) o retrato e o campo de quem demora ganham "Demorando…" para todos.
 */
export type WaitStage = 0 | 1 | 2 | 3;
export const WAIT_STAGE_MS = [0, 2 * 60_000, 3 * 60_000, 5 * 60_000] as const;
/** Diferença de relógio que conta como uma espera nova (o atraso da rede fica abaixo disso). */
const RESYNC_MS = 2000;

export function waitStage(ms: number): WaitStage {
  return ms >= WAIT_STAGE_MS[3] ? 3 : ms >= WAIT_STAGE_MS[2] ? 2 : ms >= WAIT_STAGE_MS[1] ? 1 : 0;
}

export interface SlowWait {
  player: number; name: string; mine: boolean; ms: number; stage: WaitStage;
  /** Começo da espera no relógio deste navegador; identifica a espera para anunciar cada etapa uma vez. */
  since: number;
}

type WaitState = Pick<FState, 'waiting' | 'players' | 'you' | 'gameOver'> & { watching?: boolean };

/**
 * Relógio das esperas: guarda quando cada espera começou, a partir do tempo que a ponte mandou. Reajusta só se a
 * diferença passar de 2 s, para o relógio não pular a cada estado; uma espera nova (resposta dada) recomeça do zero.
 */
export class WaitClock {
  private since = new Map<number, number>();

  sync(s: WaitState, now = Date.now()) {
    const next = new Map<number, number>();
    if (!s.gameOver) for (const entry of s.waiting ?? []) {
      if (s.players.find(p => p.id === entry.player)?.ai) continue;
      const start = now - Math.max(0, entry.ms);
      const before = this.since.get(entry.player);
      next.set(entry.player, before !== undefined && Math.abs(before - start) <= RESYNC_MS ? before : start);
    }
    this.since = next;
  }

  /** A espera mais longa agora, ou null se a mesa não espera ninguém (ou só a IA). */
  current(s: WaitState, now = Date.now()): SlowWait | null {
    if (s.gameOver) return null;
    let best: SlowWait | null = null;
    for (const [player, since] of this.since) {
      const p = s.players.find(x => x.id === player);
      if (!p || p.ai) continue;
      const ms = Math.max(0, now - since);
      if (best && best.ms >= ms) continue;
      best = { player, name: p.name, mine: player === s.you && !s.watching, ms, stage: waitStage(ms), since };
    }
    return best;
  }

  reset() { this.since.clear(); }
}

/** Dica do relógio de espera: "A mesa espera Ana há 2:14". */
export function waitClockTip(w: SlowWait): string {
  return `A mesa espera ${w.mine ? 'você' : w.name} há ${turnTimeText(w.ms)}`;
}

/** Aviso discreto para quem está demorando, a partir de 3 min. */
export function waitNudgeText(w: SlowWait | null): string {
  if (!w?.mine || w.stage < 2) return '';
  return `Sua vez já passa de ${w.stage >= 3 ? 5 : 3} min`;
}

/** Frase do leitor de tela para cada etapa. */
export function waitAnnouncement(w: SlowWait): string {
  if (w.mine) return w.stage === 1 ? 'A mesa espera você há 2 minutos.'
    : w.stage === 2 ? 'Sua vez já passa de 3 minutos.'
    : w.stage === 3 ? 'Sua vez já passa de 5 minutos. Todos veem que você está demorando.' : '';
  return w.stage === 1 ? `A mesa espera ${w.name} há 2 minutos.`
    : w.stage === 2 ? `A mesa espera ${w.name} há 3 minutos.`
    : w.stage === 3 ? `${w.name} está demorando: a mesa espera há 5 minutos.` : '';
}

/**
 * Cada etapa de uma espera é anunciada uma vez só. `next` devolve a etapa nova (para o leitor de tela e o som) ou
 * null se nada mudou. Abrindo a mesa no meio de uma espera longa, anuncia só a etapa atual, sem repetir as anteriores.
 * Uma espera nova (outro jogador ou outra decisão) recomeça.
 */
export class WaitAnnouncer {
  private key = '';
  private stage: WaitStage = 0;

  next(w: SlowWait | null): { stage: WaitStage; text: string; sound: boolean } | null {
    const key = w ? `${w.player}:${w.since}` : '';
    if (key !== this.key) { this.key = key; this.stage = 0; }
    if (!w || w.stage <= this.stage) return null;
    const from = this.stage;
    this.stage = w.stage;
    // O som toca só para quem demora, ao chegar aos 3 min (não ao abrir a mesa já nos 5).
    return { stage: w.stage, text: waitAnnouncement(w), sound: w.mine && w.stage === 2 && from < 2 };
  }

  reset() { this.key = ''; this.stage = 0; }
}
