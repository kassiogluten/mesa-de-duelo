// Análise do deck para o jogador: quantos terrenos, a chance da mão inicial e os avisos de ramp, compra e remoção.
import type { CategoryCount, CategoryId } from './functions';

/** Chance de exatamente k sucessos ao comprar n cartas de N, com K sucessos no grimório (hipergeométrica). */
export function hypergeometric(N: number, K: number, n: number, k: number): number {
  if (k < 0 || k > n || k > K || n - k > N - K) return 0;
  return Math.exp(lnChoose(K, k) + lnChoose(N - K, n - k) - lnChoose(N, n));
}
function lnChoose(n: number, k: number) { let s = 0; for (let i = 1; i <= k; i++) s += Math.log((n - k + i) / i); return s; }
/** Chance de entre `min` e `max` sucessos (inclusive). */
export const between = (N: number, K: number, n: number, min: number, max: number) => {
  let p = 0; for (let k = min; k <= max; k++) p += hypergeometric(N, K, n, k); return p;
};

export interface Insight { tone: 'good' | 'warn' | 'info'; title: string; text: string }

export interface AnalysisInput {
  /** Commander e Oathbreaker contam como deck de 100 com comandante. */
  commander: boolean;
  /** Cartas no grimório no começo da partida (o deck principal, sem os comandantes). */
  library: number;
  lands: number;
  /** Custo médio das cartas que não são terreno; null sem dados. */
  average: number | null;
  /** Mágicas baratas (custo até 2) que compram ou aceleram a mana: elas deixam o deck jogar com menos terrenos. */
  cheapHelpers: number;
  /** Null enquanto as funções das cartas não chegaram (ou se o servidor não respondeu). */
  categories: CategoryCount[] | null;
  /** Cores com poucas fontes de mana para os símbolos que pedem. */
  shortColors: string[];
  unknown: number;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Quantos terrenos o deck pede, pela conta de Frank Karsten (quanto custa o deck e quantas mágicas baratas ajudam com a
 * mana): no Commander, 31,42 + 3,13 × custo médio − 0,28 × ajudantes, entre 33 e 40; nos de 60, 19,59 + 1,90 × custo
 * médio − 0,28 × ajudantes, proporcional ao tamanho do grimório. Sem saber os ajudantes (as funções não chegaram),
 * conta os de um deck comum: 8 no Commander, 2 nos outros.
 */
export function recommendedLands(input: Pick<AnalysisInput, 'commander' | 'library' | 'average' | 'cheapHelpers'> & { knownHelpers?: boolean }): number {
  const avg = input.average ?? (input.commander ? 3 : 2.5);
  const helpers = input.knownHelpers === false ? (input.commander ? 8 : 2) : input.cheapHelpers;
  if (input.commander) return Math.min(40, Math.max(33, Math.round(31.42 + 3.13 * avg - 0.28 * helpers)));
  const raw = (19.59 + 1.9 * avg - 0.28 * helpers) * input.library / 60;
  return Math.min(Math.round(input.library * 0.45), Math.max(Math.round(input.library * 0.27), Math.round(raw)));
}

/** O que dizer do deck, do mais importante para o que só informa. */
export function deckInsights(input: AnalysisInput): Insight[] {
  const out: Insight[] = [];
  const { library: N, lands } = input;
  if (N <= 7) return out;
  // Sem os dados de boa parte das cartas, as contas enganam (um deck sem terrenos conhecidos): só o aviso.
  if (input.unknown > N * 0.1) return [{ tone: 'info', title: 'Esperando os dados das cartas', text: `Faltam os dados de ${plural(input.unknown, 'carta', 'cartas')}. A análise aparece quando eles chegarem.` }];
  const want = recommendedLands({ ...input, knownHelpers: !!input.categories });
  if (lands < want - 2) out.push({ tone: 'warn', title: 'Poucos terrenos', text: `${plural(lands, 'terreno', 'terrenos')}; para o custo deste deck, o normal seria uns ${want}. Mãos sem terreno vão ser comuns.` });
  else if (lands > want + 2) out.push({ tone: 'warn', title: 'Terrenos demais', text: `${plural(lands, 'terreno', 'terrenos')}; para o custo deste deck, uns ${want} já bastam. Sobra espaço para mais mágicas.` });
  else out.push({ tone: 'good', title: 'Terrenos na medida', text: `${plural(lands, 'terreno', 'terrenos')}, perto dos ${want} que o custo deste deck pede.` });

  const good = between(N, lands, 7, 2, 4), screw = between(N, lands, 7, 0, 1);
  out.push({ tone: screw > 0.25 ? 'warn' : 'info', title: 'Mão inicial', text: `Com 7 cartas, ${pct(good)} das mãos têm de 2 a 4 terrenos, e ${pct(screw)} têm 0 ou 1.` });

  if (input.average !== null) {
    const heavy = input.commander ? 3.6 : 3.2, light = input.commander ? 2.6 : 2;
    const avg = input.average.toFixed(2).replace('.', ',');
    if (input.average > heavy) out.push({ tone: 'warn', title: 'Curva alta', text: `Custo médio ${avg}: o deck demora para fazer as jogadas. Ramp e mágicas baratas ajudam.` });
    else if (input.average < light) out.push({ tone: 'info', title: 'Curva baixa', text: `Custo médio ${avg}: o deck joga rápido e fica sem cartas cedo; compra ajuda a manter o ritmo.` });
  }

  for (const color of input.shortColors) out.push({ tone: 'warn', title: 'Poucas fontes de cor', text: `Poucas fontes de ${color} para os símbolos dessa cor nos custos.` });

  if (input.categories) {
    const count = (id: CategoryId) => input.categories!.find(c => c.category.id === id)?.count ?? 0;
    // Faixas comuns de quem monta Commander (o modelo do The Command Zone): 10 de ramp, 10 de compra, 8 a 10 remoções e 2 a 3 limpa-campos.
    const targets: [CategoryId, number, number, string, string][] = input.commander
      ? [['ramp', 10, 7, 'Ramp', 'aceleradores de mana'], ['draw', 10, 7, 'Compra', 'cartas de compra'], ['removal', 8, 5, 'Remoção', 'remoções'], ['sweeper', 2, 1, 'Limpa-campo', 'limpa-campos']]
      : [['removal', 6, 3, 'Remoção', 'remoções'], ['draw', 4, 2, 'Compra', 'cartas de compra']];
    for (const [id, ideal, low, title, what] of targets) {
      const n = count(id);
      if (n >= ideal) out.push({ tone: 'good', title, text: `${plural(n, 'carta', 'cartas')} de ${title.toLowerCase()}: bem servido.` });
      else if (n < low) out.push({ tone: 'warn', title: `${title} abaixo do comum`, text: `Só ${n} ${what}; o comum é ter pelo menos ${ideal}.` });
      else out.push({ tone: 'info', title, text: `${n} ${what}; dá para chegar a ${ideal}.` });
    }
    if (input.commander) {
      const helpers = count('ramp') + count('draw');
      const early = 1 - hypergeometric(N, Math.min(N, helpers), 7, 0);
      if (helpers) out.push({ tone: 'info', title: 'Ramp ou compra na mão', text: `${pct(early)} das mãos iniciais trazem pelo menos uma carta de ramp ou compra.` });
    }
  }
  if (input.unknown) out.push({ tone: 'info', title: 'Análise parcial', text: `Faltam os dados de ${plural(input.unknown, 'carta', 'cartas')}; as contas não as incluem.` });
  return out;
}
