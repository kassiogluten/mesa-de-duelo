import type { FCard } from '../forge/client';
import type { PresentationEvent } from './presentationTimeline';

/**
 * Remoções feitas por outro jogador (Wrath of God, Murder, um Raio que mata): a mesa abre uma janela com a carta que
 * causou e as permanentes que saíram, para quem estava distraído entender o que sumiu. Morte em combate, custos
 * (sacrificar para ativar) e blink não contam. Tudo aqui é puro: a mesa passa o histórico e desenha a janela.
 */
export interface RemovalCause {
  /** A mágica ou habilidade na pilha que causou; junta as saídas da mesma resolução. */
  stackId: number;
  card?: FCard;
  /** O nome que a ponte mandou, para quando a carta não está à mão. */
  name?: string;
  controller?: number;
}
export interface RemovalNotice {
  key: string;
  cause: RemovalCause;
  /** As saídas do campo (`left`), na ordem em que aconteceram. */
  removed: PresentationEvent[];
}

const cardId = (event: PresentationEvent) => event.card?.id ?? event.sourceId;
/** O que pode acontecer depois de uma mágica resolver e antes de a criatura sair pelas ações baseadas no estado. */
const AFTERMATH = new Set(['left', 'damage', 'life-changed', 'entered', 'mill', 'discard', 'draw']);

/**
 * Quem tirou a permanente do campo. A ponte manda o `stackId` do que estava resolvendo (Wrath of God, Murder). A
 * criatura que morre de dano ou com resistência 0 sai logo depois, quando a mágica já resolveu: a causa é a última
 * resolução, desde que só tenham vindo efeitos dela no meio. Dano de combate, custo (sacrificar para ativar) e a
 * regra do lendário não têm causa.
 */
export function removalCause(history: readonly PresentationEvent[], index: number): RemovalCause | null {
  const event = history[index];
  if (event?.type !== 'left' || event.from !== 'Battlefield') return null;
  if (event.stackId !== undefined) {
    const item = event.frame?.stack?.find(entry => entry.id === event.stackId);
    // Sem a pilha no quadro, quem conjurou ou ativou fica no evento que pôs a mágica na pilha.
    const cast = item ? undefined : history.slice(0, index).reverse().find(e => e.stackId === event.stackId && (e.type === 'spell-cast' || e.type === 'ability-activated'));
    return { stackId: event.stackId, card: item?.source ?? cast?.card, name: event.sourceName, controller: item?.controller ?? cast?.actor };
  }
  const id = cardId(event);
  for (let i = index - 1; i >= 0; i--) {
    const before = history[i];
    if (before.type === 'damage' && before.combat && id !== undefined && before.targets?.cards?.includes(id)) return null;
    if (before.type === 'resolved' && before.stackId !== undefined) return { stackId: before.stackId, card: before.card, controller: before.actor };
    if (!AFTERMATH.has(before.type)) return null;
  }
  return null;
}

/** Blink: a carta volta do exílio logo em seguida, então ela não foi removida. */
function returned(history: readonly PresentationEvent[], index: number) {
  const event = history[index], id = cardId(event);
  if (event.to !== 'Exile' || id === undefined) return false;
  return history.slice(index + 1, index + 30).some(e => e.type === 'entered' && e.from === 'Exile' && cardId(e) === id);
}

/** As remoções depois de `afterSeq` que viram janela: uma por mágica ou habilidade, só as de outro jogador. */
export function removalNotices(history: readonly PresentationEvent[], afterSeq: number, you: number | undefined): RemovalNotice[] {
  const notices = new Map<number, RemovalNotice>();
  history.forEach((event, index) => {
    if (event.seq <= afterSeq || event.type !== 'left' || returned(history, index)) return;
    const cause = removalCause(history, index);
    if (!cause || cause.controller === undefined || cause.controller === you) return;
    const notice = notices.get(cause.stackId);
    if (notice) notice.removed.push(event);
    else notices.set(cause.stackId, { key: `rm${event.seq}`, cause, removed: [event] });
  });
  return [...notices.values()];
}

/** As permanentes removidas por dono, as suas primeiro. */
export function removedByOwner(notice: RemovalNotice, you: number | undefined) {
  const owners = [...new Set(notice.removed.map(e => e.actor))].sort((a, b) => Number(b === you) - Number(a === you));
  return owners.map(owner => ({ owner, removed: notice.removed.filter(e => e.actor === owner) }));
}
