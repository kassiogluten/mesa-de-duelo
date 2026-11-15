// Decide se os efeitos da mesa saem na camada GPU ou em CSS (opção "Efeitos: automático / completos / leves", degrau do regulador, reduzir movimento, WebGL2, contexto perdido), sem carregar o PixiJS.
import { KEYS } from '../../storage';

/** "Efeitos" nas Opções: automático (o regulador desce e sobe os degraus sozinho), completos ou leves (os efeitos em CSS), fixos. */
type EffectsLevel = 'auto' | 'full' | 'light';

/** O que está gravado; 'auto-light' (de antes do regulador, a mesa tinha trocado sozinha para leves) vale como automático. */
function stored(): EffectsLevel | null {
  try {
    const value = localStorage.getItem(KEYS.effects);
    return value === 'auto' || value === 'full' || value === 'light' ? value : value === 'auto-light' ? 'auto' : null;
  } catch { return null; }
}
/** A escolha de "Efeitos" (sem nada gravado, automático). */
export function effectsLevel(): EffectsLevel { return stored() ?? 'auto'; }
export function setEffectsLevel(level: EffectsLevel) {
  try { localStorage.setItem(KEYS.effects, level); } catch { /* Storage is optional. */ }
}

/**
 * Degrau do regulador (só no automático): 0 tudo; 1 faíscas pela metade; 2 também a mesa viva parada e sem câmera;
 * 3 os efeitos em CSS. Fica aqui, fora do pacote do PixiJS, porque a mesa e a camada GPU leem os dois.
 */
export type EffectsTier = 0 | 1 | 2 | 3;
let tier: EffectsTier = 0;
/** O degrau de agora; fora do automático, sempre 0 (quem rege, gpuPort.ts, volta para 0 ao sair dele). Barato: as faíscas leem a cada uma. */
export const effectsTier = (): EffectsTier => tier;
export function setEffectsTier(next: EffectsTier) { tier = next; }

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
  /** Degrau do regulador: no 3, os efeitos vão para o CSS. */
  tier?: EffectsTier;
  forced?: boolean;
  reduced: boolean;
  webgl2: boolean;
  /** O contexto WebGL caiu nesta página: não tenta de novo. */
  lost: boolean;
}
/** Onde os efeitos saem: 'gpu' (vale carregar a camada) ou 'css', e por quê. Reduzir movimento vale antes de tudo. */
export function gpuDecision(c: GpuConditions): { use: 'gpu' | 'css'; reason: 'reduced' | 'forced-off' | 'light' | 'governed' | 'no-webgl2' | 'lost' | 'ok' } {
  if (c.reduced) return { use: 'css', reason: 'reduced' };
  if (c.forced === false) return { use: 'css', reason: 'forced-off' };
  if (c.level === 'light' && c.forced !== true) return { use: 'css', reason: 'light' };
  if (c.level === 'auto' && c.tier === 3 && c.forced !== true) return { use: 'css', reason: 'governed' };
  if (!c.webgl2) return { use: 'css', reason: 'no-webgl2' };
  if (c.lost) return { use: 'css', reason: 'lost' };
  return { use: 'gpu', reason: 'ok' };
}

/** Câmera lenta das páginas de teste (`?lento`): a camada GPU anda junto com os temporizadores e as animações. */
export const gpuClock = { timeScale: 1 };
