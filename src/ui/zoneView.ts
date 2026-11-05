// As janelas de zona (cemitério com uma aba por jogador, exílio, zona de comando, mão revelada, cartas iguais agrupadas e
// o dano de comandante) e a prateleira do exílio ao lado da mão, com as cartas que dá para jogar de lá.
import type { FCard, FPlayer, FState } from '../forge/client';
import { esc } from './cardtext';
import { label } from './cardFaces';
import { canSelectExileCard, exileShelfCards, selectedForInput } from './playContext';
import { revealedCards, revealedCountText } from './revealedHand';
import { canUse, exileCaption, foretoldTag, inspectButton, selectedBadge } from './permanentView';
import { COUNTER_ICON, inspectIcon } from './icons';

export type ZoneKind = 'gy' | 'exile' | 'command' | 'damage' | 'dungeon' | 'hand';

/** O que a janela de zona precisa da mesa. */
export interface ZoneView {
  face(c: FCard, size: 'small' | 'normal'): string;
  findCard(id: number): FCard | undefined;
  /** Escolhendo alvo no cemitério: o pedido e o que já foi marcado, e os botões da caixa de ação (Cancelar, Concluir). */
  targetHead(s: FState): string;
  buttons(s: FState): string;
}

/** A prateleira do exílio: as cartas que dá para jogar de lá (ou suspensas), com a etiqueta de cada uma. */
export function exileShelfHTML(s: FState, face: (c: FCard) => string, cards = exileShelfCards(s)) {
  return `<span class="exile-shelf-label">Exílio</span><div class="exile-shelf-track" tabindex="0" aria-label="Cartas no exílio. Role para ver todas.">${cards.map(entry => {
    const { card, suspended, permission, choosing } = entry;
    const { playable, time, status, caption } = exileCaption(s, entry);
    const selecting = canSelectExileCard(s, card.id, s.input.gen);
    const selected = selectedForInput(s, card.id);
    return `<div class="exile-slot"><div class="exile-card${playable ? ' playable' : ''}${selecting ? ' selectable' : ''}${selected ? ' choice-selected' : ''}${choosing ? ' suspend-ready' : ''}${!playable && !choosing && !selecting ? ' waiting' : ''}" data-fid="${card.id}" data-exile-card role="button" tabindex="0"${selecting ? ` aria-pressed="${selected}"` : ''} aria-label="${esc(label(card))}, exílio. ${status}${permission && suspended ? '. Também pode ser jogada pela permissão de exílio' : ''}">${face(card)}
      ${card.foretold ? foretoldTag(card) : ''}
      ${suspended ? `<span class="exile-time" title="${time} ${time === 1 ? 'marcador de tempo' : 'marcadores de tempo'}">${COUNTER_ICON.TIME}<b>${time}</b></span>` : ''}
      <span class="exile-status" title="${esc(status)}">${caption}</span>${selectedBadge(s, card)}</div>${inspectButton(card)}</div>`;
  }).join('')}</div>`;
}

/** Dano de combate recebido de cada comandante, contra o limite de 21. */
export function commanderLedgerHTML(s: FState, p: FPlayer) {
  return `<section class="question commander-ledger" role="dialog" aria-modal="true" aria-label="Dano de comandante"><h2>Dano de comandante · ${esc(p.name)}</h2><p class="q-hint">Dano de combate recebido de cada comandante. O limite é 21 para cada carta.</p><ul>${(p.commanderDamage ?? []).map(item => {
    const owner = s.players.find(player => player.commanders?.some(c => c.id === item.commanderId));
    const commander = owner?.commanders?.find(c => c.id === item.commanderId);
    return `<li><span>${esc(commander?.name ?? `Comandante ${item.commanderId}`)}<small>${esc(owner?.name ?? '')}</small></span><b>${item.damage} / 21</b></li>`;
  }).join('')}</ul><div class="q-actions"><button class="arena-btn secondary" data-ui="zone-close">Fechar</button></div></section>`;
}

/** Chave da janela aberta: a rolagem das fileiras só volta quando é a mesma janela. */
export const zoneKey = (kind: ZoneKind, zoneOf: number | null, groupIds: number[] | null) => `${kind}:${zoneOf}:${groupIds?.join(',') ?? ''}`;

/** A janela de uma zona de `p` (ou do grupo de cartas `groupIds`), com as cartas que dá para usar dali. */
export function zoneHTML(v: ZoneView, s: FState, z: { kind: ZoneKind; player: FPlayer | undefined; groupIds: number[] | null; groupTitle: string; key: string }) {
  const { kind, player: p, groupIds } = z;
  const title = groupIds ? z.groupTitle : kind === 'command' ? 'Zona de comando' : kind === 'exile' ? 'Exílio' : kind === 'hand' ? 'Mão revelada' : 'Cemitério';
  const cards = groupIds ? groupIds.map(id => v.findCard(id)).filter((c): c is FCard => !!c)
    : kind === 'hand' ? revealedCards(p!) : [...(kind === 'command' ? p!.commandZone ?? [] : kind === 'exile' ? p!.exile : p!.graveyard)].reverse();
  // No exílio, as cartas da prateleira levam a mesma etiqueta de lá (Jogar, Aguarde, Suspensa...).
  const shelf = new Map(kind === 'exile' && !groupIds ? exileShelfCards(s).map(entry => [entry.card.id, exileCaption(s, entry)]) : []);
  const tags = (c: FCard) => {
    const caption = shelf.get(c.id);
    return `${c.plotted ? '<div class="zone-tag">Tramada</div>' : c.foretold ? foretoldTag(c) : c.preparedFrom ? '<div class="zone-tag">Preparado</div>' : ''}${caption ? `<span class="exile-status" title="${esc(caption.status)}">${caption.caption}</span>` : ''}`;
  };
  const targeting = kind === 'gy' && !groupIds && !!s.input.targeting && !s.input.paying && !s.gameOver ? s.input.targeting : null;
  const card = (c: FCard) => `<div class="zone-card">${kind !== 'hand' && canUse(s, c)
    ? `<div class="q-face actionable${selectedForInput(s, c.id) || targeting?.cards?.includes(c.id) ? ' choice-selected' : ''}" data-fid="${c.id}" data-gen="${s.input.gen}" role="button" tabindex="0"${s.input.selection ? ` aria-pressed="${selectedForInput(s, c.id)}"` : ''} aria-label="${s.input.selection ? 'Escolher' : targeting ? 'Escolher como alvo' : 'Usar'} ${esc(label(c))}">${v.face(c, 'normal')}${tags(c)}${selectedBadge(s, c)}</div>`
    : `<button class="q-face" data-peek="${c.id}" aria-label="Inspecionar ${esc(label(c))}${shelf.has(c.id) ? `. ${esc(shelf.get(c.id)!.status)}` : ''}">${v.face(c, 'normal')}${tags(c)}</button>`}
    <button class="icon-btn" data-inspect="${c.id}">${inspectIcon}Inspecionar</button></div>`;
  // Cemitério: uma aba por jogador, para passar ao de cada oponente sem fechar; as que têm alvo mostram quantos.
  const selectable = new Set(s.input.selectable);
  const tabs = kind === 'gy' && !groupIds && p && s.players.length > 1 ? `<div class="zone-tabs" role="tablist" aria-label="Cemitério de quem">${s.players.map(pl => {
    const n = targeting ? pl.graveyard.filter(c => selectable.has(c.id)).length : 0;
    const who = pl.id === s.you ? 'Você' : pl.name;
    return `<button type="button" role="tab" class="zone-tab${n ? ' has-targets' : ''}" data-gy="${pl.id}" data-zone="gy" aria-selected="${pl.id === p.id}"${pl.id === p.id ? '' : ' tabindex="-1"'} aria-label="Cemitério ${pl.id === s.you ? 'seu' : `de ${esc(pl.name)}`}, ${pl.graveyard.length} ${pl.graveyard.length === 1 ? 'carta' : 'cartas'}${n ? `, ${n} ${n === 1 ? 'alvo' : 'alvos'}` : ''}">${esc(who)} <span class="zone-tab-count">${pl.graveyard.length}</span>${n ? `<span class="zone-tab-targets" aria-hidden="true">${n} ${n === 1 ? 'alvo' : 'alvos'}</span>` : ''}</button>`;
  }).join('')}</div>` : '';
  // Escolhendo alvo: o pedido e os botões da mesa (Cancelar, Concluir) vêm junto, porque o resto da mesa fica atrás da janela.
  const targetHead = targeting ? v.targetHead(s) : '';
  const actions = targeting ? `${v.buttons(s)}<button class="arena-btn secondary" data-ui="zone-close">Ver a mesa</button>` : '<button class="arena-btn secondary" data-ui="zone-close">Fechar</button>';
  return `<div class="question zone-view${targeting ? ' zone-targeting' : ''}" data-zone="${esc(z.key)}" role="dialog" aria-modal="true" aria-label="${title}">
    <h2>${title}${p ? ` · ${esc(p.name)}` : ''} (${kind === 'hand' && p && !groupIds ? revealedCountText(p) : cards.length})</h2>
    ${tabs}${targetHead}
    ${kind === 'hand' && p && !groupIds ? `<p class="q-hint">Só para ver: quem joga estas cartas é ${esc(p.name)}.</p>` : ''}
    ${cards.length ? `<div class="q-opts cards">${cards.map(card).join('')}</div>` : '<p class="q-hint">Vazio.</p>'}
    <div class="q-actions">${actions}</div>
  </div>`;
}
