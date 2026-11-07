// A mão em leque: cada carta (com o selo do custo, de onde veio quando é de fora da mão, o valor que ela conta e as pilhas
// de cópias iguais), as cartas de fora da mão que dá para jogar agora e a mão de costas de quem assiste.
import type { FCard, FPlayer, FState } from '../forge/client';
import { esc, manaHTML } from './cardtext';
import { countSeals, countSealsHTML } from './cardCounts';
import { label } from './cardFaces';
import { selectedForInput } from './playContext';
import { canUse, inspectButton, selectedBadge, usable } from './permanentView';
import { sleeveClass } from './sleeves';

/** Uma posição do leque: a carta, a etiqueta de onde ela vem (vazia na mão) e as cópias empilhadas nela. */
export type HandFanItem = { c: FCard; tag: string; copies?: number[] };

/** Cartas de fora da mão que dá para usar agora, com a etiqueta de onde vêm; aparecem nas prateleiras do grimório e do cemitério. */
export function outsideHand(s: FState) {
  if (s.question || !s.input.priority || !s.input.ok.enabled || !s.castable?.length) return [];
  const out: { c: FCard; tag: string }[] = [];
  for (const p of s.players) {
    const mine = p.id === s.you;
    for (const c of p.graveyard) if (canUse(s, c)) out.push({ c, tag: mine ? 'Cemitério' : `Cemitério de ${p.name}` });
    if (p.libraryTop && canUse(s, p.libraryTop)) out.push({ c: p.libraryTop, tag: mine ? 'Topo do grimório' : `Topo do grimório de ${p.name}` });
  }
  return out;
}

/** O leque da mão; `incoming`: a carta comprada ainda em voo fica escondida até a animação chegar nela. */
export function handHTML(s: FState, fan: HandFanItem[], o: { face(c: FCard): string; incoming(id: number): boolean; playerName(id: number): string }) {
  const n = fan.length;
  return fan.map(({ c, tag, copies }, i) => {
    const pile = (copies?.length ?? 1) > 1 ? copies!.length : 0;
    const off = i - (n - 1) / 2;
    const sel = tag || usable(s, c.id) ? 'playable' : '';
    const selected = selectedForInput(s, c.id);
    const openingSelected = !!s.input.openingSelected?.includes(c.id);
    const openingSelection = s.input.opening === 'mulligan-bottom' ? ` aria-pressed="${openingSelected}"` : s.input.selection && (usable(s, c.id) || selected) ? ` aria-pressed="${selected}"` : '';
    // Selo do custo acima do canto esquerdo: no leque, a carta seguinte cobre o canto direito, onde fica o custo impresso.
    const cost = !c.faceDown && c.manaCost ? `<div class="hcost" aria-hidden="true">${manaHTML(c.manaCost)}</div>` : '';
    const where = tag ? `<div class="hzone">${esc(tag)}</div>` : '';
    // O valor que a carta conta (item 56): o selo fica na borda esquerda, a parte do leque que a carta seguinte não cobre.
    const counted = c.faceDown ? '' : countSealsHTML(c, o.playerName, s.you);
    const countedText = c.faceDown ? '' : countSeals(c, o.playerName, s.you).map(seal => seal.label).join(' ');
    return `<div class="hand-slot"><div class="hcard ${sel}${o.incoming(c.id) ? ' incoming' : ''}${tag ? ' outside' : ''}${pile ? ' pile' : ''}${openingSelected ? ' opening-selected' : ''}${selected ? ' choice-selected' : ''}" data-fid="${c.id}" role="button" tabindex="0"${openingSelection} aria-label="${esc(label(c))}${pile ? `, ${pile} cópias` : ''}${tag ? ` (${esc(tag)})` : ''}${countedText ? `. ${esc(countedText)}` : ''}"
      style="--rot:${off * 2.6}deg;--dy:${off * off * 2.2}px;z-index:${i + 1}">${o.face(c)}${cost}${where}${counted}${selectedBadge(s, c)}${pile ? `<span class="hand-copies" aria-hidden="true" title="${pile} cópias de ${esc(label(c))}">×${pile}</span>` : ''}</div>${inspectButton(c)}</div>`;
  }).join('');
}

/** Quem assiste não vê a mão de ninguém: a de baixo também fica de costas, só com a quantidade. */
export function hiddenHandHTML(me: FPlayer) {
  return Array.from({ length: me.handCount }, (_, i) => {
    const off = i - (me.handCount - 1) / 2;
    return `<div class="hand-slot"><div class="hcard hidden-card" aria-hidden="true" style="--rot:${off * 2.6}deg;--dy:${off * off * 2.2}px;z-index:${i + 1}"><div class="back${sleeveClass(me.sleeve)}"></div></div></div>`;
  }).join('');
}
