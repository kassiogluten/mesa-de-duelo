// Os assentos da mesa: o campo, o retrato, os montes e o tapete de cada jogador (no duelo, o oponente em cima e você
// embaixo; com vários jogadores, uma coluna por oponente, que dá para ocultar ou deixar sozinha), a zona de comando, a
// mão revelada do oponente, a vista de foco num oponente e a vida que conta até o novo valor.
import type { FPlayer, FState } from '../forge/client';
import { cacheGet } from '../scryfall';
import { cardInfo } from '../cards';
import { legalAttackTargets } from './commanderTable';
import type { createAttackChoice } from './attackChoice';
import type { OpponentFocus } from './opponentFocus';
import { backRow, fieldRow, isBackRow, type BoardView } from './permanentView';
import { turnSpellsTotal } from './playerStatus';
import { oppHandHTML, revealedCards } from './revealedHand';
import { avatar, collapsedSeat, commandCards, damageButton, focusButton, focusHTML, matStyle, opponentSeat, piles, type SeatView } from './seatView';
import { followSeats, forcedSeatReason, manualSeatChoice, visibleSeats, type SeatMemory } from './seatVisibility';
import { trackCounterBumps } from './tableCards';
import type { TableCtx } from './tableContext';
import { fitLoneRows, fitRowWidths } from './tableLayout';
import { newSeatState } from './tableState';
import { seatTurnChange } from './turnHighlight';
import { label } from './cardFaces';

export interface SeatsDeps extends Pick<TableCtx, 'root' | '$' | 'setHTML' | 'state' | 'match' | 'portraits' | 'prefs' | 'face' | 'faceStyle' | 'image' | 'playerName' | 'cardName' | 'announce' | 'renderTable'> {
  attack: ReturnType<typeof createAttackChoice>;
  focus: OpponentFocus;
  /** Celular: os terrenos virados vão para um monte só. */
  compact(): boolean;
}

/** O que a mesa sabe dos jogadores neste desenho: você, os oponentes ainda na mesa e o primeiro deles. */
export interface SeatPlayers { me: FPlayer; opp: FPlayer; opponents: FPlayer[]; multiplayer: boolean }

export function createTableSeats(d: SeatsDeps) {
  const { root, $ } = d;
  let seats = newSeatState('');
  /** De quem era o turno no último desenho dos assentos, e a troca que o desenho atual mostra (só no desenho em que mudou). */
  let seatTurnPlayer: number | null | undefined;
  let seatTurn: { from: number | null; to: number | null } | null = null;
  /** Marcador com o balão aberto por clique (id da carta e tipo), até clicar fora. */
  let openCounter: string | null = null;
  // Veneno primeiro (com 10 o jogador perde); os outros marcadores do jogador vêm depois, com nome em português.
  /** Tipos de marcador de jogador que mudaram neste desenho, para o selo pulsar uma vez. */
  let counterBumps = new Map<number, Set<string>>();
  const lastPlayerCounters = new Map<number, Record<string, number>>();
  const seatMemory = (): SeatMemory => ({ hidden: seats.hidden, solo: seats.solo, retired: seats.retired, focus: seats.focus });

  /** O que as peças do campo precisam da mesa (permanentView.ts), lido na hora de cada desenho. */
  const boardView = (): BoardView => {
    const match = d.match(), attack = d.attack;
    return { face: d.face, faceStyle: d.faceStyle, playerName: d.playerName, openCounter, lastDamage: match.lastDamage, selectedBlocker: match.selectedBlocker, compact: d.compact(),
      attackSelected: (s, id) => attack.selected.has(id) || attack.queue.queuedAttackers.includes(id) || (attack.allGen !== null && legalAttackTargets(s, { attacker: id, gen: attack.allGen }).length > 0),
      attackTargets: attack.targets };
  };
  /** Arte do tapete: a capa do deck que veio com a partida ou, em rede, a capa que a sala mostra de cada um. */
  function matArt(s: FState, p: FPlayer, idx: number): string | undefined {
    if (!d.prefs.playmat) return undefined;
    const cover = s.room?.players.find(rp => rp.playerId === p.id)?.cover, card = cover ? cacheGet(cover) : null;
    return d.portraits()[idx] ?? (card ? cardInfo(card).artCrop : undefined);
  }
  const spellsTotal = () => turnSpellsTotal(d.state()?.players ?? []);
  /** O que os assentos e retratos precisam da mesa (seatView.ts), além das peças do campo. */
  const seatView = (): SeatView => ({ ...boardView(), image: d.image, portraits: d.portraits(), matArt, counterBumps, spellsTotal: spellsTotal(), activePlayer: d.state()?.activePlayer, cardName: d.cardName, seats, seatMemory: seatMemory(), seatTurn });
  function syncMat(el: HTMLElement, art: string | undefined) {
    el.hidden = !art;
    if (el.getAttribute('style') !== matStyle(art)) el.setAttribute('style', matStyle(art));
  }

  /** Os marcadores de jogador que mudaram desde o último desenho. */
  function trackCounters(players: FPlayer[]) { counterBumps = trackCounterBumps(lastPlayerCounters, players); }

  /** Desenha os assentos e devolve o aviso do que a mesa mudou sozinha nos assentos (para o leitor de tela). */
  function render(s: FState, visual: FState, { me, opp, opponents, multiplayer }: SeatPlayers) {
    const match = d.match();
    $('#fOpponents').hidden = !multiplayer;
    const matchKey = s.matchId ?? s.session?.code ?? '';
    if (matchKey !== seats.match) { seats = newSeatState(matchKey); match.handOrder = []; }
    const followed = followSeats(visual, opponents, seatMemory());
    seats.hidden = new Set(followed.memory.hidden); seats.solo = followed.memory.solo; seats.retired = followed.memory.retired; seats.focus = followed.memory.focus;
    // O aviso do que a mesa mudou sozinha vai junto com o anúncio do pedido atual, no fim da renderização.
    const seatNotice = s.spectating ? '' : followed.notices.join(' ');
    const shownSeats = visibleSeats(visual, opponents, { hidden: seats.hidden, solo: seats.solo });
    seatTurn = seatTurnChange(seatTurnPlayer, visual);
    seatTurnPlayer = visual.gameOver ? null : visual.activePlayer;
    // Ocultos viram uma coluna estreita; o espaço que sobra vai para os campos à vista.
    $('#fOpponents').style.gridTemplateColumns = opponents.map(p => shownSeats.has(p.id) ? 'minmax(0, 1fr)' : 'var(--collapsed-seat)').join(' ');
    $('#fOpponents').dataset.shown = String(shownSeats.size);
    d.setHTML($('#fOpponents'), multiplayer ? opponents.map((player, i) => shownSeats.has(player.id)
      ? opponentSeat(seatView(), visual, player, i, opponents.length, forcedSeatReason(visual, player)) : collapsedSeat(seatView(), visual, player, i)).join('') : '');
    const command = $('#fCommand');
    command.hidden = !(me.commanders?.length);
    d.setHTML(command, command.hidden ? '' : `<span class="command-heading">Comando</span><div class="command-track">${commandCards(seatView(), s, me)}</div>${damageButton(me)}`);
    d.setHTML($('#fOppHand'), multiplayer ? '' : oppHandHTML(opp, c => d.face(c, 'small'), label));
    $('#fOppHand').classList.toggle('revealed', !multiplayer && revealedCards(opp).length > 0);
    d.setHTML($('#fOppAvatar'), multiplayer ? '' : avatar(seatView(), visual, opp, 1) + focusButton(opp, ' duel-focus'));
    // A quantidade de cartas na sua mão fica no ícone da mão, ao lado do relógio do turno (tableHand.ts).
    d.setHTML($('#fMeAvatar'), avatar(seatView(), visual, me, 0));
    d.setHTML($('#fOppPiles'), multiplayer ? '' : piles(seatView(), visual, opp) + (opp.commanders?.length ? `<div class="duel-command">${commandCards(seatView(), s, opp)}${damageButton(opp)}</div>` : ''));
    d.setHTML($('#fMePiles'), piles(seatView(), visual, me));
    d.setHTML($('#fOppLands'), multiplayer ? '' : backRow(boardView(), visual, opp));
    d.setHTML($('#fMeLands'), backRow(boardView(), visual, me));
    d.setHTML($('#fOppCreatures'), multiplayer ? '' : fieldRow(boardView(), visual, opp.battlefield.filter(c => !isBackRow(c))));
    d.setHTML($('#fMeCreatures'), fieldRow(boardView(), visual, me.battlefield.filter(c => !isBackRow(c))));
    syncMat($('#fOppMat'), multiplayer ? undefined : matArt(s, opp, 1));
    const focusPlayers = visual.players.filter(p => p.id !== visual.you && !p.eliminated);
    const focusSeat = d.focus.seat();
    const focused = focusPlayers.find(p => p.id === focusSeat);
    if (focusSeat !== null && !focused) d.focus.drop();
    const focusView = $('#fFocus');
    focusView.hidden = !focused;
    d.setHTML(focusView, focused ? focusHTML(seatView(), s, visual, focused, focusPlayers, visual.players.filter(p => p.id !== visual.you).indexOf(focused) + 1) : '');
    syncMat($('#fMeMat'), matArt(s, me, 0));
    fitLoneRows(root);
    fitRowWidths(root);
    return seatNotice;
  }

  /** "Só este", "Ocultar" e "Mostrar" nos assentos com vários jogadores. True quando o clique foi num deles. */
  function click(t: HTMLElement) {
    const menu = t.closest<HTMLElement>('[data-seat-menu]')?.dataset.seatMenu;
    if (menu !== undefined) {
      seats.menu = seats.menu === Number(menu) ? null : Number(menu);
      d.renderTable();
      root.querySelector<HTMLElement>(seats.menu === null ? `[data-seat-menu="${menu}"]` : `#fSeatMenu-${menu} [role="menuitem"]`)?.focus({ preventScroll: true });
      return true;
    }
    const seatSolo = t.closest<HTMLElement>('[data-seat-solo]')?.dataset.seatSolo;
    const seatHide = t.closest<HTMLElement>('[data-seat-hide]')?.dataset.seatHide;
    const seatShow = t.closest<HTMLElement>('[data-seat-show]')?.dataset.seatShow;
    if (seatSolo === undefined && seatHide === undefined && seatShow === undefined) return false;
    seats.menu = null;
    const state = d.state();
    const name = (id: number) => state?.players.find(p => p.id === id)?.name ?? 'Oponente';
    let message: string;
    // Escolha do jogador durante o foco no atacante: fica valendo depois do turno dele.
    seats.focus = manualSeatChoice(seatMemory()).focus;
    if (seatSolo !== undefined) {
      const id = Number(seatSolo);
      seats.solo = seats.solo === id ? null : id;
      message = seats.solo === null ? 'Mostrando todos os oponentes.' : `Mostrando só o campo de ${name(id)}. Os outros oponentes ficaram ocultos.`;
    } else if (seatHide !== undefined) {
      seats.hidden.add(Number(seatHide)); message = `Campo de ${name(Number(seatHide))} oculto.`;
    } else {
      const id = Number(seatShow);
      // "Mostrar" num "só este" desfaz o isolamento; fora dele, só tira o oponente da lista de ocultos.
      if (seats.solo !== null) { seats.hidden = new Set(state?.players.filter(p => p.id !== seats.solo && p.id !== id && p.id !== state?.you).map(p => p.id)); seats.solo = null; }
      seats.hidden.delete(id); message = `Campo de ${name(id)} à vista.`;
    }
    d.renderTable();
    // A renderização anuncia o pedido atual; o aviso da troca vem depois para não ser apagado.
    d.announce(message);
    const seat = seatShow ?? seatSolo ?? seatHide;
    const focus = root.querySelector<HTMLElement>(`[data-seat-player="${seat}"] [data-seat-menu]`) ?? root.querySelector<HTMLElement>(`[data-seat-player="${seat}"] [data-seat-show]`);
    focus?.focus({ preventScroll: true });
    return true;
  }

  const countedLife = new WeakSet<Element>();
  /** A vida que mudou conta até o novo valor, e o retrato pisca (verde ou vermelho). */
  function countLife() {
    const match = d.match();
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    for (const el of root.querySelectorAll<HTMLElement>('.avatar[data-pid] > .life')) {
      if (countedLife.has(el)) continue;
      countedLife.add(el);
      const pid = Number(el.parentElement!.dataset.pid), to = Number(el.textContent);
      const from = match.shownLife.get(pid);
      match.shownLife.set(pid, to);
      if (from === undefined || from === to || Number.isNaN(to) || still) continue;
      const avatarEl = el.parentElement!, dir = to > from ? 'life-up' : 'life-down';
      avatarEl.classList.remove('life-up', 'life-down'); void avatarEl.offsetWidth; avatarEl.classList.add(dir);
      const start = performance.now(), duration = Math.min(700, 160 + Math.abs(to - from) * 60);
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        el.textContent = String(Math.round(from + (to - from) * (1 - (1 - t) ** 3)));
        if (t < 1 && el.isConnected) requestAnimationFrame(step);
        else { el.textContent = String(to); window.setTimeout(() => avatarEl.classList.remove(dir), 400); }
      };
      el.textContent = String(from);
      requestAnimationFrame(step);
    }
  }

  return {
    render, click, trackCounters, countLife,
    /** Marcador com o balão aberto (id da carta e tipo). */
    openCounter: () => openCounter,
    setOpenCounter(v: string | null) { openCounter = v; },
    /** Fecha o menu de exibição de um assento (clique fora dele, Esc, tela cheia); true se havia um aberto. */
    closeMenu() { if (seats.menu === null) return false; seats.menu = null; d.renderTable(); return true; },
  };
}
