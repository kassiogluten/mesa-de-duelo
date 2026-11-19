// Os modos de uma mágica ou habilidade modal ("Escolha um —", "Escolha dois —") numa tela só: cada modo num cartão com o texto da carta em português e o alvo que pede, os que não dá para escolher apagados com o motivo, e a contagem.
import type { FOption, FQuestion, FUnavailableMode } from '../forge/client';
import { esc, manaHTML, richText } from './cardtext';
import { validTargetKind } from './shortInstruction';

export const isModeChoice = (q: FQuestion) => q.purpose === 'modes';

const NUMBERS = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco'];
/** "escolha um modo", "escolha dois modos", "escolha de 1 a 3 modos", "escolha um ou mais modos". */
export function modesAsk(min: number, max: number) {
  const n = (k: number) => NUMBERS[k] ?? String(k);
  if (min === max) return `escolha ${n(max)} ${max === 1 ? 'modo' : 'modos'}`;
  if (min <= 1 && max >= (NUMBERS.length - 1)) return 'escolha um ou mais modos';
  return min === 0 ? `escolha até ${n(max)} ${max === 1 ? 'modo' : 'modos'}` : `escolha de ${min} a ${max} modos`;
}

/**
 * O texto de cada modo como está impresso na carta (as linhas que começam com "•"), na ordem da carta. Só vale quando
 * o número de modos bate com o que o servidor contou; senão, null e a tela usa o texto que veio com cada opção.
 */
export function printedModes(rules: string | undefined, count: number | undefined): string[] | null {
  if (!rules || !count) return null;
  const modes = rules.split(/\r?\n/).map(l => l.trim()).filter(l => /^[•●]/.test(l)).map(l => l.replace(/^[•●]\s*/, ''));
  return modes.length === count ? modes : null;
}

const clean = (label: string) => label.replace(/^[\s•●]+/, '').trim();

export interface ModeRow { modeIndex: number; text: string; option?: number; target?: string | null; off?: FUnavailableMode['reason'] }

/** Os modos na ordem da carta: os que dá para escolher (com o índice da opção na resposta) e os que ficaram de fora. */
export function modeRows(q: FQuestion, rules: string | undefined): ModeRow[] {
  const printed = printedModes(rules, q.modeCount);
  const text = (index: number, label: string) => printed?.[index - 1] ?? clean(label);
  const rows: ModeRow[] = (q.options ?? []).map((o, i) => {
    const opt: FOption = typeof o === 'string' ? { label: o } : o;
    const index = opt.modeIndex ?? 0;
    return { modeIndex: index, text: index ? text(index, opt.label) : clean(opt.label), option: i, target: opt.valid ? validTargetKind(opt.valid, opt.zones) : undefined };
  });
  for (const u of q.unavailableModes ?? []) rows.push({ modeIndex: u.modeIndex, text: text(u.modeIndex, u.label), off: u.reason });
  // Sem o número do modo (servidor antigo), mantém a ordem em que vieram.
  return rows.every(r => r.modeIndex) ? rows.sort((a, b) => a.modeIndex - b.modeIndex) : rows;
}

const OFF: Record<FUnavailableMode['reason'], string> = { target: 'Sem alvo possível agora', chosen: 'Já escolhido antes' };

/** A janela inteira. picked: as opções marcadas, na ordem do toque; cardName e cost: o nome da carta na mesa e o custo dela. */
export function modeChoiceHTML(q: FQuestion, picked: number[], rules: string | undefined, cardName: string | undefined, cost: string | undefined) {
  const min = q.min ?? 1, max = q.max ?? 1, single = max === 1;
  const ask = modesAsk(min, max);
  const title = cardName ? `${cardName}: ${ask}` : ask[0]!.toUpperCase() + ask.slice(1);
  const ready = picked.length >= min && picked.length <= max;
  const count = single ? '' : `<span class="q-pick-count${ready ? ' ok' : ''}" id="fQPickCount" aria-label="${picked.length} de ${max} modos escolhidos">${picked.length}<small>/ ${max}</small></span>`;
  const rows = modeRows(q, rules).map(r => {
    if (r.option === undefined) {
      return `<div class="mode-opt off" aria-disabled="true"><span class="mode-k" aria-hidden="true">${r.modeIndex || ''}</span><span>${richText(r.text)}<small class="mode-why">${OFF[r.off ?? 'target']}</small></span></div>`;
    }
    const at = picked.indexOf(r.option);
    const on = at >= 0;
    const target = r.target ? `<small>Alvo: ${esc(r.target)}</small>` : '';
    return `<button class="mode-opt${on ? ' on' : ''}" data-q-opt="${r.option}" aria-pressed="${on}"><span class="mode-k" aria-hidden="true">${on && !single ? at + 1 : r.modeIndex || ''}</span><span>${richText(r.text)}${target}</span></button>`;
  }).join('');
  const hint = single ? 'Toque no modo.' : min === max ? `Toque em ${NUMBERS[max] ?? max} modos e confirme.` : 'Toque nos modos e confirme.';
  return `<div class="q-head"><h2>${esc(title)}</h2><button class="icon-btn q-minimize" data-ui="question-minimize" aria-label="Ver a mesa sem perder esta escolha">Ver a mesa</button></div>
    <p class="mode-sub">${cost ? manaHTML(cost) : ''}<span>${hint}</span>${count}</p>
    <div class="mode-grid">${rows}</div>
    ${single && min > 0 ? '' : `<div class="q-actions">${min === 0 ? '<button class="arena-btn secondary" data-q-none>Nenhum modo</button>' : ''}<p class="q-pick-warn" id="fQPickWarn" role="alert" hidden></p>${single ? '' : `<button class="arena-btn primary" data-q-submit>${ready ? 'Confirmar modos' : 'Confirmar'}</button>`}</div>`}`;
}
