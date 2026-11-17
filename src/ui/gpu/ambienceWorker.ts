// O worker da mesa viva: desenha o shader num OffscreenCanvas fora da página, a 30 quadros por segundo, sem acordar a página a cada quadro.
import { AMBIENCE_FRAME_MS, ambienceContext, createAmbienceDraw, type AmbienceFromWorker, type AmbienceToWorker } from './ambienceDraw';

let canvas: OffscreenCanvas | null = null;
let draw: ReturnType<typeof createAmbienceDraw> = null;
let running = false, timer = 0, last = 0, frames = 0, reportedAt = 0;
const post = (m: AmbienceFromWorker) => postMessage(m);
// O laço: o requestAnimationFrame do worker (acompanha a tela) ou, sem ele, um relógio de 30 por segundo.
const hasRaf = typeof requestAnimationFrame === 'function';

function schedule() {
  timer = hasRaf ? requestAnimationFrame(frame) : setTimeout(() => frame(performance.now()), AMBIENCE_FRAME_MS) as unknown as number;
}
function cancel() {
  if (hasRaf) cancelAnimationFrame(timer); else clearTimeout(timer);
  timer = 0;
}
function frame(now: number) {
  timer = 0;
  if (!running || !draw) return;
  schedule();
  const elapsed = now - last;
  if (elapsed < AMBIENCE_FRAME_MS - 2) return;
  last = now;
  // Depois de uma pausa (aba de volta), a luz continua de onde estava, sem salto.
  draw.draw(Math.min(elapsed, 100) / 1000);
  frames++;
  // A página só sabe dos quadros para os testes: um recado a cada quarto de segundo basta.
  if (now - reportedAt >= 250) { reportedAt = now; post({ type: 'frames', frames }); }
}

onmessage = (e: MessageEvent<AmbienceToWorker>) => {
  const m = e.data;
  if (m.type === 'start') {
    canvas = m.canvas;
    canvas.width = m.width; canvas.height = m.height;
    const gl = ambienceContext(canvas);
    draw = gl ? createAmbienceDraw(gl) : null;
    if (!draw) { post({ type: 'failed' }); return; }
    canvas.addEventListener('webglcontextlost', lost => { lost.preventDefault(); running = false; cancel(); post({ type: 'lost' }); });
  } else if (m.type === 'size') {
    if (canvas && (canvas.width !== m.width || canvas.height !== m.height)) { canvas.width = m.width; canvas.height = m.height; }
  } else if (m.type === 'set') draw?.set(m.scene);
  else if (m.type === 'pulse') draw?.pulse(m.pulse);
  else if (m.type === 'run') {
    if (m.on && !running) { running = true; last = 0; schedule(); }
    if (!m.on && running) { running = false; cancel(); post({ type: 'frames', frames }); }
  }
};
