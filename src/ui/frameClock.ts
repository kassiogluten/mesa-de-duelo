// O relógio de quadros da mesa: um laço só de requestAnimationFrame, ligado enquanto alguém escuta e a aba está à vista, que a cada meio segundo diz quantos quadros por segundo a mesa desenhou.

/** Uma janela de meio segundo: a média e a do pior quarto dos quadros (a que o regulador usa: um quadro solto não pesa). */
export interface FrameWindow { at: number; fps: number; lowFps: number }

const WINDOW_MS = 500;

/** Quadros por segundo do pior quarto: o intervalo entre quadros no percentil 75. */
export function lowFps(gaps: number[]): number {
  if (!gaps.length) return 0;
  const sorted = [...gaps].sort((a, b) => a - b);
  return 1000 / sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * .75))]!;
}

const listeners = new Set<(w: FrameWindow) => void>();
let raf = 0, start = 0, last = 0, frames = 0;
let gaps: number[] = [];

function tick(now: number) {
  // Quem para de escutar dentro do aviso (o regulador indo descansar) desliga o laço: este quadro não pede outro.
  raf = 0;
  if (last) { gaps.push(now - last); frames++; }
  last = now;
  if (!start) start = now;
  if (now - start >= WINDOW_MS) {
    const w: FrameWindow = { at: now, fps: Math.round(frames * 1000 / (now - start)), lowFps: Math.round(lowFps(gaps)) };
    start = now; frames = 0; gaps = [];
    for (const fn of listeners) fn(w);
  }
  if (!raf && listeners.size && !document.hidden) raf = requestAnimationFrame(tick);
}
/** Liga só com alguém escutando e a aba à vista; ao voltar, recomeça a janela (a pausa não conta como quadro lento). */
function sync() {
  const on = listeners.size > 0 && !document.hidden;
  if (on && !raf) { start = last = frames = 0; gaps = []; raf = requestAnimationFrame(tick); }
  if (!on && raf) { cancelAnimationFrame(raf); raf = 0; }
}
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', sync);

/** Escuta as janelas; devolve como parar de escutar. */
export function listenFrames(fn: (w: FrameWindow) => void): () => void {
  listeners.add(fn); sync();
  return () => { listeners.delete(fn); sync(); };
}
