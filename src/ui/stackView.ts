// A pilha na mesa: o monte de cartas ao lado do campo (o topo com o selo do tipo e a faixa da habilidade de lealdade ou do
// modo escolhido) e a galeria que abre ao tocar nele.
import type { FCard, FState } from '../forge/client';
import { esc, richText } from './cardtext';
import { countSealsHTML } from './cardCounts';
import { STACK_KINDS, loyaltyLineIn, modeLineIn, stackBadgeText, stackCastLine, stackLoyaltyCost, stackLoyaltyLine, stackLoyaltyTone, stackOwnerLine, stackTag } from './stackPresentation';

/** O que a pilha precisa da mesa. */
export interface StackView {
  /** A carta em tamanho normal. */
  face(c: FCard): string;
  label(c: FCard): string;
  /** Texto em português da carta, quando a mesa o tem. */
  ptText(name: string | undefined): string | undefined;
  playerName(id: number): string;
  you: number | undefined;
  /** "Alvos: …" do item. */
  targetsText(targets: FState['stack'][number]['targets']): string;
}

/** Selo que diz por que o item está na pilha (mágica, habilidade ou gatilho) e, se houver, como foi conjurado ou o custo de lealdade. */
export function stackKindBadge(si: FState['stack'][number]) {
  const kind = si.kind && STACK_KINDS[si.kind];
  const tag = stackTag(si);
  if (!kind && !tag) return '';
  // No celular, com a forma de conjurar, o ícone já diz o tipo: a palavra sai para o selo caber na pilha estreita.
  const label = kind ? `<span class="stack-kind-label${tag ? ' with-cast' : ''}">${kind.label}${tag ? ' · ' : ''}</span>` : '';
  return `<span class="stack-kind ${si.kind ?? 'spell'}" title="${esc(stackBadgeText(si))}">${kind ? `<svg viewBox="0 0 16 16" aria-hidden="true">${kind.icon}</svg>` : ''}${label}${esc(tag)}</span>`;
}
/** Faixa no pé da carta do topo: qual habilidade de lealdade foi usada, com o custo e o texto dela. */
export function stackLoyaltyStrip(v: StackView, si: FState['stack'][number]) {
  const cost = stackLoyaltyCost(si);
  if (!cost) return '';
  const tone = stackLoyaltyTone(si);
  // O texto em português da carta, quando a mesa o tem; senão, o que o servidor manda.
  const text = (si.loyalty && loyaltyLineIn(v.ptText(si.source?.name), si.loyalty.cost)) || si.loyalty?.text;
  return `<span class="stack-loyalty ${tone}${si.loyalty?.ultimate ? ' ultimate' : ''}"><b class="loyalty-chip ${tone}">${esc(cost)}</b>${text ? `<span>${richText(text)}</span>` : ''}</span>`;
}
/** Faixa no pé da carta do topo: o modo escolhido de uma mágica modal (um por linha, na ordem em que resolvem). */
export function stackModeStrip(v: StackView, si: FState['stack'][number]) {
  if (!si.modes?.length) return '';
  // O texto em português da carta, quando a mesa o tem; senão, o que o servidor manda.
  const pt = v.ptText(si.source?.name);
  const rows = si.modes.map(m => `<span class="stack-mode-row"><b class="mode-chip" title="Modo ${m.index} da carta" aria-label="Modo ${m.index}:">${m.index}</b><span>${richText(modeLineIn(pt, m.index) || m.text)}</span></span>`).join('');
  return `<span class="stack-loyalty stack-mode" title="${si.modes.length > 1 ? 'Modos escolhidos' : 'Modo escolhido'}">${rows}</span>`;
}
export function stackFace(v: StackView, si: FState['stack'][number]) {
  // O valor que a carta conta (item 56), atualizado enquanto ela espera na pilha.
  const counted = si.source ? countSealsHTML(si.source, v.playerName, v.you) : '';
  return si.source ? v.face(si.source) + counted : `<div class="stack-effect-face"><span>Efeito na pilha</span><p>${richText(si.text)}</p></div>`;
}
export function stackPanel(v: StackView, s: FState, replaying: boolean, o: { minimized: boolean; galleryOpen: boolean }) {
  const count = s.stack.length;
  const top = s.stack[0];
  if (!top) return '';
  return `<div class="stack-heading"><h2>Pilha</h2><span class="stack-count">${count}</span>${`<button class="stack-size-toggle" data-ui="stack-size" aria-label="${o.minimized ? 'Expandir a pilha' : 'Recolher a pilha para ver o campo'}" aria-expanded="${!o.minimized}">${o.minimized ? '+' : '−'}</button>`}</div>
    <button class="stack-pile" data-ui="${replaying ? 'stack-replay' : 'stack-open'}" data-stack="${top.id}" ${replaying ? 'data-stack-replay' : `data-gen="${s.input.gen}" aria-haspopup="dialog" aria-expanded="${o.galleryOpen}" aria-controls="fStackGallery"`} aria-label="${stackBadgeText(top) ? `${esc(stackBadgeText(top))}. ` : ''}${replaying ? `Inspecionar ${top.source ? esc(v.label(top.source)) : 'efeito'}. Reprodução de uma jogada já processada; não está mais na pilha.` : `Abrir a pilha: ${count} ${count === 1 ? 'efeito' : 'efeitos'}. ${top.source ? esc(v.label(top.source)) : 'O efeito do topo'} resolve primeiro.`}">
      ${s.stack.slice(0, 4).map((si, i) => `<div class="stack-layer ${si.controller === s.you ? 'mine' : 'theirs'}${!replaying && s.input.selectableStacks?.includes(si.id) ? ' actionable' : ''}" style="--depth:${i}" ${i ? `data-stack="${si.id}"` : ''} aria-hidden="true">${stackFace(v, si)}${i ? '' : stackKindBadge(si) + stackLoyaltyStrip(v, si) + stackModeStrip(v, si)}</div>`).join('')}
      <span class="stack-top-label">${replaying ? 'Jogada recente' : 'Resolve primeiro'}</span>
    </button><span class="stack-open-hint">${replaying ? 'Clique para inspecionar' : 'Clique para ver a pilha'}</span>`;
}

/** A pilha aberta em galeria: um item por vez, na ordem em que resolvem, com efeito, alvos e o que dá para fazer. */
export function stackGalleryHTML(v: StackView, s: FState) {
  const count = s.stack.length;
  return `<section class="stack-gallery" role="dialog" aria-modal="true" aria-labelledby="fStackGalleryTitle" aria-describedby="fStackGalleryHint">
    <header class="stack-gallery-heading"><div><h2 id="fStackGalleryTitle">Pilha <span aria-live="polite">${count}</span></h2><p id="fStackGalleryHint">O primeiro efeito à esquerda resolve primeiro.</p></div><button class="icon-btn" data-ui="stack-close" aria-label="Fechar pilha">Fechar</button></header>
    <ol class="stack-gallery-track" tabindex="0" aria-label="Efeitos em ordem de resolução. Role para ver todos.">${s.stack.map((si, i) => {
      const selectable = !!s.input.selectableStacks?.includes(si.id);
      const name = si.source ? v.label(si.source) : 'Efeito';
      const owner = s.players.find(p => p.id === si.controller)?.name;
      return `<li class="stack-gallery-item ${si.controller === s.you ? 'mine' : 'theirs'}" data-stack-instance="${si.id}">
        <div class="stack-gallery-order"><b>${i + 1}</b><span>${i === 0 ? 'Resolve primeiro' : `${i + 1}º na resolução`}</span></div>
        <button class="stack-gallery-card${selectable ? ' actionable' : ''}" data-stack="${si.id}" data-gen="${s.input.gen}" aria-label="${selectable ? 'Selecionar como alvo' : 'Inspecionar'}: ${esc(name)}">${stackFace(v, si)}${stackKindBadge(si)}</button>
        <div class="stack-gallery-owner">${esc(stackOwnerLine(si, s.you, owner))}</div>
        <div class="stack-gallery-effect" tabindex="0" aria-label="Efeito e alvos de ${esc(name)}">${stackLoyaltyLine(si) ? `<p class="stack-cast">${esc(stackLoyaltyLine(si))}</p>` : ''}<p>${richText(si.text)}</p>${stackCastLine(si.cast) ? `<p class="stack-cast">${esc(stackCastLine(si.cast))}</p>` : ''}${v.targetsText(si.targets) ? `<p class="stack-targets">${esc(v.targetsText(si.targets))}</p>` : ''}</div>
        <div class="stack-gallery-actions">${selectable ? `<button class="arena-btn primary" data-stack="${si.id}" data-gen="${s.input.gen}">Selecionar como alvo</button>` : ''}${si.source ? `<button class="icon-btn" data-stack-inspect="${si.id}" aria-label="Inspecionar ${esc(name)}">Inspecionar</button>` : ''}</div>
      </li>`;
    }).join('')}</ol>
    <p class="stack-gallery-help">Use ← e → nas cartas para percorrer a pilha. Esc fecha.</p>
  </section>`;
}
