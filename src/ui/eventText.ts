// As frases de cada evento da partida: a legenda da animação, o que o leitor de tela ouve e as linhas do histórico.
import type { FCard, FState } from '../forge/client';
import { withoutCardIds } from './cardtext';
import { damageDetail } from './damageEffects';
import { listNames } from './historyLog';
import { loyaltyLook } from './planeswalkerEffects';
import type { PresentationEvent } from './presentationTimeline';
import { startingRollText } from './startingRoll';

/** O que as frases precisam da mesa: o estado ao vivo (jogadores e você), o nome das cartas e a carta por id. */
export interface EventView {
  state(): FState | null | undefined;
  label(c: FCard): string;
  findCard(id: number): FCard | undefined;
  /** Nome em português, quando o Scryfall tem a tradução. */
  ptName(name: string): string | undefined;
}

/** De onde veio a carta conjurada, no histórico (da mão não precisa dizer). */
const ZONE_FROM: Record<string, string> = { Graveyard: 'do cemitério', Exile: 'do exílio', Command: 'da zona de comando', Library: 'do grimório' };

/** A frase de um evento. `detailed` (no histórico) acrescenta alvos, de quem era a carta e de onde ela veio. */
export function eventDescription(v: EventView, event: PresentationEvent, detailed = false) {
  const who = v.state()?.players.find(p => p.id === event.actor)?.name ?? 'Jogador';
  const name = event.card?.name ? v.label(event.card) : 'uma carta';
  const on = detailed ? historyTargets(v, event) : '';
  const from = detailed && event.from && ZONE_FROM[event.from] ? ` ${ZONE_FROM[event.from]}` : '';
  const owner = detailed && event.actor !== undefined ? ` (${event.actor === v.state()?.you ? 'sua' : `de ${who}`})` : '';
  switch (event.type) {
    case 'land-played': return `${who} jogou ${name}${from}.`;
    case 'spell-cast': return `${who} conjurou ${name}${from}${on}.`;
    case 'ability-activated': return event.loyalty && !event.trigger ? loyaltyDescription(event, who, name, on) : event.trigger ?`Gatilho${event.card?.name ? ` de ${name}` : ''}${on}.` : `${who} ativou uma habilidade${event.card?.name ? ` de ${name}` : ''}${on}.`;
    case 'draw': return event.searched ? `${who} buscou ${(event.count ?? 1) === 1 ? 'uma carta' : `${event.count} cartas`} no grimório.`
      : `${who} comprou ${(event.count ?? 1) === 1 ? 'uma carta' : `${event.count} cartas`}.`;
    case 'scry': {
      const top = event.top ?? 0, bottom = event.bottom ?? 0, n = top + bottom;
      const where = top && bottom ? `${top} no topo e ${bottom} no fundo` : top ? `${n === 1 ? 'a carta ficou' : 'todas ficaram'} no topo` : `${n === 1 ? 'a carta foi' : 'todas foram'} para o fundo`;
      return `${who} fez vidência ${n}: ${where}.`;
    }
    case 'coin': return event.startingToss ? `Moeda para ver quem começa: ${who} começa.` : `${who} jogou uma moeda: ${event.heads ? 'cara' : 'coroa'}.`;
    case 'starting-roll': return startingRollText(event, id => id === v.state()?.you ? 'Você' : v.state()?.players.find(p => p.id === id)?.name ?? 'Jogador');
    case 'die': return `${who} rolou um d${event.sides ?? 6}: ${event.result ?? '?'}${event.sourceName ? ` (${v.ptName(event.sourceName) || event.sourceName})` : ''}.`;
    case 'attached': {
      const hostId = event.targets?.cards?.[0], playerId = event.targets?.players?.[0];
      const hostCard = hostId === undefined ? undefined : v.findCard(hostId) ?? frameCard(hostId, event);
      const host = hostCard ? v.label(hostCard) : v.state()?.players.find(p => p.id === playerId)?.name ?? 'outra permanente';
      const kind = /Equipment/.test(event.card?.typeLine ?? '') ? 'Equipar' : /Aura/.test(event.card?.typeLine ?? '') ? 'Encantar' : 'Anexar';
      return event.moved ? `${kind}: ${name} passou para ${host}.` : `${kind}: ${name} em ${host}.`;
    }
    case 'control-changed': return `${who} ganhou o controle de ${name}${detailed && event.previous !== undefined ? ` (era de ${v.state()?.players.find(p => p.id === event.previous)?.name ?? 'outro jogador'})` : ''}.`;
    case 'resolved': return `Resolução: ${event.card?.name ? name : 'efeito'}.`;
    case 'countered': return `Anulado: ${event.card?.name ? name : 'efeito'}.`;
    // "Carta …" concorda com qualquer nome (o Cavaleiro, a Aura).
    case 'left': return event.reason === 'destroyed' ? `Carta destruída: ${name}${owner}.` : event.reason === 'sacrificed' ? `Carta sacrificada: ${name}${owner}.`
      : event.to === 'Exile' ? `Carta exilada: ${name}${owner}.` : event.to === 'Hand' ? `Volta para a mão: ${name}${owner}.` : event.to === 'Library' ? `Volta para o grimório: ${name}${owner}.`
      : detailed && event.to === 'Graveyard' ? `Para o cemitério: ${name}${owner}.` : `${name}${owner} saiu do campo.`;
    case 'discard': return `${who} descartou ${name}.`;
    case 'mill': return millDescription(v, event, who);
    case 'entered': if ((event.entries?.length ?? 0) > 1) return entriesDescription(v, event.entries!, event.from);
      return event.from === 'Exile' ? `Volta ao campo: ${name}${owner}.` : detailed && event.from === 'Graveyard' ? `Volta do cemitério ao campo: ${name}${owner}.`
      : detailed && event.card?.token && !event.from ? `Ficha criada: ${name}${owner}.` : `${name} entrou no campo${owner}.`;
    case 'attackers': return attackDescription(v, event);
    case 'blockers': { const n = event.cards?.length ?? 0; return detailed && n ? `${who} bloqueou com ${n} ${n === 1 ? 'criatura' : 'criaturas'}.` : `${who} declarou bloqueadores.`; }
    case 'turn': return `Turno de ${who}.`;
    case 'damage': {
      const n = Math.abs(event.delta ?? 0);
      const target = [...(event.targets?.players ?? []).map(id => v.state()?.players.find(p => p.id === id)?.name),
        ...(event.targets?.cards ?? []).map(id => { const c = v.findCard(id) ?? frameCard(id, event); return c ? v.label(c) : undefined; })].filter(Boolean).join(', ');
      const from = event.card?.name && !event.card.faceDown ? ` de ${v.label(event.card)}` : '';
      const what = event.infect && event.targets?.players?.length ? `${n} de veneno` : event.wither ? `${n} marcador${n === 1 ? '' : 'es'} −1/−1` : `${n} de dano`;
      if (event.prevented) return `Escudo preveniu ${n} de dano${target ? ` a ${target}` : ''}${from}.`;
      return `${target ? `${target} sofreu ${what}` : `${what} causado`}${from}${damageDetail(event)}.`;
    }
    case 'life-changed': return `${who}: ${event.delta && event.delta > 0 ? '+' : ''}${event.delta ?? 0} de vida.`;
    default: return event.text ? withoutCardIds(event.text) : 'O jogo avançou.';
  }
}
/** "Ana usou +2 de Jace Beleren." ou "Ana usou o ultimate de Jace Beleren (−10)." */
export function loyaltyDescription(event: PresentationEvent, who: string, name: string, on: string) {
  const cost = loyaltyLook(event)?.cost;
  if (event.ultimate) return `${who} usou o ultimate de ${name}${cost ? ` (${cost})` : ''}${on}.`;
  return cost ? `${who} usou ${cost} de ${name}${on}.` : `${who} usou uma habilidade de lealdade de ${name}${on}.`;
}
/** Uma carta que já saiu do campo, como estava na mesa no momento do evento. */
export function frameCard(id: number, event: PresentationEvent) {
  for (const p of event.frame?.players ?? []) { const c = p.battlefield.find(card => card.id === id); if (c) return c; }
  return event.frame?.stack.find(si => si.source?.id === id)?.source;
}
/** " em Bruno e Llanowar Elves": os alvos da mágica ou da habilidade, para o histórico. */
export function historyTargets(v: EventView, event: PresentationEvent) {
  if (event.type !== 'spell-cast' && event.type !== 'ability-activated') return '';
  const s = v.state();
  const names = [...(event.targets?.players ?? []).map(id => id === s?.you ? 'você' : s?.players.find(p => p.id === id)?.name),
    ...(event.targets?.cards ?? []).map(id => { const c = v.findCard(id) ?? frameCard(id, event); return c ? v.label(c) : undefined; })].filter((n): n is string => !!n);
  return names.length ? ` em ${listNames(names)}` : '';
}
/** "Oponente moeu 3 cartas com Thought Scour: Forest, Llanowar Elves e Giant Growth." */
export function millDescription(v: EventView, event: PresentationEvent, who: string) {
  const cards = event.milled ?? (event.card ? [event.card] : []);
  const names = cards.slice(0, 5).map(c => v.label(c));
  if (cards.length > 5) names.push(`mais ${cards.length - 5}`);
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} e ${names.at(-1)}` : names[0] ?? '';
  const n = cards.length, what = n === 1 ? 'uma carta' : `${n} cartas`;
  const by = event.sourceName ? ` com ${v.ptName(event.sourceName) || event.sourceName}` : '';
  if (event.surveil) return `${who} pôs ${what} do grimório no cemitério${by}${list ? `: ${list}` : ''}.`;
  return n === 1 && list ? `${who} moeu ${list}${by}.` : `${who} moeu ${what}${by}${list ? `: ${list}` : ''}.`;
}
/** "8 fichas de Rabbit entraram no campo." — as permanentes que a mesma resolução pôs no campo de uma vez. */
export function entriesDescription(v: EventView, cards: FCard[], from?: string) {
  const [first] = cards;
  if (!first) return '';
  const n = cards.length, same = cards.every(c => c.name === first.name), name = v.label(first);
  const list = listNames([...cards.slice(0, 5).map(v.label), ...(n > 5 ? [`mais ${n - 5}`] : [])]);
  if (from === 'Exile') return same ? `${n} × ${name} voltam ao campo.` : `${n} permanentes voltam ao campo: ${list}.`;
  if (cards.every(c => c.token) && !from) return same ? `${n} fichas de ${name} entraram no campo.` : `${n} fichas entraram no campo.`;
  return same ? `${n} × ${name} entraram no campo.` : `${n} permanentes entraram no campo: ${list}.`;
}
/** "Ana ataca você com 2 criaturas." — quem ataca, quem é atacado e com quantas. */
export function attackDescription(v: EventView, event: PresentationEvent) {
  const s = v.state();
  const you = s?.you;
  const name = (id: number) => id === you ? 'você' : s?.players.find(p => p.id === id)?.name ?? 'Jogador';
  const who = event.actor === you ? 'Você' : event.actor === undefined ? 'Jogador' : name(event.actor);
  const defenders = [...(event.targets?.players ?? []).map(name),
    ...(event.targets?.cards ?? []).map(id => v.findCard(id)).filter((c): c is FCard => !!c).map(v.label)];
  const list = defenders.length > 1 ? `${defenders.slice(0, -1).join(', ')} e ${defenders.at(-1)}` : defenders[0];
  const n = event.cards?.length ?? 0;
  const count = n ? ` com ${n} ${n === 1 ? 'criatura' : 'criaturas'}` : '';
  return `${who} ataca${list ? ` ${list}` : ''}${count}.`;
}
export function targetsDescription(v: EventView, targets: PresentationEvent['targets']) {
  if (!targets) return '';
  const names = [...(targets.cards ?? []).map(id => v.findCard(id)).filter((c): c is FCard => !!c).map(v.label),
    ...(targets.players ?? []).map(id => v.state()?.players.find(p => p.id === id)?.name).filter(Boolean)];
  return names.length ? `Alvo${names.length > 1 ? 's' : ''}: ${names.join(', ')}` : '';
}
