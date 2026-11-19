// O golpe de comandante num jogador: a coroa dourada que se estampa no retrato (e se parte no golpe que chega a 21) e a coroa pequena que voa até o contador "Dano X/21", que rola do número de antes para o de agora.
import type { PresentationEvent } from './presentationTimeline';
import { center, reduced, type MotionKit, type Point } from './motionKit';
import { COMMANDER_LIMIT, COMMANDER_NEAR, commanderCounterChange, countsOf } from './commanderCounter';

/** A cor da aura, do rastro e das faíscas do comandante que golpeia. */
export const COMMANDER_GOLD = '#f2c14c';

const CROWN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7.5l4.6 3.9L12 4.2l4.4 7.2L21 7.5 19 18H5zM5 19.3h14v2.2H5z"/></svg>';

export function createCommanderMotion(kit: MotionKit) {
  const { root, later, animate, effect, remove, gpu, hiddenCards, onClear } = kit;

  /** O contador "Dano X/21" do jogador que está à vista (a tela de foco também tem um). */
  function counterOf(player: number) {
    const all = [...root.querySelectorAll<HTMLElement>(`.commander-damage[data-zone="damage"][data-gy="${player}"]`)];
    return all.find(el => el.getBoundingClientRect().width > 0) ?? null;
  }
  /** Escreve um valor no contador, com o alerta de perto de 21. */
  function show(counter: HTMLElement, value: number) {
    const b = counter.querySelector('b');
    if (b) b.textContent = `${value}/${COMMANDER_LIMIT}`;
    counter.classList.toggle('danger', value >= COMMANDER_NEAR);
  }
  /** Mostra o contador de volta, se o golpe o tinha escondido (o primeiro dano de comandante: antes, nem havia contador). */
  function reveal(counter: HTMLElement) {
    if (!hiddenCards.delete(counter)) return false;
    counter.style.opacity = '';
    return true;
  }

  /**
   * Antes do golpe: o quadro da jogada já traz o dano com este golpe, e o contador volta para o de antes (ou some, se
   * ainda não havia dano de comandante) até a coroa chegar. Se a apresentação for interrompida, ele fica certo.
   */
  function prime(event: PresentationEvent) {
    const player = event.targets?.players?.[0];
    const counter = player === undefined ? null : counterOf(player);
    if (!counter || reduced()) return;
    const change = commanderCounterChange(countsOf(counter), event);
    if (!change || change.before === change.after) return;
    if (change.before <= 0) { counter.style.opacity = '0'; hiddenCards.add(counter); }
    else show(counter, change.before);
    const settle = () => { reveal(counter); show(counter, change.after); };
    const drop = onClear(settle);
    // Rede de segurança: mesmo sem a coroa chegar (o retrato não estava à vista), o contador acerta sozinho.
    later(() => { drop(); settle(); }, 2600);
  }

  /** A coroa se estampa no retrato em `at`; na reserva em CSS, a coroa do selo cresce e some (ou treme e fica vermelha). */
  function stamp(at: Point, lethal: boolean) {
    const size = Math.max(54, Math.min(110, Math.max(at.w, 48) * 1.15));
    if (gpu.play('crownStamp', { at, size, lethal })) return;
    const crown = effect(`crown-stamp${lethal ? ' lethal' : ''}`, { ...at, w: size, h: size }, CROWN);
    const frames: Keyframe[] = lethal
      ? [{ opacity: 0, scale: '1.9' }, { opacity: 1, scale: '1', offset: .16 }, { opacity: 1, scale: '1', translate: '-3px 0', offset: .3 }, { opacity: 1, translate: '3px 0', offset: .38 }, { opacity: 1, translate: '-2px 0', offset: .46 }, { opacity: 0, scale: '1.3', translate: '0 10px' }]
      : [{ opacity: 0, scale: '1.9' }, { opacity: 1, scale: '.94', offset: .2 }, { opacity: 1, scale: '1', offset: .32 }, { opacity: 1, scale: '1', translate: '0 0', offset: .65 }, { opacity: 0, scale: '.9', translate: '0 -14px' }];
    animate(crown, frames, lethal ? 1000 : 760, 'ease-out');
    later(() => remove(crown), lethal ? 1020 : 780);
  }

  /** A coroa pequena voa do retrato até o contador; na reserva em CSS, a coroa do selo faz o arco. */
  function fly(from: Point, to: Point, lethal: boolean, duration: number) {
    if (gpu.play('crownFly', { from, to, duration, lethal })) return;
    const crown = effect(`crown-fly${lethal ? ' lethal' : ''}`, { ...from, w: 30, h: 30 }, CROWN);
    const dx = to.cx - from.cx, dy = to.cy - from.cy, lift = Math.min(120, Math.hypot(dx, dy) * .4);
    const frames: Keyframe[] = [];
    for (let i = 0; i <= 10; i++) {
      const u = i / 10, k = u < .5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
      const y = dy * k - lift * 4 * k * (1 - k);
      frames.push({ translate: `${(dx * k).toFixed(1)}px ${y.toFixed(1)}px`, scale: String(+(1 - .4 * k).toFixed(2)), opacity: i === 10 ? .2 : 1 });
    }
    animate(crown, frames, duration, 'linear');
    later(() => remove(crown), duration);
  }

  /** A coroa chegou: o contador aparece (ou acende), cresce um instante e rola do número de antes para o de agora. */
  function arrive(player: number, change: ReturnType<typeof commanderCounterChange>, lethal: boolean) {
    const counter = counterOf(player);
    if (!counter) return;
    const appeared = reveal(counter);
    counter.classList.add('commander-hit');
    if (lethal) counter.classList.add('commander-lethal');
    later(() => counter.classList.remove('commander-hit', 'commander-lethal'), 900);
    animate(counter, appeared
      ? [{ scale: '.2', opacity: 0 }, { scale: '1.3', opacity: 1, offset: .45 }, { scale: '1' }]
      : [{ scale: '1' }, { scale: '1.28', offset: .3 }, { scale: '1' }], 460, 'cubic-bezier(.2, 1.4, .4, 1)');
    // O "+N" sai logo abaixo do contador (ele fica perto da borda e da taxa do comandante: o número que sobe do
    // retrato ficaria em cima dela).
    const at = center(counter);
    if (change && at) {
      const plus = effect(`commander-plus${lethal ? ' lethal' : ''}`, { ...at, cy: at.cy + at.h / 2, w: 40, h: 20 });
      plus.textContent = `+${change.hit}`;
      animate(plus, [{ opacity: 0, translate: '0 -6px', scale: '.6' }, { opacity: 1, translate: '0 2px', scale: '1.15', offset: .2 }, { opacity: 1, translate: '0 6px', scale: '1', offset: .7 }, { opacity: 0, translate: '0 12px' }], 1000, 'ease-out');
      later(() => remove(plus), 1020);
    }
    if (!change) return;
    // Rola de um em um, mais rápido quanto maior o salto, e termina no valor de agora.
    const from = change.before, to = change.after, steps = Math.max(0, to - from), each = steps ? Math.min(70, 320 / steps) : 0;
    for (let i = 1; i <= steps; i++) later(() => { if (counter.isConnected) show(counter, from + i); }, i * each);
    later(() => { if (counter.isConnected) show(counter, to); }, steps * each + 10);
  }

  /**
   * O golpe de comandante chegou ao retrato em `at`: a coroa se estampa (e se parte, no golpe que chega a 21) e uma
   * coroa pequena voa até o contador "Dano X/21". Com "reduzir movimento", só o contador muda e acende.
   */
  function hit(event: PresentationEvent, at: Point) {
    const player = event.targets?.players?.[0];
    if (player === undefined) return;
    const counter = counterOf(player);
    const change = commanderCounterChange(countsOf(counter), event);
    const lethal = !!change?.lethal;
    if (reduced()) { if (counter) { reveal(counter); if (change) show(counter, change.after); } return; }
    stamp(at, lethal);
    const to = center(counter?.querySelector('b') ?? counter);
    if (!to) return;
    const wait = lethal ? 480 : 240, duration = 520;
    later(() => fly(at, to, lethal, duration), wait);
    later(() => arrive(player, change, lethal), wait + duration);
  }

  return { prime, hit, stamp, fly };
}
