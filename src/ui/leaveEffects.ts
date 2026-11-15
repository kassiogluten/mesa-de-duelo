// Saídas do campo com cena própria: a destruída racha e se parte em pedaços, a exilada gira e é sugada por um portal.
import type { MotionKit, Point } from './motionKit';

/** Os pontos da borda da carta (em %, em volta, no sentido do relógio) até onde as rachaduras vão; cada par vizinho é um pedaço. */
const RIM: [number, number][] = [[0, 0], [40, 0], [100, 0], [100, 38], [100, 72], [100, 100], [55, 100], [0, 100], [0, 62], [0, 25]];
/** De onde as rachaduras partem (o golpe), um pouco acima do meio da carta. */
const HIT: [number, number] = [48, 44];

/** Uma rachadura do golpe até a borda, em zigue-zague (no desenho de 100×140, a proporção da carta). */
function crackPath([x, y]: [number, number], i: number) {
  const [hx, hy] = HIT, h = (v: number) => v * 1.4;
  const mid = (u: number, jog: number) => {
    const px = hx + (x - hx) * u, py = hy + (y - hy) * u, len = Math.hypot(x - hx, y - hy) || 1;
    return `${(px - (y - hy) / len * jog).toFixed(1)},${h(py + (x - hx) / len * jog).toFixed(1)}`;
  };
  const side = i % 2 ? 1 : -1;
  return `M${hx},${h(hy)} L${mid(.3, 3 * side)} L${mid(.6, -2.5 * side)} L${x},${h(y)}`;
}
const CRACKS = `<svg class="destroy-cracks" viewBox="0 0 100 140" preserveAspectRatio="none" aria-hidden="true">${RIM.map((p, i) => `<path pathLength="1" d="${crackPath(p, i)}"/>`).join('')}</svg>`;

/** A peça da carta parada no lugar de onde sai, no tamanho que ela tinha no campo. */
function placeAt(piece: HTMLElement, from: Point) {
  piece.style.left = `${from.cx}px`; piece.style.top = `${from.cy}px`;
  piece.style.width = `${from.w}px`; piece.style.height = `${from.h}px`; piece.style.setProperty('--fw', `${from.w}px`);
}

export function createLeaveEffects(kit: MotionKit) {
  const { later, animate, effect, remove, absorb, shatter, gpu } = kit;

  /**
   * Destruída: rachaduras correm do golpe até a borda enquanto a carta treme, e ela se parte em pedaços com a arte dela,
   * que pulam e caem com peso; a poeira segue até o cemitério, que pulsa ao recebê-la.
   */
  function crumble(from: Point, to: Point, piece: HTMLElement, duration: number, into: HTMLElement | null) {
    placeAt(piece, from);
    // A legenda (na peça) fica por cima dos pedaços.
    piece.classList.add('destroy-holding');
    const face = piece.querySelector<HTMLElement>('.face');
    const crack = Math.round(duration * .36), rest = duration - crack;
    piece.insertAdjacentHTML('beforeend', CRACKS);
    piece.querySelectorAll<SVGPathElement>('.destroy-cracks path').forEach((path, i) =>
      path.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: crack * .55, delay: (i % 5) * crack * .08, easing: 'ease-out', fill: 'both' }));
    const shake = Array.from({ length: 7 }, (_, i) => ({ translate: i === 6 ? '0 0' : `${(i % 2 ? 1 : -1) * (1 + i * .4)}px ${(i % 3) - 1}px` }));
    animate(piece, shake, crack, 'linear');
    if (face) animate(face, [{ filter: 'none' }, { filter: 'brightness(.8) contrast(1.2) saturate(.7)' }], crack, 'linear');
    later(() => {
      const html = face?.outerHTML ?? '';
      piece.querySelector('.destroy-cracks')?.remove();
      if (face) face.style.visibility = 'hidden';
      shatter(from);
      gpu.play('trail', { from, to, duration: rest * .9, style: 'dust' });
      RIM.forEach(([x, y], i) => {
        const [nx, ny] = RIM[(i + 1) % RIM.length]!;
        // O centro do pedaço: é em volta dele que ele gira, e é dele que sai a direção do pulo.
        const gx = (HIT[0] + x + nx) / 3, gy = (HIT[1] + y + ny) / 3;
        const shard = effect('presentation-piece destroy-shard', from, html);
        shard.style.clipPath = `polygon(${HIT[0]}% ${HIT[1]}%, ${x}% ${y}%, ${nx}% ${ny}%)`;
        shard.style.transformOrigin = `${gx}% ${gy}%`;
        const dx = (gx - HIT[0]) / 100 * from.w * (.8 + Math.random() * .5), up = from.h * (.12 + Math.random() * .14) + Math.max(0, HIT[1] - gy) / 100 * from.h * .5;
        const fall = from.h * (1 + Math.random() * .4), spin = (gx < HIT[0] ? -1 : 1) * (40 + Math.random() * 110);
        // Lançado para fora e para cima, e a gravidade puxa: a posição em cada quarto do tempo.
        const frames = [0, .25, .5, .75, 1].map(u => ({
          translate: `${(dx * (1 - (1 - u) ** 2)).toFixed(1)}px ${(-up * 4 * u * (1 - u) * .9 + fall * u * u).toFixed(1)}px`,
          rotate: `${(spin * u).toFixed(1)}deg`,
          opacity: u < .6 ? 1 : 1 - (u - .6) / .4,
          filter: `brightness(${(1 - u * .35).toFixed(2)})`,
        }));
        animate(shard, frames, rest, 'linear');
        later(() => remove(shard), rest);
      });
      if (into) later(() => absorb(into), rest * .85);
    }, crack);
  }

  /**
   * Exilada: um portal escuro com a borda de luz se abre deitado sobre a mesa, e a carta gira, tomba e encolhe até ser
   * sugada para dentro dele; o portal se fecha num clarão. A legenda fica parada no lugar, fora do giro.
   */
  function vortex(from: Point, piece: HTMLElement, duration: number, caption?: HTMLElement) {
    placeAt(piece, from);
    piece.classList.add('exile-sinking');
    if (caption) {
      const tag = effect('presentation-piece exile-caption', from);
      tag.append(caption);
      later(() => remove(tag), duration);
    }
    const size = Math.max(from.w, from.h) * 1.15;
    // Na camada GPU: o portal com os braços em espiral e grãos de luz rodando para o centro; em CSS, um disco que gira.
    if (!gpu.play('vortex', { at: from, duration })) {
      const hole = effect('exile-vortex', { ...from, w: size, h: size }, '<span class="exile-vortex-arms"></span>');
      animate(hole, [{ scale: '0', opacity: 0 }, { scale: '1', opacity: 1, offset: .22 }, { scale: '1', opacity: 1, offset: .78 }, { scale: '0', opacity: 0 }], duration, 'ease-in-out');
      const arms = hole.firstElementChild as HTMLElement | null;
      if (arms) animate(arms, [{ rotate: '0deg' }, { rotate: '-720deg' }], duration, 'cubic-bezier(.3,0,.7,1)');
      later(() => remove(hole), duration);
    }
    // A carta fica invisível no fim: a animação devolve o estilo dela ao acabar, um pouco antes da limpeza.
    piece.style.opacity = '0';
    const turn = (tilt: number, spin: number, scale: number) => `translate(-50%, -50%) perspective(700px) rotateX(${tilt}deg) rotate(${spin}deg) scale(${scale})`;
    animate(piece, [
      { transform: turn(0, 0, 1), filter: 'brightness(1)', opacity: 1 },
      { transform: turn(34, -35, .9), filter: 'brightness(1.25) saturate(.7)', opacity: 1, offset: .25 },
      { transform: turn(50, -250, .42), filter: 'brightness(.75) saturate(.4)', opacity: 1, offset: .62 },
      { transform: turn(60, -620, .02), filter: 'brightness(.3) saturate(0)', opacity: 0, offset: .88 },
      { transform: turn(60, -620, .02), filter: 'brightness(.3) saturate(0)', opacity: 0 },
    ], duration, 'cubic-bezier(.45,0,.8,.6)');
  }

  return { crumble, vortex };
}
