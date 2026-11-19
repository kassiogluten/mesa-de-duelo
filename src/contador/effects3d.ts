// Os objetos em 3D do Contador de vida, pela mesma camada GPU da partida: d6, d20 e moeda rolando no meio da mesa, o d20 de quem começa em cada painel, os golpes grandes na vida, a coroa do dano de comandante, a racha de quem sai e o brasão de quem vence.
import type { GpuLayer } from '../ui/gpu/gpuLayer';
import type { Point } from '../ui/motionKit';
import { effectsLevel, gpuDecision, hasWebGL2 } from '../ui/gpu/gpuSupport';
import type { Entrada } from './state';

type Efeitos = typeof import('../ui/gpu/gpuEffects');
type Camada = { layer: GpuLayer; fx: Efeitos };

/** Quanto tempo o dado e a moeda ficam na tela; o dado assenta na metade e a moeda em 62%. */
const DADO_MS = 2600;
const MOEDA_MS = 2600;

export interface Efeitos3d {
  /** Rola no meio da tela. Devolve em quantos ms o resultado assenta, ou null sem 3D (quem chamou mostra em texto). */
  rolar(e: Entrada): Promise<number | null>;
  /**
   * O d20 de quem começa, rolando no painel (`at`) e parando virado para quem senta ali (`giro`, em graus como o
   * `rotate` do CSS). Fica `hold` ms na mesa e assenta na metade; devolve se rolou em 3D.
   */
  rolarNo(at: Point, lados: number, resultado: number, giro: number, hold: number): Promise<boolean>;
  /** Um anel de luz na cor pedida em volta do painel (quem ganhou o sorteio). */
  brilho(at: Point, cor: string): void;
  /** Golpe grande na vida (10 ou mais de uma vez): clarão e faíscas vermelhas, maiores a cada 10 (`nivel`). */
  golpe(at: Point, nivel: number): void;
  /** Cura grande: grãos verdes subindo para o lado de quem senta ali (`giro`, em graus). */
  cura(at: Point, giro: number): void;
  /**
   * Dano de comandante somado: a coroa dourada, da largura de `at`, se estampa no quadro do comandante; `letal` é o toque que chega a
   * 21, e a coroa se parte em estilhaços vermelhos.
   */
  coroa(at: Point, letal: boolean): void;
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
    async rolarNo(at, lados, resultado, giro, hold) {
      const c = await pronta();
      return !!c?.fx.play(c.layer, 'die', { at, result: String(resultado), sides: lados, hold, font: fonte(), travel: at.w * .5, tilt: .25, turn: giro * Math.PI / 180 });
    },
    brilho(at, cor) { void pronta().then(c => c?.fx.play(c.layer, 'arrive', { at, color: cor, size: Math.max(at.w, at.h) * 1.6 })); },
    golpe(at, nivel) {
      void pronta().then(c => {
        if (!c) return;
        const lado = Math.min(at.w, at.h);
        // Do tamanho do painel: o anel não passa para o do vizinho (quem levou o golpe fica claro).
        c.fx.play(c.layer, 'burst', { at, tone: 'damage', size: lado * (.75 + .15 * Math.min(3, nivel - 1)), heavy: true, lethal: nivel >= 2 });
        if (nivel >= 2) c.fx.play(c.layer, 'shockwave', { at, color: '#ec5a3f', reach: lado * 1.1 });
      });
    },
    cura(at, giro) { void pronta().then(c => c?.fx.play(c.layer, 'heal', { at, turn: giro * Math.PI / 180 })); },
    coroa(at, letal) { void pronta().then(c => c?.fx.play(c.layer, 'crownStamp', { at, size: Math.max(36, Math.min(110, Math.min(at.w, at.h))), lethal: letal })); },
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
