// Custos opcionais ao conjurar (reforço, recompra, entrelaçar...): cada forma de conjurar num cartão, com o custo total, o que muda e a mana disponível, no lugar da lista "Kicker – {4}" com "Nenhum".
import type { FOption, FQuestion } from '../forge/client';
import { esc, manaHTML, richText } from './cardtext';
import { numberCost } from './numberChoice';

export const isOptionalCosts = (q: FQuestion) => q.purpose === 'optional-costs';

/** Nome de cada custo opcional e a pergunta quando ele é o único. */
const NAMES: Record<string, [string, string]> = {
  Kicker1: ['Reforço', 'reforçar?'], Kicker2: ['Reforço', 'reforçar?'], Buyback: ['Recompra', 'pagar a recompra?'], Entwine: ['Entrelaçar', 'entrelaçar?'],
  Bargain: ['Barganha', 'barganhar?'], PromiseGift: ['Presente', 'prometer o presente?'], Retrace: ['Retraçar', 'retraçar?'], Jumpstart: ['Impulso', 'usar o impulso?'],
  Offering: ['Oferenda', 'fazer a oferenda?'], Teamwork: ['Trabalho em equipe', 'usar o trabalho em equipe?'], Flash: ['Lampejo', 'conjurar como lampejo?'],
  Generic: ['Custo adicional', 'pagar o custo adicional?'],
};
const option = (o: FOption | string): FOption => (typeof o === 'string' ? { label: o } : o);
/** "Kicker – {4}" → "Kicker" quando o tipo não é conhecido. */
const nameOf = (o: FOption) => NAMES[o.optional ?? '']?.[0] ?? o.label.replace(/\s*[–-]\s*\{.*$/, '').trim();

const sentencesOf = (rules: string) => rules.split(/\n+/).flatMap(line => line.split(/(?<=[.!?])\s+/)).map(s => s.trim()).filter(s => s && !/^(Reforço|Kicker)\b/i.test(s));
const KICKED = /reforçad|kicked/i;

/** O que a mágica faz sem o reforço: a primeira frase da carta que não fala dele. */
export function unkickedEffect(o: FOption, rules: string | undefined) {
  if (!(o.optional ?? '').startsWith('Kicker') || !rules) return null;
  return sentencesOf(rules).find(s => !KICKED.test(s)) ?? null;
}

/** O que o custo muda, quando dá para dizer: a frase da carta sobre o reforço, a recompra, entrelaçar. */
export function optionalEffect(o: FOption, rules: string | undefined) {
  const type = o.optional ?? '';
  if (type.startsWith('Kicker') && rules) {
    const found = sentencesOf(rules).find(s => KICKED.test(s));
    if (found) return found;
  }
  if (type === 'Buyback') return 'A carta volta para a sua mão quando resolver.';
  if (type === 'Entwine') return 'Escolhe todos os modos.';
  return null;
}

/** Mana de um custo ("{4}{R}" → 5) somando a parte de cada opção marcada à da mágica. */
const manaOf = (parts: string[]) => numberCost({ base: parts.join(''), each: '' }, 0);
const costLine = (parts: string[]) => {
  const { symbols } = manaOf(parts);
  return manaHTML(symbols.map(s => `{${s}}`).join(''));
};

function offerHTML(attrs: string, title: string, parts: string[], effect: string | null, extra: string[] | undefined, available: number | undefined, on = false) {
  const lack = available === undefined ? 0 : Math.max(0, manaOf(parts).mana - available);
  return `<button type="button" class="offer${on ? ' on' : ''}${lack ? ' short' : ''}" ${attrs}><b>${esc(title)}</b><span class="offer-cost">${costLine(parts)}</span>${extra?.length ? `<small>${esc(extra.join(', '))}</small>` : ''}${effect ? `<span class="offer-effect">${richText(effect)}</span>` : ''}${lack ? `<span class="offer-lack">Falta ${lack} de mana</span>` : ''}</button>`;
}

/** A janela: com um custo só, "Sem" e "Com" lado a lado (um toque responde); com vários, um cartão marcável por custo e "Conjurar". */
export function optionalCostsHTML(q: FQuestion, picked: number[], rules: string | undefined, cardName: string | undefined) {
  const opts = (q.options ?? []).map(option);
  const base = q.cost?.base ?? '', available = q.cost?.available;
  const single = opts.length === 1 && (q.max ?? 1) === 1;
  const first = opts[0];
  const ask = single && first ? NAMES[first.optional ?? '']?.[1] ?? `pagar ${nameOf(first).toLowerCase()}?` : 'custos opcionais';
  const title = cardName ? `${cardName}: ${ask}` : ask[0]!.toUpperCase() + ask.slice(1);
  const bar = available === undefined ? '' : `<p class="offer-mana">Mana disponível: <strong>${available}</strong></p>`;
  const head = `<div class="q-head"><h2>${esc(title)}</h2><button class="icon-btn q-minimize" data-ui="question-minimize" aria-label="Ver a mesa sem perder esta escolha">Ver a mesa</button></div>`;
  if (single && first) {
    const name = nameOf(first);
    return `${head}<div class="offers">
      ${offerHTML('data-q-none', `Sem ${name.toLowerCase()}`, [base], unkickedEffect(first, rules), undefined, available)}
      ${offerHTML('data-q-opt="0"', `Com ${name.toLowerCase()}`, [base, first.cost ?? ''], optionalEffect(first, rules), first.extra, available)}
    </div>${bar}`;
  }
  const chosen = picked.map(i => opts[i]).filter((o): o is FOption => !!o);
  const total = [base, ...chosen.map(o => o.cost ?? '')];
  const lack = available === undefined ? 0 : Math.max(0, manaOf(total).mana - available);
  return `${head}<p class="q-hint">Marque os custos que quer pagar.</p><div class="offers">
    ${opts.map((o, i) => offerHTML(`data-q-opt="${i}" aria-pressed="${picked.includes(i)}"`, nameOf(o), [o.cost ?? ''], optionalEffect(o, rules), o.extra, undefined, picked.includes(i))).join('')}
    </div>${bar}<div class="q-actions"><button class="arena-btn secondary" data-q-none>Sem custos opcionais</button><button class="arena-btn primary" data-q-submit>Conjurar por ${costLine(total)}${lack ? ` (falta ${lack})` : ''}</button></div>`;
}
