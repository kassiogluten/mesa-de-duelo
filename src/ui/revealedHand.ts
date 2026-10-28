import type { FCard, FPlayer } from '../forge/client';
import { esc } from './cardtext';

/**
 * Mão revelada (Telepathy, Revelation, Seer's Vision): a ponte manda em `revealedHand` as cartas da mão de outro
 * jogador que você pode ver, pela regra do Forge. Elas só aparecem; quem joga é o dono.
 */
export const EYE_ICON = '<svg class="eye" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>';

export const revealedCards = (p: Pick<FPlayer, 'revealedHand'>): FCard[] => p.revealedHand ?? [];

/** "5 cartas" ou, com só parte da mão à vista, "2 de 5 cartas à vista". */
export function revealedCountText(p: Pick<FPlayer, 'revealedHand' | 'handCount'>) {
  const shown = revealedCards(p).length, total = Math.max(p.handCount, shown);
  const cards = `${total} ${total === 1 ? 'carta' : 'cartas'}`;
  return shown < total ? `${shown} de ${cards} à vista` : cards;
}

/** Inclinação de cada carta do leque, como a mão de costas do oponente. */
const fanStyle = (i: number, n: number, rot = 3, dy = 1.5) => {
  const off = i - (n - 1) / 2;
  return `--rot:${-off * rot}deg;--dy:${-off * off * dy}px`;
};

/**
 * Leque da mão do oponente no duelo: de costas, ou, com a mão revelada, as cartas de face para cima no mesmo lugar,
 * com o selo "Mão revelada". Tocar numa carta abre o inspetor (`data-peek`); não dá para jogá-la.
 */
export function oppHandHTML(p: FPlayer, face: (c: FCard) => string, label: (c: FCard) => string) {
  const shown = revealedCards(p);
  const hidden = Math.max(0, p.handCount - shown.length), n = shown.length + hidden;
  if (!shown.length) return Array.from({ length: p.handCount }, (_, i) => `<div class="back" style="${fanStyle(i, p.handCount)}"></div>`).join('');
  const cards = shown.map((c, i) =>
    `<button type="button" class="revealed-card" data-peek="${c.id}" style="${fanStyle(i, n, 2.5, 1)}" aria-label="Inspecionar ${esc(label(c))}, na mão de ${esc(p.name)}">${face(c)}</button>`).join('');
  const backs = Array.from({ length: hidden }, (_, i) => `<div class="back" style="${fanStyle(shown.length + i, n, 2.5, 1)}"></div>`).join('');
  return `<div class="revealed-fan" role="group" aria-label="Mão revelada de ${esc(p.name)}: ${revealedCountText(p)}">${cards}${backs}</div>`
    + `<span class="revealed-tag" aria-hidden="true">${EYE_ICON}Mão revelada</span>`;
}

/**
 * Número de cartas na mão no cabeçalho do assento (Commander). Com a mão revelada, o selo ganha um olho e a etiqueta
 * "Revelada", e tocar nele abre a galeria com a mão, como a do cemitério.
 */
export function seatHandHTML(p: FPlayer) {
  if (!revealedCards(p).length) return `<span class="seat-hand" aria-label="${p.handCount} cartas na mão"><span class="back" aria-hidden="true"></span>${p.handCount}</span>`;
  return `<button type="button" class="seat-hand revealed" data-gy="${p.id}" data-zone="hand" title="Mão revelada" aria-label="Ver a mão revelada de ${esc(p.name)} (${revealedCountText(p)})">${EYE_ICON}<b>${p.handCount}</b><span class="seat-hand-tag">Revelada</span></button>`;
}
