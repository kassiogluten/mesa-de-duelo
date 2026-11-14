// A porta da mesa para a camada GPU: carrega o PixiJS com a mesa ociosa, pede cada efeito e, sem a camada, deixa quem pediu usar o CSS.
import type { GpuLayer } from './gpuLayer';
import type { GpuEffectName, GpuEffectParams } from './gpuEffects';
import { autoLight, createFrameWatch, effectsLevel, forcedGpu, gpuDecision, hasWebGL2 } from './gpuSupport';

export const AUTO_LIGHT_NOTICE = 'Os efeitos ficaram leves neste aparelho. Dá para mudar em Opções.';

type Runtime = { layer: GpuLayer; effects: typeof import('./gpuEffects') };

// O contexto caiu nesta página: os efeitos ficam em CSS até recarregar (não tenta de novo nesta partida).
let contextLost = false;
// A porta da mesa mais recente, para as páginas de teste e a medição (`window.gpu` no laboratório de efeitos).
let latest: ReturnType<typeof createGpuPort> | null = null;
export const latestGpuPort = () => latest;

/**
 * `root` é a mesa; `host()` é onde o canvas entra (a `.arena`). `reduced()` é o "reduzir movimento" lido na hora.
 * `notice` mostra o aviso da troca automática para leves.
 */
export function createGpuPort(root: HTMLElement, o: { host(): HTMLElement; reduced(): boolean; notice?(text: string): void }) {
  let runtime: Runtime | null = null;
  // A carga em andamento e o número dela (uma carga desfeita por `release` não segura a seguinte).
  let loading: { gen: number } | null = null;
  let idle: number | null = null;
  // Cada pedido de carga ganha um número: sair da mesa no meio da carga desfaz o que chegar atrasado.
  let generation = 0;
  const watch = createFrameWatch();
  const coarse = () => globalThis.matchMedia?.('(pointer: coarse)').matches ?? false;
  const decision = () => gpuDecision({ level: effectsLevel(), forced: forcedGpu(), reduced: o.reduced(), webgl2: hasWebGL2(), lost: contextLost });

  async function load(gen: number) {
    const [layerModule, effects] = await Promise.all([import('./gpuLayer'), import('./gpuEffects')]);
    if (gen !== generation) return;
    const layer = await layerModule.createGpuLayer(o.host(), {
      coarse: coarse(),
      onLost() { contextLost = true; runtime = null; },
      onEffectDone(average, frames) { if (watch.effect(average, frames) && forcedGpu() === undefined && autoLight()) switchToLightNow(); },
    });
    if (gen !== generation) { layer.destroy(); return; }
    effects.prepare(layer);
    runtime = { layer, effects };
    preloadTable();
    // As imagens do Scryfall chegam depois do desenho (e a mesa redesenha sozinha): de tempos em tempos, com o navegador
    // ocioso, as cartas novas da mão, da pilha e do campo também carregam a textura.
    const again = () => { if (runtime?.layer !== layer || layer.destroyed) return; const ric = globalThis.requestIdleCallback; if (ric) ric(preloadTable, { timeout: 1000 }); else preloadTable(); setTimeout(again, 1500); };
    setTimeout(again, 1500);
  }
  /** As cartas que podem voar logo (mão, pilha, campo, topo dos montes e zona de comando) carregam a textura delas: ao ficar pronta, de tempos em tempos e a cada desenho da mesa. */
  function preloadTable() {
    if (!runtime || runtime.layer.destroyed) return;
    const { layer, effects } = runtime;
    root.querySelectorAll<HTMLElement>('#fHand .face[data-full], #fStack .face[data-full], .field .face[data-full], .piles .face[data-full], #fCommand .face[data-full]').forEach(el => effects.preload(layer, el.dataset.full!));
  }
  // A troca automática acontece no meio de um quadro da camada: desfaz no próximo giro, fora do laço dela.
  function switchToLightNow() { setTimeout(() => { release(); o.notice?.(AUTO_LIGHT_NOTICE); }, 0); }

  /**
   * A mesa abriu (ou a opção voltou para completos): carrega a camada quando o navegador estiver ocioso, nunca no meio
   * de uma jogada. Sem WebGL2, a troca para leves acontece aqui, uma vez.
   */
  function prepare() {
    const d = decision();
    if (d.reason === 'no-webgl2' && effectsLevel() === 'full' && autoLight()) { o.notice?.(AUTO_LIGHT_NOTICE); return; }
    if (d.use !== 'gpu' || runtime || loading?.gen === generation || idle !== null || root.hidden) return;
    const gen = ++generation;
    const start = () => {
      idle = null;
      const current = loading = { gen };
      load(gen).catch(() => { /* Sem o pacote (rede, navegador): os efeitos continuam em CSS. */ }).finally(() => { if (loading === current) loading = null; });
    };
    const ric = globalThis.requestIdleCallback;
    idle = ric ? ric(start, { timeout: 4000 }) as unknown as number : globalThis.setTimeout(start, 1200) as unknown as number;
  }
  /** Saiu da mesa ou trocou para leves: desfaz o canvas e o contexto WebGL. */
  function release() {
    generation++;
    if (idle !== null) { (globalThis.cancelIdleCallback ?? clearTimeout)(idle); idle = null; }
    runtime?.layer.destroy(); runtime = null;
    watch.reset();
  }
  // A mesa escondida (voltou à tela inicial, ao Laboratório) libera a camada; à mostra de novo (a partida abre depois
  // de a mesa ser preparada), carrega com a mesa ociosa.
  if (typeof MutationObserver !== 'undefined') new MutationObserver(() => { if (root.hidden) release(); else prepare(); }).observe(root, { attributes: true, attributeFilter: ['hidden'] });

  const port = {
    prepare, release,
    /** A opção "Efeitos" mudou. */
    refresh() { if (decision().use === 'gpu') prepare(); else release(); },
    /**
     * Desenha o efeito na camada GPU. Devolve false quando não desenhou (leves, reduzir movimento, camada ainda
     * carregando, contexto perdido): quem pediu faz o efeito em CSS.
     */
    play<N extends GpuEffectName>(name: N, params: GpuEffectParams[N]): boolean {
      if (!runtime || runtime.layer.destroyed || decision().use !== 'gpu') return false;
      return runtime.effects.play(runtime.layer, name, params);
    },
    clear() { runtime?.layer.clear(); },
    /** Se a textura de uma carta já carregou (a carta de costas só vira no ar com a face pronta); sem ela, começa a carregar. */
    textureReady(url: string) { return !!runtime && !runtime.layer.destroyed && runtime.effects.textureReady(runtime.layer, url); },
    preloadTable,
    /** Para os testes e a medição: quadros desenhados e efeitos vivos (sem a camada, nada). */
    stats: () => runtime?.layer.stats() ?? null,
    ready: () => !!runtime,
    /** Para os testes: carrega agora, sem esperar a mesa ficar ociosa. */
    async loadNow() { release(); if (decision().use !== 'gpu') return false; const gen = ++generation; await load(gen).catch(() => {}); return !!runtime; },
  };
  latest = port;
  return port;
}
