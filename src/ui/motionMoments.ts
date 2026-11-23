// Os momentos que contam a história do jogo, na mesa: o corte vermelho e a faixa do primeiro sangue no retrato atingido, e os retratos se apagando um depois do outro, com a faixa da eliminação dupla (ou tripla), quando o mesmo golpe derruba vários jogadores.
import type { PresentationEvent } from './presentationTimeline';
import { center, reduced, type MotionKit, type Point } from './motionKit';
import { FIRST_BLOOD, multiKill } from './tableMoments';

const BLOOD = '#e2544a';

export function createMomentMotion(kit: MotionKit) {
  const { root, layer, animate, effect, remove, later, gpu } = kit;
  const portrait = (player: number | undefined) => center(root.querySelector(`.avatar-slot [data-pid="${player}"]`));

  /**
   * A faixa: ao lado do ponto, do lado do meio da mesa (embaixo e em cima dele aparecem o número do dano e o nome do
   * jogador); no meio da mesa sem ponto.
   */
  function banner(cls: string, title: string, at: Point | undefined, ms: number, sub?: string) {
    const bounds = layer().getBoundingClientRect();
    const html = `<b>${title}</b>${sub ? `<span>${sub}</span>` : ''}<i></i>`;
    let el: HTMLElement;
    if (!at) el = effect(`moment-banner middle ${cls}`, { cx: bounds.left + bounds.width / 2, cy: bounds.top + bounds.height * .42, w: 0, h: 0 }, html);
    else {
      const right = at.cx < bounds.left + bounds.width / 2;
      el = effect(`moment-banner ${cls} ${right ? 'right' : 'left'}`, { cx: right ? at.cx + at.w / 2 + 22 : at.cx - at.w / 2 - 22, cy: at.cy + at.h * .5, w: 0, h: 0 }, html);
    }
    const still = reduced();
    // A curva vai em cada trecho: uma curva que passa do ponto na cena inteira adiantaria o fim da faixa.
    animate(el, [
      { opacity: 0, scale: still ? '1' : '.85', easing: 'cubic-bezier(.2,1.4,.4,1)' },
      { opacity: 1, scale: '1', offset: .1 },
      { opacity: 1, scale: '1', offset: .82, easing: 'ease-in' },
      { opacity: 0, scale: '1' },
    ], ms, 'linear');
    if (!still) animate(el.querySelector<HTMLElement>('i')!, [{ scale: '0 1' }, { scale: '0 1', offset: .08, easing: 'ease-out' }, { scale: '1 1', offset: .3 }, { scale: '1 1' }], ms, 'linear');
    later(() => remove(el), ms);
  }

  /** Um corte de lâmina, na diagonal, por cima do ponto: risca rápido e some. */
  function slash(at: Point, delay: number, angle: number) {
    const length = Math.max(at.w, at.h) * 2.4;
    const cut = effect('moment-slash', { ...at, w: length, h: 0 });
    cut.style.transform = `translate(-50%, -50%) rotate(${angle}deg)`;
    animate(cut, [
      { opacity: 1, clipPath: 'inset(0 100% 0 0)' },
      { opacity: 1, clipPath: 'inset(0 0 0 0)', offset: .3 },
      { opacity: 1, clipPath: 'inset(0 0 0 0)', offset: .55 },
      { opacity: 0, clipPath: 'inset(0 0 0 100%)' },
    ], 460, 'cubic-bezier(.3,0,.2,1)', delay);
    later(() => remove(cut), 460 + delay);
  }

  /** O primeiro golpe de combate num jogador: o corte vermelho no retrato e a faixa pequena, sem a borda da mesa piscar (discreto). */
  function firstBlood(event: PresentationEvent, ms: number) {
    const at = portrait(event.targets?.players?.[0]);
    const hold = Math.max(ms, 1300);
    banner('blood', FIRST_BLOOD.title, at, hold);
    if (reduced() || !at) return;
    slash(at, 60, -32);
    gpu.play('arrive', { at, color: BLOOD, size: Math.max(at.w, at.h) * 1.2 });
  }

  /**
   * Vários jogadores derrubados pelo mesmo golpe: os retratos se apagam um depois do outro, cada um com um corte, e a
   * faixa da eliminação aparece no meio da mesa. Devolve quanto a cena dura.
   */
  function multiKillScene(players: number[], ms: number) {
    const named = multiKill(players.length);
    if (!named) return 0;
    const gap = 280, hold = Math.max(ms, 2200);
    banner('kill', named.title, undefined, hold);
    if (reduced()) return hold;
    players.forEach((player, i) => {
      const el = root.querySelector<HTMLElement>(`.avatar-slot [data-pid="${player}"]`), at = center(el);
      if (!el || !at) return;
      const delay = 220 + i * gap;
      slash(at, delay, -35);
      slash(at, delay + 90, 35);
      animate(el, [{ filter: 'none' }, { filter: 'grayscale(1) brightness(.45)', offset: .25 }, { filter: 'grayscale(1) brightness(.45)', offset: .85 }, { filter: 'none' }],
        hold - delay, 'ease-out', delay);
      later(() => gpu.play('arrive', { at, color: BLOOD, size: Math.max(at.w, at.h) * 1.8 }), delay);
    });
    return hold;
  }

  /** O campo lotado rangendo: a mesa balança de leve, como madeira cedendo ao peso. */
  function creak() {
    const arena = root.querySelector<HTMLElement>('.arena');
    if (!arena || reduced()) return;
    animate(arena, [{ rotate: '0deg' }, { rotate: '.22deg', offset: .2 }, { rotate: '-.16deg', offset: .45 }, { rotate: '.08deg', offset: .7 }, { rotate: '0deg' }], 700, 'ease-in-out');
  }

  return { firstBlood, multiKill: multiKillScene, creak };
}
