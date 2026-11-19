// A entrada do comandante conjurado da zona de comando: a carta sobe da pilha, paira, mergulha no lugar dela com a mesa tremendo e a poeira subindo, e a arte sai da moldura, cresce em volta e volta.
import type { FCard } from '../forge/client';
import { cacheGet } from '../scryfall';
import { effectsTier } from './gpu/gpuSupport';
import { center, LANDING, reduced, type MotionKit, type Point } from './motionKit';

/** Partes da cena, em frações do passo: o mergulho termina em `DIVE`; a arte sai, fica e volta até `BLOOM_END`. */
export const DIVE = .42, BLOOM_END = .94;

/** A arte recortada da carta (a impressão em português, se houver), ou nada se o Scryfall ainda não a trouxe. */
export function artCropOf(card: Pick<FCard, 'name' | 'print'> | undefined) {
  const sc = card?.name ? cacheGet(card.name, card.print) : null;
  return (sc?.pt?.image_uris ?? sc?.image_uris)?.art_crop;
}

/** O retângulo da ilustração dentro da carta impressa (mais ou menos de 11% a 56% da altura, com a margem da moldura). */
export function artBox(card: Point): Point {
  return { cx: card.cx, cy: card.cy - card.h * .165, w: card.w * .84, h: card.h * .45 };
}

/** A sombra e o brilho da carta no ar: `k` de 0 (na mesa) a 1 (no alto). */
const lifted = (k: number, color: string) =>
  `drop-shadow(0 ${(6 + 28 * k).toFixed(1)}px ${(8 + 16 * k).toFixed(1)}px rgb(0 0 0 / ${(.5 - .2 * k).toFixed(2)})) drop-shadow(0 0 ${(14 * k).toFixed(1)}px ${color})`;

export function createCommanderEntry(kit: MotionKit) {
  const { root, animate, effect, remove, later, gpu, ripple } = kit;
  /** Ao conjurar da zona de comando: busca a arte antes, para ela estar pronta quando ele resolver. */
  function preload(card: FCard | undefined) {
    const url = artCropOf(card);
    if (!url) return;
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
  }
  /**
   * A carta sai da pilha, sobe acima do lugar dela, maior, paira um instante e mergulha. A peça é centrada por
   * `translate(-50%, -50%)`: com a origem no canto, ela cresce em volta do próprio centro, sem escorregar para o lado.
   */
  function dive(piece: HTMLElement, from: Point, to: Point, duration: number, color: string) {
    piece.style.transformOrigin = '0 0';
    const s0 = Math.max(.4, Math.min(3, from.w / Math.max(1, to.w)));
    const lift = Math.max(to.h * .85, 60);
    animate(piece, [
      { offset: 0, translate: `${(from.cx - to.cx).toFixed(1)}px ${(from.cy - to.cy).toFixed(1)}px`, scale: String(s0.toFixed(3)), opacity: .9, filter: lifted(.2, color), easing: 'cubic-bezier(.2,.7,.3,1)' },
      { offset: .58, translate: `0 ${-lift}px`, scale: '1.38', opacity: 1, filter: lifted(1, color), easing: 'linear' },
      { offset: .74, translate: `0 ${(-lift * 1.06).toFixed(1)}px`, scale: '1.42', opacity: 1, filter: lifted(1, color), easing: 'cubic-bezier(.6,0,1,1)' },
      { offset: 1, translate: '0 0', scale: '1', opacity: 1, filter: lifted(0, color) },
    ], duration, 'linear');
  }
  /** O impacto: clarão, anel e poeira no lugar, a mesa treme para baixo e volta, e a carta assenta com mola. */
  function impact(piece: HTMLElement, at: Point, color: string) {
    if (!gpu.play('commanderSlam', { at, color })) ripple(at);
    gpu.ambiencePulse({ quake: .7 });
    animate(piece, [{ scale: '1.06' }, { scale: '1' }], LANDING.duration, LANDING.easing);
    // No degrau 2 do regulador, a mesa fica parada.
    const arena = effectsTier() < 2 ? root.querySelector<HTMLElement>('.arena') : null;
    if (arena) animate(arena, [{ translate: '0 0' }, { translate: '0 6px', offset: .14 }, { translate: '0 -3px', offset: .38 }, { translate: '0 1.5px', offset: .64 }, { translate: '0 0' }], 380, 'ease-out');
  }
  /** A arte se solta da caixa da ilustração, cresce em volta da carta com as bordas esfumadas, fica e volta para dentro. */
  function bloom(url: string, card: Point, duration: number, color: string) {
    const box = artBox(card);
    const w = Math.max(card.w * 4.2, 220), h = w * .73;
    const el = effect('commander-bloom', { ...box, w, h });
    el.style.backgroundImage = `url("${url.replace(/"/g, '%22')}")`;
    const s0 = (box.w / w).toFixed(3);
    animate(el, [
      { scale: s0, opacity: 0, easing: 'cubic-bezier(.2,.7,.2,1)' },
      { scale: '1', opacity: .95, offset: .32, easing: 'linear' },
      { scale: '1.05', opacity: .95, offset: .62, easing: 'cubic-bezier(.6,0,.4,1)' },
      { scale: s0, opacity: .15 },
    ], duration, 'linear');
    later(() => remove(el), duration);
    // A luz e as brasas em volta (as da lendária, na cor dele); sem a camada GPU, a arte basta.
    gpu.play('legend', { at: { ...box, w: w * .55, h: h * .55 }, color });
  }
  /**
   * A cena inteira sobre a peça que voa (`piece`, já no lugar `to`), em `duration` ms. Devolve false com "reduzir
   * movimento", para quem chamou fazer o pouso de sempre.
   */
  function arrive(card: FCard | undefined, piece: HTMLElement, from: Point, to: Point, duration: number) {
    if (reduced()) return false;
    const color = kit.toneOf(piece);
    const fall = Math.round(duration * DIVE);
    dive(piece, from, to, fall, color);
    later(() => impact(piece, to, color), fall);
    const url = artCropOf(card);
    if (url) later(() => bloom(url, to, Math.round(duration * (BLOOM_END - DIVE)), color), fall + 40);
    return true;
  }
  /** No fim, já com a permanente de verdade à vista: a coroa de comandante dela salta no canto. */
  function crown(landed: HTMLElement) {
    const badge = landed.querySelector<HTMLElement>('.badge.commander');
    if (!badge) return;
    animate(badge, [{ scale: '0', opacity: 0 }, { scale: '1.35', opacity: 1, offset: .6 }, { scale: '1', opacity: 1 }], 380, 'ease-out');
    const at = center(badge);
    if (at) gpu.play('arrive', { at, color: '#f2b54c', size: Math.max(at.w, at.h) * 2.4 });
  }
  return { preload, arrive, crown };
}
