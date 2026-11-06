// Cartas que uma permanente exilou com ela (Journey to Nowhere, Oblivion Ring, Banisher Priest, imprint, Hideaway): quais são e o texto que as liga.
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

/** Linhas do inspetor: "Exilando: Urso Pardo." na permanente, "Exilada por Jornada para Lugar Nenhum." na carta exilada. */
export function exiledNotes(s: FState | null | undefined, c: FCard): string[] {
  if (!s) return [];
  const { under, by } = links(s);
  const cards = under.get(c.id);
  const lines = cards ? [`Exilando: ${list(cards.map(exiledName))}.`] : [];
  for (const a of attachedTo(s, c.id)) {
    const its = under.get(a.id);
    if (its) lines.push(`${label(a)}, presa a ela, exilando: ${list(its.map(exiledName))}.`);
  }
  if (lines.length) return lines;
  const source = by.get(c.id);
  return source ? [`Exilada por ${label(source)}, que está no campo.`] : [];
}

/** Para o leitor de tela, junto do nome da permanente. */
export function exiledAria(cards: FCard[]) {
  return cards.length ? `exilando ${list(cards.map(exiledName))}` : '';
}
