// A mão na mesa: o leque (na ordem que o jogador arrumou, com cópias iguais empilhadas na mão cheia e as cartas de fora
// da mão que dá para jogar), as compras que ainda vão chegar voando, e o modo da mão (fixa, oculta ou automática) com
// os botões logo acima das cartas.
import type { FPlayer, FState } from '../forge/client';
import { KEYS } from '../storage';
import { HAND_GROUP_FROM, arrangeHand, groupHand } from './handDrag';
import { TALL_TABLE, savedHandMode, toggleAuto, toggleShown, type HandMode } from './handMode';
import { handHTML, hiddenHandHTML, outsideHand, type HandFanItem } from './handView';
import { usable } from './permanentView';
import { selectedForInput } from './playContext';
import { suppressOpeningPreview } from './openingPresentation';
import type { TableCtx } from './tableContext';

export interface HandDeps extends Pick<TableCtx, 'root' | '$' | 'setHTML' | 'state' | 'match' | 'timeline' | 'face' | 'playerName'> {
  /** Cartas que você está comprando no passo que a mesa desenha agora. */
  drawing(): number;
}

export function createTableHand(d: HandDeps) {
  const { root, $ } = d;
  // Mão fixa, oculta ou automática (handMode.ts). Quem assiste começa sempre recolhida, e essa escolha não fica guardada.
  let handMode: HandMode = (() => {
    const hover = typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches;
    const tall = typeof matchMedia === 'function' && matchMedia(`(min-height: ${TALL_TABLE}px)`).matches;
    try { return savedHandMode(localStorage.getItem(KEYS.hand), hover, tall); } catch { return savedHandMode(null, hover, tall); }
  })();
  let watchHandMode: HandMode = 'auto';
  // Guardado à parte: ele vive dentro da trilha de fases, que é redesenhada (e o tira do documento até voltar).
  const handAutoButton = root.querySelector<HTMLButtonElement>('#fHandAuto')!;
  let handCountSeen = -1;
  /** Mesa do computador: só nela há mão automática (handPeek.css); no celular o ícone é só a contagem. */
  const desktop = () => typeof matchMedia !== 'function' || matchMedia('(min-width: 761px) and (min-height: 501px)').matches;
  /** Pilhas de cópias iguais da mão cheia (handDrag.ts), ou null com a mão sem agrupar. */
  let handGroups: number[][] | null = null;

  /**
   * Modo da mão: as classes na mesa, o ícone da mão (com a quantidade de cartas na mão, que no celular é só contador:
   * lá não há mão automática) e a seta (só com a mão automática desligada).
   */
  function syncMode(watching: boolean, handCount = handCountSeen) {
    const mode = watching ? watchHandMode : handMode;
    const arena = root.querySelector('.arena')!;
    arena.classList.toggle('hand-peek', mode === 'auto');
    arena.classList.toggle('hand-hidden', mode === 'oculta');
    arena.classList.toggle('hand-fixed', mode === 'fixa');
    const auto = handAutoButton, desk = desktop();
    const cards = handCount < 0 ? '' : `${handCount} ${handCount === 1 ? 'carta' : 'cartas'} na mão`;
    auto.setAttribute('aria-pressed', String(desk && mode === 'auto'));
    const state = mode === 'auto' ? 'Mão automática ligada: recolhida, sobe ao passar o mouse. Clique para desligar' : 'Mão automática desligada: clique para ligar';
    auto.title = desk ? (cards ? `${cards}. ${state}` : state) : cards;
    auto.setAttribute('aria-label', desk ? (cards ? `${cards}. Mão automática` : 'Mão automática') : cards || 'Cartas na mão');
    const count = auto.querySelector<HTMLElement>('.phase-hand-count')!;
    count.hidden = handCount < 0;
    count.textContent = String(Math.max(0, handCount));
    $('#fHandMode').hidden = mode === 'auto';
    const toggle = $('#fHandToggle'), text = mode === 'fixa' ? 'Esconder a mão' : 'Mostrar a mão';
    toggle.hidden = mode === 'auto';
    toggle.setAttribute('aria-label', text);
    toggle.title = text;
    toggle.classList.toggle('shown', mode === 'fixa');
    // Com a mão oculta, carta nova na mão faz o ícone da mão brilhar, para a compra não passar despercebida.
    if (mode === 'oculta' && handCountSeen >= 0 && handCount > handCountSeen) { auto.classList.remove('arrived'); void auto.offsetWidth; auto.classList.add('arrived'); }
    handCountSeen = handCount;
    placeControls();
  }
  /**
   * Os botões ficam centralizados acima da mão, logo acima do topo das cartas em repouso (sem contar o mouse por cima,
   * que sobe a mão automática ou uma carta): as medidas sem transformação (offset*) não mudam com isso.
   */
  function placeControls() {
    const box = $('#fHandMode'), hand = $('#fHand');
    if (!box.offsetParent || !hand.offsetParent) return;
    const mode = d.state()?.watching ? watchHandMode : handMode;
    const arenaHeight = (box.offsetParent as HTMLElement).clientHeight;
    const slot = hand.querySelector<HTMLElement>('.hand-slot');
    const peek = parseFloat(getComputedStyle(hand).getPropertyValue('--peek-visible')) || 50;
    // Mão fixa: o topo das cartas e dos selos de custo dentro da mão, somado ao lugar da mão sem o deslizar (que pode
    // estar no meio da animação de abrir).
    const drawnTop = () => {
      const handTop = hand.getBoundingClientRect().top;
      return hand.offsetTop + Math.min(...[...hand.querySelectorAll<HTMLElement>('.hcard, .hcost')].map(el => el.getBoundingClientRect().top - handTop));
    };
    const cardsTop = !slot || mode === 'oculta' ? arenaHeight - 6
      : mode === 'auto' ? arenaHeight - peek - 14
      : drawnTop();
    box.style.left = `${Math.round(hand.offsetLeft + hand.offsetWidth / 2)}px`;
    box.style.top = `${Math.round(Math.max(4, cardsTop - box.offsetHeight - 8))}px`;
  }
  function apply(next: HandMode) {
    if (d.state()?.watching) watchHandMode = next;
    else {
      handMode = next;
      try { localStorage.setItem(KEYS.hand, next); localStorage.removeItem(KEYS.handHide); } catch { /* Storage is optional. */ }
    }
    syncMode(!!d.state()?.watching);
  }
  const current = () => d.state()?.watching ? watchHandMode : handMode;

  /** Desenha a mão (a sua, ou as costas para quem assiste). */
  function render(s: FState, me: FPlayer) {
    const match = d.match();
    // Cartas do cemitério utilizáveis continuam na mão; o exílio tem seu próprio espaço.
    const extra = outsideHand(s);
    // A mão segue a ordem que o jogador arrumou: a comprada entra no fim e a jogada sai sem mexer no resto.
    match.handOrder = arrangeHand(match.handOrder, me.hand.map(c => c.id));
    const inHand = new Map(me.hand.map(c => [c.id, c]));
    // Mão cheia: cópias iguais (mesmo nome e custo, sem marcadores, as duas jogáveis ou não) viram uma pilha no lugar da
    // primeira. Não agrupa quando a mesa pede para escolher cartas da mão nem no começo da partida.
    const grouping = !s.watching && me.hand.length >= HAND_GROUP_FROM && !s.input.selection && !s.input.opening && !s.question;
    handGroups = grouping ? groupHand(match.handOrder, id => {
      const c = inHand.get(id)!;
      return c.faceDown || Object.values(c.counters ?? {}).some(Boolean) || selectedForInput(s, id) ? null : `${c.name}|${c.manaCost ?? ''}|${usable(s, id)}`;
    }) : null;
    const fan: HandFanItem[] = [...(handGroups ?? match.handOrder.map(id => [id])).map(ids => ({ c: inHand.get(ids[0]!)!, tag: '', copies: ids })), ...extra];
    $('#fHand').classList.toggle('crowded', fan.length > 7);
    syncMode(!!s.watching, s.watching ? me.handCount : me.hand.length);
    const drawsAhead = d.timeline.pendingDraws(s.you) + d.drawing() > 0 && match.handPrimed && !suppressOpeningPreview(s) && d.timeline.history.some(e => e.type === 'turn');
    for (const [id, at] of match.arriving) if (at <= performance.now()) match.arriving.delete(id);
    const incoming = (id: number) => (drawsAhead && !match.knownHand.has(id)) || match.arriving.has(id);
    d.setHTML($('#fHand'), handHTML(s, fan, { face: c => d.face(c, 'normal'), incoming, playerName: d.playerName }));
    // Quem assiste não vê a mão de ninguém: a de baixo também fica de costas, só com a quantidade.
    if (s.watching) d.setHTML($('#fHand'), hiddenHandHTML(me));
    match.knownHand = new Set([...match.handOrder, ...extra.map(({ c }) => c.id)].filter(id => !incoming(id) || match.arriving.has(id)));
    placeControls();
    match.handPrimed = true;
  }

  return {
    render, syncMode, placeControls,
    /** Botões "Auto" e da seta. */
    toggleAuto() { if (desktop()) apply(toggleAuto(current())); },
    toggleShown() { apply(toggleShown(current())); },
    /** Pilhas de cópias iguais do último desenho (null: mão sem agrupar). */
    groups: () => handGroups,
    autoButton: handAutoButton,
  };
}
export type TableHand = ReturnType<typeof createTableHand>;
