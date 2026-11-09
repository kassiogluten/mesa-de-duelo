// Cartas que uma permanente exilou com ela (Journey to Nowhere, Oblivion Ring, Banisher Priest, imprint, Hideaway): quais são, o texto que as liga e quando voltam (Necropotência).
import type { FCard, FState } from '../forge/client';
import { label } from './cardFaces';

const cache = new WeakMap<FState, { under: Map<number, FCard[]>; by: Map<number, FCard> }>();

/** Por permanente, as cartas que ela exilou (de qualquer jogador), e por carta exilada, a permanente que a exilou. */
function links(s: FState) {
  let found = cache.get(s);
  if (found) return found;
  const exiled = new Map(s.players.flatMap(p => p.exile).map(c => [c.id, c] as const));
  const under = new Map<number, FCard[]>(), by = new Map<number, FCard>();
  for (const permanent of s.players.flatMap(p => p.battlefield)) {
    const cards = (permanent.exiling ?? []).map(id => exiled.get(id)).filter((c): c is FCard => !!c);
    if (!cards.length) continue;
    under.set(permanent.id, cards);
    for (const c of cards) by.set(c.id, permanent);
  }
  cache.set(s, found = { under, by });
  return found;
}

export function exiledUnder(s: FState, permanentId: number): FCard[] {
  return links(s).under.get(permanentId) ?? [];
}

/** Auras e equipamentos presos à permanente. */
const attachedTo = (s: FState, id: number) => s.players.flatMap(p => p.battlefield).filter(a => a.attachedTo === id);

/**
 * O que sai por baixo da permanente na mesa: as cartas que ela exilou e as que as auras e os equipamentos presos a ela
 * exilaram (Sheltered by Ghosts exila com a aura presa à sua criatura), cada uma com quem a exilou.
 */
export function slotExiled(s: FState, c: FCard): { card: FCard; by: FCard }[] {
  return [c, ...attachedTo(s, c.id)].flatMap(host => exiledUnder(s, host.id).map(card => ({ card, by: host })));
}

/** Nome de uma carta exilada: virada para baixo, só quem pode ver sabe qual é. */
function exiledName(c: FCard) {
  return c.faceDown && !c.hiddenFace?.name ? 'uma carta virada para baixo' : label(c);
}
function list(names: string[]) {
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} e ${names.at(-1)}` : names[0] ?? '';
}
/** Os nomes das cartas exiladas, com as viradas para baixo juntas no fim ("Sol Ring e 2 cartas viradas para baixo"). */
function exiledList(cards: FCard[]) {
  const names = cards.map(exiledName), hidden = names.filter(n => n === 'uma carta virada para baixo').length;
  return list(hidden > 1 ? [...names.filter(n => n !== 'uma carta virada para baixo'), `${hidden} cartas viradas para baixo`] : names);
}

const DESTINATIONS: Record<string, string> = { battlefield: 'para o campo de batalha', graveyard: 'para o cemitério', library: 'para o grimório' };
const STEPS = { end: 'etapa final', upkeep: 'manutenção' };

/** "para a sua mão na sua próxima etapa final": para onde e quando a carta sai do exílio, pelo gatilho atrasado. */
function returnPhrase(s: FState, c: FCard): string | null {
  const r = c.returns;
  if (!r) return null;
  const name = (id: number | undefined) => s.players.find(p => p.id === id)?.name ?? '';
  const owner = s.players.find(p => p.exile.some(x => x.id === c.id))?.id;
  const to = r.to === 'hand' ? owner === s.you ? 'para a sua mão' : `para a mão de ${name(owner)}` : DESTINATIONS[r.to] ?? 'para outra zona';
  if (!r.step) return to;
  const step = STEPS[r.step];
  const when = r.player === undefined ? `na próxima ${step}` : r.player === s.you ? `na sua próxima ${step}` : `na próxima ${step} de ${name(r.player)}`;
  return `${to} ${when}`;
}

/** Etiqueta da carta na janela do Exílio: "Volta na etapa final". */
export function returnTag(c: FCard): string | null {
  const r = c.returns;
  return r ? `Volta${r.step ? ` na ${STEPS[r.step]}` : ''}` : null;
}

/** "Volta para a sua mão na sua próxima etapa final.", para o balão da etiqueta e o inspetor. */
export function returnNote(s: FState | null | undefined, c: FCard): string | null {
  const phrase = s && returnPhrase(s, c);
  return phrase ? `Volta ${phrase}.` : null;
}

/** Linhas do inspetor: "Exilando: Urso Pardo." na permanente, "Exilada por Jornada para Lugar Nenhum." na carta exilada. */
export function exiledNotes(s: FState | null | undefined, c: FCard): string[] {
  if (!s) return [];
  const { under, by } = links(s);
  const cards = under.get(c.id);
  const lines = cards ? [`Exilando: ${exiledList(cards)}.`] : [];
  // Necropotência: as cartas que ela ainda vai devolver, e quando.
  const waiting = (cards ?? []).filter(x => x.returns?.source === c.id);
  const phrase = waiting[0] ? returnPhrase(s, waiting[0]) : null;
  if (phrase) lines.push(waiting.length === 1 ? `A carta exilada volta ${phrase}.` : `As ${waiting.length} cartas exiladas voltam ${phrase}.`);
  for (const a of attachedTo(s, c.id)) {
    const its = under.get(a.id);
    if (its) lines.push(`${label(a)}, presa a ela, exilando: ${exiledList(its)}.`);
  }
  if (lines.length) return lines;
  const source = by.get(c.id);
  const back = returnNote(s, c);
  return [...(source ? [`Exilada por ${label(source)}, que está no campo.`] : []), ...(back ? [back] : [])];
}

/** Para o leitor de tela, junto do nome da permanente. */
export function exiledAria(cards: FCard[]) {
  return cards.length ? `exilando ${exiledList(cards)}` : '';
}
