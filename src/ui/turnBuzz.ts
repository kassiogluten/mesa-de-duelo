// Vibração no celular quando chega o turno ou uma decisão para o jogador.
import { KEYS } from '../storage';
import type { FState } from '../forge/client';
import { awaitingDecision } from './awaitingDecision';

export const TURN_BUZZ_KEY = KEYS.vibrate;
/** Duas chegadas seguidas (o turno começa e já pede uma escolha) vibram uma vez só. */
const QUIET_MS = 4000;
const PATTERN = [120, 80, 120];

type BuzzState = Pick<FState, 'turn' | 'activePlayer' | 'you' | 'gameOver' | 'matchId' | 'session' | 'input' | 'spectating' | 'sideboarding' | 'question'>;

/** Sem escolha guardada, vibra: só "off" desliga. */
export function buzzEnabled(saved: string | null): boolean {
  return saved !== 'off';
}

/**
 * O que chegou para o jogador e merece vibrar: o começo do turno dele, o pedido de bloqueio e uma decisão
 * no turno de outro (responder a uma mágica, escolher um alvo). Mudou e não está vazio: vibra.
 * As decisões no próprio turno ficam de fora: o jogador já está com a mesa na mão.
 */
export function buzzKey(s: BuzzState): string {
  if (s.gameOver || s.spectating || !(s.turn > 0)) return '';
  const match = s.matchId ?? s.session?.code ?? '';
  if (s.activePlayer === s.you) return `turn:${match}:${s.turn}`;
  if (s.input?.blocking) return `block:${match}:${s.turn}`;
  if (s.question || awaitingDecision(s as FState)) return `decision:${match}:${s.input?.gen ?? ''}`;
  return '';
}

/** Vibração curta no celular quando a vez ou uma decisão chega (S19), onde o navegador deixa vibrar. */
export function createTurnBuzz() {
  const supported = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
  let saved: string | null = null;
  try { saved = localStorage.getItem(TURN_BUZZ_KEY); } catch { /* Storage is optional. */ }
  let lastKey = '';
  let lastBuzz = 0;
  /** O primeiro estado depois de entrar ou reconectar só marca onde a partida está: não vibra. */
  let primed = false;

  return {
    supported,
    get enabled() { return buzzEnabled(saved); },
    /** Chamado a cada estado da partida. */
    observe(s: BuzzState) {
      const key = buzzKey(s);
      if (primed && key && key !== lastKey && supported && buzzEnabled(saved) && !document.hidden && Date.now() - lastBuzz > QUIET_MS) {
        lastBuzz = Date.now();
        try { navigator.vibrate(PATTERN); } catch { /* Alguns navegadores só deixam depois do primeiro toque. */ }
      }
      lastKey = key; primed = true;
    },
    setEnabled(on: boolean) {
      saved = on ? 'on' : 'off';
      try { localStorage.setItem(TURN_BUZZ_KEY, saved); } catch { /* Storage is optional. */ }
      if (on && supported) try { navigator.vibrate(PATTERN); } catch { /* Só uma amostra. */ }
    },
    /** Um aviso avulso (o voto que a mesa espera de você), com as mesmas regras de silêncio. */
    nudge() {
      if (!supported || !buzzEnabled(saved) || document.hidden || Date.now() - lastBuzz <= QUIET_MS) return;
      lastBuzz = Date.now();
      try { navigator.vibrate(PATTERN); } catch { /* Alguns navegadores só deixam depois do primeiro toque. */ }
    },
    reset() { lastKey = ''; primed = false; },
  };
}
