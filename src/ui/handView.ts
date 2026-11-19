// A mão em leque: cada carta (com o selo do custo, de onde veio quando é de fora da mão, o valor que ela conta, as pilhas
// de cópias iguais e o shuriken de quem pode entrar por ninjutsu ou sneak agora), as cartas de fora da mão que dá para jogar agora e a mão de costas de quem assiste.
import type { FCard, FPlayer, FState } from '../forge/client';
import { esc, manaHTML } from './cardtext';
import { countSeals, countSealsHTML } from './cardCounts';
import { label } from './cardFaces';
import { selectedForInput } from './playContext';
import { canUse, inspectButton, selectedBadge, usable } from './permanentView';
import { sleeveClass } from './sleeves';
import { ICON_SHURIKEN } from './icons';
import { modeText } from './choiceScreens';

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
    const cost = !c.faceDown && c.manaCost ? costChip(c) : '';
    const where = tag ? `<div class="hzone">${esc(tag)}</div>` : '';
    // O valor que a carta conta (item 56): o selo fica na borda esquerda, a parte do leque que a carta seguinte não cobre.
    const counted = c.faceDown ? '' : countSealsHTML(c, o.playerName, s.you);
    const swap = swapNow(s, c, tag);
    const swapText = swap ? modeText(swap) : undefined;
    const countedText = c.faceDown ? '' : countSeals(c, o.playerName, s.you).map(seal => seal.label).join(' ');
    return `<div class="hand-slot"><div class="hcard ${sel}${o.incoming(c.id) ? ' incoming' : ''}${tag ? ' outside' : ''}${pile ? ' pile' : ''}${openingSelected ? ' opening-selected' : ''}${selected ? ' choice-selected' : ''}${swap ? ` swap ${swap}` : ''}" data-fid="${c.id}"${swapText ? ` title="${esc(`${swapText[0]}: ${swapText[1]}`)}"` : ''} role="button" tabindex="0"${openingSelection} aria-label="${esc(label(c))}${pile ? `, ${pile} cópias` : ''}${tag ? ` (${esc(tag)})` : ''}${countedText ? `. ${esc(countedText)}` : ''}${swap ? `. Pode usar ${swapText?.[0] ?? swap}` : ''}"
      style="--rot:${off * 2.6}deg;--dy:${off * off * 2.2}px;z-index:${i + 1}">${o.face(c)}${cost}${where}${counted}${swap ? `<span class="swap-seal" aria-hidden="true">${ICON_SHURIKEN}</span>` : ''}${selectedBadge(s, c)}${pile ? `<span class="hand-copies" aria-hidden="true" title="${pile} cópias de ${esc(label(c))}">×${pile}</span>` : ''}</div>${inspectButton(c)}</div>`;
  }).join('');
}

/**
 * Ninjutsu ou sneak que a carta da mão pode usar agora (um atacante seu não bloqueado, com a prioridade): o servidor diz
 * qual, e a mesa só mostra enquanto ela é jogável. Cartas de fora da mão (`tag`) não entram.
 */
export function swapNow(s: FState, c: FCard, tag = ''): FCard['swap'] {
  return !tag && c.swap && s.input.priority && s.input.actionable?.includes(c.id) ? c.swap : undefined;
}

/** Selo de custo: o impresso, ou o de agora quando uma redução ou aumento o mudou (verde mais barato, vermelho mais caro). */
function costChip(c: FCard) {
  const now = c.castCost;
  if (!now) return `<div class="hcost" aria-hidden="true">${manaHTML(c.manaCost!)}</div>`;
  const kind = now.delta < 0 ? 'cheaper' : now.delta > 0 ? 'pricier' : '';
  return `<div class="hcost ${kind}" aria-hidden="true">${now.cost.match(/\{[^}]+\}/) ? manaHTML(now.cost) : '<span class="hcost-zero">0</span>'}</div>`;
}

/** Quem assiste não vê a mão de ninguém: a de baixo também fica de costas, só com a quantidade. */
export function hiddenHandHTML(me: FPlayer) {
  return Array.from({ length: me.handCount }, (_, i) => {
    const off = i - (me.handCount - 1) / 2;
    return `<div class="hand-slot"><div class="hcard hidden-card" aria-hidden="true" style="--rot:${off * 2.6}deg;--dy:${off * off * 2.2}px;z-index:${i + 1}"><div class="back${sleeveClass(me.sleeve)}"></div></div></div>`;
  }).join('');
}
