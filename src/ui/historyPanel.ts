// O histórico da partida (Menu → Registro): as jogadas agrupadas por turno, com a miniatura de cada carta para ampliar
// mesmo depois que ela saiu da mesa. Os turnos e linhas abertos pelo jogador ficam assim até a partida mudar.
import type { FCard } from '../forge/client';
import { esc } from './cardtext';
import { historyTurns, turnSummary, type HistoryItem, type HistoryNames } from './historyLog';
import type { PresentationTimeline } from './presentationTimeline';

export interface HistoryDeps {
  timeline: PresentationTimeline;
  names: HistoryNames;
  you(): number | undefined;
  image(name: string | undefined, size: 'small' | 'normal', print?: FCard['print']): string | undefined;
  setHTML(el: HTMLElement, html: string): void;
}

export function createHistoryPanel(root: HTMLElement, d: HistoryDeps) {
  /** Turnos e linhas do histórico abertos ou fechados pelo jogador; sem escolha, ficam abertos o turno atual e o anterior. */
  const historyOpen = new Map<string, boolean>();
  let historyMatch = '';
  /** As cartas que o histórico mostra, para ampliar mesmo depois de terem saído da mesa. */
  const historyCards = new Map<string, FCard>();
  function historyThumb(card: FCard | undefined) {
    const art = card && (card.image ?? d.image(card.name, 'small', card.print));
    return `<span class="history-thumb"${art ? ` style="background-image:url('${art}')"` : ''} aria-hidden="true"></span>`;
  }
  function historyItem(item: HistoryItem) {
    if (!item.card) return `<span class="history-text">${esc(item.text)}</span>`;
    historyCards.set(item.key, item.card);
    return `<button class="history-inspect" data-event="${item.key}">${historyThumb(item.card)}<span class="history-text">${esc(item.text)}</span></button>`;
  }
  /** Histórico agrupado: só é montado com a gaveta aberta. */
  function render() {
    if ((root.querySelector('#fLogDrawer') as HTMLElement).hidden) return;
    if (historyMatch !== d.timeline.matchId) { historyMatch = d.timeline.matchId; historyOpen.clear(); }
    historyCards.clear();
    const you = d.you();
    d.names.you = you;
    const turns = historyTurns(d.timeline.history, d.names);
    const recent = new Set(turns.slice(-2).map(t => t.key));
    d.setHTML(root.querySelector('#fLog') as HTMLElement, turns.slice().reverse().map(turn => {
      const open = historyOpen.get(turn.key) ?? recent.has(turn.key);
      const title = turn.turn === undefined ? 'Início da partida' : `Turno ${turn.turn} · ${turn.actor === you ? 'Você' : esc(d.names.player(turn.actor))}`;
      return `<li class="history-turn${turn.actor !== undefined && turn.actor === you ? ' mine' : ''}">
        <button class="history-turn-head" data-log-toggle="${turn.key}" aria-expanded="${open}"><span class="history-caret" aria-hidden="true"></span><span class="history-turn-title">${title}</span><span class="history-turn-count">${turnSummary(turn)}</span></button>
        <ul class="history-lines"${open ? '' : ' hidden'}>${turn.lines.slice().reverse().map(line => {
          const expanded = historyOpen.get(line.key) ?? false;
          const more = line.children.length ? `<button class="history-more" data-log-toggle="${line.key}" aria-expanded="${expanded}" aria-label="${expanded ? 'Esconder' : 'Mostrar'} os detalhes (${line.children.length})">${line.children.length}<span class="history-caret" aria-hidden="true"></span></button>` : '';
          return `<li class="history-line${line.actor !== undefined && line.actor === you ? ' mine' : ''}"><div class="history-row">${historyItem(line)}${more}</div>${line.children.length && expanded
            ? `<ul class="history-details">${line.children.map(child => `<li>${historyItem(child)}</li>`).join('')}</ul>` : ''}</li>`;
        }).join('') || '<li class="history-line history-empty">Nenhuma jogada ainda.</li>'}</ul></li>`;
    }).join('') || '<li class="history-empty">As jogadas aparecerão aqui.</li>');
  }
  return {
    render,
    /** Abre ou fecha um turno ou uma linha (o botão diz como está agora). */
    toggle(key: string, open: boolean) { historyOpen.set(key, open); render(); },
    card: (key: string) => historyCards.get(key),
  };
}
