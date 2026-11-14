// A camada GPU da mesa: um canvas WebGL transparente por cima do campo, só para os efeitos, que desenha apenas enquanto há efeito vivo.
import { Application, Container, UPDATE_PRIORITY } from 'pixi.js';
import { gpuClock } from './gpuSupport';

/** Um efeito vivo na camada: anda `ms` (já na câmera lenta) a cada quadro e diz se continua. */
export interface GpuEffect {
  view: Container;
  update(ms: number): boolean;
}

interface GpuLayerStats {
  /** Quadros desenhados desde que a camada nasceu (parada, não sobe). */
  frames: number;
  /** Efeitos vivos agora. */
  live: number;
}

export type GpuLayer = Awaited<ReturnType<typeof createGpuLayer>>;

/**
 * Cria o canvas dentro de `host` (a `.arena`) e o PixiJS em WebGL2, parado: o laço só roda enquanto há efeito vivo.
 * `onLost` avisa que o contexto caiu (a camada já se desfez). `onEffectDone` recebe a média de tempo entre quadros
 * de cada efeito que terminou, para a troca automática para leves.
 */
// Teto de densidade: 2 no computador e 1,5 no celular (partículas não pedem mais que isso, e a GPU agradece).
let coarseDevice = false;
const density = () => Math.min(globalThis.devicePixelRatio || 1, coarseDevice ? 1.5 : 2);

export async function createGpuLayer(host: HTMLElement, opts: { coarse: boolean; onLost(): void; onEffectDone(averageFrameMs: number, frames: number): void }) {
  coarseDevice = opts.coarse;
  const canvas = document.createElement('canvas');
  canvas.className = 'gpu-layer';
  canvas.setAttribute('aria-hidden', 'true');
  const app = new Application();
  await app.init({
    canvas, preference: ['webgl'], preferWebGLVersion: 2, backgroundAlpha: 0, antialias: false, autoStart: false,
    resolution: density(), autoDensity: true,
    resizeTo: window, failIfMajorPerformanceCaveat: false,
  });
  app.ticker.stop();
  host.append(canvas);

  const live = new Map<GpuEffect, { frames: number; elapsed: number }>();
  let frames = 0, destroyed = false, stopAfterRender = false;
  function tick() {
    const real = app.ticker.elapsedMS, ms = real * gpuClock.timeScale;
    for (const [effect, info] of live) {
      info.frames++; info.elapsed += real;
      if (effect.update(ms)) continue;
      live.delete(effect);
      effect.view.destroy({ children: true });
      // O primeiro quadro de um efeito sobe as texturas: fica fora da média.
      if (info.frames > 1) opts.onEffectDone(info.elapsed / info.frames, info.frames);
    }
    stopAfterRender = !live.size;
  }
  app.ticker.add(tick, undefined, UPDATE_PRIORITY.HIGH);
  // Depois do desenho (que o PixiJS faz com prioridade LOW): conta o quadro e, sem efeito vivo, para o laço com a tela limpa.
  app.ticker.add(() => { frames++; if (stopAfterRender) { stopAfterRender = false; app.ticker.stop(); } }, undefined, UPDATE_PRIORITY.UTILITY);

  // A janela foi para outra tela (ou o zoom mudou): a densidade acompanha, para os efeitos não ficarem borrados.
  const resized = () => { if (!destroyed && app.renderer.resolution !== density()) { app.renderer.resolution = density(); app.resize(); } };
  addEventListener('resize', resized);
  const lost = (e: Event) => { e.preventDefault(); destroy(); opts.onLost(); };
  canvas.addEventListener('webglcontextlost', lost);

  /** Põe um efeito na camada e liga o laço, se estava parado. */
  function add(effect: GpuEffect) {
    if (destroyed) return;
    app.stage.addChild(effect.view);
    live.set(effect, { frames: 0, elapsed: 0 });
    stopAfterRender = false;
    if (!app.ticker.started) app.ticker.start();
  }
  /** Tira todos os efeitos (a limpeza da mesa) e desenha uma vez a tela vazia. */
  function clear() {
    if (destroyed || !live.size) return;
    for (const effect of live.keys()) effect.view.destroy({ children: true });
    live.clear();
    app.render(); frames++;
    app.ticker.stop();
  }
  function destroy() {
    if (destroyed) return;
    destroyed = true;
    canvas.removeEventListener('webglcontextlost', lost);
    removeEventListener('resize', resized);
    live.clear();
    app.ticker.stop();
    // Desfaz o contexto WebGL junto (o navegador limita quantos uma página pode ter abertos).
    app.destroy({ removeView: true }, { children: true, texture: true, textureSource: true });
  }
  /**
   * Ponto da janela (o mesmo `Point` dos efeitos em CSS) na camada. Ela cobre a janela inteira, mas a `.arena` pode
   * estar deslocada (página de teste, tremor da mesa): a diferença sai do retângulo do canvas.
   */
  function local(x: number, y: number) {
    const r = canvas.getBoundingClientRect();
    return { x: x - r.left, y: y - r.top };
  }
  return {
    canvas, app, add, clear, destroy, local, coarse: opts.coarse,
    get destroyed() { return destroyed; },
    stats: (): GpuLayerStats => ({ frames, live: live.size }),
    size: () => ({ width: app.screen.width, height: app.screen.height }),
  };
}
