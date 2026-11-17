// A mesa viva: um shader só, por baixo das cartas (ambienceDraw.ts), a 30 quadros por segundo em meia resolução, desenhado num worker para a página não acordar a cada quadro; sem worker com OffscreenCanvas, na própria página.
import { AMBIENCE_FRAME_MS, ambienceContext, createAmbienceDraw, type AmbienceFromWorker, type AmbiencePulse, type AmbienceScene, type AmbienceToWorker } from './ambienceDraw';

export type { AmbiencePulse, AmbienceScene } from './ambienceDraw';

/** Quadros desenhados (para os testes: parada, a conta não sobe). */
interface AmbienceStats { frames: number; running: boolean }

/** Quem desenha: o worker ou a própria página. `run` liga e desliga o laço; `frames` conta os quadros. */
interface Painter {
  set(scene: AmbienceScene): void;
  pulse(p: AmbiencePulse): void;
  run(on: boolean): void;
  resize(width: number, height: number): void;
  frames(): number;
  destroy(): void;
}

/** O navegador desenha WebGL fora da página? (Sem isso, a mesa viva fica na página, como antes.) */
const offscreen = () => typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && 'transferControlToOffscreen' in HTMLCanvasElement.prototype;

/**
 * Cria o canvas da mesa viva dentro de `host` (o fundo da mesa). Devolve null sem WebGL2 ou sem compilar o shader na
 * página: a mesa fica com o fundo de sempre. No worker, a falha chega depois: ele tenta de novo na página, e só sem
 * ela avisa `onLost`.
 */
export function createAmbience(host: HTMLElement, opts: { coarse: boolean; onLost?(): void }) {
  // Luz difusa não precisa de nitidez: meia resolução no computador, um terço no celular.
  const scale = opts.coarse ? .34 : .5;
  const size = () => ({ width: Math.max(1, Math.round(innerWidth * scale)), height: Math.max(1, Math.round(innerHeight * scale)) });
  // A cena e o laço guardados aqui: quem desenha de novo (o worker falhou e a página assumiu) começa igual.
  let scene: AmbienceScene | null = null, running = false, destroyed = false, paused = false;

  let canvas = newCanvas();
  let painter: Painter | null = offscreen() ? workerPainter(canvas) : pagePainter(canvas);
  if (!painter) return null;
  host.append(canvas);

  function newCanvas() {
    const el = document.createElement('canvas');
    el.className = 'table-ambience';
    el.setAttribute('aria-hidden', 'true');
    return el;
  }
  /** O worker não conseguiu (sem WebGL2 no OffscreenCanvas, worker que não carregou): a página assume. */
  function fallBack() {
    if (destroyed) return;
    painter?.destroy();
    const next = newCanvas(), page = pagePainter(next);
    canvas.replaceWith(next); canvas = next;
    if (!page) { lose(); return; }
    painter = page;
    if (scene) page.set(scene);
    if (running) page.run(true);
  }
  function lose() { destroy(); opts.onLost?.(); }

  function workerPainter(el: HTMLCanvasElement): Painter {
    const worker = new Worker(new URL('./ambienceWorker.ts', import.meta.url), { type: 'module' });
    const send = (m: AmbienceToWorker, transfer: Transferable[] = []) => worker.postMessage(m, transfer);
    let frames = 0;
    worker.onmessage = (e: MessageEvent<AmbienceFromWorker>) => {
      if (e.data.type === 'frames') frames = e.data.frames;
      else if (e.data.type === 'failed') fallBack();
      else lose();
    };
    worker.onerror = e => { e.preventDefault(); fallBack(); };
    const target = el.transferControlToOffscreen();
    send({ type: 'start', canvas: target, ...size() }, [target]);
    return {
      set: next => send({ type: 'set', scene: next }),
      pulse: p => send({ type: 'pulse', pulse: p }),
      run: on => send({ type: 'run', on }),
      resize: (width, height) => send({ type: 'size', width, height }),
      frames: () => frames,
      destroy: () => worker.terminate(),
    };
  }

  function pagePainter(el: HTMLCanvasElement): Painter | null {
    const gl = ambienceContext(el);
    if (!gl) return null;
    const draw = createAmbienceDraw(gl);
    if (!draw) { gl.getExtension('WEBGL_lose_context')?.loseContext(); return null; }
    const lost = (e: Event) => { e.preventDefault(); lose(); };
    el.addEventListener('webglcontextlost', lost);
    let frames = 0, raf = 0, last = 0;
    const resize = (width: number, height: number) => { if (el.width !== width || el.height !== height) { el.width = width; el.height = height; } };
    const { width, height } = size();
    resize(width, height);
    function frame(now: number) {
      raf = requestAnimationFrame(frame);
      const elapsed = now - last;
      if (elapsed < AMBIENCE_FRAME_MS - 2) return;
      last = now;
      // Depois de uma pausa (aba de volta), a luz continua de onde estava, sem salto.
      draw!.draw(Math.min(elapsed, 100) / 1000);
      frames++;
    }
    return {
      set: next => draw.set(next),
      pulse: p => draw.pulse(p),
      run(on) {
        if (on && !raf) { last = 0; raf = requestAnimationFrame(frame); }
        if (!on) { cancelAnimationFrame(raf); raf = 0; }
      },
      resize,
      frames: () => frames,
      destroy() {
        cancelAnimationFrame(raf); raf = 0;
        el.removeEventListener('webglcontextlost', lost);
        gl.getExtension('WEBGL_lose_context')?.loseContext();
      },
    };
  }

  /** O laço roda com a mesa viva solta (fora do degrau 2) e a aba à vista. */
  function sync() {
    const on = !destroyed && !paused && !document.hidden;
    if (on !== running) { running = on; painter?.run(on); }
  }
  const resized = () => { const { width, height } = size(); painter?.resize(width, height); };
  document.addEventListener('visibilitychange', sync);
  addEventListener('resize', resized);

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    sync();
    document.removeEventListener('visibilitychange', sync);
    removeEventListener('resize', resized);
    painter?.destroy(); painter = null;
    canvas.remove();
  }
  sync();
  return {
    get canvas() { return canvas; },
    /** A cena nova: a luz, a cor e a vinheta deslizam até ela. */
    set(next: AmbienceScene) { scene = next; painter?.set(next); },
    /** O regulador para (degrau 2) ou solta a mesa viva; parada, ela guarda o último quadro e ignora os toques. */
    pause(on: boolean) { paused = on; sync(); },
    /** Um toque do jogo: clarão, tremor ou escurecer (somam com o que já está acontecendo). */
    pulse(p: AmbiencePulse) { if (!paused) painter?.pulse(p); },
    destroy,
    get destroyed() { return destroyed; },
    stats: (): AmbienceStats => ({ frames: painter?.frames() ?? 0, running }),
  };
}
export type Ambience = NonNullable<ReturnType<typeof createAmbience>>;
