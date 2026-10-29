import type { FCard } from '../forge/client';
import type { PresentationEvent } from './presentationTimeline';

/**
 * Histórico da partida (Menu → Registro) agrupado: um bloco por turno e, dentro dele, uma linha por jogada. A mágica
 * e o que ela causou viram uma linha só, assim como o dano de combate com as mortes, os gatilhos seguidos da mesma
 * carta e as remoções em sequência. Tudo aqui é puro: a mesa passa os nomes e o texto de cada evento.
 */
export interface HistoryNames {
  you?: number;
  /** Nome do jogador ("Ana"). */
  player(id: number | undefined): string;
  /** Nome da carta do evento, ou nada quando ela está virada para baixo ou não tem nome. */
  card(event: PresentationEvent): string | undefined;
  /** Uma carta citada pelo evento (atacante, bloqueador), mesmo que ela já tenha saído do campo. */
  cardById(id: number, event: PresentationEvent): FCard | undefined;
  label(card: FCard): string;
  /** A frase de um evento sozinho. */
  describe(event: PresentationEvent): string;
}
export interface HistoryItem { key: string; text: string; card?: FCard; actor?: number }
export interface HistoryLine extends HistoryItem { children: HistoryItem[] }
export interface HistoryTurn { key: string; turn?: number; actor?: number; lines: HistoryLine[] }

/** O que uma mágica ou habilidade pode causar ao resolver (fica na linha dela). */
const EFFECTS = new Set(['left', 'entered', 'damage', 'life-changed', 'mill', 'discard', 'draw']);

interface Unit {
  head: PresentationEvent;
  /** O que aconteceu enquanto ela resolvia. */
  effects: PresentationEvent[];
  /** A resolução (ou anulação) que fechou a mágica ou habilidade desta linha. */
  outcome?: PresentationEvent;
  /** Linhas parecidas e seguidas que viraram uma só. */
  parts?: Unit[];
}

const plain = (unit: Unit) => !unit.outcome && !unit.effects.length && !unit.parts;
const cardKey = (event: PresentationEvent) => event.card?.name && !event.card.faceDown ? event.card.name : '';
const isTrigger = (unit: Unit) => unit.head.type === 'ability-activated' || unit.head.type === 'resolved' ? !!unit.head.trigger : false;

/** Junta "a", "b" e "c" como "a, b e c"; com muitas, corta e diz quantas faltam. */
export function listNames(names: string[], max = 4) {
  const shown = names.slice(0, max);
  if (names.length > max) shown.push(`mais ${names.length - max}`);
  return shown.length > 1 ? `${shown.slice(0, -1).join(', ')} e ${shown.at(-1)}` : shown[0] ?? '';
}
const cards = (n: number) => n === 1 ? 'uma carta' : `${n} cartas`;
const permanents = (n: number) => n === 1 ? 'uma permanente' : `${n} permanentes`;
const noDot = (text: string) => text.replace(/\.$/, '');

/** Divide a partida em turnos, na ordem em que aconteceram. Os eventos antes do primeiro turno ficam num bloco sem número. */
export function historyTurns(events: readonly PresentationEvent[], names: HistoryNames): HistoryTurn[] {
  const turns: { head?: PresentationEvent; events: PresentationEvent[] }[] = [];
  for (const event of events) {
    if (event.type === 'turn') turns.push({ head: event, events: [] });
    else if (turns.length) turns.at(-1)!.events.push(event);
    else turns.push({ events: [event] });
  }
  return turns.map(({ head, events }) => ({
    key: head ? `t${head.seq}` : 'inicio',
    turn: head ? head.turn ?? head.frame?.turn : undefined,
    actor: head?.actor,
    lines: merge(units(events)).map(unit => line(unit, names)),
  })).filter(turn => turn.turn !== undefined || turn.lines.length);
}

/** Primeira passada: cada evento vira uma linha, e a resolução leva junto o que aconteceu enquanto ela acontecia. */
function units(events: readonly PresentationEvent[]) {
  const list: Unit[] = [];
  for (const event of events) {
    const last = list.at(-1);
    if (event.type === 'draw' && last && plain(last) && last.head.type === 'draw' && last.head.actor === event.actor) {
      list[list.length - 1] = { head: { ...last.head, count: (last.head.count ?? 1) + (event.count ?? 1) }, effects: [] };
      continue;
    }
    if ((event.type === 'resolved' || event.type === 'countered') && event.stackId !== undefined) {
      // O Forge mostra o que a mágica fez antes de dizer que ela resolveu; nesse meio-tempo ela é o topo da pilha.
      const effects: PresentationEvent[] = [];
      while (list.length && plain(list.at(-1)!)) {
        const head = list.at(-1)!.head;
        const fromThis = EFFECTS.has(head.type) && head.frame?.stack?.[0]?.id === event.stackId;
        // Compras não trazem a mesa, mas com algo na pilha só a resolução pode tê-las causado.
        if (!fromThis && head.type !== 'draw') break;
        effects.unshift(list.pop()!.head);
      }
      const cast = list.at(-1);
      if (cast && plain(cast) && cast.head.stackId === event.stackId && (cast.head.type === 'spell-cast' || cast.head.type === 'ability-activated'))
        list[list.length - 1] = { head: cast.head, effects, outcome: event };
      else list.push({ head: event, effects });
      continue;
    }
    list.push({ head: event, effects: [] });
  }
  return list;
}

/** Que tipo de linha é, para juntar as parecidas e seguidas. Sem chave, a linha nunca se junta a outra. */
function mergeKey(unit: Unit): string | null {
  const { head } = unit;
  if (isTrigger(unit) && cardKey(head)) return `trigger:${cardKey(head)}`;
  if (!plain(unit)) return null;
  if (head.type === 'damage' && head.combat) return 'combat';
  if (head.type === 'left') return `left:${head.reason ?? head.to ?? ''}`;
  if (head.type === 'entered') return 'entered';
  if (head.type === 'discard') return `discard:${head.actor}`;
  if (head.type === 'life-changed') return `life:${head.actor}:${Math.sign(head.delta ?? 0)}`;
  return null;
}
function joins(run: Unit, unit: Unit) {
  const key = mergeKey(run.parts?.[0] ?? run);
  if (!key) return false;
  // O dano de combate leva junto a vida que mudou com ele e as criaturas que morreram dele.
  // Gatilhos da mesma carta, na pilha ou já resolvidos, contam juntos.
  if (key.startsWith('trigger:')) return mergeKey(unit) === key;
  if (key === 'combat') return plain(unit) && (unit.head.type === 'damage' && !!unit.head.combat || unit.head.type === 'life-changed' || unit.head.type === 'left');
  return mergeKey(unit) === key;
}
function merge(list: Unit[]) {
  const out: Unit[] = [];
  for (const unit of list) {
    const last = out.at(-1);
    if (last && joins(last, unit)) {
      const parts = last.parts ?? [last];
      out[out.length - 1] = { head: parts[0].head, effects: [], parts: [...parts, unit] };
    } else out.push(unit);
  }
  return out;
}

/** De quem eram as permanentes: "3 suas e 4 de Ana", as suas primeiro. */
export function ownersText(events: readonly PresentationEvent[], names: HistoryNames) {
  const actors = [...new Set(events.map(e => e.actor))].sort((a, b) => Number(b === names.you) - Number(a === names.you));
  return listNames(actors.map(actor => {
    const n = events.filter(e => e.actor === actor).length;
    return actor === names.you ? `${n} ${n === 1 ? 'sua' : 'suas'}` : `${n} de ${names.player(actor)}`;
  }), actors.length);
}

/**
 * O que a mágica, a habilidade ou o combate causou, em poucas palavras ("destruiu 7 permanentes (3 suas e 4 de Ana)").
 * `owners: false` deixa de fora de quem eram as permanentes, para quem já mostra isso de outro jeito.
 */
export function effectParts(events: readonly PresentationEvent[], names: HistoryNames, skip?: number, owners = true): string[] {
  const parts: string[] = [];
  const left = events.filter(e => e.type === 'left');
  const leaving: [string, (list: string) => string][] = [
    ['destroyed', list => `destruiu ${list}`], ['sacrificed', list => `fez sacrificar ${list}`], ['Exile', list => `exilou ${list}`],
    ['Hand', list => `devolveu ${list} à mão`], ['Library', list => `pôs ${list} no grimório`], ['Graveyard', list => `mandou ${list} para o cemitério`],
  ];
  const kind = (e: PresentationEvent) => e.reason ?? (leaving.some(([k]) => k === e.to) ? e.to! : '');
  for (const [k, verb] of [...leaving, ['', (list: string) => `tirou ${list} do campo`] as [string, (list: string) => string]]) {
    const group = left.filter(e => kind(e) === k);
    if (group.length) parts.push(verb(group.length === 1 ? names.card(group[0]) ?? permanents(1) : `${permanents(group.length)}${owners ? ` (${ownersText(group, names)})` : ''}`));
  }
  const entered = events.filter(e => e.type === 'entered' && (skip === undefined || e.sourceId !== skip));
  if (entered.length) parts.push(enteredText(entered, names, true));
  const damage = events.filter(e => e.type === 'damage' && !e.prevented);
  if (damage.length) {
    const total = damage.reduce((n, e) => n + Math.abs(e.delta ?? 0), 0);
    const targets = [...new Set(damage.flatMap(e => [...(e.targets?.players ?? []).map(id => names.player(id)),
      ...(e.targets?.cards ?? []).map(id => { const c = names.cardById(id, e); return c ? names.label(c) : `#${id}`; })]))];
    parts.push(targets.length > 3 ? `causou ${total} de dano a ${targets.length} alvos` : `causou ${total} de dano${targets.length ? ` a ${listNames(targets)}` : ''}`);
  }
  for (const actor of new Set(events.filter(e => e.type === 'draw').map(e => e.actor))) {
    const n = events.filter(e => e.type === 'draw' && e.actor === actor).reduce((sum, e) => sum + (e.count ?? 1), 0);
    parts.push(`${names.player(actor)} comprou ${cards(n)}`);
  }
  for (const actor of new Set(events.filter(e => e.type === 'mill').map(e => e.actor))) {
    const milled = events.filter(e => e.type === 'mill' && e.actor === actor);
    const n = milled.reduce((sum, e) => sum + (e.milled?.length ?? 1), 0);
    parts.push(milled.every(e => e.surveil) ? `${names.player(actor)} pôs ${cards(n)} no cemitério` : `${names.player(actor)} moeu ${cards(n)}`);
  }
  for (const actor of new Set(events.filter(e => e.type === 'discard').map(e => e.actor))) {
    const discarded = events.filter(e => e.type === 'discard' && e.actor === actor);
    parts.push(`${names.player(actor)} descartou ${discarded.length === 1 ? names.card(discarded[0]) ?? cards(1) : cards(discarded.length)}`);
  }
  // A vida perdida pelo dano já está dita no dano.
  const damaged = new Set(damage.flatMap(e => e.targets?.players ?? []));
  for (const actor of new Set(events.filter(e => e.type === 'life-changed').map(e => e.actor))) {
    const delta = events.filter(e => e.type === 'life-changed' && e.actor === actor).reduce((sum, e) => sum + (e.delta ?? 0), 0);
    if (delta > 0) parts.push(`${names.player(actor)} ganhou ${delta} de vida`);
    else if (delta < 0 && (actor === undefined || !damaged.has(actor))) parts.push(`${names.player(actor)} perdeu ${-delta} de vida`);
  }
  return parts;
}
function enteredText(entered: readonly PresentationEvent[], names: HistoryNames, byEffect = false) {
  // Fichas criadas pela mágica ou pelo gatilho: "criou 8 fichas de Rabbit".
  if (byEffect && entered.every(e => e.card?.token && !e.from)) {
    const n = entered.length, same = entered.every(e => cardKey(e) && cardKey(e) === cardKey(entered[0])), name = names.card(entered[0]);
    if (same && name) return n === 1 ? `criou uma ficha de ${name}` : `criou ${n} fichas de ${name}`;
    return n === 1 ? 'criou uma ficha' : `criou ${n} fichas`;
  }
  if (entered.length === 1) return `${names.card(entered[0]) ?? 'uma permanente'} entrou no campo`;
  const same = entered.every(e => cardKey(e) && cardKey(e) === cardKey(entered[0]));
  return same ? `${entered.length} × ${names.card(entered[0])} entraram no campo` : `${permanents(entered.length)} entraram no campo`;
}

/** O que mostrar ao abrir a linha: cada evento com a sua frase, menos a vida que só repete o dano. */
function details(events: readonly PresentationEvent[], names: HistoryNames): HistoryItem[] {
  const damaged = new Set(events.filter(e => e.type === 'damage').flatMap(e => e.targets?.players ?? []));
  return events.filter(e => !(e.type === 'life-changed' && (e.delta ?? 0) < 0 && e.actor !== undefined && damaged.has(e.actor)))
    .map(e => item(e, names.describe(e)));
}
const item = (event: PresentationEvent, text: string): HistoryItem => ({ key: `e${event.seq}`, text, card: event.card?.name && !event.card.faceDown ? event.card : undefined, actor: event.actor });

function line(unit: Unit, names: HistoryNames): HistoryLine {
  const base = item(unit.head, '');
  if (unit.parts && unit.parts.length > 1) return { ...base, ...runLine(unit.parts, names) };
  const { head, effects, outcome } = unit;
  const children = effects.length > 1 ? details(effects, names) : [];
  if (outcome) {
    const cast = noDot(names.describe(head));
    if (outcome.type === 'countered') return { ...base, text: `${cast}: não resolveu.`, children };
    const parts = effectParts(effects, names, head.sourceId);
    return { ...base, text: parts.length ? `${cast}: ${parts.join('; ')}.` : `${cast}.`, children };
  }
  if (head.type === 'resolved' && effects.length) {
    const parts = effectParts(effects, names, head.sourceId);
    const name = names.card(head) ?? 'Efeito';
    return { ...base, text: parts.length ? `${name} (${names.player(head.actor)}) resolveu: ${parts.join('; ')}.` : names.describe(head), children };
  }
  if (head.type === 'attackers') return { ...base, text: names.describe(head), children: (head.cards ?? []).map(id => names.cardById(id, head)).filter((c): c is FCard => !!c)
    .map(card => ({ key: `e${head.seq}c${card.id}`, text: names.label(card), card })) };
  if (head.type === 'blockers') return { ...base, text: names.describe(head), children: blocks(head, names) };
  return { ...base, text: names.describe(head), children };
}
/** "Grizzly Bears bloqueia Serra Angel", pelo combate como estava quando os bloqueadores foram declarados. */
function blocks(head: PresentationEvent, names: HistoryNames): HistoryItem[] {
  const mine = new Set(head.cards ?? []);
  return (head.frame?.combat ?? []).flatMap(pair => pair.blockers.filter(id => mine.has(id)).map(id => {
    const blocker = names.cardById(id, head), attacker = names.cardById(pair.attacker, head);
    return { key: `e${head.seq}b${id}`, text: `${blocker ? names.label(blocker) : 'Criatura'} bloqueia ${attacker ? names.label(attacker) : 'um atacante'}`, card: blocker };
  }));
}

function runLine(parts: Unit[], names: HistoryNames): { text: string; children: HistoryItem[] } {
  const key = mergeKey(parts[0])!;
  const heads = parts.map(p => p.head);
  const n = parts.length;
  if (key.startsWith('trigger:')) {
    const name = names.card(heads[0]) ?? 'uma carta';
    // O gatilho que entrou na pilha e a resolução dele, quando estão separados, são um gatilho só.
    const count = new Set(heads.map(e => e.stackId ?? e.seq)).size;
    const effects = parts.flatMap(p => p.effects);
    const said = effectParts(effects, names);
    const children = effects.length ? details(effects, names) : parts.map(p => line({ ...p, parts: undefined }, names)).map(({ children: _, ...rest }) => rest);
    const resolved = parts.some(p => p.outcome || p.head.type === 'resolved');
    return { text: `${count} gatilhos de ${name}${said.length ? `: ${said.join('; ')}` : resolved ? '' : ' na pilha'}.`, children };
  }
  const children = details(heads, names);
  if (key === 'combat') {
    const damage = heads.filter(e => e.type === 'damage');
    const said: string[] = [];
    for (const id of new Set(damage.flatMap(e => e.targets?.players ?? []))) {
      const hits = damage.filter(e => e.targets?.players?.includes(id));
      const total = hits.reduce((sum, e) => sum + Math.abs(e.delta ?? 0), 0);
      said.push(`${names.player(id)} sofreu ${total} ${hits.every(e => e.infect) ? 'de veneno' : 'de dano'}`);
    }
    const died = heads.filter(e => e.type === 'left');
    if (died.length) said.push(died.length > 3 ? `${died.length} criaturas morreram` : `${listNames(died.map(e => names.card(e) ?? 'uma criatura'))} ${died.length === 1 ? 'morreu' : 'morreram'}`);
    const lifelink = heads.filter(e => e.type === 'life-changed' && (e.delta ?? 0) > 0);
    for (const actor of new Set(lifelink.map(e => e.actor))) said.push(`${names.player(actor)} ganhou ${lifelink.filter(e => e.actor === actor).reduce((s, e) => s + (e.delta ?? 0), 0)} de vida`);
    if (!said.length) said.push(`dano em ${permanents(new Set(damage.flatMap(e => e.targets?.cards ?? [])).size)}`);
    return { text: `Dano de combate: ${said.join('; ')}.`, children };
  }
  if (key.startsWith('left:')) {
    const what: Record<string, string> = { destroyed: 'destruídas', sacrificed: 'sacrificadas', Exile: 'exiladas', Hand: 'devolvidas à mão', Library: 'postas no grimório', Graveyard: 'postas no cemitério' };
    const list = listNames(heads.map(e => names.card(e) ?? 'uma carta'));
    return { text: `${n} cartas ${what[key.slice(5)] ?? 'saíram do campo'}: ${list}.`, children };
  }
  if (key === 'entered') return { text: `${enteredText(heads, names).replace(/^./, c => c.toUpperCase())}.`, children };
  if (key.startsWith('discard:')) return { text: `${names.player(heads[0].actor)} descartou ${n} cartas: ${listNames(heads.map(e => names.card(e) ?? 'uma carta'))}.`, children };
  if (key.startsWith('life:')) {
    const delta = heads.reduce((sum, e) => sum + (e.delta ?? 0), 0);
    return { text: `${names.player(heads[0].actor)}: ${delta > 0 ? '+' : ''}${delta} de vida.`, children };
  }
  return { text: names.describe(heads[0]), children };
}

/** Quantas jogadas o turno teve, para o cabeçalho de um turno recolhido. */
export function turnSummary(turn: HistoryTurn) {
  const n = turn.lines.length;
  return n === 0 ? 'Nenhuma jogada' : n === 1 ? '1 jogada' : `${n} jogadas`;
}
