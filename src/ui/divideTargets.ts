// Dano dividido igualmente entre os alvos (Bola de Fogo): quanto cada alvo leva com os alvos já marcados e quanto a mágica vai custar, com o {1} a mais por alvo depois do primeiro.
import type { FTargeting } from '../forge/client';

/** "This spell costs {1} more to cast for each target beyond the first" (ou a frase em português): o custo de cada alvo a mais. */
export function extraPerTarget(rules: string | undefined) {
  if (!rules) return null;
  const m = rules.match(/costs? (\{[^}]+\}) more to cast for each target beyond the first/i)
    ?? rules.match(/custa (\{[^}]+\}) a mais para ser conjurad[ao] para cada alvo (?:após o|além do) primeiro/i);
  return m?.[1] ?? null;
}

/** "{X}{R}" com X = 4 e 1 alvo a mais de {1} → "{5}{R}": a mana genérica somada num número só. */
export function totalCost(manaCost: string, x: number | undefined, extra: string | null, extraTimes: number) {
  const syms = [...manaCost.matchAll(/\{([^}]+)\}/g)].map(m => m[1]!);
  if (extra) for (let i = 0; i < extraTimes; i++) syms.push(...[...extra.matchAll(/\{([^}]+)\}/g)].map(m => m[1]!));
  let generic = 0;
  const colored: string[] = [];
  for (const s of syms) {
    if (s === 'X') generic += x ?? 0;
    else if (/^\d+$/.test(s)) generic += Number(s);
    else colored.push(s);
  }
  const mana = generic + colored.length;
  return { cost: `${generic || !colored.length ? `{${generic}}` : ''}${colored.map(s => `{${s}}`).join('')}`, mana };
}

export interface EvenSplit { line: string; each: number; cost: string | null; lack: number }

/** A frase do dano com os alvos marcados e o custo; null se a escolha não divide dano igualmente. */
export function evenSplit(t: FTargeting, manaCost: string | undefined, rules: string | undefined): EvenSplit | null {
  const d = t.divideEvenly;
  if (!d) return null;
  const n = t.count ?? (t.cards?.length ?? 0) + (t.players?.length ?? 0);
  const each = n ? Math.floor(d.amount / n) : d.amount;
  const lost = n ? d.amount - each * n : 0;
  const line = !n ? `Toque nos alvos: ${d.amount} de dano dividido igualmente.`
    : `${n} ${n === 1 ? 'alvo' : 'alvos'}: ${each} de dano em cada.${lost ? ` Sobra${lost === 1 ? '' : 'm'} ${lost}, que se perde${lost === 1 ? '' : 'm'}.` : ''}`;
  const extra = extraPerTarget(rules);
  if (!manaCost) return { line, each, cost: null, lack: 0 };
  const total = totalCost(manaCost, d.x, extra, Math.max(0, n - 1));
  const lack = d.available === undefined ? 0 : Math.max(0, total.mana - d.available);
  return { line, each, cost: total.cost, lack };
}
