// Escolher um número (o X de uma mágica, quantas vezes pagar um custo, "escolha um número"): o contador com − e +, os atalhos, quanto vai pagar com a mana disponível e o efeito com o número no lugar do X.
import type { FCard, FNumberCost, FQuestion } from '../forge/client';
import { esc, manaHTML, richText } from './cardtext';

export const isNumberChoice = (q: FQuestion) => q.kind === 'number';

/** Mais que isso de mana, a barra vira só texto. */
const BAR_MAX = 24;

/** O número dentro da faixa da pergunta. */
export function clampNumber(q: FQuestion, n: number) {
  const min = q.min ?? 0;
  return Math.max(min, q.max === undefined ? n : Math.min(q.max, n));
}

/** O número do rascunho (o texto do campo); vazio ou inválido, o menor. */
export function numberValue(q: FQuestion, text: string | undefined) {
  const n = Number.parseInt(text ?? '', 10);
  return Number.isSafeInteger(n) ? clampNumber(q, n) : q.min ?? 0;
}

/** Os símbolos de um custo, com a mana genérica somada num número só, e quanto de mana ele pede. */
function totalCost(parts: string[]) {
  let generic = 0, mana = 0;
  const colored: string[] = [];
  for (const part of parts) for (const [, s] of part.matchAll(/\{([^}]+)\}/g)) {
    if (/^\d+$/.test(s!)) { generic += Number(s); mana += Number(s); }
    else if (s !== 'X') { colored.push(s!); mana += 1; }
  }
  const symbols = [...(generic > 0 || !colored.length ? [String(generic)] : []), ...colored];
  return { symbols, mana };
}

/** O custo pago com o número n: o resto do custo mais n vezes cada unidade. */
export function numberCost(cost: FNumberCost, n: number) {
  return totalCost([cost.base, ...Array.from({ length: Math.max(0, n) }, () => cost.each)]);
}

/** Até quantas unidades a mana disponível paga, dentro da faixa; sem estimativa ou sem custo de mana, null. */
export function affordable(q: FQuestion) {
  const c = q.cost;
  if (!c || c.available === undefined) return null;
  const each = totalCost([c.each]).mana;
  if (each <= 0) return null;
  return clampNumber(q, Math.floor((c.available - totalCost([c.base]).mana) / each));
}

/**
 * A frase do texto da carta que fala do X, com o número no lugar ("causa 4 de dano a qualquer alvo"). Os {X} dos
 * custos ficam como estão; sem frase com X, null.
 */
export function xEffect(text: string | undefined, n: number) {
  if (!text) return null;
  const free = /(^|[^{\p{L}\d/])X(?![\p{L}\d}/])/u;
  const sentences = text.split(/\n+/).flatMap(line => line.split(/(?<=[.!?])\s+/));
  const found = sentences.find(s => free.test(s) && !/^\s*\{/.test(s));
  return found ? found.replace(new RegExp(free.source, 'gu'), `$1${n}`).trim() : null;
}

/** O botão de confirmar diz o que vai acontecer. */
export function confirmLabel(q: FQuestion, n: number) {
  if (q.unit === 'x') return `Confirmar X = ${n}`;
  if (q.unit === 'times') return n === 0 ? 'Não pagar' : `Pagar ${n} ${n === 1 ? 'vez' : 'vezes'}`;
  return `Confirmar ${n}`;
}

const cancelLabel = (q: FQuestion) => (q.cancel === 'spell' ? 'Cancelar mágica' : 'Cancelar habilidade');

/** A linha de custo e efeito: quanto paga, o que faz ou quanto falta, e a barra da mana disponível. */
export function numberPreviewHTML(q: FQuestion, n: number, rules: string | undefined) {
  const effect = q.unit === 'x' ? xEffect(rules, n) : null;
  const c = q.cost;
  if (!c) return effect ? `<div class="num-preview"><p class="num-effect">${richText(effect)}</p></div>` : '';
  const { symbols, mana } = numberCost(c, n);
  const available = c.available;
  const lack = available === undefined ? 0 : Math.max(0, mana - available);
  const base = totalCost([c.base]).mana;
  const status = lack ? `Falta ${lack} de mana: você tem ${available} disponível.`
    : effect ?? (available === undefined ? '' : `Você tem ${available} de mana disponível.`);
  const bar = available !== undefined && Math.max(mana, available) <= BAR_MAX && Math.max(mana, available) > 0
    ? `<div class="num-bar" aria-hidden="true">${Array.from({ length: Math.max(mana, available) }, (_, i) =>
      `<i class="${i >= available ? 'lack' : i < Math.min(base, mana) ? 'base' : i < mana ? 'used' : ''}"></i>`).join('')}</div>` : '';
  return `<div class="num-preview${lack ? ' over' : ''}"><p class="num-pay">Paga ${manaHTML(symbols.map(s => `{${s}}`).join(''))}</p>${status ? `<p class="num-effect">${richText(status)}</p>` : ''}${bar}</div>`;
}

/** Os atalhos: o menor, o que dá para pagar (ou o maior) e, sem teto nem custo, mais 10. */
function quickHTML(q: FQuestion) {
  const min = q.min ?? 0, cap = affordable(q);
  const set = (n: number, text: string) => `<button type="button" class="num-quick" data-num-set="${n}">${text}</button>`;
  return [set(min, `Mín ${min}`),
    cap !== null && cap > min ? set(cap, `O que dá para pagar (${cap})`) : q.max !== undefined ? set(q.max, `Máx ${q.max}`) : '<button type="button" class="num-quick" data-num-add="10">+10</button>'].join('');
}

const unitLabel = (q: FQuestion) => q.unit === 'x' ? 'Valor de X' : q.unit === 'times' ? 'Vezes'
  : q.max === undefined ? `A partir de ${q.min ?? 0}` : `De ${q.min ?? 0} a ${q.max}`;

/** A janela inteira: título, carta, contador (ou os números soltos), atalhos, custo e botões. */
export function numberChoiceHTML(q: FQuestion, text: string | undefined, card: string, rules: string | undefined, names?: [string, string]) {
  // O Forge escreve o nome da carta em inglês; o título usa o nome que a mesa mostra.
  const title = names && names[0] && names[1] ? q.title.split(names[0]).join(names[1]) : q.title;
  const head = `<div class="q-head"><h2>${richText(title)}</h2><button class="icon-btn q-minimize" data-ui="question-minimize" aria-label="Ver a mesa sem perder esta escolha">Ver a mesa</button></div>`;
  const cancel = q.cancel ? `<button type="button" class="arena-btn secondary" data-q-none>${cancelLabel(q)}</button>` : '';
  const side = card ? `<div class="num-card">${card}</div>` : '';
  if (q.values?.length) {
    return `${head}<div class="num-choice">${side}<div class="num-main"><p class="q-hint">Toque no número.</p>
      <div class="num-chips">${q.values.map(v => `<button type="button" class="num-chip" data-num-pick="${v}">${v}</button>`).join('')}</div>
      <div class="q-actions">${cancel}</div></div></div>`;
  }
  const n = numberValue(q, text);
  const over = q.cost?.available !== undefined && numberCost(q.cost, n).mana > q.cost.available;
  return `${head}<form class="num-choice" data-q-number>${side}<div class="num-main">
      <div class="num-unit">${esc(unitLabel(q))}</div>
      <div class="num-counter">
        <button type="button" class="num-step" data-num-add="-1" aria-label="Menos um" ${n <= (q.min ?? 0) ? 'disabled' : ''}>−</button>
        <input id="fQNumber" class="num-value${over ? ' over' : ''}" type="number" inputmode="numeric" step="1" min="${q.min ?? 0}"${q.max !== undefined ? ` max="${q.max}"` : ''} value="${n}" aria-label="${esc(unitLabel(q))}" autocomplete="off">
        <button type="button" class="num-step" data-num-add="1" aria-label="Mais um" ${q.max !== undefined && n >= q.max ? 'disabled' : ''}>+</button>
      </div>
      <div class="num-quicks">${quickHTML(q)}</div>
      <div class="num-live" aria-live="polite">${numberPreviewHTML(q, n, rules)}</div>
      <div class="q-actions">${cancel}<button class="arena-btn primary" data-num-confirm>${esc(confirmLabel(q, n))}</button></div>
    </div></form>`;
}

/**
 * Atualiza a janela aberta para o número n sem redesenhá-la (o campo não perde o foco nem o que está sendo digitado):
 * os botões − e +, o custo, o efeito e o texto do confirmar. Com `setInput`, escreve n no campo também.
 */
export function refreshNumber(box: HTMLElement, q: FQuestion, n: number, rules: string | undefined, setInput: boolean) {
  const input = box.querySelector<HTMLInputElement>('#fQNumber');
  if (!input) return;
  if (setInput) input.value = String(n);
  input.classList.toggle('over', q.cost?.available !== undefined && numberCost(q.cost, n).mana > q.cost.available);
  const less = box.querySelector<HTMLButtonElement>('[data-num-add="-1"]'), more = box.querySelector<HTMLButtonElement>('[data-num-add="1"]');
  if (less) less.disabled = n <= (q.min ?? 0);
  if (more) more.disabled = q.max !== undefined && n >= q.max;
  const live = box.querySelector<HTMLElement>('.num-live');
  if (live) live.innerHTML = numberPreviewHTML(q, n, rules);
  const confirm = box.querySelector<HTMLElement>('[data-num-confirm]');
  if (confirm) confirm.textContent = confirmLabel(q, n);
}

/** O texto de regras da carta que pede o número (em português quando há). */
export const rulesOf = (card: FCard | undefined, ptText: (name: string | undefined) => string | undefined) => (card ? ptText(card.name) || card.text : undefined);
