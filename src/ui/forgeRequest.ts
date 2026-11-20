// Pedidos do Forge nas escolhas de cartas que chegam em inglês ou pela metade ("Escolha 1 creature(s) a sacrifice.",
// "Select a permanent to remove 1 counter(s) from"): a frase curta em português e o nome do botão que confirma.
import { targetKind } from './shortInstruction';
import { colorName } from './colorChoice';
import { creatureTypePt } from './creatureTypes';
import type { FQuestion } from '../forge/client';

export interface SelectionRequest {
  /** O que fazer, numa frase: "Sacrifique 1 criatura." */
  text: string;
  /** O botão que confirma: "Sacrificar". */
  ok: string;
}

/** Verbo do pedido do Forge (em inglês ou já em português): imperativo da frase e o botão. */
const VERBS: Record<string, [string, string]> = {
  sacrifice: ['Sacrifique', 'Sacrificar'], sacrificar: ['Sacrifique', 'Sacrificar'],
  destroy: ['Destrua', 'Destruir'], exile: ['Exile', 'Exilar'], exilar: ['Exile', 'Exilar'],
  discard: ['Descarte', 'Descartar'], descartar: ['Descarte', 'Descartar'],
  tap: ['Vire', 'Virar'], virar: ['Vire', 'Virar'], untap: ['Desvire', 'Desvirar'], desvirar: ['Desvire', 'Desvirar'],
  return: ['Devolva', 'Devolver'], reveal: ['Revele', 'Revelar'], revelar: ['Revele', 'Revelar'],
  exaurir: ['Exaura', 'Exaurir'], enlist: ['Recrute com', 'Recrutar'],
};

/** Plural em inglês das palavras de tipo, para a tradução sair no plural ("2 creature" → "2 criaturas"). */
const plural = (en: string) => en.replace(/\b(creature|player|planeswalker|permanent|artifact|enchantment|land|spell|card|battle|opponent)\b/g, '$1s');
/** "creature", "a creature", "artifact or creature" → "criatura", "artefato ou criatura"; null se não souber traduzir. */
function kindOf(en: string, n: number) {
  const bare = en.trim().replace(/^(?:an?|one|um\(n\)|um|uma)\s+/i, '');
  if (!bare) return n === 1 ? 'carta' : 'cartas';
  return targetKind(n === 1 ? bare : plural(bare.toLowerCase()));
}
const count = (n: number, kind: string) => `${n} ${kind}`;

/**
 * O pedido de uma escolha de cartas no campo ou na mão (a última linha da mensagem do Forge), em português, com o botão
 * que confirma; null quando não é um pedido conhecido (aí a mesa mostra o texto do Forge como sempre).
 */
export function selectionRequest(message: string): SelectionRequest | null {
  const line = message.split('\n').map(l => l.trim()).filter(Boolean).pop() ?? '';
  let m: RegExpMatchArray | null;
  // "Escolha 1 creature(s) a sacrifice." / "Escolha até 2 creature(s) a exile." (lblSelectNumTargetToAction)
  if ((m = line.match(/^Escolha (até )?(\d+) (.+?)\(s\) a (\w+)\.?$/i))) {
    const n = Number(m[2]), verb = VERBS[m[4]!.toLowerCase()], kind = kindOf(m[3]!, n);
    if (!verb || !kind) return null;
    return { text: `${verb[0]} ${m[1] ? 'até ' : ''}${count(n, kind)}.`, ok: verb[1] };
  }
  // "Selecione creature para sacrificar (1 restantes)": custo de sacrificar (lblSelectATargetToSacrifice).
  if ((m = line.match(/^Selecione (.+?) para sacrificar \((\d+) restantes?\)$/i))) {
    const n = Number(m[2]), kind = kindOf(m[1]!, n);
    return kind ? { text: `Para pagar o custo, sacrifique ${count(n, kind)}.`, ok: 'Sacrificar' } : null;
  }
  // "Escolha um(n) creature para virar (2 restante)", desvirar, exaurir; "Select a creature to enlist (1 left)".
  if ((m = line.match(/^Escolha (?:um\(n\)|um|uma) (.+?) para (virar|desvirar|exaurir) \((\d+) restantes?\)$/i))
    || (m = line.match(/^Select an? (.+?) to (enlist) \((\d+) left\)$/i))) {
    const n = Number(m[3]), verb = VERBS[m[2]!.toLowerCase()]!, kind = kindOf(m[1]!, n);
    return kind ? { text: `Para pagar o custo, ${verb[0].toLowerCase()} ${count(n, kind)}.`, ok: verb[1] } : null;
  }
  // "Select a permanent to remove 1 counter(s) from" (lblRemoveNTargetCounterFromCardPayCostSelect, sem tradução).
  if ((m = line.match(/^Select (.+?) to remove (\d+)\s*(.*?) counter\(s\) from$/i))) {
    const n = Number(m[2]), kind = kindOf(m[1]!, 1);
    const what = n === 1 ? 'marcador' : 'marcadores';
    return { text: `Para pagar o custo, escolha ${kind ? `a ${kind}` : 'a carta'} de onde sai${n === 1 ? '' : 'em'} ${n} ${what}.`, ok: n === 1 ? 'Tirar o marcador' : 'Tirar os marcadores' };
  }
  // "Descartar 2 carta(s)" (o descarte de um efeito).
  if ((m = line.match(/^Descartar (\d+) carta\(s\)$/i))) {
    const n = Number(m[1]);
    return { text: `Descarte ${n} ${n === 1 ? 'carta' : 'cartas'}.`, ok: 'Descartar' };
  }
  // "Escolha 1 carta(s) para descartar para levar sua mão ao máximo de 7 cartas." (fim do turno)
  if ((m = line.match(/^Escolha (\d+) carta\(s\) para descartar para levar sua mão ao máximo de (\d+) cartas\.?$/i))) {
    const n = Number(m[1]);
    return { text: `Descarte ${n} ${n === 1 ? 'carta' : 'cartas'}: o máximo na mão é ${m[2]}.`, ok: 'Descartar' };
  }
  if (/^Select any number to exile$/i.test(line)) return { text: 'Escolha quantas cartas quiser para exilar.', ok: 'Exilar' };
  return null;
}

/** Títulos de escolha que o Forge manda em inglês. */
const TITLES: [RegExp, string][] = [
  [/^Select a card to put onto the battlefield$/i, 'Escolha a carta que vai para o campo de batalha'],
];
export const ptTitle = (title: string) => TITLES.find(([re]) => re.test(title.trim()))?.[1] ?? cardNameTitle(title) ?? title;

const NAME_KINDS: Record<string, string> = { land: 'terreno', creature: 'criatura', artifact: 'artefato', enchantment: 'encantamento', planeswalker: 'planeswalker',
  battle: 'batalha', instant: 'mágica instantânea', sorcery: 'feitiço', permanent: 'permanente' };
const listed = (words: string[], last: string) => words.length > 1 ? `${words.slice(0, -1).join(', ')} ${last} ${words.at(-1)}` : words[0] ?? '';
/**
 * Nomear uma carta com restrição (Silverquill Silencer, Meddling Mage): o Forge põe a descrição da carta em inglês no
 * título ("Escolha o nome da carta noncreature, nonland."). Descrição que não se conhece fica como veio.
 */
function cardNameTitle(title: string): string | null {
  const m = title.trim().match(/^Escolha o nome da carta (.+?)\.?$/);
  if (!m) return null;
  let desc = m[1]!.trim(), value = '';
  const mv = desc.match(/^(.*?)\s*with mana value (\w+) or (less|greater)$/i);
  if (mv) { desc = mv[1]!; value = ` com valor de mana ${mv[2]} ou ${mv[3]!.toLowerCase() === 'less' ? 'menos' : 'mais'}`; }
  desc = desc.replace(/\s*\bcard$/i, '').trim();
  if (/^nonbasic land$/i.test(desc)) return `Escolha o nome de uma carta de terreno não básico${value}.`;
  const parts = desc ? desc.split(/\s*,\s*(?:or\s+)?|\s+or\s+/i) : [];
  const no = parts.filter(p => /^non/i.test(p)).map(p => p.slice(3).toLowerCase()), yes = parts.filter(p => !/^non/i.test(p)).map(p => p.toLowerCase());
  if ((no.length && yes.length) || yes.some(w => !NAME_KINDS[w]) || no.some(w => !NAME_KINDS[w] && w !== 'legendary')) return null;
  const kind = (w: string) => w === 'legendary' ? 'lendária' : `de ${NAME_KINDS[w]}`;
  const phrase = no.length ? ` que não seja ${no.map(kind).join(' nem ')}` : yes.length ? ` de ${listed(yes.map(w => NAME_KINDS[w]!), 'ou')}` : '';
  return `Escolha o nome de uma carta${phrase}${value}.`;
}

/** O aviso do que alguém escolheu, com a cor ou o tipo de criatura em português: "Jogador 1 escolheu white" → "Jogador 1 escolheu branco". */
export function choiceNotice(text: string) {
  const m = text.match(/^(.+ escolheu )([\w' -]+)\.?$/);
  if (!m) return text;
  const color = colorName(m[2]!);
  if (color !== m[2]) return `${m[1]}${color.toLowerCase()}.`;
  const type = creatureTypePt(m[2]!);
  return type !== m[2] ? `${m[1]}${type}.` : text;
}

/** Os montes da última escolha de monte respondida (Fato ou Ficção), para o aviso dizer para onde foi cada um. */
let lastPiles: { source?: string; piles: string[][]; chosen: number; chosenTo?: string; otherTo?: string } | null = null;
/** Guarda os montes ao responder a escolha de monte; `option` é a opção respondida (a de um dos montes). */
export function rememberPiles(q: FQuestion, option: number) {
  if (q.purpose !== 'piles-choose' || !q.piles?.length) return;
  const name = (i: number) => { const o = q.options?.[i]; return o && typeof o !== 'string' ? o.card?.name ?? '' : ''; };
  lastPiles = { source: q.card?.name, piles: q.piles.map(p => p.cards.map(name)), chosen: q.piles.findIndex(p => p.option === option), chosenTo: q.chosenTo, otherTo: q.otherTo };
}

const ZONE_TO: Record<string, string> = { hand: 'para a mão', graveyard: 'para o cemitério', exile: 'para o exílio', library: 'para o grimório', battlefield: 'para o campo' };
const list = (names: string[]) => names.length > 1 ? `${names.slice(0, -1).join(', ')} e ${names.at(-1)}` : names[0] ?? '';

/**
 * "valor do efeito de Fato ou Ficção para Jogador 1 é Jogador 1 escolhe a Pilha 1:\nPlains\nIsland" → "Jogador 1 ficou com
 * o monte de 2 (Planície e Ilha), para a mão; Pântano, Montanha e Floresta vão para o cemitério." Com o título da carta
 * e os nomes das cartas escolhidas, para o aviso mostrar as miniaturas. Os nomes passam por `translate`.
 */
export function pilesNotice(text: string, translate: (name: string) => string = n => n) {
  const m = text.match(/^valor do efeito de (.+?) para .+? é (.+?) escolhe a Pilha (\d+):\s*\n([\s\S]*)$/);
  if (!m) return null;
  const chosen = m[4]!.split('\n').map(l => l.trim()).filter(Boolean);
  const memory = lastPiles && (!lastPiles.source || translate(lastPiles.source) === m[1] || lastPiles.source === m[1]) ? lastPiles : null;
  const other = memory ? memory.piles[memory.chosen === 0 ? 1 : 0] ?? [] : [];
  const to = memory?.chosenTo ? ` ${ZONE_TO[memory.chosenTo] ?? ''}`.trimEnd() : '';
  const otherTo = memory?.otherTo ? ZONE_TO[memory.otherTo] : undefined;
  const names = chosen.map(translate);
  let out = chosen.length ? `${m[2]} ficou com o monte de ${chosen.length} (${list(names)})${to}.` : `${m[2]} ficou com o monte vazio.`;
  if (other.length) out += ` ${list(other.map(translate))} ${other.length === 1 ? 'vai' : 'vão'} ${otherTo ?? 'para o outro lugar'}.`;
  lastPiles = null;
  return { title: m[1]!, text: out, cards: chosen };
}
