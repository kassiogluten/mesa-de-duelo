// Decide se os efeitos da mesa saem na camada GPU ou em CSS (opção "Efeitos: completos / leves", reduzir movimento, WebGL2, contexto perdido), sem carregar o PixiJS.
import { KEYS } from '../../storage';

/** "Efeitos" nas Opções: completos (camada GPU, quando o aparelho aguenta) ou leves (os efeitos em CSS). */
type EffectsLevel = 'full' | 'light';
/** O que fica gravado: 'auto-light' é leves escolhido pela mesa (sem WebGL2 ou com os quadros caindo), não pelo jogador. */
type StoredLevel = EffectsLevel | 'auto-light';

function stored(): StoredLevel | null {
  try {
    const value = localStorage.getItem(KEYS.effects);
    return value === 'full' || value === 'light' || value === 'auto-light' ? value : null;
  } catch { return null; }
}
/** A escolha de "Efeitos" (sem nada gravado, completos). */
export function effectsLevel(): EffectsLevel { return stored() === null || stored() === 'full' ? 'full' : 'light'; }
export function setEffectsLevel(level: EffectsLevel) {
  try { localStorage.setItem(KEYS.effects, level); } catch { /* Storage is optional. */ }
}
/**
 * A mesa troca sozinha para leves só enquanto o jogador não escolheu nada: quem pôs "completos" à mão fica com eles.
 * Devolve se trocou (para o aviso aparecer uma vez só).
 */
export function autoLight(): boolean {
  if (stored() !== null) return false;
  try { localStorage.setItem(KEYS.effects, 'auto-light'); } catch { return false; }
  return true;
}

/** `?gpu=0` força os efeitos em CSS e `?gpu=1` tenta a GPU mesmo com leves (páginas de teste e medição). */
export function forcedGpu(search = globalThis.location?.search ?? ''): boolean | undefined {
  const value = new URLSearchParams(search).get('gpu');
  return value === '0' ? false : value === '1' ? true : undefined;
}

let webgl2: boolean | undefined;
/** O aparelho tem WebGL2 (testado uma vez por página, devolvendo o contexto de teste na hora). */
export function hasWebGL2(): boolean {
  if (webgl2 !== undefined) return webgl2;
  try {
    const gl = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('webgl2');
    webgl2 = !!gl;
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch { webgl2 = false; }
  return webgl2;
}

interface GpuConditions {
  level: EffectsLevel;
  forced?: boolean;
  reduced: boolean;
  webgl2: boolean;
  /** O contexto WebGL caiu nesta página: não tenta de novo. */
  lost: boolean;
}
/** Onde os efeitos saem: 'gpu' (vale carregar a camada) ou 'css', e por quê. Reduzir movimento vale antes de tudo. */
export function gpuDecision(c: GpuConditions): { use: 'gpu' | 'css'; reason: 'reduced' | 'forced-off' | 'light' | 'no-webgl2' | 'lost' | 'ok' } {
  if (c.reduced) return { use: 'css', reason: 'reduced' };
  if (c.forced === false) return { use: 'css', reason: 'forced-off' };
  if (c.level === 'light' && c.forced !== true) return { use: 'css', reason: 'light' };
  if (!c.webgl2) return { use: 'css', reason: 'no-webgl2' };
  if (c.lost) return { use: 'css', reason: 'lost' };
  return { use: 'gpu', reason: 'ok' };
}

/**
 * Efeito lento: menos de 25 quadros por segundo em média durante a vida dele. Três lentos entre os oito primeiros
 * efeitos de uma partida trocam para leves (os números de base estão em docs/spec-mesa-webgl.md, "Medições").
 */
export const SLOW_FRAME_MS = 40;
const SLOW_EFFECTS = 3, WATCHED_EFFECTS = 8;
/** Conta os primeiros efeitos e diz quando os quadros caíram demais. */
export function createFrameWatch() {
  let seen = 0, slow = 0;
  return {
    /** Um efeito terminou, com a média de tempo entre quadros dele. Devolve true quando é hora de trocar para leves. */
    effect(averageFrameMs: number, frames: number): boolean {
      if (seen >= WATCHED_EFFECTS || frames < 3) return false;
      seen++;
      if (averageFrameMs > SLOW_FRAME_MS) slow++;
      return slow >= SLOW_EFFECTS;
    },
    reset() { seen = 0; slow = 0; },
  };
}

/** Câmera lenta das páginas de teste (`?lento`): a camada GPU anda junto com os temporizadores e as animações. */
export const gpuClock = { timeScale: 1 };
