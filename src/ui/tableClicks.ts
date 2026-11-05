// O tratador de cliques da mesa: um só, na raiz, que testa o alvo do clique numa ordem fixa (trilha, menus, botões
// `data-ui` por grupo, assentos, painéis, inspeção, zonas, pergunta, votos, caixa de ação e, por último, as cartas e os
// jogadores da mesa). A ordem importa: um elemento dentro de outro vale pelo primeiro teste que o pega.
import { isPassLevel, type PassLevelPreference } from './passLevel';
import type { OpponentStopsPreference } from './opponentStops';
import { hideCardPreview } from './cardInspector';
import { label } from './cardFaces';
import type { createAttackChoice } from './attackChoice';
import type { createHistoryPanel } from './historyPanel';
import { canPlayCommander } from './commanderTable';
import type { OpponentFocus } from './opponentFocus';
import type { createPassMenu, createStopMenu } from './passMenus';
import { canUse, usable } from './permanentView';
import { blockPairAction, canPlayExileCard, canSelectExileCard, selectedForInput } from './playContext';
import { isProliferating, proliferateClear, proliferateSuggestion, proliferateToggle } from './proliferate';
import type { TableCtx } from './tableContext';
import type { createInputActions } from './tableInputActions';
import type { createTableOverlay } from './tableOverlay';
import type { createTablePhases } from './tablePhases';
import type { createTableQuestion } from './tableQuestion';
import type { createTableSeats } from './tableSeats';
import type { createTableZone } from './tableZone';
import { zoneKindOf } from './tableZone';
import { runUi, type createUiActions } from './tableUiActions';
import { confirmUpkeepMana, upkeepManaKey } from './upkeepMana';

export interface ClickDeps extends Pick<TableCtx, 'root' | 'client' | 'match' | 'findCard' | 'announce' | 'render' | 'renderTable' | 'stopPresentation' | 'renderedInputIsCurrent' | 'showPreview' | 'cardFromElement'> {
  ui: ReturnType<typeof createUiActions>;
  phases: ReturnType<typeof createTablePhases>;
  seats: ReturnType<typeof createTableSeats>;
  question: ReturnType<typeof createTableQuestion>;
  zone: ReturnType<typeof createTableZone>;
  overlay: ReturnType<typeof createTableOverlay>;
  inputs: ReturnType<typeof createInputActions>;
  attack: ReturnType<typeof createAttackChoice>;
  historyLog: ReturnType<typeof createHistoryPanel>;
  focus: OpponentFocus;
  stops: ReturnType<typeof createStopMenu>;
  opponentStops: OpponentStopsPreference;
  passMenu: ReturnType<typeof createPassMenu>;
  passLevel: PassLevelPreference;
  setMenu(open: boolean, restore?: boolean): void;
  closeStackGallery(): void;
  /** Celular: a mesa estreita, sem lupa nas cartas. */
  compact(): boolean;
}

export function attachTableClicks(d: ClickDeps) {
  const { root } = d;
  function restoreLogFocus(key: string) {
    root.querySelector<HTMLElement>(`#fLog [data-log-toggle="${CSS.escape(key)}"]`)?.focus({ preventScroll: true });
  }
  /** Manutenção (partida e turno) em que o jogador já confirmou gerar mana mesmo assim. */
  let upkeepManaConfirmed = '';

  root.addEventListener('click', e => {
    const t = e.target as HTMLElement;
    const ui = t.closest<HTMLElement>('[data-ui]')?.dataset.ui;
    const { ui: tables, stops, passMenu, question, zone, seats } = d;
    // Gráfico de vida no fim do jogo: no toque, a coluna tocada mostra a vida de todos naquele turno.
    const lifeCol = t.closest<SVGGElement>('.lc-col');
    if (lifeCol) { for (const col of root.querySelectorAll('.lc-col.on')) if (col !== lifeCol) col.classList.remove('on'); lifeCol.classList.toggle('on'); return; }
    if (d.phases.click(t, e)) return;
    // Paradas no turno do oponente: o ícone da trilha abre o menu do grupo; fora dele, o menu fecha.
    const stopGroup = t.closest<HTMLElement>('[data-stop-group]')?.dataset.stopGroup;
    if (stopGroup) { stops.set(stops.group === stopGroup ? null : stopGroup, e.detail === 0); return; }
    const stop = t.closest<HTMLElement>('#fStopMenu [data-stop]');
    if (stop) { if (stops.editable()) d.opponentStops.toggle(stop.dataset.stop!); stops.sync(); d.render(); return; }
    if (stops.group && !t.closest('#fStopMenu')) stops.set(null);
    if (runUi(tables.pass, ui, t, e)) return;
    const level = t.closest<HTMLElement>('#fPassMenu [data-pass-level]')?.dataset.passLevel;
    if (level) { const client = d.client(); if (client?.connected && !d.match().disconnected && isPassLevel(level)) d.passLevel.change(level); passMenu.set(false, true); d.render(); return; }
    if (passMenu.open && !t.closest('#fPassMenu')) passMenu.set(false);
    if (runUi(tables.prompt, ui, t, e)) return;
    const focusTo = t.closest<HTMLElement>('[data-focus-seat]')?.dataset.focusSeat;
    if (focusTo !== undefined) { d.focus.open(Number(focusTo)); return; }
    // Na tela de foco, tocar numa carta só mostra; cemitério, exílio e dano de comandante abrem a lista para ver.
    if (t.closest('#fFocus')) {
      const card = t.closest<HTMLElement>('[data-fid],[data-peek],[data-inspect]');
      if (card && !t.closest('[data-gy] [data-peek]')) { d.showPreview(d.cardFromElement(card), card, true); return; }
      if (!t.closest('[data-gy]')) return;
    }
    // Com a escolha recolhida, a mesa é só para olhar: inspecionar, ver cemitério e menu, sem jogar nada.
    if (question.minimized() && !t.closest('#fQuestion, #fMenu, .log-drawer, [data-ui], [data-inspect], [data-peek], [data-gy], [data-stack-inspect]')) return;
    if (seats.click(t)) return;
    if (runUi(tables.view, ui, t, e)) return;
    if (!t.closest('#fMenu') && ui !== 'menu') d.setMenu(false);
    if (runUi(tables.panel, ui, t, e)) return;
    if (t.id === 'fStackGallery') { tables.panel['stack-close'](t, e, 'stack-close'); return; }
    if (t.id === 'fSettings') { tables.panel['settings-close'](t, e, 'settings-close'); return; }
    if (d.overlay.click(t)) return;
    const logToggle = t.closest<HTMLElement>('[data-log-toggle]');
    if (logToggle) {
      const key = logToggle.dataset.logToggle!;
      d.historyLog.toggle(key, logToggle.getAttribute('aria-expanded') !== 'true'); restoreLogFocus(key);
      return;
    }
    const inspecting = t.closest<HTMLElement>('[data-inspect],[data-event],[data-stack-inspect]');
    if (inspecting) { d.showPreview(d.cardFromElement(inspecting), inspecting, true); return; }
    const state = d.client()?.state;
    const stackTarget = t.closest<HTMLElement>('[data-stack]');
    if (stackTarget && state) {
      const id = Number(stackTarget.dataset.stack);
      if (!d.renderedInputIsCurrent(stackTarget)) return;
      if (!state.stack.some(item => item.id === id)) return;
      if (!state.question && state.input.selectableStacks?.includes(id)) {
        d.stopPresentation(); d.client()!.send({ type: 'stack', id, gen: Number(stackTarget.dataset.gen) });
        if (d.match().stackGalleryOpen) d.closeStackGallery();
      } else d.showPreview(d.cardFromElement(stackTarget), stackTarget, true);
      return;
    }
    const grouped = t.closest<HTMLElement>('[data-group]');
    if (grouped && state) { zone.openGroup(state, grouped.dataset.group!.split(',').map(Number), grouped.dataset.groupTitle ?? 'Cartas do grupo'); return; }
    const purePeek = t.closest<HTMLElement>('[data-peek]');
    if (purePeek && !purePeek.closest('[data-gy]')) { d.showPreview(d.cardFromElement(purePeek), purePeek, true); return; }
    const renderedQuestion = t.closest<HTMLElement>('[data-qid]');
    if (renderedQuestion && Number(renderedQuestion.dataset.qid) !== state?.question?.id) return;
    if (runUi(tables.action, ui, t, e)) return;
    if (t.id === 'fZone') { tables.action['zone-close'](t, e, 'zone-close'); return; }
    const ctr = t.closest<HTMLElement>('[data-ctr]')?.dataset.ctr ?? null;
    const openCounter = seats.openCounter();
    if (ctr || openCounter) {
      seats.setOpenCounter(ctr && ctr !== openCounter ? ctr : null);
      d.render();
      if (ctr) return; // clicar no marcador só mostra o texto, não usa a carta
    }
    const client = d.client();
    if (!client) return;
    const gy = t.closest<HTMLElement>('[data-gy]');
    if (gy && client.state) { zone.openZone(client.state, +gy.dataset.gy!, zoneKindOf(gy.dataset.zone)); return; }
    if (question.clickDraft(t)) return;
    const undoChoice = t.closest<HTMLElement>('[data-undo]')?.dataset.undo;
    if (undoChoice) { client.send(undoChoice === 'cancel' ? { type: 'undo-cancel' } : { type: 'undo-vote', value: undoChoice === 'yes' }); return; }
    const skip = t.closest<HTMLElement>('[data-skip-vote]');
    if (skip) { client.send({ type: 'skip-vote', target: Number(skip.dataset.skipVote), value: skip.dataset.value !== 'false' }); return; }
    if (question.clickAnswer(t)) return;
    const act = t.closest<HTMLElement>('[data-act]')?.dataset.act;
    if (act === 'phyrexian-life') {
      const control = t.closest<HTMLElement>('[data-act]')!;
      if (!d.renderedInputIsCurrent(control)) return;
      d.inputs.payLife(Number(control.dataset.gen));
      return;
    }
    if (act === 'ok' || act === 'cancel' || act === 'pass-turn' || act === 'resolve-all') {
      const control = t.closest<HTMLElement>('[data-act]')!;
      if (!d.renderedInputIsCurrent(control)) return;
      d.inputs.send(act, Number(control.dataset.gen));
      return;
    }
    const prolifRow = t.closest<HTMLElement>('[data-prolif-kind]'), prolifTool = t.closest<HTMLElement>('[data-prolif]');
    if ((prolifRow || prolifTool) && client.state && isProliferating(client.state)) {
      const control = (prolifRow ?? prolifTool)!;
      if (!d.renderedInputIsCurrent(control)) return;
      const s = client.state;
      const message = prolifRow ? proliferateToggle(s, prolifRow.dataset.prolifKind === 'player' ? 'player' : 'card', Number(prolifRow.dataset.prolifId))
        : prolifTool!.dataset.prolif === 'suggested' ? proliferateSuggestion(s) : proliferateClear(s);
      if (message) { d.stopPresentation(); client.send(message); }
      return;
    }
    if (t.closest('.emblem')) return; // fica dentro do retrato, mas não é um clique no jogador
    const mana = t.closest<HTMLElement>('[data-mana]')?.dataset.mana;
    if (mana) { const control = t.closest<HTMLElement>('[data-mana]')!; if (d.renderedInputIsCurrent(control)) { d.stopPresentation(); client.send({ type: 'mana', color: mana, gen: Number(control.dataset.gen) }); } return; }
    boardClick(t);
  });

  /** As cartas e os jogadores da mesa: atacar, bloquear, proliferar, escolher um jogador ou usar a carta. */
  function boardClick(t: HTMLElement) {
    const client = d.client()!, { attack } = d, match = d.match();
    const defender = t.closest<HTMLElement>('[data-defender]');
    if (defender && client.state) {
      attack.choose(client.state, { id: Number(defender.dataset.defender), kind: defender.dataset.defenderKind === 'card' ? 'card' : 'player' }, Number(defender.dataset.gen));
      return;
    }
    const pl = t.closest<HTMLElement>('[data-pid]');
    if (pl && client.state?.input.attacking) {
      attack.choose(client.state, { id: Number(pl.dataset.pid), kind: 'player' }, Number(pl.dataset.gen));
      return;
    }
    // Proliferar: o clique no retrato ou na carta passa pela mesma escolha da lista (o Forge confirmaria sozinho ao marcar o último).
    if (pl && client.state && isProliferating(client.state)) {
      const message = d.renderedInputIsCurrent(pl) ? proliferateToggle(client.state, 'player', Number(pl.dataset.pid)) : null;
      if (message) { d.stopPresentation(); client.send(message); }
      return;
    }
    if (pl) { if (d.renderedInputIsCurrent(pl) && client.state?.input.selectablePlayers?.includes(+pl.dataset.pid!)) { d.stopPresentation(); client.send({ type: 'player', id: +pl.dataset.pid!, gen: Number(pl.dataset.gen) }); } return; }
    const cd = t.closest<HTMLElement>('[data-fid]');
    if (!cd || !d.renderedInputIsCurrent(cd)) return;
    const s = client.state!;
    const id = Number(cd.dataset.fid), gen = Number(cd.dataset.gen);
    if (isProliferating(s) && gen === s.input.gen) {
      const message = proliferateToggle(s, 'card', id);
      if (message) { d.stopPresentation(); client.send(message); return; }
    }
    if (s.input.attacking && cd.closest('.field')) {
      if (s.input.attacking.attackers.includes(id)) { attack.tapAttacker(s, id, gen); return; }
      attack.choose(s, { id, kind: 'card' }, gen);
      return;
    }
    if (cd.hasAttribute('data-command-card') && !canPlayCommander(s, id, gen)) { d.showPreview(d.findCard(id), cd, true); return; }
    if (cd.hasAttribute('data-library-top')) { const top = d.findCard(id); if (!top || gen !== s.input.gen || !canUse(s, top)) { d.showPreview(top, cd, true); return; } }
    if (s.input.blocking && cd.closest('.field')) {
      if (s.input.blocking.blockers.includes(id)) {
        match.selectedBlocker = match.selectedBlocker?.blocker === id ? null : { blocker: id, gen };
        hideCardPreview(true); d.renderTable(); return;
      }
      if (s.input.blocking.attackers.includes(id)) {
        const action = blockPairAction(s, match.selectedBlocker, id, gen);
        if (!action) { d.announce(match.selectedBlocker ? 'Essa criatura não pode bloquear esse atacante.' : 'Selecione primeiro uma criatura sua para bloquear.'); return; }
        match.selectedBlocker = null; d.stopPresentation(); hideCardPreview(true); client.send(action); d.renderTable(); return;
      }
      return;
    }
    if (cd.hasAttribute('data-exile-card')) {
      if (s.input.suspendCast?.card.id === id) { d.inputs.send('ok', gen); return; }
      if (!canPlayExileCard(s, id, gen) && !canSelectExileCard(s, id, gen)) { d.showPreview(d.findCard(id), cd, true); return; }
    }
    // Celular: sem lupa, tocar numa carta do oponente que não faz nada agora mostra a carta. Nas suas, o toque é sempre
    // do jogo (o terreno vira por mana mesmo fora da lista de usáveis); para ver, segure.
    const theirs = d.findCard(id)?.controller !== s.you;
    if (d.compact() && cd.closest('.field') && theirs && !usable(s, id) && !selectedForInput(s, id)) { d.showPreview(d.findCard(id), cd, true); return; }
    // Usar uma carta do cemitério ou do exílio fecha a janela, para a pergunta seguinte aparecer.
    // No alvo de cemitério aberto sozinho, a janela fica até a escolha acabar (com vários alvos, marca um de cada vez).
    if (cd.closest('#fZone') && !(d.zone.openedForTarget() && s.input.targeting)) d.zone.close();
    // Na sua manutenção, virar algo só para mana pede confirmação, uma vez por manutenção.
    const upkeepKey = upkeepManaKey(s, id);
    if (upkeepKey && upkeepKey !== upkeepManaConfirmed) {
      const card = d.findCard(id);
      void confirmUpkeepMana(card ? label(card) : 'esta carta').then(yes => {
        const now = d.client()?.state;
        if (!yes || !now || d.match().disconnected || upkeepManaKey(now, id) !== upkeepKey) return;
        upkeepManaConfirmed = upkeepKey;
        d.stopPresentation();
        d.client()!.send({ type: 'card', id, gen: now.input.gen });
      });
      return;
    }
    d.stopPresentation();
    client.send({ type: 'card', id: +cd.dataset.fid!, gen: Number(cd.dataset.gen) });
  }
}
