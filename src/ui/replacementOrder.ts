import type { FCard, FQuestion } from '../forge/client';
import { esc, richText } from './cardtext';

/*
 * Qual efeito de substituição se aplica primeiro (Corpsejack Menace com Hardened Scales): cada efeito com a carta
 * dele, e "usar em todas" para não perguntar de novo a cada criatura do mesmo efeito.
 */

export const isReplacementOrder = (q: FQuestion) => q.purpose === 'replacement-order';

export function replacementOrderHTML(q: FQuestion, all: boolean, face: (c: FCard) => string, label: (c: FCard) => string) {
  const opts = (q.options ?? []).map(o => typeof o === 'string' ? { label: o } : o);
  const source = q.card ? label(q.card) : '';
  return `<div class="q-head"><h2>Qual efeito aplicar primeiro?</h2><button class="icon-btn q-minimize" data-ui="question-minimize" aria-label="Ver a mesa sem perder esta escolha">Ver a mesa</button></div>
    <p class="q-hint">${source ? `${esc(source)} está resolvendo. ` : ''}Mais de um efeito muda o mesmo evento, e a ordem muda o resultado. Toque no que se aplica primeiro.</p>
    <div class="q-opts cards">${opts.map((o, i) => {
      const name = o.card ? label(o.card) : '';
      return `<button class="q-opt has-card" data-q-opt="${i}"${o.card ? ` data-q-card="${o.card.id}"` : ''} aria-label="${esc(`${name ? `${name}: ` : ''}${o.ability ?? o.label}`)}">
        ${o.card ? `<div class="q-face">${face(o.card)}</div>` : ''}<span>${name ? `<b>${esc(name)}</b> ` : ''}${richText(o.ability ?? o.label)}</span></button>`;
    }).join('')}</div>
    ${q.applyToAll ? `<label class="q-apply-all"><input type="checkbox" id="fQApplyAll" ${all ? 'checked' : ''}><span>Usar a mesma escolha no resto deste efeito <small>(em cada criatura que recebe marcadores, por exemplo)</small></span></label>` : ''}`;
}
