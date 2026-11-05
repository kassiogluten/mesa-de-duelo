// A janela de zona da mesa: cemitério, exílio, comando, masmorra, dano de comandante, mão revelada ou um grupo de
// cartas iguais do campo. Na escolha de alvo que só pode estar em cemitérios, o cemitério abre sozinho e fecha junto.
import type { FState } from '../forge/client';
import { richText } from './cardtext';
import { ptOf } from './cardFaces';
import { restoreRowScroll, rowScroll, syncAllRowEdges } from './cardRow';
import { dungeonViewHTML } from './dungeon';
import { buttons, targetInfoHTML, targetInfoOf } from './actionPanel';
import { revealedCards } from './revealedHand';
import { shortInstruction } from './shortInstruction';
import type { TableCtx } from './tableContext';
import { commanderLedgerHTML, zoneHTML, zoneKey, type ZoneKind, type ZoneView } from './zoneView';

/**
 * Escolha de alvo em que todos os alvos possíveis estão em cemitérios (Reanimar, Regrowth...): a chave da escolha e
 * o cemitério que abre primeiro, o seu se ele tiver alvo, senão o do primeiro oponente que tiver.
 */
export function graveyardTargeting(s: FState) {
  const t = s.input.targeting;
  if (!t || s.input.paying || s.input.vote || s.gameOver || s.question || s.watching || s.input.selectablePlayers?.length) return null;
  const selectable = new Set(s.input.selectable);
  const owners = s.players.map(p => ({ p, n: p.graveyard.filter(c => selectable.has(c.id)).length })).filter(o => o.n);
  if (!owners.length || owners.reduce((sum, o) => sum + o.n, 0) < selectable.size) return null;
  return { key: `${t.source}:${t.kind ?? ''}:${t.ability ?? ''}`, player: (owners.find(o => o.p.id === s.you) ?? owners[0]).p.id };
}

/** A zona que um botão `data-zone` abre (sem o atributo: o cemitério). */
export function zoneKindOf(zone: string | undefined): ZoneKind {
  return zone === 'exile' ? 'exile' : zone === 'command' ? 'command' : zone === 'damage' ? 'damage' : zone === 'dungeon' ? 'dungeon' : zone === 'hand' ? 'hand' : 'gy';
}

export type ZoneDeps = Pick<TableCtx, '$' | 'setHTML' | 'match' | 'face' | 'findCard' | 'actionView' | 'syncModal'>;

export function createTableZone(d: ZoneDeps) {
  const { $ } = d;
  let zoneKind: ZoneKind = 'gy';
  /** Alvo no cemitério: a escolha que abriu o cemitério sozinha (fecha junto com ela) e a que o jogador fechou (não reabre). */
  let gyTargetOpened: string | null = null;
  let gyTargetDismissed: string | null = null;
  let groupTitle = '';

  /** O que a janela de zona precisa da mesa (zoneView.ts). */
  const zoneCtx: ZoneView = { face: d.face, findCard: id => d.findCard(id), buttons: s => buttons(d.actionView(), s), targetHead: s => {
    const short = shortInstruction(s.input, name => ptOf(name)?.name || name), info = targetInfoOf(d.actionView(), s);
    return `<div class="zone-target">${short ? `<p class="q-hint zone-target-ask">${richText(short)}</p>` : ''}${info ? targetInfoHTML(info) : ''}</div>`;
  } };

  function close() {
    const match = d.match();
    if (gyTargetOpened) { gyTargetDismissed = gyTargetOpened; gyTargetOpened = null; }
    match.zoneOf = null; match.groupIds = null; $('#fZone').hidden = true; d.syncModal();
  }
  /** Abre o cemitério sozinho quando o alvo só pode estar nele, e fecha quando a escolha acaba. Fechado à mão, não volta. */
  function syncGraveyardTargeting(s: FState) {
    const match = d.match();
    const target = graveyardTargeting(s);
    if (!target) {
      const opened = gyTargetOpened;
      gyTargetOpened = null;
      if (opened && zoneKind === 'gy' && match.zoneOf !== null && !match.groupIds) { match.zoneOf = null; $('#fZone').hidden = true; d.syncModal(); }
      if (!s.input.targeting) gyTargetDismissed = null;
      return;
    }
    if (target.key === gyTargetOpened || target.key === gyTargetDismissed) return;
    if (match.groupIds || (match.zoneOf !== null && zoneKind !== 'gy')) return;
    gyTargetOpened = target.key;
    if (match.zoneOf === null) { zoneKind = 'gy'; match.zoneOf = target.player; }
  }
  /** Desenha a janela aberta (ou a fecha, se o que ela mostrava sumiu). */
  function show(s: FState) {
    const match = d.match();
    const el = $('#fZone');
    const p = s.players.find(pl => pl.id === match.zoneOf);
    if (!p && !match.groupIds) { close(); return; }
    if (zoneKind === 'dungeon' && p && !match.groupIds) { d.setHTML(el, dungeonViewHTML(p)); el.hidden = false; d.syncModal(); return; }
    if (zoneKind === 'damage' && p && !match.groupIds) {
      d.setHTML(el, commanderLedgerHTML(s, p));
      el.hidden = false; d.syncModal(); return;
    }
    // Mão revelada (Telepathy e afins): só para ver; com o efeito fora do campo, a galeria fecha.
    if (zoneKind === 'hand' && p && !match.groupIds && !revealedCards(p).length) { close(); return; }
    const key = zoneKey(zoneKind, match.zoneOf, match.groupIds);
    const before = el.hidden ? null : el.querySelector<HTMLElement>('.zone-view');
    const rows = before?.dataset.zone === key ? rowScroll(before) : [];
    d.setHTML(el, zoneHTML(zoneCtx, s, { kind: zoneKind, player: p, groupIds: match.groupIds, groupTitle, key }));
    const after = el.querySelector<HTMLElement>('.zone-view');
    if (after && after !== before) restoreRowScroll(after, rows);
    el.hidden = false;
    syncAllRowEdges(el);
    d.syncModal();
  }
  /** No desenho da mesa: o cemitério do alvo e a janela aberta. */
  function sync(s: FState) {
    const match = d.match();
    syncGraveyardTargeting(s);
    if (match.zoneOf !== null || match.groupIds) show(s);
  }
  return {
    close, show, sync,
    /** As cartas iguais de um grupo do campo. */
    openGroup(s: FState, ids: number[], title: string) { const match = d.match(); match.groupIds = ids; groupTitle = title; match.zoneOf = null; show(s); },
    /** A zona de um jogador (`kind`: o `data-zone` do botão). */
    openZone(s: FState, player: number, kind: ZoneKind) { const match = d.match(); match.groupIds = null; match.zoneOf = player; zoneKind = kind; show(s); },
    /** Seta nas abas do cemitério: o mesmo tipo de zona de outro jogador. */
    switchPlayer(s: FState, player: number) { d.match().zoneOf = player; show(s); },
    /** O cemitério abriu sozinho para uma escolha de alvo que ainda está valendo. */
    openedForTarget: () => !!gyTargetOpened,
  };
}
