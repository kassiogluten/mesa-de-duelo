// Animações da permanente que aguenta: a indestrutível e a regenerada racham e se fecham em luz, e o corte do primeiro golpe e do golpe duplo no alvo.
import type { PresentationEvent } from './presentationTimeline';
import { center, reduced, type MotionKit, type Point } from './motionKit';

const SHIELD = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5z"/></svg>';
const LEAF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 4C10 4 5 9 5 15c0 1 .2 2 .6 2.900L4 19.500 5.500 21l1.600-1.600c.9.4 1.900.6 2.900.6 6 0 11-5 10-16z"/></svg>';

export function createSurviveMotion(kit: MotionKit) {
  const { root, later, animate, effect, remove, floatNumber, gpu } = kit;

  /**
   * A permanente em `at` ficou no campo: na camada GPU, ela racha e as rachaduras se fecham em luz (dourada na
   * indestrutível, verde na regenerada); em CSS, um contorno na mesma cor acende em volta dela. Sempre com o nome do
   * que a salvou subindo da carta.
   */
  function mend(at: Point, how: 'indestructible' | 'regenerated', duration = 820) {
    const regen = how === 'regenerated';
    floatNumber({ ...at, h: at.h * .6 }, regen ? 'Regenerou' : 'Indestrutível', `survive ${regen ? 'regen' : 'gold'}`, [], regen ? LEAF : SHIELD);
    if (reduced() || gpu.play('mend', { at, how, duration })) return;
    const glow = effect(`mend-glow ${regen ? 'regen' : 'gold'}`, at);
    animate(glow, [{ opacity: 0, scale: '1.12' }, { opacity: .95, scale: '1', offset: .4 }, { opacity: .8, scale: '1', offset: .7 }, { opacity: 0, scale: '1.06' }], duration, 'ease-out');
    later(() => remove(glow), duration + 20);
  }
  /** O passo de um `survived` (e dos outros da mesma mágica, que saem juntos): cada carta racha e se fecha no lugar dela. */
  function survived(event: PresentationEvent, duration: number) {
    const id = event.card?.id ?? event.sourceId;
    const el = id === undefined ? null : root.querySelector<HTMLElement>(`.field [data-fid="${id}"]`), box = center(el);
    if (!el || !box || !event.survived) return;
    // A regenerada vira na mesma hora: a caixa medida no meio do giro vale pelo formato em que a carta vai ficar.
    const lying = !!el.closest('.tapped'), long = Math.max(box.w, box.h), short = Math.min(box.w, box.h);
    const at = { ...box, w: lying ? long : short, h: lying ? short : long };
    mend(at, event.survived, Math.max(620, duration));
    // A carta estremece com o golpe que não a levou.
    if (el) animate(el, [{ translate: '0 0' }, { translate: '-3px 0', offset: .12 }, { translate: '3px 0', offset: .26 }, { translate: '-2px 0', offset: .4 }, { translate: '0 0', offset: .55 }, { translate: '0 0' }], 520);
  }
  /**
   * O corte do primeiro golpe no alvo em `at`, vindo no sentido `dir`; `second` é o segundo golpe do golpe duplo, que
   * cruza o primeiro. Em CSS, um risco claro (dois, cruzados, no segundo).
   */
  function slash(at: Point, dir: number, second: boolean) {
    if (reduced() || gpu.play('slash', { at, dir, second })) return;
    const reach = Math.max(at.w, at.h, 60) * 1.5, turn = dir + Math.PI / 2;
    for (const [i, tilt] of (second ? [-.6, .6] : [-.6]).entries()) {
      const cut = effect('strike-slash', { ...at, w: reach, h: 3 });
      cut.style.rotate = `${turn + tilt}rad`;
      const faint = second && i === 0;
      animate(cut, [{ scale: '0 1', opacity: faint ? .4 : 1 }, { scale: '1 1', opacity: faint ? .4 : 1, offset: .35 }, { scale: '1 .4', opacity: 0 }], 320, 'ease-out');
      later(() => remove(cut), 340);
    }
  }
  return { mend, survived, slash };
}
