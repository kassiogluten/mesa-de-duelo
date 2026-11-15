// A porta da mesa para a camada GPU: carrega o PixiJS e a mesa viva com a mesa ociosa, pede cada efeito, rege o degrau dos efeitos no automático e, sem a camada, deixa quem pediu usar o CSS.
import type { GpuLayer } from './gpuLayer';
import type { Ambience, AmbiencePulse, AmbienceScene } from './tableAmbience';
import type { GpuEffectName, GpuEffectParams } from './gpuEffects';
import { ambienceOff, effectsLevel, effectsTier, forcedGpu, gpuDecision, hasWebGL2, setEffectsTier, type EffectsTier } from './gpuSupport';
import { createGovernor } from './effectsGovernor';
import { listenFrames, type FrameWindow } from '../frameClock';

type Runtime = { layer: GpuLayer; effects: typeof import('./gpuEffects'); ambience: Ambience | null };

// O contexto caiu nesta página: os efeitos ficam em CSS até recarregar (não tenta de novo nesta partida).
let contextLost = false;
// A porta da mesa mais recente, para as páginas de teste e a medição (`window.gpu` no laboratório de efeitos).
let latest: ReturnType<typeof createGpuPort> | null = null;
export const latestGpuPort = () => latest;

/**
 * `root` é a mesa; `host()` é onde o canvas entra (a `.arena`). `reduced()` é o "reduzir movimento" lido na hora.
 * `busy()` diz se algum efeito em CSS está animando (o regulador só sobe um degrau depois de ver a mesa aguentar efeito).
 */
export function createGpuPort(root: HTMLElement, o: { host(): HTMLElement; reduced(): boolean; busy?(): boolean }) {
  let runtime: Runtime | null = null;
  // A carga em andamento e o número dela (uma carga desfeita por `release` não segura a seguinte).
  let loading: { gen: number } | null = null;
  let idle: number | null = null;
  // Cada pedido de carga ganha um número: sair da mesa no meio da carga desfaz o que chegar atrasado.
  let generation = 0;
  // A cena mais recente da mesa viva: quem chega depois (a camada carregou agora) já começa nela.
  let scene: AmbienceScene | null = null;
  const coarse = () => globalThis.matchMedia?.('(pointer: coarse)').matches ?? false;
  const decision = () => gpuDecision({ level: effectsLevel(), tier: effectsTier(), forced: forcedGpu(), reduced: o.reduced(), webgl2: hasWebGL2(), lost: contextLost });
  // O regulador do automático: escuta os quadros só enquanto rege (mesa à vista, automático, com WebGL2).
  const governor = createGovernor();
  let unlisten: (() => void) | null = null;

  async function load(gen: number) {
    const [layerModule, effects, ambienceModule] = await Promise.all([import('./gpuLayer'), import('./gpuEffects'), import('./tableAmbience')]);
    if (gen !== generation) return;
    const layer = await layerModule.createGpuLayer(o.host(), {
      coarse: coarse(),
      onLost() { contextLost = true; runtime?.ambience?.destroy(); runtime = null; govern(); },
    });
    if (gen !== generation) { layer.destroy(); return; }
    effects.prepare(layer);
    // A mesa viva tem o próprio contexto: se ele cair, só ela some, e os efeitos continuam.
    const backdrop = ambienceOff() ? null : o.host().querySelector<HTMLElement>(':scope > .mat');
    const ambience = backdrop ? ambienceModule.createAmbience(backdrop, { coarse: coarse(), onLost() { if (runtime) runtime.ambience = null; } }) : null;
    if (ambience && scene) ambience.set(scene);
    if (ambience && effectsTier() >= 2) ambience.pause(true);
    runtime = { layer, effects, ambience };
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
  /** O regulador rege só no automático, com a mesa à vista e a GPU possível; fora disso, o degrau volta a 0. */
  function govern() {
    const on = effectsLevel() === 'auto' && forcedGpu() === undefined && !o.reduced() && hasWebGL2() && !contextLost && !root.hidden;
    if (on && !unlisten) { governor.reset(performance.now()); unlisten = listenFrames(step); }
    if (!on) { unlisten?.(); unlisten = null; setTier(0); }
  }
  /** A cada meio segundo: o pior quarto dos quadros, se algo animava e quantas permanentes há. */
  function step(w: FrameWindow) {
    const busy = (runtime?.layer.stats().live ?? 0) > 0 || !!o.busy?.();
    setTier(governor.sample({ at: w.at, fps: w.lowFps, busy, permanents: root.querySelectorAll?.('.slot').length ?? 0 }));
  }
  /** Degrau novo: 1 corta faíscas (gpuParticles.ts lê na hora), 2 para a mesa viva e a câmera, 3 troca para o CSS. */
  function setTier(next: EffectsTier) {
    if (next === effectsTier()) return;
    setEffectsTier(next);
    runtime?.ambience?.pause(next >= 2);
    if (decision().use === 'gpu') prepare(); else release();
  }

  /**
   * A mesa abriu (ou a opção voltou para completos): carrega a camada quando o navegador estiver ocioso, nunca no meio
   * de uma jogada.
   */
  function prepare() {
    govern();
    const d = decision();
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
    runtime?.ambience?.destroy(); runtime?.layer.destroy(); runtime = null;
  }
  // A mesa escondida (voltou à tela inicial, ao Laboratório) libera a camada; à mostra de novo (a partida abre depois
  // de a mesa ser preparada), carrega com a mesa ociosa.
  if (typeof MutationObserver !== 'undefined') new MutationObserver(() => { if (root.hidden) { release(); govern(); } else prepare(); }).observe(root, { attributes: true, attributeFilter: ['hidden'] });

  const port = {
    prepare, release,
    /** A opção "Efeitos" mudou. */
    refresh() { govern(); if (decision().use === 'gpu') prepare(); else release(); },
    /**
     * Desenha o efeito na camada GPU. Devolve false quando não desenhou (leves, reduzir movimento, camada ainda
     * carregando, contexto perdido): quem pediu faz o efeito em CSS.
     */
    play<N extends GpuEffectName>(name: N, params: GpuEffectParams[N]): boolean {
      if (!runtime || runtime.layer.destroyed || decision().use !== 'gpu') return false;
      return runtime.effects.play(runtime.layer, name, params);
    },
    clear() { runtime?.layer.clear(); },
    /** A mesa viva vai para esta cena (quem joga, a cor dele, a sua vida, o combate). */
    ambience(next: AmbienceScene) { scene = next; runtime?.ambience?.set(next); },
    /** Um toque do jogo na mesa viva (clarão, tremor, escurecer); sem ela, nada. */
    ambiencePulse(pulse: AmbiencePulse) { if (decision().use === 'gpu') runtime?.ambience?.pulse(pulse); },
    /** Para os testes: quadros da mesa viva e se ela está rodando (sem ela, nada). */
    ambienceStats: () => runtime?.ambience?.stats() ?? null,
    /** Se a textura de uma carta já carregou (a carta de costas só vira no ar com a face pronta); sem ela, começa a carregar. */
    textureReady(url: string) { return !!runtime && !runtime.layer.destroyed && runtime.effects.textureReady(runtime.layer, url); },
    preloadTable,
    /** Para os testes e a medição: quadros desenhados e efeitos vivos (sem a camada, nada). */
    stats: () => runtime?.layer.stats() ?? null,
    ready: () => !!runtime,
    /** Para os testes: põe a mesa num degrau do regulador, como se os quadros tivessem pedido. */
    setTier,
    /** Para os testes: carrega agora, sem esperar a mesa ficar ociosa. */
    async loadNow() { release(); if (decision().use !== 'gpu') return false; const gen = ++generation; await load(gen).catch(() => {}); return !!runtime; },
  };
  latest = port;
  return port;
}
