// O Game Changer chegando à mesa, depois do voo: a mesa escurece em volta da carta, o facho e a gema da camada GPU (ou um anel dourado em CSS), a faixa "Game Changer" com o nome da carta e o selo de gema que aparece no canto quando a gema pousa.
import type { PresentationEvent } from './presentationTimeline';
import { center, reduced, type MotionKit, type Point } from './motionKit';
import { label } from './cardFaces';
import { esc } from './cardtext';

/** Metade da largura da faixa, para ela não sair da mesa quando a carta está num canto. */
const BANNER_HALF = 130;

export function createGameChangerMoment(kit: MotionKit) {
  const { layer, animate, effect, remove, later, gpu } = kit;
  /**
   * A faixa: ao lado da carta, do lado de dentro da mesa, quando ela está perto da borda (a pilha, com os avisos dela
   * embaixo); senão, embaixo dela, ou em cima, se embaixo não couber.
   */
  function banner(event: PresentationEvent, at: Point, ms: number) {
    const bounds = layer().getBoundingClientRect();
    const html = `<b>Game Changer</b><span>${esc(label(event.card!))}</span><i></i>`;
    const room = BANNER_HALF * 2 + 24;
    const side = at.cx + at.w / 2 + room > bounds.right ? 'left' : at.cx - at.w / 2 - room < bounds.left ? 'right' : null;
    let el: HTMLElement;
    if (side && at.w * 3 + room < bounds.width) {
      const cx = side === 'left' ? at.cx - at.w / 2 - 18 : at.cx + at.w / 2 + 18;
      el = effect(`gc-banner ${side}`, { cx, cy: at.cy + at.h * .12, w: 0, h: 0 }, html);
    } else {
      const below = at.cy + at.h / 2 + 52 < bounds.bottom;
      const cx = Math.max(bounds.left + BANNER_HALF, Math.min(bounds.right - BANNER_HALF, at.cx));
      el = effect(`gc-banner${below ? '' : ' above'}`, { cx, cy: below ? at.cy + at.h / 2 + 10 : at.cy - at.h / 2 - 10, w: 0, h: 0 }, html);
    }
    const still = reduced();
    animate(el, [
      { opacity: 0, translate: still ? '0 0' : '0 8px' },
      { opacity: 1, translate: '0 0', offset: .16 },
      { opacity: 1, translate: '0 0', offset: .8 },
      { opacity: 0, translate: '0 0' },
    ], ms, 'ease-out');
    if (!still) animate(el.querySelector<HTMLElement>('i')!, [{ scale: '0 1' }, { scale: '0 1', offset: .12 }, { scale: '1 1', offset: .4 }, { scale: '1 1' }], ms, 'ease-out');
    later(() => remove(el), ms);
  }
  /**
   * `host`: a pilha (a mágica no topo) ou a permanente no campo (o terreno). `ms`: o tempo da cena, depois do voo. Com
   * "reduzir movimento", só a faixa aparece; o selo já está no canto.
   */
  function moment(event: PresentationEvent, host: HTMLElement | null, ms: number) {
    if (!host || !event.card || ms < 200) return;
    const cardEl = host.matches('.stack-pile') ? host.querySelector<HTMLElement>('.stack-layer') ?? host : host;
    const at = center(cardEl);
    if (!at) return;
    const badge = host.querySelector<HTMLElement>('.badge.game-changer');
    banner(event, at, ms);
    if (reduced()) return;
    gpu.ambiencePulse({ dim: { amount: .45, ms: ms * .8 } });
    gpu.play('spotlight', { at, radius: Math.max(at.w, at.h) * .75 + 30, duration: ms, strength: .45 });
    if (gpu.play('gameChanger', { at, to: center(badge), duration: ms })) {
      // O selo só aparece quando a gema pousa nele, e salta.
      if (badge) animate(badge, [{ opacity: 0, scale: '1' }, { opacity: 0, scale: '1', offset: .965 }, { opacity: 1, scale: '1.4', offset: .985 }, { opacity: 1, scale: '1' }], ms + 120, 'linear');
      return;
    }
    // Sem a camada GPU: um anel dourado acende em volta da carta e o selo salta no canto.
    const halo = effect('gc-halo', { ...at, w: at.w + 10, h: at.h + 10 });
    const pulse = Math.round(ms * .7);
    animate(halo, [{ opacity: 0, scale: '1.08' }, { opacity: 1, scale: '1', offset: .25 }, { opacity: .8, scale: '1', offset: .7 }, { opacity: 0, scale: '1.04' }], pulse, 'ease-out');
    later(() => remove(halo), pulse);
    if (badge) animate(badge, [{ opacity: 0, scale: '.2', rotate: '-30deg' }, { opacity: 0, scale: '.2', rotate: '-30deg', offset: .3 }, { opacity: 1, scale: '1.35', rotate: '0deg', offset: .55 }, { opacity: 1, scale: '1', rotate: '0deg' }], pulse, 'ease-out');
  }
  return { moment };
}
