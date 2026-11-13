// Prévia do Laboratório: um esboço só de ver da mesa montada, com o Jogador 2 em cima e você embaixo, como na partida.
import { cacheGet, cardImageUrls } from '../scryfall';
import { esc } from './cardtext';
import { PHASES, counterName, runs, type Draft, type Exiled, type Permanent, type Side } from './labModel';

/** Terreno vai para a fileira dos terrenos, como na mesa; sem a carta no cache ainda, fica com as outras. */
const isLand = (name: string) => /\bLand\b/.test(cacheGet(name)?.type_line ?? '');

function face(name: string, cls = '', badges = '') {
  const url = cardImageUrls([name], ['small'])[0];
  return `<span class="lp-card${cls}" title="${esc(name)}">${url ? `<img src="${esc(url)}" alt="${esc(name)}" loading="lazy">` : `<span class="lp-name">${esc(name)}</span>`}${badges}</span>`;
}

/** Uma permanente, virada de lado se estiver virada, com os marcadores e, por baixo, o que está preso a ela. */
function permanent(c: Permanent, count: number, under: Map<number, Permanent[]>): string {
  const counters = Object.entries(c.counters).filter(([, n]) => n > 0)
    .map(([type, n]) => `<span class="lp-badge">${esc(counterName(type))} ×${n}</span>`).join('');
  const badges = (count > 1 ? `<span class="lp-badge lp-qty">×${count}</span>` : '') + (counters ? `<span class="lp-badges">${counters}</span>` : '');
  // Os selos ficam no lugar da carta, não nela: a carta virada gira, e eles continuam de pé.
  const card = face(c.name, c.tapped ? ' lp-tapped' : '');
  const attached = under.get(c.uid) ?? [];
  const cls = `lp-slot${attached.length ? ' lp-host' : ''}${c.tapped ? ' lp-slot-tapped' : ''}`;
  return `<span class="${cls}">${attached.map(a => face(a.name, ' lp-attached')).join('')}${card}${badges}</span>`;
}

function fieldRows(d: Draft, side: Side, under: Map<number, Permanent[]>) {
  const attachedSomewhere = new Set(d.players.flatMap(s => s.battlefield.filter(c => c.attachedTo !== null && d.players.some(o => o.battlefield.some(h => h.uid === c.attachedTo))).map(c => c.uid)));
  const own = side.battlefield.filter(c => !attachedSomewhere.has(c.uid));
  // As iguais sem nada de diferente ficam empilhadas, com a quantidade.
  const plain = (c: Permanent) => !c.tapped && !Object.values(c.counters).some(n => n > 0) && !under.has(c.uid);
  const row = (list: Permanent[]) => runs(list, (a, b) => a.name === b.name && plain(a) && plain(b))
    .map(r => permanent(list[r.start]!, r.count, under)).join('');
  return { lands: row(own.filter(c => isLand(c.name))), others: row(own.filter(c => !isLand(c.name))) };
}

function pile(label: string, cards: (string | Exiled)[], back = false) {
  const top = cards[back ? 0 : cards.length - 1];
  const name = top === undefined ? '' : typeof top === 'string' ? top : top.name;
  const body = !cards.length ? '<span class="lp-card lp-empty"></span>' : back ? '<span class="lp-card lp-back"></span>' : face(name);
  const hint = back && name ? `<small title="${esc(name)}">topo: ${esc(name)}</small>` : '';
  return `<div class="lp-pile"><span class="lp-pile-label">${label} <b>${cards.length}</b></span>${body}${hint}</div>`;
}

function half(d: Draft, p: 0 | 1, current: boolean) {
  const side = d.players[p];
  const under = new Map<number, Permanent[]>();
  for (const s of d.players) for (const c of s.battlefield) if (c.attachedTo !== null) under.set(c.attachedTo, [...(under.get(c.attachedTo) ?? []), c]);
  const { lands, others } = fieldRows(d, side, under);
  const phase = PHASES.find(([v]) => v === d.phase)?.[1] ?? '';
  const head = `<div class="lp-head"><strong>Jogador ${p + 1}</strong>${p === 0 ? '<small>você</small>' : ''}
    <span class="lp-life" title="Vida">♥ ${side.life}</span>${side.poison ? `<span class="lp-poison" title="Veneno">☠ ${side.poison}</span>` : ''}
    ${d.active === p ? `<span class="lp-turn">Turno, ${esc(phase)}</span>` : ''}</div>`;
  const hand = `<div class="lp-hand" aria-label="Mão">${side.hand.length ? side.hand.map(n => face(n)).join('') : '<span class="lp-none">mão vazia</span>'}</div>`;
  const field = (lands || others)
    ? (p === 1 ? [lands, others] : [others, lands]).filter(Boolean).map(r => `<div class="lp-row">${r}</div>`).join('')
    : '<div class="lp-row"><span class="lp-none">campo vazio</span></div>';
  // Na borda da mesa, como na partida: o nome, a vida e as pilhas lado a lado; depois a mão e o campo, rumo ao meio.
  const edge = `<div class="lp-edge">${head}<div class="lp-piles">${pile('Grimório', side.library, true)}${pile('Cemitério', side.graveyard)}${pile('Exílio', side.exile)}</div></div>`;
  const parts = [edge, hand, `<div class="lp-field">${field}</div>`];
  return `<section class="lp-half${current ? ' current' : ''}" data-preview-player="${p}" aria-label="Jogador ${p + 1}">${(p === 1 ? parts : parts.reverse()).join('')}</section>`;
}

/** A mesa inteira; {@code current} é o jogador aberto no editor, marcado na prévia. */
export const previewHTML = (d: Draft, current: 0 | 1) => `<div class="lp-table">${half(d, 1, current === 1)}${half(d, 0, current === 0)}</div>`;
