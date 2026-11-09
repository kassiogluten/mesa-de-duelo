// A caixa de ação: os botões de cada momento (passar, fim de turno, resolver tudo, pagar, confirmar ataque ou bloqueio,
// mulligan, quem começa), o selo do nível de passar, o painel do alvo sendo escolhido e os nomes da lista de proliferar.
import type { FCard, FState } from '../forge/client';
import { esc, optionHTML, richText, withoutCardIds } from './cardtext';
import { label } from './cardFaces';
import { voteTallyText } from './cardVote';
import { cardDecision } from './decisionPrompt';
import { isProliferating, proliferateOkLabel } from './proliferate';
import { passLabel } from './phaseHud';
import { passLevelBadgeHTML, type PassLevel } from './passLevel';
import { abilityKindLabel, paymentButtonLabels, targetProgress, voteRequest } from './shortInstruction';
import { waitingOnText } from './awaitingDecision';
import { gameResult, watchBarHTML } from './resultView';
import { zoneName } from './questionView';

/** O que a caixa de ação precisa da mesa. */
export interface ActionView {
  findCard(id: number, withPrompt?: boolean): FCard | undefined;
  playerName(id: number): string;
  /** No fim do jogo, o jogador fechou o resultado para olhar a mesa. */
  observing: boolean;
  disconnected: boolean;
  /** Já houve um clique neste prompt há pouco: os botões esperam o Forge responder. */
  clickLocked(gen: number): boolean;
  passLevel: PassLevel;
  passLevelSupported: boolean;
  passingTurn: boolean;
  passPending: boolean;
  passMenuOpen: boolean;
  /** "Atacar com tudo" esperando o defensor; criaturas escolhidas sem defensor; ataques na fila. */
  attackAll: boolean;
  attackSelecting: number;
  attackBusy: boolean;
}

/** Sem nenhum bloqueador seu declarado, o botão diz que você não vai bloquear (como o "Não atacar" do ataque). */
export function blockConfirmLabel(s: FState) {
  const mine = new Set(s.players.find(p => p.id === s.you)?.battlefield.map(c => c.id));
  const blockers = new Set(s.combat.flatMap(entry => entry.blockers).filter(id => mine.has(id))).size;
  return blockers ? `Confirmar ${blockers} ${blockers === 1 ? 'bloqueador' : 'bloqueadores'}` : 'Sem bloqueio';
}
export function attackConfirmLabel(attackers: number) {
  return attackers ? `Confirmar ${attackers} ${attackers === 1 ? 'atacante' : 'atacantes'}` : 'Não atacar';
}
export function proliferateNames(v: ActionView, s: FState) {
  const who = (playerId: number | undefined) => playerId === s.you ? 'Seu' : `De ${s.players.find(p => p.id === playerId)?.name ?? 'oponente'}`;
  return {
    name: (c: { kind: 'card' | 'player'; id: number }) => c.kind === 'player'
      ? c.id === s.you ? 'Você' : s.players.find(p => p.id === c.id)?.name ?? 'Jogador'
      : (() => { const card = v.findCard(c.id); return card ? label(card).split(',')[0]! : 'Permanente'; })(),
    whose: (c: { kind: 'card' | 'player'; id: number; holder?: number }) => c.kind === 'player' ? 'Jogador' : who(c.holder),
  };
}
/** O jogo espera a escolha de um jogador e nada mais (sem cartas, alvos, combate ou pagamento). */
export function choosingPlayer(s: FState) {
  const input = s.input;
  return !!input.selectablePlayers?.length && !input.selectable.length && !input.selectableStacks?.length && !input.priority && !input.opening
    && !input.targeting && !input.paying && !input.attacking && !input.blocking && !input.vote && !input.selection && !isProliferating(s);
}
export function buttons(v: ActionView, s: FState) {
  if (s.gameOver && v.observing && !v.disconnected) {
    const result = gameResult(s);
    return `<span class="observe-label ${result.tone}">${result.title} · Jogo encerrado</span><button class="arena-btn primary" data-ui="result">Ver resultado</button>`;
  }
  if (s.gameOver || s.question) return '';
  if (s.watching) return watchBarHTML(s);
  if (s.spectating) return '<span class="spectating-label">Você foi eliminado. Acompanhando a partida.</span>';
  if (s.input.opening === 'starting-player') {
    const choices = s.players.filter(player => s.input.selectablePlayers?.includes(player.id));
    return choices.length ? choices.map(player => `<button class="arena-btn ${player.id === s.you ? 'primary' : 'secondary'}" data-pid="${player.id}" data-gen="${s.input.gen}">${esc(player.name)}${player.id === s.you ? ' · Você' : ''}</button>`).join('') : '<button class="arena-btn waiting" disabled>Aguardando a escolha de quem começa…</button>';
  }
  // Escolha de um jogador só no retrato (o oponente que decide no Curator of Destinies): um botão por jogador, como no "Quem começa?".
  const players = choosingPlayer(s) ? s.players.filter(player => s.input.selectablePlayers!.includes(player.id)) : [];
  if (players.length) {
    const cancelChoice = s.input.cancel.enabled && s.input.cancel.label ? `<button class="arena-btn secondary" data-act="cancel" data-gen="${s.input.gen}">${optionHTML(s.input.cancel.label)}</button>` : '';
    return players.map(player => `<button class="arena-btn primary" data-pid="${player.id}" data-gen="${s.input.gen}">${esc(player.name)}${player.id === s.you ? ' · Você' : ''}</button>`).join('') + cancelChoice;
  }
  const decision = cardDecision(s);
  const handCount = s.players.find(p => p.id === s.you)?.hand.length ?? 0;
  const move = s.input.commanderMove;
  const payment = s.input.paying ? paymentButtonLabels(s.input) : null;
  const ok = payment && s.input.ok.label ? { ...s.input.ok, label: payment.ok } : move ? { ...s.input.ok, label: 'Zona de comando' } : s.input.suspendCast ? { ...s.input.ok, label: 'Conjurar agora' } : s.input.blocking ? { ...s.input.ok, label: blockConfirmLabel(s) } : s.input.attacking ? { ...s.input.ok, label: attackConfirmLabel(s.combat.length), enabled: s.input.ok.enabled && !v.attackAll && !v.attackSelecting && !v.attackBusy } : s.input.opening === 'play-draw' ? { ...s.input.ok, label: 'Eu jogo' }
    : s.input.opening === 'mulligan' ? { ...s.input.ok, label: `Manter ${handCount - (s.input.openingReturnCount ?? 0)}` }
    : s.input.opening === 'mulligan-bottom' && s.input.openingReturnCount ? { ...s.input.ok, label: s.input.openingReturnCount === 1 ? 'Devolver 1 carta' : `Devolver ${s.input.openingReturnCount} cartas` } : isProliferating(s) ? { ...s.input.ok, label: proliferateOkLabel(s) } : decision ? { ...s.input.ok, label: 'Confirmar seleção' } : s.input.ok;
  // No proliferar o Cancelar do Forge troca o modo de seleção em massa ("Meu", "Todos"); a lista tem os próprios atalhos.
  const cancel = payment && s.input.cancel.label ? { ...s.input.cancel, label: payment.cancel } : isProliferating(s) ? { ...s.input.cancel, label: '' } : move ? { ...s.input.cancel, label: zoneName(move.to) } : v.attackAll ? { ...s.input.cancel, label: 'Cancelar seleção' } : s.input.suspendCast ? { ...s.input.cancel, label: 'Deixar no exílio' } : s.input.opening === 'play-draw' ? { ...s.input.cancel, label: 'Oponente joga' }
    // O "Automático" do Forge escolhe as primeiras cartas da mão por você.
    // Com a escolha completa ele fica desativado: some, e só o "Devolver" fica.
    : s.input.opening === 'mulligan-bottom' && s.input.cancel.label ? { ...s.input.cancel, label: s.input.cancel.enabled ? 'Escolher por mim' : '' } : s.input.cancel;
  const waiting = v.clickLocked(s.input.gen) || (!!s.input.attacking && v.attackBusy);
  const b = (act: string, btn: { label: string; enabled: boolean }, kind: string) =>
    btn.label ? `<button class="arena-btn ${kind}" data-act="${act}"${act === 'ok' ? ' aria-keyshortcuts="Space" title="Atalho: Espaço"' : ''}${act === 'cancel' && v.attackAll ? ' data-ui="attack-clear"' : ''} data-gen="${s.input.gen}" ${btn.enabled && !waiting ? '' : 'disabled'}>${optionHTML(btn.label)}</button>` : '';
  const mine = s.activePlayer === s.you;
  if (!ok.enabled && !cancel.enabled) return decision ? '' : `<button class="arena-btn waiting" disabled>${s.input.opening ? 'Aguardando confirmação…' : waitingOnText(s) || (v.passingTurn ? 'Passando até o fim do turno…' : '') || (mine ? 'Aguardando o jogo…' : s.players.length > 2 ? `${s.players.find(p => p.id === s.activePlayer)?.name ?? 'Oponente'} jogando…` : 'Oponente jogando…')}</button>`;
  // "Fim de turno" passaria direto por um combate extra ainda por vir: com um pendente, o atalho some.
  const extraCombat = mine && (s.extraCombats ?? 0) > 0;
  const endTurn = !!s.input.priority && ok.enabled && mine && !s.stack.length && !s.input.targeting && !s.input.paying && !extraCombat;
  const undo = (endTurn || (extraCombat && !!s.input.priority)) && /fim de turno|end turn/i.test(cancel.label) ? '' : b('cancel', cancel, 'secondary');
  const priority = s.input.priority ? { ...ok, label: passLabel(s) } : ok;
  // Pilha longa: resolve tudo de uma vez. Para sozinho se algo novo entrar na pilha ou se o jogo pedir uma decisão.
  const resolveAll = !!s.input.priority && ok.enabled && s.stack.length >= 2 && !s.input.targeting && !s.input.paying
    ? b('resolve-all', { label: `Resolver todos (${s.stack.length})`, enabled: true }, 'secondary') : '';
  // Mana phyrexiana: o mesmo que tocar no próprio retrato, um símbolo por 2 de vida.
  const lifeEnabled = s.input.paying && s.input.phyrexianLife !== undefined;
  const life = (kind: string) => lifeEnabled ? b('phyrexian-life', { label: 'Pagar 2 de vida', enabled: true }, kind) : '';
  // Sem mana para o automático, a vida vira o destaque; sem ela, só sobra desistir ou não pagar.
  if (s.input.paying && s.input.canAutoPay === false && cancel.enabled)
    return lifeEnabled ? b('ok', ok, 'secondary') + b('cancel', cancel, 'secondary') + life('primary') : b('ok', ok, 'secondary') + b('cancel', cancel, 'primary');
  // O destaque, sempre por último (embaixo, onde a mão já espera), é o próximo passo. Nunca o "Fim de turno": apertado
  // por hábito, ele pularia o resto do turno.
  const pass = b('ok', priority, 'primary');
  const passTurn = endTurn ? b('pass-turn', { label: 'Fim de turno', enabled: true }, 'secondary') : '';
  return undo + life('secondary') + resolveAll + passTurn + pass;
}
/** O selo do nível fica à vista durante toda a partida, também com o oponente jogando, para trocar a qualquer hora. */
export function passLevelVisible(v: ActionView, s: FState) {
  if (!v.passLevelSupported || s.gameOver || s.spectating || s.watching || s.question || s.input.opening || s.input.attacking || s.input.blocking) return false;
  // Só junto da prioridade ou da espera: numa escolha (descarte, alvo, pagamento) ele só atrapalharia.
  return !(s.input.selection || s.input.targeting || s.input.paying || cardDecision(s) || (!s.input.priority && (s.input.ok.enabled || s.input.cancel.enabled)));
}
export function passLevelControl(v: ActionView, s: FState) {
  return passLevelVisible(v, s) ? passLevelBadgeHTML(v.passLevel, { passingTurn: v.passingTurn, open: v.passMenuOpen, busy: v.passPending }) : '';
}
/** Voto numa permanente: a escolha é no campo, e o painel diz de qual votação ela é. */
export function voteBoardPrompt(v: ActionView, vote: NonNullable<FState['input']['vote']>) {
  const tally = vote.votes.length ? `\nVotos até agora: ${voteTallyText(vote.votes, v.playerName)}` : '';
  return `Votação: ${label(vote.card)}${tally}\n\n${voteRequest(label(vote.card))}`;
}
/**
 * Decisão que segura a partida: aviso no centro da mesa, caixa de ação em destaque, o resto da mesa esmaecido
 * e, se ela ficar parada, um lembrete com som. Com outro jogador decidindo, o aviso diz por quem a mesa espera.
 */
/**
 * Escolha de alvos antes da pilha: o gatilho ou a habilidade que pede o alvo (no idioma do motor, que já vem em
 * português quando a carta tem tradução), quantos alvos faltam e quais já foram marcados.
 */
export interface TargetInfo { source: string; kind: string | null; ability: string; progress: string | null; chosen: string[] }
export function targetInfoOf(v: ActionView, s: FState): TargetInfo | null {
  const t = s.input.targeting;
  if (!t) return null;
  const src = t.card ?? v.findCard(t.source);
  const kind = abilityKindLabel(t.kind);
  const ability = kind && t.ability ? withoutCardIds(t.ability).trim() : '';
  const chosen = [...(t.cards ?? []).map(id => { const c = v.findCard(id); return c ? label(c) : null; }),
    ...(t.players ?? []).map(id => id === s.you ? 'você' : s.players.find(p => p.id === id)?.name ?? null)].filter((n): n is string => !!n);
  const progress = targetProgress(t);
  if (!ability && !progress && !chosen.length) return null;
  return { source: src ? label(src) : 'a carta', kind, ability, progress, chosen };
}
export function targetInfoHTML(info: TargetInfo) {
  const ability = info.ability ? `<div class="target-ability"><p><span class="target-ability-kind">${esc(info.kind!)}</span> ${richText(info.ability)}</p></div>` : '';
  const status = [info.progress ? `<strong>${esc(info.progress)}</strong>` : '', info.chosen.length ? `<span>Marcado${info.chosen.length > 1 ? 's' : ''}: ${esc(info.chosen.join(', '))}</span>` : ''].filter(Boolean).join('');
  return `<div class="target-info">${ability}${status ? `<p class="target-status">${status}</p>` : ''}</div>`;
}
/** O mesmo, para o leitor de tela. */
export function targetInfoText(info: TargetInfo) {
  return [info.ability ? `${info.kind} de ${info.source}: ${/[.!?]$/.test(info.ability) ? info.ability : `${info.ability}.`}` : '', info.progress ? `${info.progress}.` : '', info.chosen.length ? `Marcado${info.chosen.length > 1 ? 's' : ''}: ${info.chosen.join(', ')}.` : '']
    .filter(Boolean).join(' ');
}
