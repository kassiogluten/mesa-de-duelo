// A pergunta aberta na mesa (escolher cartas, nomes, montes, a ordem do grimório ou dos gatilhos, dividir o dano de
// combate, um número, um texto): a janela, a barra que fica quando ela é recolhida com "Ver a mesa", o rascunho da
// resposta, a busca e o filtro, e os cliques, digitação e envio de cada tela.
import type { FCard, FQuestion } from '../forge/client';
import { CHOICE_SORT_KEY, choiceLayout, choiceStatus, isFilterableChoice, newChoiceView, parseChoiceSort, type ChoiceSort, type ChoiceView } from './choiceFilters';
import { isPlayMode, isTriggerOrder, newTriggerOrder, undoTrigger, type TriggerOrder } from './choiceScreens';
import { adjust, autoSplit, isCombatDamage, splitStatus } from './combatDamage';
import { esc } from './cardtext';
import { label, ptOf } from './cardFaces';
import { hideCardPreview } from './cardInspector';
import { restoreRowScroll, rowScroll, syncAllRowEdges } from './cardRow';
import { isLibraryChoice, librarySummary, moveLibraryCard, placeLibraryCard } from './libraryChoice';
import { isNameChoice, nameListHTML, nameMatches, nameStatus } from './nameChoice';
import { isPilesChoice, isPilesSplit, movePileCard, splitSummary } from './piles';
import { amountStatus, choiceTypeLine, newQuestionDraft, questionBar as renderQuestionBar, questionHTML as renderQuestion, type QuestionView } from './questionView';
import { attachTriggerOrder } from './triggerOrderInput';
import { prefsChanged } from '../conta/sync';
import { EVENTS } from '../storage';
import type { TableCtx } from './tableContext';

export interface QuestionDeps extends Pick<TableCtx, 'root' | '$' | 'setHTML' | 'client' | 'state' | 'match' | 'motion' | 'face' | 'playerName' | 'announce' | 'render' | 'renderTable' | 'stopPresentation' | 'syncModal' | 'leaveOverlay'> {
  /** Onde o foco começa numa janela (tableModal.ts). */
  modalStart(el: HTMLElement): HTMLElement | null | undefined;
}

const ptName = (name: string) => ptOf(name)?.name;

export function createTableQuestion(d: QuestionDeps) {
  const { root, $ } = d;
  /** Filtro por tipo e busca da escolha grande de cartas aberta (só mudam a tela, não a resposta). */
  let choiceView: ChoiceView | null = null;
  const viewFor = (q: FQuestion) => { if (choiceView?.id !== q.id) choiceView = newChoiceView(q.id); return choiceView; };
  /** Ordem das escolhas grandes de cartas; acompanha a conta, como as outras preferências da mesa. */
  let choiceSort: ChoiceSort = 'type';
  const readChoiceSort = () => { try { choiceSort = parseChoiceSort(localStorage.getItem(CHOICE_SORT_KEY)); } catch { /* Storage is optional. */ } };
  readChoiceSort();
  addEventListener(EVENTS.prefsSincronizadas, readChoiceSort);
  /** Divisão do dano de combate em andamento (bloqueio duplo ou atropelar). */
  let damageSplit: { id: number; amounts: number[] } | null = null;
  const splitFor = (q: FQuestion) => {
    if (damageSplit?.id !== q.id) damageSplit = { id: q.id, amounts: autoSplit(q) };
    return damageSplit.amounts;
  };
  /** Ordem dos gatilhos sendo montada na tela de ordenar gatilhos. */
  let triggerOrder: { id: number; t: TriggerOrder } | null = null;
  const triggersFor = (q: FQuestion) => {
    if (triggerOrder?.id !== q.id) triggerOrder = { id: q.id, t: newTriggerOrder(q.options?.length ?? 0) };
    return triggerOrder.t;
  };
  // Pergunta recolhida com "Ver a mesa": vira uma barra e a mesa fica à vista, só para olhar.
  let minimizedQuestion: number | null = null;
  const minimized = () => { const s = d.state(); return !!s?.question && !s.gameOver && minimizedQuestion === s.question.id; };

  const pilesView = () => ({ face: (c: FCard) => d.face(c, 'normal'), label, playerName: d.playerName, you: d.state()?.you });
  const questionView = (): QuestionView => ({ face: c => d.face(c, 'normal'), label, ptName, ptType: name => ptOf(name)?.type_line, ptText: name => ptOf(name)?.text, playerName: d.playerName,
    players: d.state()?.players ?? [], piles: pilesView(), choiceSort, choiceView: viewFor, damageSplit: splitFor, triggerOrder: triggersFor });
  function questionHTML(q: FQuestion) {
    const match = d.match();
    if (!match.qState || match.qState.id !== q.id) match.qState = newQuestionDraft(q);
    return renderQuestion(questionView(), q, match.qState);
  }
  function questionBar(q: FQuestion) {
    const match = d.match();
    return renderQuestionBar(questionView(), q, isTriggerOrder(q) ? triggerOrder?.id === q.id ? triggerOrder.t.placed : 0 : match.qState?.id === q.id ? match.qState.picked.length : 0);
  }

  /**
   * Busca digitada: esconde e mostra as cartas sem redesenhar a escolha, para não tirar o foco nem quebrar o acento
   * que ainda está sendo digitado. O próximo desenho já sai com o mesmo texto.
   */
  function applyChoiceSearch(q: FQuestion) {
    const match = d.match();
    const layout = choiceLayout(q, { sort: choiceSort, view: viewFor(q), name: label, typeLine: c => choiceTypeLine(questionView(), c) });
    const box = $('#fQuestion');
    box.querySelectorAll<HTMLElement>('.q-opts [data-q-opt]').forEach(el => { el.hidden = !layout.visible.has(Number(el.dataset.qOpt)); });
    for (const g of layout.groups) {
      const heading = box.querySelector<HTMLElement>(`[data-q-group="${g.key}"]`);
      if (!heading) continue;
      const shown = g.indices.filter(i => layout.visible.has(i)).length;
      heading.hidden = !shown;
      heading.querySelector('span')!.textContent = String(shown);
    }
    const status = box.querySelector<HTMLElement>('#fQStatus');
    if (status) status.textContent = choiceStatus(layout, match.qState?.id === q.id ? match.qState.picked : []);
  }
  /** Nomear uma carta: a lista muda sem redesenhar a escolha, para não tirar o foco da busca. */
  function applyNameSearch(q: FQuestion) {
    const match = d.match();
    const found = nameMatches(q, match.qState?.text ?? '', ptName);
    const box = $('#fQuestion');
    const list = box.querySelector<HTMLElement>('#fQNames');
    if (list) { list.innerHTML = nameListHTML(q, found, ptName); list.scrollTop = 0; }
    const status = box.querySelector<HTMLElement>('#fQNameStatus');
    if (status) status.textContent = nameStatus(found, match.qState?.text ?? '');
  }

  function answer(extra: { indices?: number[]; value?: boolean; text?: string; amounts?: number[] }) {
    const client = d.client();
    const q = client?.state?.question;
    if (!q || !client) return;
    d.stopPresentation();
    client.send({ type: 'answer', id: q.id, ...extra });
    d.match().qState = null; triggerOrder = null; damageSplit = null;
    $('#fQuestion').hidden = true;
  }

  /** A janela da pergunta (ou a barra, recolhida); sem pergunta, ela sai aos poucos. */
  function render() {
    const s = d.state()!, match = d.match();
    const qEl = $('#fQuestion');
    if (s.question && !s.gameOver) {
      if (minimizedQuestion !== null && minimizedQuestion !== s.question.id) minimizedQuestion = null;
      const isMinimized = minimized();
      qEl.classList.toggle('minimized', isMinimized);
      // Escolha grande de cartas redesenhada (uma carta marcada, um filtro): continua onde estava, sem entrar de novo.
      const before = qEl.querySelector<HTMLElement>('.question');
      const typingName = document.activeElement?.id === 'fQNameSearch';
      const again = isFilterableChoice(s.question) && Number(before?.dataset.qid) === s.question.id ? before!.scrollTop : null;
      // Fileira de cartas (celular): marcar uma carta redesenha a escolha, mas a fileira fica onde estava.
      const rows = Number(before?.dataset.qid) === s.question.id ? rowScroll(before) : [];
      d.setHTML(qEl, isMinimized ? questionBar(s.question) : `<div class="question${isTriggerOrder(s.question) ? ' trigger-order' : isLibraryChoice(s.question) ? ' library-choice' : isPilesSplit(s.question) || isPilesChoice(s.question) ? ' piles' : isPlayMode(s.question) ? ' play-mode' : isCombatDamage(s.question) ? ' combat-damage' : ''}${again !== null ? ' settled' : ''}" data-qid="${s.question.id}" role="dialog" aria-modal="true" aria-label="${esc(s.question.title)}">${questionHTML(s.question)}</div>`);
      const after = qEl.querySelector<HTMLElement>('.question');
      if (s.question.kind === 'reveal' && !isMinimized && after && Number(before?.dataset.qid) !== s.question.id) d.motion.revealIn([...after.querySelectorAll<HTMLElement>('.q-face')]);
      if (again !== null && after && after !== before) after.scrollTop = again;
      if (after && after !== before) restoreRowScroll(after, rows);
      // A busca de nomes recebe o foco ao abrir e o mantém quando a escolha é redesenhada no meio da digitação.
      const nameSearch = after && after !== before ? after.querySelector<HTMLInputElement>('#fQNameSearch') : null;
      if (nameSearch && (typingName || Number(before?.dataset.qid) !== s.question.id)) {
        nameSearch.focus({ preventScroll: true });
        nameSearch.setSelectionRange(nameSearch.value.length, nameSearch.value.length);
      }
      qEl.hidden = false;
      syncAllRowEdges(qEl);
    } else {
      if (!qEl.hidden && !qEl.classList.contains('minimized')) d.leaveOverlay(qEl);
      qEl.hidden = true;
      qEl.classList.remove('minimized');
      match.qState = null;
      minimizedQuestion = null;
    }
  }

  /** "Ver a mesa" recolhe a pergunta; "Voltar à escolha" (`question-restore`) a traz de volta. */
  function minimize(ui: string) {
    minimizedQuestion = ui === 'question-minimize' ? d.state()?.question?.id ?? null : null;
    hideCardPreview(true); d.renderTable(); d.syncModal();
    (ui === 'question-minimize' ? root.querySelector<HTMLElement>('[data-ui="question-restore"]') : d.modalStart($('#fQuestion')))?.focus({ preventScroll: true });
  }

  /** Cliques que montam a resposta: a ordem do grimório, os montes, o filtro e a ordem da escolha, marcar opções. */
  function clickDraft(t: HTMLElement) {
    const match = d.match(), state = d.state();
    const libPlace = t.closest<HTMLElement>('[data-lib-place]');
    const libMove = t.closest<HTMLElement>('[data-lib-move]');
    const libQuestion = state?.question;
    if ((libPlace || libMove) && match.qState && libQuestion && isLibraryChoice(libQuestion) && match.qState.id === libQuestion.id) {
      if (libPlace) {
        const [to, option] = libPlace.dataset.libPlace!.split(':');
        if (placeLibraryCard(match.qState.picked, Number(option), to === 'away')) { d.render(); d.announce(librarySummary(libQuestion, match.qState.picked)); }
      } else {
        const [pos = NaN, dir = NaN] = libMove!.dataset.libMove!.split(':').map(Number);
        if (moveLibraryCard(match.qState.picked, pos, dir < 0 ? -1 : 1)) {
          d.render();
          // O foco acompanha a carta na nova posição (ou fica na outra seta, se esta acabou na ponta).
          const at = pos + dir;
          (root.querySelector<HTMLButtonElement>(`[data-lib-move="${at}:${dir}"]:not(:disabled)`) ?? root.querySelector<HTMLElement>(`[data-lib-move="${at}:${-dir}"]`))?.focus({ preventScroll: true });
          const option = match.qState.picked[at], moved = option === undefined ? undefined : libQuestion.options?.[option];
          if (moved && typeof moved !== 'string' && moved.card) d.announce(`${label(moved.card)}: ${at + 1}ª de ${match.qState.picked.length}${at === 0 ? ', no topo' : ''}.`);
        }
      }
      return true;
    }
    const pileMove = t.closest<HTMLElement>('[data-pile-move]');
    const pilePick = t.closest<HTMLElement>('[data-pile-pick]');
    const pileQuestion = state?.question;
    if ((pileMove || pilePick) && match.qState && pileQuestion && match.qState.id === pileQuestion.id) {
      if (pilePick && isPilesChoice(pileQuestion)) { answer({ indices: [Number(pilePick.dataset.pilePick)] }); return true; }
      if (pileMove && isPilesSplit(pileQuestion)) {
        const option = Number(pileMove.dataset.pileMove);
        movePileCard(match.qState.picked, option);
        d.render();
        // O foco segue a carta no outro monte.
        root.querySelector<HTMLElement>(`[data-pile-move="${option}"]`)?.focus({ preventScroll: true });
        d.announce(splitSummary(pileQuestion, match.qState.picked));
        return true;
      }
    }
    const filter = t.closest<HTMLElement>('[data-q-filter]');
    const sortBy = t.closest<HTMLElement>('[data-q-sort]')?.dataset.qSort;
    const filtering = state?.question;
    if ((filter || sortBy) && filtering && isFilterableChoice(filtering)) {
      if (filter) viewFor(filtering).type = filter.dataset.qFilter || null;
      if (sortBy) {
        choiceSort = parseChoiceSort(sortBy);
        try { localStorage.setItem(CHOICE_SORT_KEY, choiceSort); } catch { /* Storage is optional. */ }
        prefsChanged();
      }
      d.render();
      const scroller = root.querySelector<HTMLElement>('#fQuestion .question');
      if (scroller) scroller.scrollTop = 0;
      d.announce(root.querySelector('#fQStatus')?.textContent ?? '');
      return true;
    }
    const opt = t.closest<HTMLElement>('[data-q-opt]');
    if (opt && match.qState) {
      const q = state?.question;
      if (!q) return true;
      const i = +opt.dataset.qOpt!;
      const isOrder = q.kind === 'order';
      if (!isOrder && (q.max ?? 1) === 1) { answer({ indices: [i] }); return true; }
      const at = match.qState.picked.indexOf(i);
      if (at >= 0) match.qState.picked.splice(at, 1);
      else if (isOrder || match.qState.picked.length < (q.max ?? 1)) match.qState.picked.push(i);
      d.render();
      return true;
    }
    return false;
  }

  /** Cliques que respondem: a divisão do dano, os gatilhos, confirmar, nenhuma, manter tudo, sim ou não. */
  function clickAnswer(t: HTMLElement) {
    const match = d.match();
    const openQuestion = d.state()?.question;
    if (openQuestion && isCombatDamage(openQuestion)) {
      const step = t.closest<HTMLElement>('[data-cd-add],[data-cd-sub],[data-cd-lethal]');
      if (step) {
        const how = step.hasAttribute('data-cd-add') ? 'add' : step.hasAttribute('data-cd-sub') ? 'sub' : 'lethal';
        const index = Number(step.dataset.cdAdd ?? step.dataset.cdSub ?? step.dataset.cdLethal);
        damageSplit = { id: openQuestion.id, amounts: adjust(openQuestion, splitFor(openQuestion), index, how) };
        const key = how === 'add' ? 'data-cd-add' : how === 'sub' ? 'data-cd-sub' : 'data-cd-lethal';
        d.render();
        // O foco fica no mesmo botão (ou no vizinho, se ele ficou desabilitado), e o novo valor é anunciado.
        const again = root.querySelector<HTMLButtonElement>(`[${key}="${index}"]`);
        (again && !again.disabled ? again : root.querySelector<HTMLElement>(`[data-cd-sub="${index}"]:not(:disabled), [data-cd-add="${index}"]:not(:disabled)`))?.focus();
        d.announce(splitStatus(openQuestion, damageSplit.amounts).message);
        return true;
      }
      if (t.closest('[data-cd-auto]')) { damageSplit = { id: openQuestion.id, amounts: autoSplit(openQuestion) }; d.render(); return true; }
      if (t.closest('[data-cd-confirm]')) {
        const amounts = splitFor(openQuestion);
        if (splitStatus(openQuestion, amounts).valid) answer({ amounts });
        return true;
      }
    }
    const trigger = t.closest<HTMLElement>('[data-trigger]');
    if (trigger && openQuestion && isTriggerOrder(openQuestion)) {
      triggerInput?.tap(openQuestion, Number(trigger.dataset.trigger));
      return true;
    }
    if (t.closest('[data-trigger-undo]') && openQuestion && isTriggerOrder(openQuestion)) { if (undoTrigger(triggersFor(openQuestion))) d.render(); return true; }
    if (t.closest('[data-trigger-confirm]') && openQuestion && isTriggerOrder(openQuestion)) { answer({ indices: [...triggersFor(openQuestion).order] }); return true; }
    if (t.closest('[data-q-submit]') && match.qState) { answer({ indices: match.qState.picked }); return true; }
    if (t.closest('[data-q-none]')) { answer({ indices: [] }); return true; }
    if (t.closest('[data-q-keep]')) { answer({ indices: (d.state()?.question?.options ?? []).map((_, i) => i) }); return true; }
    const conf = t.closest<HTMLElement>('[data-q-confirm]');
    if (conf) { answer({ value: conf.dataset.qConfirm === 'true' }); return true; }
    return false;
  }

  root.addEventListener('submit', e => {
    const form = e.target as HTMLElement;
    if (form.matches('[data-q-amount-form]')) {
      e.preventDefault();
      const q = d.state()?.question;
      if (q?.kind !== 'amount' || Number(form.closest<HTMLElement>('[data-qid]')?.dataset.qid) !== q.id) return;
      const status = amountStatus(q, d.match().qState);
      if (status.valid) answer({ amounts: status.amounts });
      return;
    }
    if (!form.matches('[data-q-text]')) return;
    e.preventDefault();
    if (Number((e.target as HTMLElement).closest<HTMLElement>('[data-qid]')?.dataset.qid) !== d.state()?.question?.id) return;
    answer({ text: (root.querySelector('#fQInput') as HTMLInputElement).value });
  });
  /** Digitação na pergunta: texto, busca de nomes, busca na escolha grande e as quantidades. */
  function input(t: HTMLInputElement) {
    const match = d.match(), s = d.state();
    if (t.id === 'fQInput' && match.qState) match.qState.text = t.value;
    if (t.id === 'fQNameSearch' && match.qState && s?.question && isNameChoice(s.question)) {
      match.qState.text = t.value;
      applyNameSearch(s.question);
    }
    if (t.id === 'fQSearch' && s?.question && isFilterableChoice(s.question)) {
      viewFor(s.question).query = t.value;
      applyChoiceSearch(s.question);
    }
    if (t.hasAttribute('data-q-amount') && match.qState && s?.question?.kind === 'amount') {
      const q = s.question;
      if (Number(t.closest<HTMLElement>('[data-qid]')?.dataset.qid) !== q.id) return false;
      match.qState.amounts[Number(t.dataset.qAmount)] = t.value;
      const status = amountStatus(q, match.qState);
      $('#fAmountRemaining').textContent = status.text;
      (root.querySelector('[data-q-amount-submit]') as HTMLButtonElement).disabled = !status.valid;
    }
    return true;
  }

  let triggerInput: ReturnType<typeof attachTriggerOrder> | null = null;
  return {
    render, answer, minimized, minimize, clickDraft, clickAnswer, input,
    /** Ordem dos gatilhos: teclado e arrastar (ligado no mesmo ponto da mesa de antes, pela ordem das escutas). */
    attachTriggerInput() {
      triggerInput = attachTriggerOrder(root, { client: d.client, order: triggersFor, render: () => d.render(), announce: text => d.announce(text) });
    },
  };
}
