// A caixa de ação da mesa: a carta que o pedido cita, o pedido (a frase curta sempre à vista e o texto do Forge em
// "Ver detalhes"), o painel do alvo, do proliferar e do "Atacar quem?", a previsão do bloqueio, os botões e o selo do
// nível de passar. E o que o leitor de tela ouve a cada pedido novo.
import type { FPlayer, FState } from '../forge/client';
import { esc, richText, withoutCardIds } from './cardtext';
import { label, ptOf } from './cardFaces';
import { buttons, passLevelControl, proliferateNames, targetInfoHTML, targetInfoOf, targetInfoText, voteBoardPrompt } from './actionPanel';
import type { createAttackChoice } from './attackChoice';
import { forecastLineHTML, forecastText } from './combatForecast';
import { cardDecision, selectionMessage, tapToPayMessage, tapToPayShort } from './decisionPrompt';
import { isProliferating, proliferatePanelHTML } from './proliferate';
import { zoneWithArticle } from './questionView';
import { openingHandCount } from './openingPresentation';
import { poolCost, shortInstruction, spokenMana } from './shortInstruction';
import type { createTableSettings } from './tableSettings';
import type { TableCtx } from './tableContext';

/** O que o pedido da mesa precisa saber da escolha de ataque e do bloqueio (lido só no caso que usa). */
export interface PromptChoices {
  attackAll: boolean;
  attackSelected: number;
  /** Nome do defensor escolhido antes das criaturas, ou null. */
  pinned(): string | null;
  /** Nome da criatura escolhida para bloquear, ou null. */
  blocker(): string | null;
  /** A frase do voto aberto na mesa. */
  vote(): string;
}

/** O pedido da caixa de ação, antes de virar frase curta: vazio quando os botões e a mesa já dizem tudo. */
export function boardPrompt(s: FState, c: PromptChoices): string {
  const opening = s.input.opening;
  if (s.gameOver) return '';
  if (s.input.attacking) {
    if (c.attackAll) return 'Atacar com tudo: escolha quem atacar.';
    if (c.attackSelected) return `${c.attackSelected} ${c.attackSelected === 1 ? 'criatura selecionada' : 'criaturas selecionadas'}: escolha quem atacar.`;
    const pinned = c.pinned();
    return pinned !== null ? `Atacar ${pinned}: escolha suas criaturas. Limpe a seleção para escolher as cartas primeiro.` : 'Selecione suas criaturas e escolha quem atacar, ou escolha o defensor primeiro.';
  }
  if (s.input.commanderMove) return `${s.input.commanderMove.card ? label(s.input.commanderMove.card) : 'Seu comandante'} ${s.input.commanderMove.stays ? 'está n' : 'iria para '}${zoneWithArticle(s.input.commanderMove.to)}. Para onde vai?`;
  if (s.input.suspendCast) return 'Suspender: conjure agora sem pagar o custo de mana ou deixe a carta no exílio.';
  if (s.input.blocking) {
    const blocker = c.blocker();
    return blocker !== null ? `${blocker}: escolha o atacante. Se já estiver bloqueando esse atacante, o clique remove o bloqueio.` : 'Escolha uma criatura sua e depois o atacante que ela vai bloquear.';
  }
  if (s.input.vote) return c.vote();
  if (s.input.priority && !s.input.paying && !s.input.targeting) return '';
  // Esperando o oponente na abertura: o centro já explica, e a mensagem que sobrou é a da sua escolha anterior.
  if (s.input.openingWait) return '';
  if (opening === 'starting-player' || opening === 'play-draw' || opening === 'mulligan' || (opening === 'mulligan-bottom' && s.input.openingReturnCount !== undefined)) return '';
  if (opening === 'mulligan-bottom') return s.input.message.replace(/(\d+)\s+carta\(s\)/g, (_, n: string) => `${n} ${Number(n) === 1 ? 'carta' : 'cartas'}`);
  return s.input.tapToPay ? tapToPayMessage(s.input.tapToPay, s.input.card ? label(s.input.card) : undefined) : s.input.message;
}

/** As linhas do pedido: o Forge manda "Carta (id) - texto da habilidade" antes do pedido, e o pedido vem primeiro. */
export function instructionLines(instruction: string, decision: boolean) {
  const sourceFirst = decision ? null : instruction.match(/^(.+ \(\d+\) - [\s\S]*?)\n\n([\s\S]+)$/);
  return (sourceFirst ? `${sourceFirst[2]}\n\n${sourceFirst[1]}` : instruction).split('\n');
}

export interface ActionBoxDeps extends Pick<TableCtx, 'root' | '$' | 'setHTML' | 'match' | 'findCard' | 'face' | 'cardName' | 'actionView' | 'announce'> {
  attack: ReturnType<typeof createAttackChoice>;
  settings: ReturnType<typeof createTableSettings>;
  /** O aviso "Sua decisão" (tableNotices.ts); devolve se há decisão esperando. */
  renderAwaiting(s: FState, text: string): unknown;
}

export function createActionBox(d: ActionBoxDeps) {
  const { root, $ } = d;
  // Instrução aberta com "Ver detalhes"; volta a ficar recolhida quando a instrução muda.
  let expandedPrompt = '';
  let shownInstruction = '';

  /** Desenha a caixa de ação e anuncia o pedido (com `seatNotice`, o que a mesa mudou sozinha nos assentos). */
  function render(s: FState, me: FPlayer, seatNotice: string) {
    const { attack } = d, match = d.match();
    // Carta que o prompt cita mas que não está à vista na mesa (topo do grimório na vidência/vigilância).
    // A carta que vota fica à vista mesmo estando na pilha: é ela que explica o voto.
    // Na escolha de alvos (antes da pilha), a carta que pede o alvo aparece mesmo no campo, com a habilidade e o que falta.
    // A do topo do grimório conta como fora de vista: enquanto se olha (vidência 1, vigilância 1) ela vem também como
    // topo do monte, que é só uma miniatura.
    // Em qualquer outra decisão fora da prioridade (pagar, confirmar, escolher cartas ou jogadores para um custo ou para
    // o que um efeito pede ao resolver), a carta que pede também aparece, mesmo no campo ou entre as opções.
    const choosingTargets = !!s.input.targeting && !s.input.paying && !s.input.vote && !s.gameOver;
    root.querySelector('.arena')!.classList.toggle('choosing-targets', choosingTargets);
    const pc = s.input.vote?.card ?? (choosingTargets ? s.input.targeting!.card : undefined) ?? s.input.card ?? s.input.targeting?.card;
    const decision = cardDecision(s);
    const onLibraryTop = !!pc && s.players.some(p => p.libraryTop?.id === pc.id);
    const deciding = !s.gameOver && !s.question && !s.input.priority && !s.input.vote && !s.input.opening && !s.input.attacking && !s.input.blocking;
    const targetSource = !!pc && (choosingTargets ? pc.id === s.input.targeting!.source : deciding && !onLibraryTop);
    const promptCard = !s.input.suspendCast && pc && !pc.faceDown && pc.name && (!!s.input.vote || targetSource || onLibraryTop || !d.findCard(pc.id, false))
      ? targetSource
        ? `<div class="prompt-card target-source-card" data-peek="${pc.id}" role="button" tabindex="0" aria-label="Inspecionar ${esc(label(pc))}">${d.face(pc, 'normal')}</div>`
        : `<div class="prompt-card" data-peek="${pc.id}">${d.face(pc, 'normal')}</div>` : '';
    const targetInfo = choosingTargets ? targetInfoOf(d.actionView(), s) : null;
    $('#fAction').classList.toggle('target-source', !!promptCard && targetSource);
    const opening = s.input.opening;
    const prompt = boardPrompt(s, {
      attackAll: attack.allGen !== null, attackSelected: attack.selected.size,
      pinned: () => attack.pinned ? attack.defenderName(s, attack.pinned) : null,
      blocker: () => match.selectedBlocker ? label(d.findCard(match.selectedBlocker.blocker)!) : null,
      vote: () => voteBoardPrompt(d.actionView(), s.input.vote!),
    });
    $('#fAction').classList.toggle('suspend-choice', !!s.input.suspendCast);
    $('#fAction').classList.toggle('card-decision', !!decision);
    $('#fAction').classList.toggle('hand-decision', !!decision?.inHand);
    root.querySelector('.arena')!.classList.toggle('has-hand-decision', !!decision?.inHand);
    const instruction = decision ? selectionMessage(prompt) : prompt;
    // O Forge manda "Carta (id) - texto da habilidade" antes do pedido; o pedido vem primeiro para não sumir no texto recolhido.
    const lines = instructionLines(instruction, !!decision);
    const heading = decision ? `<h2 class="decision-heading">${esc(withoutCardIds(lines.length > 1 ? lines.shift()! : 'Sua escolha'))}</h2>` : '';
    const prolifPanel = isProliferating(s) ? proliferatePanelHTML(s, proliferateNames(d.actionView(), s)) : '';
    const selectionCount = decision && !prolifPanel ? `<div class="decision-progress" role="status"><strong>${esc(decision.progress)}</strong><span>${esc(decision.instruction)}</span></div>` : '';
    shownInstruction = instruction;
    const expanded = !!instruction && expandedPrompt === instruction;
    const more = `<button class="prompt-more" data-ui="prompt-more" aria-controls="fPrompt" aria-expanded="${expanded}" hidden>${expanded ? 'Ver menos' : 'Ver detalhes'}</button>`;
    const attackPanel = attack.panelHTML(s);
    const myForecast = s.input.blocking ? s.forecast?.find(f => f.player === s.you) : undefined;
    const blockForecast = myForecast ? forecastLineHTML(myForecast, d.cardName) : '';
    $('#fAction').classList.toggle('attack-choosing', !!attackPanel);
    $('#fAction').classList.toggle('proliferating', !!prolifPanel);
    // Frase curta sempre à vista; o texto do Forge (habilidade inteira, pedido em inglês) fica em "Ver detalhes".
    const short = decision || !instruction ? null : shortInstruction(s.input.paying ? { ...s.input, reserve: poolCost(s.players.find(p => p.id === s.you)?.pool) } : s.input, name => ptOf(name)?.name || name);
    const forgeText = richText(lines.join('\n')).replace(/\n/g, '<br>');
    const promptBody = short ? `<strong class="prompt-short">${richText(short)}</strong><span class="prompt-forge"><br><br>${forgeText}</span>` : forgeText;
    const targetPanel = targetInfo && !decision ? targetInfoHTML(targetInfo) : '';
    d.setHTML($('#fAction'), `${promptCard}<div class="decision-copy">${heading}<div class="prompt${expanded ? ' expanded' : ''}${short ? ' has-short' : ''}" id="fPrompt">${promptBody}</div>${more}</div>${targetPanel}${selectionCount}${prolifPanel}${attackPanel}${blockForecast}<div class="btns">${buttons(d.actionView(), s)}${passLevelControl(d.actionView(), s)}</div>`);
    d.settings.syncPassLevel();
    attack.syncPanelShift();
    // "Ver detalhes" só aparece quando o texto não cabe nas linhas da caixa.
    const promptEl = root.querySelector<HTMLElement>('#fPrompt');
    const moreEl = root.querySelector<HTMLElement>('[data-ui="prompt-more"]');
    if (promptEl && moreEl) moreEl.hidden = !expanded && !short && promptEl.scrollHeight <= promptEl.clientHeight + 1;
    // O pedido é o último parágrafo do Forge ("Carta (id) - habilidade" vem antes); sem o número da carta.
    const request = instruction.split(/\n\s*\n/).map(part => part.trim()).filter(Boolean).pop() ?? '';
    const awaiting = d.renderAwaiting(s, isProliferating(s) ? 'Proliferar: marque o que ganha marcadores'
      : s.input.tapToPay ? tapToPayShort(s.input.tapToPay, s.input.card ? label(s.input.card) : undefined) : short ?? withoutCardIds(request));
    // A previsão do combate vai junto: a cada bloqueio marcado ou desfeito, a frase muda e o leitor de tela lê de novo.
    const forecastSpoken = (s.forecast ?? []).map(f => forecastText(f, f.player === s.you ? null : s.players.find(p => p.id === f.player)?.name ?? 'O defensor', d.cardName)).join(' ');
    const targetSpoken = targetPanel && targetInfo ? ` ${targetInfoText(targetInfo)}` : '';
    d.announce([seatNotice, instruction ? `${awaiting ? 'Sua decisão. ' : ''}${short ? spokenMana(short) : withoutCardIds(instruction)}${targetSpoken}${decision ? ` ${decision.progress}. ${decision.instruction}` : ''}` : (opening === 'play-draw' || opening === 'starting-player' ? 'Escolha quem joga primeiro.' : opening === 'mulligan' ? `Mão inicial: ${me.hand.length} cartas, ${openingHandCount(me.hand).replace(' · ', ' e ')}.` : opening === 'mulligan-bottom' ? `Cartas a devolver: ${s.input.openingReturnRemaining ?? s.input.openingReturnCount ?? 0}.` : ''), forecastSpoken].filter(Boolean).join(' '));
  }
  return {
    render,
    /** "Ver detalhes" / "Ver menos" do pedido. */
    toggleDetails() { expandedPrompt = expandedPrompt === shownInstruction ? '' : shownInstruction; },
  };
}
