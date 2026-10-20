import type { FCard, FOption, FQuestion } from '../forge/client';
import { esc } from './cardtext';

/*
 * Distribuir o dano de combate de um atacante bloqueado por duas ou mais criaturas (ou com atropelar).
 * As regras são as da ponte (CombatDamage.java): todo o dano distribuído; com ordem, um bloqueador só recebe
 * dano depois que os anteriores têm letal; o defensor só recebe quando todos os bloqueadores têm letal.
 */

type Face = (c: FCard) => string;
type Label = (c: FCard) => string;

export const isCombatDamage = (q: FQuestion) => q.kind === 'amount' && q.purpose === 'combat-damage';

const options = (q: FQuestion) => (q.options ?? []).map(o => (typeof o === 'string' ? { label: o } : o) as FOption);

/** Divisão automática: letal em cada bloqueador, na ordem; o que sobra vai para o defensor ou para o último. */
export function autoSplit(q: FQuestion): number[] {
  if (q.suggested?.length === (q.options?.length ?? 0)) return [...q.suggested];
  const opts = options(q);
  let left = q.total ?? 0, last = -1;
  const out = opts.map((o, i) => {
    if (o.defender) return 0;
    last = i;
    const give = Math.min(left, o.lethal ?? 0); left -= give; return give;
  });
  if (left > 0) { const d = opts.findIndex(o => o.defender); out[d >= 0 ? d : Math.max(0, last)] += left; }
  return out;
}

export interface SplitStatus { remaining: number; valid: boolean; message: string; locked: boolean[] }

/** Quanto falta, se a divisão vale e quais opções ainda não podem receber dano (com o motivo). */
export function splitStatus(q: FQuestion, amounts: number[]): SplitStatus {
  const opts = options(q);
  const total = q.total ?? 0;
  const remaining = total - amounts.reduce((a, b) => a + b, 0);
  const locked = opts.map(() => false);
  let message = '';
  if (!q.free) {
    let allLethal = true;
    opts.forEach((o, i) => {
      // Com ordem, o próximo bloqueador só abre depois do letal no anterior; o defensor só depois de todos.
      if ((o.defender || q.ordered) && !allLethal) {
        locked[i] = true;
        if (amounts[i] > 0) message ||= o.defender ? 'Para passar dano ao defensor, dê dano letal a todos os bloqueadores.' : 'Dê dano letal a cada bloqueador antes de passar ao próximo.';
      }
      if (!o.defender) allLethal &&= amounts[i] >= (o.lethal ?? 0);
    });
  }
  if (!message && remaining < 0) message = `Passou ${-remaining} do total.`;
  return { remaining, valid: remaining === 0 && !message, message: message || (remaining > 0 ? `Falta distribuir ${remaining}.` : 'Tudo distribuído.'), locked };
}

/** + ou − num alvo, respeitando o total e as travas; "letal" completa até o letal (ou põe todo o resto). */
export function adjust(q: FQuestion, amounts: number[], index: number, how: 'add' | 'sub' | 'lethal'): number[] {
  const next = [...amounts];
  const st = splitStatus(q, amounts);
  const o = options(q)[index];
  if (how === 'sub') { next[index] = Math.max(0, next[index] - 1); return next; }
  if (st.locked[index] || st.remaining <= 0) return next;
  const lethal = o.defender ? st.remaining : Math.max(1, (o.lethal ?? 0) - next[index]);
  next[index] += how === 'add' ? 1 : Math.min(st.remaining, lethal > 0 ? lethal : st.remaining);
  return next;
}

function targetName(o: FOption, label: Label, players: { id: number; name: string }[]) {
  if (o.card) return label(o.card);
  return players.find(p => p.id === o.id)?.name ?? o.label;
}

export function combatDamageHTML(q: FQuestion, amounts: number[], face: Face, label: Label, players: { id: number; name: string }[] = []) {
  const opts = options(q);
  const st = splitStatus(q, amounts);
  const attacker = q.card;
  const flags = [q.trample ? 'atropelar' : '', q.deathtouch ? 'toque mortífero: 1 de dano já é letal' : ''].filter(Boolean).join(' · ');
  const rule = q.free ? 'Divida o dano como quiser.' : q.ordered ? 'Na ordem dos bloqueadores: o próximo só recebe dano depois que o anterior tem dano letal.' : 'Divida entre os bloqueadores como quiser.';
  const targets = opts.map((o, i) => {
    const name = targetName(o, label, players);
    const n = amounts[i] ?? 0;
    const lethal = o.lethal ?? 0;
    const isLethal = !o.defender && n >= lethal && lethal > 0;
    return `<li class="cd-target${o.defender ? ' defender' : ''}${st.locked[i] ? ' locked' : ''}${isLethal ? ' lethal' : ''}">
      <div class="cd-face">${o.card ? face(o.card) : `<div class="cd-player" aria-hidden="true">${esc(Array.from(name)[0] ?? '?')}</div>`}</div>
      <div class="cd-name">${esc(name)}</div>
      <div class="cd-need">${o.defender ? (q.trample ? 'Excesso por atropelar' : 'Defensor') : `Letal: ${lethal}`}${isLethal ? ' ✓' : ''}</div>
      <div class="cd-stepper" role="group" aria-label="${esc(`Dano em ${name}`)}">
        <button type="button" class="cd-btn" data-cd-sub="${i}" aria-label="${esc(`Tirar 1 de ${name}`)}" ${n > 0 ? '' : 'disabled'}>−</button>
        <output class="cd-amount" aria-live="polite" aria-label="${esc(`${n} de dano em ${name}`)}">${n}</output>
        <button type="button" class="cd-btn" data-cd-add="${i}" aria-label="${esc(`Pôr 1 em ${name}`)}" ${st.locked[i] || st.remaining <= 0 ? 'disabled' : ''}>+</button>
      </div>
      <button type="button" class="cd-lethal" data-cd-lethal="${i}" ${st.locked[i] || st.remaining <= 0 ? 'disabled' : ''}>${o.defender ? 'Todo o resto' : 'Letal'}</button>
      ${st.locked[i] ? `<p class="cd-lock">${o.defender ? 'Abre quando todos os bloqueadores tiverem letal.' : 'Abre depois do letal no anterior.'}</p>` : ''}
    </li>`;
  }).join('');
  return `<div class="q-head"><h2>Distribua o dano de combate</h2><button class="icon-btn q-minimize" data-ui="question-minimize" aria-label="Ver a mesa sem perder esta escolha">Ver a mesa</button></div>
    <div class="cd-body">
      ${attacker ? `<div class="cd-attacker"><div class="cd-face big" data-peek="${attacker.id}">${face(attacker)}</div><p><strong>${esc(label(attacker))}</strong> causa <b>${q.total}</b> de dano${flags ? `<small>${esc(flags)}</small>` : ''}</p></div>` : ''}
      <div class="cd-main">
        <p class="q-hint">${esc(rule)}</p>
        <ol class="cd-targets">${targets}</ol>
        <p class="cd-status${st.valid ? ' ok' : st.message.startsWith('Falta') ? '' : ' error'}" id="fCombatDamageStatus" aria-live="polite">${esc(st.message)}</p>
      </div>
    </div>
    <div class="q-actions">
      <button type="button" class="arena-btn secondary" data-cd-auto>Distribuição automática</button>
      <button type="button" class="arena-btn primary big" data-cd-confirm ${st.valid ? '' : 'disabled'} aria-describedby="fCombatDamageStatus">Confirmar dano</button>
    </div>`;
}
