// Dividir um total entre opções (o dano do Raio Bifurcado, um escudo de prevenção, marcadores): o mesmo visual do dano de combate, com − e + por alvo, quanto mata cada criatura e o que falta dividir.
import type { FCard, FOption, FPlayer, FQuestion } from '../forge/client';
import { esc, withoutCardIds } from './cardtext';

export const isAmountChoice = (q: FQuestion) => q.kind === 'amount' && q.purpose !== 'combat-damage';

const option = (o: FOption | string): FOption => (typeof o === 'string' ? { label: o } : o);
const limits = (q: FQuestion, o: FOption) => ({ min: o.min ?? 0, max: Math.min(o.max ?? q.total ?? 0, q.total ?? 0) });

/** A divisão de partida: igual entre as opções, dentro dos limites de cada uma (o que sobra vai para as primeiras). */
export function evenAmounts(q: FQuestion): number[] {
  const opts = (q.options ?? []).map(option);
  const total = q.total ?? 0;
  const out = opts.map(o => limits(q, o).min);
  let left = total - out.reduce((a, b) => a + b, 0);
  // Uma por vez, em rodízio, até acabar ou ninguém mais caber.
  while (left > 0) {
    let placed = false;
    for (let i = 0; i < opts.length && left > 0; i++) {
      if (out[i]! < limits(q, opts[i]!).max) { out[i]!++; left--; placed = true; }
    }
    if (!placed) break;
  }
  return out;
}

/** Os números do rascunho (texto) como inteiros; inválido conta 0. */
export const amountsOf = (amounts: string[]) => amounts.map(a => (/^\d+$/.test(a) ? Number(a) : 0));

/** Põe ou tira 1 de uma opção, dentro do limite dela e do que sobra do total. */
export function stepAmount(q: FQuestion, amounts: number[], index: number, by: 1 | -1): number[] {
  const o = q.options?.[index];
  if (o === undefined) return amounts;
  const { min, max } = limits(q, option(o));
  const left = (q.total ?? 0) - amounts.reduce((a, b) => a + b, 0);
  const next = [...amounts];
  const n = next[index] ?? 0;
  if (by > 0 && n < max && left > 0) next[index] = n + 1;
  if (by < 0 && n > min) next[index] = n - 1;
  return next;
}

/** O dano que mata a criatura: a resistência menos o dano já marcado (sem contar toque mortífero e afins). */
export const lethalOf = (c: FCard | undefined) => (c?.creature && c.toughness !== undefined ? Math.max(1, c.toughness - (c.damage ?? 0)) : null);

const WHAT: Record<NonNullable<FQuestion['amountOf']>, [string, string]> = {
  damage: ['divida {n} de dano', 'de dano'], shield: ['divida a prevenção de {n} de dano', 'prevenido'], counters: ['divida {n} marcadores', 'marcadores'],
};

export interface AmountView { face(c: FCard): string; label(c: FCard): string; players: FPlayer[] }

export function amountChoiceHTML(v: AmountView, q: FQuestion, amounts: number[]) {
  const opts = (q.options ?? []).map(option);
  const total = q.total ?? 0;
  const left = total - amounts.reduce((a, b) => a + b, 0);
  const [ask, unit] = q.amountOf ? WHAT[q.amountOf] : [`divida ${total}`, ''];
  const askText = ask.replace('{n}', String(total));
  const title = q.card ? `${v.label(q.card)}: ${askText}` : askText[0]!.toUpperCase() + askText.slice(1);
  const rows = opts.map((o, i) => {
    const card = o.card;
    const player = o.kind === 'player' ? v.players.find(p => p.id === o.id) : undefined;
    const name = card ? v.label(card) : player?.name ?? withoutCardIds(o.label);
    const n = amounts[i] ?? 0;
    const { min, max } = limits(q, o);
    const lethal = q.amountOf === 'damage' ? lethalOf(card) : null;
    const dies = lethal !== null && n >= lethal;
    const need = lethal !== null ? (dies ? 'Morre' : `Morre com ${lethal}`) : player ? `${player.life} de vida` : `De ${min} a ${max}`;
    return `<li class="cd-target${dies ? ' lethal' : ''}">
      <div class="cd-face">${card ? v.face(card) : `<div class="cd-player" aria-hidden="true">${esc(Array.from(name)[0] ?? '?')}</div>`}</div>
      <div class="cd-name">${esc(name)}</div>
      <div class="cd-need">${esc(need)}${dies ? ' ✓' : ''}</div>
      <div class="cd-stepper" role="group" aria-label="${esc(`${name}: ${n} ${unit}`.trim())}">
        <button type="button" class="cd-btn" data-amt-sub="${i}" aria-label="${esc(`Tirar 1 de ${name}`)}" ${n > min ? '' : 'disabled'}>−</button>
        <output class="cd-amount" aria-live="polite">${n}</output>
        <button type="button" class="cd-btn" data-amt-add="${i}" aria-label="${esc(`Pôr 1 em ${name}`)}" ${n < max && left > 0 ? '' : 'disabled'}>+</button>
      </div>
    </li>`;
  }).join('');
  const status = left > 0 ? `Falta dividir ${left}.` : left < 0 ? `Passou ${-left} do total.` : 'Tudo dividido.';
  return `<div class="q-head"><h2>${esc(title)}</h2><button class="icon-btn q-minimize" data-ui="question-minimize" aria-label="Ver a mesa sem perder esta escolha">Ver a mesa</button></div>
    <div class="cd-main amount-main">
      <ol class="cd-targets">${rows}</ol>
      <p class="cd-status${left === 0 ? ' ok' : ''}" id="fAmountStatus" aria-live="polite">${esc(status)}</p>
    </div>
    <div class="q-actions">
      <button type="button" class="arena-btn secondary" data-amt-even>Dividir igual</button>
      <button type="button" class="arena-btn primary" data-amt-confirm ${left === 0 ? '' : 'disabled'} aria-describedby="fAmountStatus">Confirmar</button>
    </div>`;
}
