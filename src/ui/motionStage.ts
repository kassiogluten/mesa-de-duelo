import type { PresentationEvent } from './presentationTimeline';
import { center, reduced, type MotionKit, type Point } from './motionKit';

/** O que acontece no meio da mesa ou nos retratos: moeda e dado, cartas reveladas e o fim da partida. */
export function createStageMotion(kit: MotionKit) {
  const { root, layer, later, animate, effect, remove, shatter, gpu } = kit;
  /** Moeda e dado: giram no centro da mesa e param no resultado, com quem jogou embaixo. */
  function chance(event: PresentationEvent, label: string, duration: number) {
    const bounds = layer().getBoundingClientRect();
    const coin = event.type === 'coin';
    const size = Math.max(64, Math.min(96, bounds.height * .12));
    const at: Point = { cx: bounds.left + bounds.width * .5, cy: bounds.top + bounds.height * .46, w: size, h: size };
    const piece = effect(`chance-piece ${coin ? `coin ${event.heads ? 'heads' : 'tails'}` : 'die'}`, at);
    const value = document.createElement('b');
    const final = coin ? (event.heads ? 'Cara' : 'Coroa') : String(event.result ?? '?');
    value.textContent = final; piece.append(value);
    if (!coin && event.sides) { const sides = document.createElement('small'); sides.textContent = `d${event.sides}`; piece.append(sides); }
    const caption = document.createElement('span'); caption.className = 'presentation-caption'; caption.textContent = label; piece.append(caption);
    const hold = Math.max(duration, 1100);
    later(() => remove(piece), hold);
    if (reduced()) return;
    // Na camada GPU: a moeda gira com espessura e sombra, o dado rola com perspectiva; a peça em CSS fica só com a legenda.
    const font = getComputedStyle(piece).fontFamily || 'sans-serif';
    if (coin ? gpu.play('coin', { at, heads: !!event.heads, label: final, hold, font }) : gpu.play('die', { at: { ...at, w: size * .9, h: size * .9 }, result: final, sides: event.sides ?? 6, hold, font })) {
      piece.classList.add('gpu-drawn');
      animate(caption, [{ opacity: 0 }, { opacity: 1, offset: .15 }, { opacity: 1, offset: .88 }, { opacity: 0 }], hold);
      return;
    }
    if (coin) {
      // Sobe girando no ar (cinco voltas) e cai mostrando o lado que saiu.
      animate(piece, [
        { opacity: 0, translate: '0 40px', scale: '.6', rotate: 'x 0deg' },
        { opacity: 1, translate: '0 -60px', scale: '1.1', rotate: 'x 900deg', offset: .35 },
        { opacity: 1, translate: '0 0', scale: '1', rotate: 'x 1800deg', offset: .62, easing: 'cubic-bezier(.3,1.5,.5,1)' },
        { opacity: 1, translate: '0 0', scale: '1', rotate: 'x 1800deg', offset: .88 },
        { opacity: 0, translate: '0 0', scale: '1', rotate: 'x 1800deg' }], hold, 'cubic-bezier(.3,.6,.4,1)');
      return;
    }
    // O dado rola de lado, trocando de número, e para no resultado com um quique.
    const sides = Math.max(2, event.sides ?? 6), result = event.result ?? 1;
    for (let i = 0; i < 6; i++) later(() => { value.textContent = String(((result + i * 7) % sides) + 1); }, 60 + i * 80);
    later(() => { value.textContent = final; }, 60 + 6 * 80);
    animate(piece, [
      { opacity: 0, translate: '-120px 30px', rotate: '-200deg', scale: '.7' },
      { opacity: 1, translate: '-40px -20px', rotate: '-60deg', scale: '1', offset: .25 },
      { opacity: 1, translate: '0 0', rotate: '0deg', scale: '1.12', offset: .5 },
      { opacity: 1, translate: '0 0', rotate: '0deg', scale: '1', offset: .6 },
      { opacity: 1, translate: '0 0', rotate: '0deg', scale: '1', offset: .88 },
      { opacity: 0, translate: '0 0', rotate: '0deg', scale: '1' }], hold, 'cubic-bezier(.3,.6,.4,1)');
  }
  function revealIn(shown: HTMLElement[]) {
    if (reduced()) return;
    // Entram de costas, crescem um pouco e viram de face, uma depois da outra.
    shown.slice(0, 12).forEach((el, i) => animate(el, [
      { rotate: 'y 180deg', scale: '.8', opacity: 0, filter: 'brightness(.6)' },
      { rotate: 'y 90deg', scale: '1.08', opacity: 1, filter: 'brightness(1.4)', offset: .5 },
      { rotate: 'y 0deg', scale: '1', opacity: 1, filter: 'none' }], 520, 'cubic-bezier(.3,.7,.4,1)', 120 + i * 90));
  }
  function finale(winners: number[], losers: number[]): number {
    if (document.hidden || root.hidden || reduced()) return 0;
    const avatar = (id: number) => root.querySelector<HTMLElement>(`.avatar[data-pid="${id}"]`);
    for (const id of losers) {
      const el = avatar(id), at = center(el);
      if (!el || !at) continue;
      el.classList.add('finale-lose');
      later(() => el.classList.remove('finale-lose'), 1500);
      // Na camada GPU, o retrato racha e solta cinzas e fumaça; sem ela, os estilhaços de sempre.
      if (!gpu.play('defeat', { at })) shatter({ ...at, w: Math.max(at.w, 70), h: Math.max(at.h, 70) });
      animate(el, [{ translate: '0 0' }, { translate: '-5px 0', offset: .15 }, { translate: '5px 0', offset: .3 }, { translate: '-3px 0', offset: .45 }, { translate: '0 0', offset: .6 }, { translate: '0 0' }], 700);
    }
    for (const id of winners) {
      const el = avatar(id), at = center(el);
      if (!el || !at) continue;
      el.classList.add('finale-win');
      later(() => el.classList.remove('finale-win'), 1500);
      // Na camada GPU: raios dourados girando atrás do retrato, onda de luz e confete.
      if (gpu.play('victory', { at, delay: 200 })) continue;
      const size = Math.max(at.w, at.h) * 2.4;
      const wave = effect('walker-wave finale-wave', { ...at, w: size, h: size });
      wave.style.setProperty('--walker', '#f2b54c');
      animate(wave, [{ opacity: .9, scale: '.2' }, { opacity: .5, scale: '.8', offset: .5 }, { opacity: 0, scale: '1.2' }], 1000, 'cubic-bezier(.2,.6,.3,1)', 200);
      later(() => remove(wave), 1250);
    }
    const arena = root.querySelector<HTMLElement>('.arena');
    if (arena && losers.length) animate(arena, [{ translate: '0 0' }, { translate: '-4px 2px', offset: .25 }, { translate: '3px -1px', offset: .5 }, { translate: '0 0' }], 320, 'linear', 80);
    return 1300;
  }
  return { chance, revealIn, finale };
}
