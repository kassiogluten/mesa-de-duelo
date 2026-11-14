// Ninjutsu e sneak (item 115): o atacante some numa fumaça que marca o lugar dele, e o ninja surge dela com um shuriken.
import type { PresentationEvent } from './presentationTimeline';
import { reduced, type MotionKit, type Point } from './motionKit';

/*
 * O atacante não bloqueado volta para a mão como custo; a fumaça fica no lugar dele enquanto a habilidade (ou a mágica,
 * no sneak) está na pilha. Ao resolver, um shuriken gira da mão de quem usou até o lugar do ninja, a fumaça vai junto e
 * estoura, e o ninja aparece nela, já virado e atacando. O servidor liga as duas pontas (`swapFor` e `swapWith`).
 */

/** Saída ou entrada de uma troca de ninjutsu ou sneak. */
export function ninjaSwap(event: PresentationEvent): boolean {
  return (event.type === 'left' || event.type === 'entered') && (event.reason === 'ninjutsu' || event.reason === 'sneak');
}

const PUFFS: [number, number, number][] = [[-.3, -.15, .7], [.25, -.25, .65], [-.05, .2, .8], [.35, .2, .6], [-.4, .25, .55], [.05, -.4, .55]];
const SHURIKEN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill-rule="evenodd" d="M12 1l2.2 7.8L22 11l-7.8 2.2L12 23l-2.2-7.8L2 12l7.8-2.2zm0 9a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/></svg>';
/** Quanto tempo a fumaça espera a habilidade resolver antes de sumir sozinha (anulada, ou a mesa pulou a entrada). */
const WAIT = 12000;

export function createNinjaMotion(kit: MotionKit) {
  const { effect, animate, later, remove, track } = kit;
  /** Fumaça esperando o ninja, pela carta dele. */
  const waiting = new Map<number, HTMLElement>();
  function smoke(at: Point) {
    const size = Math.max(at.w, at.h) * 1.5;
    return effect('ninja-smoke', { ...at, w: size, h: size },
      PUFFS.map(([x, y, s]) => `<i style="left:${50 + x * 60}%;top:${50 + y * 60}%;width:${s * 70}%;height:${s * 70}%"></i>`).join(''));
  }
  /** O atacante sai: a fumaça cresce no lugar dele e fica, mais fraca, até o ninja chegar. */
  function vanish(event: PresentationEvent, at: Point, duration: number) {
    if (reduced() || event.swapFor === undefined) return;
    waiting.get(event.swapFor)?.remove();
    const cloud = smoke(at);
    // Na camada GPU, a fumaça ganha volume: uma nuvem que se espalha no lugar do atacante.
    kit.gpu.play('puff', { at, size: Math.max(at.w, at.h) * 1.6 });
    animate(cloud, [{ opacity: 0, scale: '.5' }, { opacity: 1, scale: '1.1', offset: .35 }, { opacity: .55, scale: '1' }], duration * .8);
    cloud.style.opacity = '.55';
    waiting.set(event.swapFor, cloud);
    const id = event.swapFor;
    later(() => { if (waiting.get(id) === cloud) { waiting.delete(id); animate(cloud, [{ opacity: .55 }, { opacity: 0 }], 400); later(() => remove(cloud), 400); } }, WAIT);
  }
  /**
   * O ninja entra: o shuriken gira de `from` (a mão, ou a pilha no sneak) até `to`; a fumaça que esperava vai até lá e
   * estoura, e a carta (`piece`) aparece no meio dela. Devolve false sem animação, para quem chamou pousar a carta como sempre.
   */
  function appear(event: PresentationEvent, piece: HTMLElement, from: Point, to: Point, duration: number, rot = 0) {
    if (reduced()) return false;
    const id = event.card?.id;
    // A carta de verdade fica escondida até surgir da fumaça, mesmo que a mesa redesenhe o campo no meio.
    const hide = document.createElement('style');
    if (id !== undefined) { hide.textContent = `.field [data-fid="${id}"] { opacity: 0 !important; }`; track(hide); }
    const old = id === undefined ? undefined : waiting.get(id);
    if (id !== undefined) waiting.delete(id);
    const cloud = old ?? smoke(to);
    const size = Math.max(to.w, to.h) * 1.5;
    if (old) {
      const was = cloud.getBoundingClientRect();
      cloud.style.left = `${to.cx}px`; cloud.style.top = `${to.cy}px`; cloud.style.width = cloud.style.height = `${size}px`;
      animate(cloud, [{ translate: `${was.left + was.width / 2 - to.cx}px ${was.top + was.height / 2 - to.cy}px` }, { translate: '0 0' }], duration * .4);
    }
    // E estoura de novo quando o shuriken chega, com o ninja surgindo dela.
    kit.gpu.play('puff', { at: to, size: size * 1.2, delay: duration * .4 });
    const star = effect('ninja-shuriken', { ...from, w: 34, h: 34 }, SHURIKEN);
    animate(star, [
      { translate: '0 0', rotate: '0turn', opacity: 1 },
      { translate: `${to.cx - from.cx}px ${to.cy - from.cy}px`, rotate: '2turn', opacity: 1, offset: .9 },
      { translate: `${to.cx - from.cx}px ${to.cy - from.cy}px`, rotate: '2.2turn', opacity: 0 },
    ], duration * .45, 'cubic-bezier(.4, 0, .6, 1)');
    star.style.opacity = '0';
    animate(cloud, [{ opacity: .55, scale: '1' }, { opacity: 1, scale: '1.25', offset: .3 }, { opacity: 0, scale: '1.6' }], duration * .6, 'linear', duration * .4);
    cloud.style.opacity = '0';
    // Já no giro da carta no campo (virada, atacando): só a face gira, para a legenda continuar na horizontal; a caixa da
    // carta virada é deitada, então a face troca largura e altura.
    const face = piece.querySelector<HTMLElement>('.face');
    if (face && Math.abs(Math.abs(rot) - 90) < 1) Object.assign(face.style, { position: 'absolute', left: '50%', top: '50%',
      width: piece.style.height, height: piece.style.width, translate: '-50% -50%', rotate: `${rot}deg` });
    animate(piece, [{ opacity: 0, scale: '.7' }, { opacity: 0, scale: '.7', offset: .45 }, { opacity: 1, scale: '1.04', offset: .8 }, { opacity: 1, scale: '1' }], duration, 'linear');
    later(() => { remove(star); remove(cloud); remove(hide); }, duration);
    return true;
  }
  return { vanish, appear };
}
