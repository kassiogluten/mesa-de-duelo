// O foil da carta aberta nos detalhes: ela inclina em 3D seguindo o mouse (ou o dedo arrastado de lado), com o reflexo de luz e o brilho da raridade dela, mais forte quanto mais rara.
import { effectsLevel } from './gpu/gpuSupport';
import './cardFoil.css';

/** O brilho de cada raridade: comum só com o reflexo, incomum prateado, rara dourada, mítica com arco-íris e especial com arco-íris e cintilado. */
export type Foil = 'common' | 'uncommon' | 'rare' | 'mythic' | 'special';

/** O foil de uma raridade do Scryfall (bonus vale como especial; sem raridade conhecida, comum). */
export function foilOf(rarity: string | undefined): Foil {
  return rarity === 'uncommon' || rarity === 'rare' || rarity === 'mythic' || rarity === 'special' ? rarity : rarity === 'bonus' ? 'special' : 'common';
}

/** Inclinação máxima, em graus, nos dois eixos. */
const TILT = 12;

/** Sem movimento (reduzir movimento ou Efeitos leves): o brilho fica parado, sem inclinar nem passar sozinho. */
function still() {
  return effectsLevel() === 'light' || (globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
}

/** Põe a luz em (x, y), de 0 a 1 na carta, e a inclinação que vem dela; `active` acende o brilho inteiro. */
function place(el: HTMLElement, x: number, y: number, active: boolean) {
  el.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`);
  el.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
  el.style.setProperty('--rx', `${((x - .5) * 2 * TILT).toFixed(2)}deg`);
  el.style.setProperty('--ry', `${((.5 - y) * 2 * TILT).toFixed(2)}deg`);
  el.classList.toggle('foil-active', active);
}

/**
 * Liga o foil em `el` (a moldura `.ci-foil` da imagem). Com `intro`, a luz passa uma vez pela carta ao abrir, para o
 * jogador ver que ela brilha mesmo sem mexer o mouse (no toque, é o único jeito de descobrir).
 */
export function attachFoil(el: HTMLElement | null, intro: boolean) {
  if (!el) return;
  place(el, .5, .5, false);
  if (still()) { el.classList.add('foil-still'); return; }
  let frame = 0, sweep = 0;
  const stopSweep = () => { if (sweep) cancelAnimationFrame(sweep); sweep = 0; };
  const follow = (e: PointerEvent) => {
    stopSweep();
    const r = el.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    if (frame) return;
    // Um ajuste por quadro, por mais rápido que o mouse ande.
    frame = requestAnimationFrame(() => { frame = 0; el.classList.add('tilting'); place(el, x, y, true); });
  };
  const rest = () => {
    if (frame) { cancelAnimationFrame(frame); frame = 0; }
    el.classList.remove('tilting');
    place(el, .5, .5, false);
  };
  el.addEventListener('pointerenter', follow);
  el.addEventListener('pointermove', follow);
  el.addEventListener('pointerleave', rest);
  el.addEventListener('pointercancel', rest);
  el.addEventListener('pointerup', e => { if (e.pointerType !== 'mouse') rest(); });
  if (!intro) return;
  // A passada de abertura: a luz vai do canto de cima à esquerda até o de baixo à direita, inclinando de leve, e volta ao meio.
  const start = performance.now(), ms = 1100;
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / ms), k = t < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    el.classList.add('tilting');
    place(el, .15 + .7 * k, .2 + .6 * k, true);
    if (t < 1 && el.isConnected) sweep = requestAnimationFrame(step);
    else { sweep = 0; rest(); }
  };
  sweep = requestAnimationFrame(step);
}
