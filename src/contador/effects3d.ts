// Os objetos em 3D do Contador de vida, pela mesma camada GPU da partida: d6, d20 e moeda rolando no meio da mesa, a racha de quem sai e o brasão de quem vence.
import type { GpuLayer } from '../ui/gpu/gpuLayer';
import type { Point } from '../ui/motionKit';
import { effectsLevel, gpuDecision, hasWebGL2 } from '../ui/gpu/gpuSupport';
import type { Entrada } from './state';

type Efeitos = typeof import('../ui/gpu/gpuEffects');
type Camada = { layer: GpuLayer; fx: Efeitos };

/** Quanto tempo o dado e a moeda ficam na tela; o dado assenta na metade e a moeda em 62%. */
const DADO_MS = 2600;
const MOEDA_MS = 2600;

interface Efeitos3d {
  /** Rola no meio da tela. Devolve em quantos ms o resultado assenta, ou null sem 3D (quem chamou mostra em texto). */
  rolar(e: Entrada): Promise<number | null>;
  /** Alguém saiu da partida: o painel racha e solta cinzas. */
  fora(at: Point): void;
  /** Sobrou um: raios dourados e o brasão em 3D caindo sobre o painel. */
  vence(at: Point): void;
  destruir(): void;
}

const reduzido = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const fonte = () => getComputedStyle(document.documentElement).getPropertyValue('--display').trim() || 'serif';

/**
 * A camada é carregada com a mesa ociosa, logo depois de abrir (o PixiJS e os shaders custam no primeiro uso, e isso
 * não pode cair na primeira rolagem). Sem WebGL2, com "reduzir movimento" ou com os efeitos leves, fica sem 3D.
 */
export function criarEfeitos3d(host: HTMLElement): Efeitos3d {
  let carga: Promise<Camada | null> | null = null, perdido = false, destruido = false;
  const pode = () => !destruido && gpuDecision({ level: effectsLevel(), reduced: reduzido(), webgl2: hasWebGL2(), lost: perdido }).use === 'gpu';
  const carregar = () => carga ??= (async (): Promise<Camada | null> => {
    try {
      const [{ createGpuLayer }, fx] = await Promise.all([import('../ui/gpu/gpuLayer'), import('../ui/gpu/gpuEffects'), document.fonts?.ready]);
      if (destruido) return null;
      const layer = await createGpuLayer(host, { coarse: matchMedia('(pointer: coarse)').matches, onLost() { perdido = true; carga = null; } });
      if (destruido) { layer.destroy(); return null; }
      fx.prepare(layer);
      return { layer, fx };
    } catch { perdido = true; return null; }
  })();
  const pronta = async () => pode() ? carregar() : null;

  const ocioso = (fn: () => void) => 'requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: 2500 }) : setTimeout(fn, 800);
  ocioso(() => { if (pode()) void carregar(); });

  return {
    async rolar(e) {
      if (e.tipo !== 'dado' && e.tipo !== 'moeda') return null;
      const c = await pronta();
      if (!c) return null;
      const lado = Math.min(innerWidth, innerHeight), size = lado * (e.tipo === 'moeda' ? .34 : .3);
      const at: Point = { cx: innerWidth / 2, cy: innerHeight / 2, w: size, h: size };
      if (e.tipo === 'moeda') {
        const cara = e.resultado === 'cara';
        return c.fx.play(c.layer, 'coin', { at, heads: cara, label: cara ? 'Cara' : 'Coroa', hold: MOEDA_MS, font: fonte() }) ? MOEDA_MS * .62 : null;
      }
      const ok = c.fx.play(c.layer, 'die', { at, result: String(e.resultado), sides: e.lados, hold: DADO_MS, font: fonte(), travel: size * 1.1, tilt: .3 });
      return ok ? DADO_MS * .5 : null;
    },
    fora(at) { void pronta().then(c => c?.fx.play(c.layer, 'defeat', { at })); },
    vence(at) {
      void pronta().then(c => {
        if (c?.fx.play(c.layer, 'victory', { at, delay: 150 })) c.fx.play(c.layer, 'crest', { at, font: fonte(), delay: 100 });
      });
    },
    destruir() {
      destruido = true;
      void carga?.then(c => c?.layer.destroy());
    },
  };
}
