import type { ScryCard } from '../scryfall';
import './cardFlip.css';

/** Como a carta mostra o outro lado: outra imagem (dupla face, transformar, modal) ou a mesma de cabeça para baixo (flip). */
export interface CardSides { kind: 'dfc' | 'flip'; images: string[] }

/** As faces da carta que dá para virar; null para as de uma face só. Cada face usa a imagem em português quando tem. */
export function cardSides(sc?: ScryCard | null): CardSides | null {
  if (!sc) return null;
  const images = [0, 1].map(i => sc.pt?.faceImages?.[i]?.normal ?? sc.faceImages?.[i]?.normal).filter((u): u is string => !!u);
  if (images.length === 2) return { kind: 'dfc', images };
  const image = sc.pt?.image_uris?.normal ?? sc.image_uris?.normal;
  return sc.layout === 'flip' && image ? { kind: 'flip', images: [image] } : null;
}

const label = (sides: CardSides, turned: boolean) => sides.kind === 'flip' ? (turned ? 'Desvirar a carta' : 'Girar a carta') : turned ? 'Ver a frente' : 'Ver o verso';

export const flipButtonHTML = (sides: CardSides, className: string) =>
  `<button type="button" class="${className} cf-toggle" data-flip aria-pressed="false">${label(sides, false)}</button>`;

/** Vira a imagem: na dupla face gira e troca de face no meio do giro; na flip gira 180°. */
export function turnCard(img: HTMLImageElement | null | undefined, button: HTMLElement, sides: CardSides) {
  const turned = button.getAttribute('aria-pressed') !== 'true';
  button.setAttribute('aria-pressed', String(turned));
  button.textContent = label(sides, turned);
  if (!img) return;
  if (sides.kind === 'flip') { img.classList.toggle('cf-upside-down', turned); return; }
  const next = sides.images[turned ? 1 : 0];
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !img.animate) { img.src = next; return; }
  // Um giro só, com a troca no meio (de lado, a carta não aparece): se a animação não rodar, a carta segue à vista.
  const preload = new Image(); preload.src = next;
  img.animate([{ transform: 'perspective(900px) rotateY(0)' }, { transform: 'perspective(900px) rotateY(90deg)', offset: .5 }, { transform: 'perspective(900px) rotateY(0)' }], { duration: 340, easing: 'ease-in-out' });
  setTimeout(() => { img.src = next; }, 170);
}
