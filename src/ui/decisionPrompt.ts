import type { FState } from '../forge/client';

/** Selection metadata describes the task without guessing the underlying card rule. */
export function cardDecision(s: FState) {
  const selection = s.input.selection;
  if (!selection || s.gameOver || s.question || s.input.opening || s.input.priority) return null;
  const { min, max, cards } = selection;
  const count = cards.length;
  if (s.input.tapToPay) return { inHand: false, ...tapToPayProgress(s.input.tapToPay, count) };
  const remaining = Math.max(0, min - count);
  const hand = new Set(s.players.find(p => p.id === s.you)?.hand.map(c => c.id) ?? []);
  const candidates = [...s.input.selectable, ...cards];
  const inHand = candidates.length > 0 && candidates.every(id => hand.has(id));
  const progress = min === max
    ? `${count} de ${max} ${max === 1 ? 'carta selecionada' : 'cartas selecionadas'}`
    : `${count} ${count === 1 ? 'carta selecionada' : 'cartas selecionadas'} · mínimo ${min}, máximo ${max}`;
  const instruction = remaining > 0
    ? `Escolha ${remaining === 1 ? 'mais uma carta' : `mais ${remaining} cartas`}.`
    : s.input.ok.enabled ? 'Você pode confirmar a seleção.' : 'Selecione as cartas indicadas.';
  return { inHand, progress, instruction };
}

/** Preserve the engine's instruction, replacing its numeric plural placeholders. */
export function selectionMessage(message: string) {
  return message.replace(/(\d+)\s+carta\(s\)/g, (_, n: string) => `${n} ${Number(n) === 1 ? 'carta' : 'cartas'}`);
}

type TapToPay = NonNullable<FState['input']['tapToPay']>;
/** [nenhum, um, vários] */
const TAPPED: Record<TapToPay['kind'], [string, string, string]> = {
  improvise: ['Nenhum artefato escolhido', 'artefato escolhido', 'artefatos escolhidos'],
  convoke: ['Nenhuma criatura escolhida', 'criatura escolhida', 'criaturas escolhidas'],
  waterbend: ['Nenhuma permanente escolhida', 'permanente escolhida', 'permanentes escolhidas'],
};
const unpaid = (remaining: string) => !/^(\{0\}|0)?$/.test(remaining.trim());

const TITLES: Record<TapToPay['kind'], string> = { improvise: 'Improvisar', convoke: 'Convocar', waterbend: 'Dobrar água' };

/** Frase curta do balão no meio da mesa. */
export function tapToPayShort(tap: TapToPay, cardName?: string) {
  const what = { improvise: 'vire artefatos', convoke: 'vire criaturas', waterbend: 'vire artefatos e criaturas' }[tap.kind];
  return `${TITLES[tap.kind]}: ${what} para ajudar a pagar${cardName ? ` ${cardName}` : ''}.`;
}

/** Improvisar, convocar e dobrar água: o pedido do Forge em inglês vira título (primeira linha) e explicação. */
export function tapToPayMessage(tap: TapToPay, cardName?: string) {
  const title = TITLES[tap.kind];
  const what = {
    improvise: 'Toque nos artefatos que vão ajudar a pagar: cada um virado paga {1}.',
    convoke: 'Toque nas criaturas que vão ajudar a pagar: cada uma virada paga {1} ou um símbolo de mana da cor dela.',
    waterbend: 'Toque nos artefatos e criaturas que vão ajudar a pagar: cada um virado paga {1}.',
  }[tap.kind];
  return `${title}${cardName ? `: ${cardName}` : ''}\n${what} ${unpaid(tap.remaining) ? `Falta pagar ${tap.remaining}.` : 'O custo já está todo pago.'}`;
}

function tapToPayProgress(tap: TapToPay, count: number) {
  const [none, one, many] = TAPPED[tap.kind];
  return {
    progress: count === 0 ? none : `${count} ${count === 1 ? one : many}`,
    instruction: unpaid(tap.remaining) ? 'Confirme para pagar o resto com mana.' : 'Confirme para conjurar.',
  };
}
