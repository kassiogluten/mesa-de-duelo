// A janela grande do centro da mesa: a troca de cartas com o sideboard entre os jogos, o fim da partida (com o momento
// antes do resultado, em que o retrato de quem perdeu racha) e o resultado, e os avisos de conexão caída.
import type { FState } from '../forge/client';
import { ptOf } from './cardFaces';
import { statsDetailsHTML, statsHighlightsHTML } from './matchStats';
import { disconnectedHTML, gameResult, lifeDetails, reconnectingHTML, resultHTML } from './resultView';
import { createSideboardPanel } from './sideboardPanel';
import type { TableCtx } from './tableContext';

export type OverlayDeps = Pick<TableCtx, 'root' | '$' | 'setHTML' | 'opts' | 'state' | 'match' | 'timeline' | 'motion' | 'render' | 'syncModal'>;

export function createTableOverlay(d: OverlayDeps) {
  const { root, $ } = d;
  // Fim da partida (o momento antes do resultado).
  let finaleKey = '', finaleUntil = 0, wasPlaying = false;
  /**
   * O gráfico de vida e a tabela de números do jogo que acabou ficam recolhidos (no resultado e entre os jogos);
   * abertos ou fechados, continuam assim ao redesenhar.
   */
  let lifeDetailsOpen = false, statsOpen = false;
  // "toggle" não sobe pela árvore: a escuta é na captura.
  root.addEventListener('toggle', e => {
    const t = e.target as HTMLElement;
    if (t.matches?.('[data-life-details]')) lifeDetailsOpen = (t as HTMLDetailsElement).open;
    if (t.matches?.('[data-stats-details]')) statsOpen = (t as HTMLDetailsElement).open;
  }, true);
  const detailsHTML = (s: FState) => statsDetailsHTML(s, statsOpen) + lifeDetails(s, lifeDetailsOpen, name => ptOf(name)?.name || name);
  const sideboard = createSideboardPanel(d, detailsHTML);

  function render(s: FState) {
    const match = d.match();
    if (!s.gameOver) match.observing = false;
    // Fim da partida visto ao vivo: antes do resultado, o retrato de quem perdeu racha e o de quem ganhou acende.
    const overKey = s.gameOver ? `${d.timeline.matchId}:${s.match?.gameNumber ?? 1}` : '';
    if (s.gameOver && overKey !== finaleKey) {
      finaleKey = overKey;
      if (wasPlaying && !s.match?.abandoned && !match.disconnected) {
        const winners = s.players.filter(p => s.winner && p.name === s.winner).map(p => p.id);
        const losers = s.winner ? s.players.filter(p => p.name !== s.winner).map(p => p.id) : [];
        const ms = d.motion.finale(winners, losers);
        if (ms) { finaleUntil = performance.now() + ms; window.setTimeout(() => d.render(), ms + 20); }
      }
    }
    wasPlaying = !s.gameOver;
    const ov = $('#fOverlay');
    if (s.sideboarding && !match.disconnected && !s.match?.over) {
      sideboard.paint(ov, s);
      ov.hidden = false;
    } else if (s.gameOver && !match.disconnected && match.observing) {
      ov.hidden = true; ov.dataset.html = '';
    } else if (s.gameOver && !match.disconnected && performance.now() < finaleUntil) {
      ov.hidden = true; ov.dataset.html = '';
    } else if (s.gameOver && !match.disconnected) {
      const result = gameResult(s);
      // Os quatro números de quem joga à vista; a tabela de todos e o gráfico de vida, recolhidos.
      const summary = statsHighlightsHTML(s) + detailsHTML(s);
      const html = resultHTML(s, { result, summary, still: !ov.hidden, lab: !!s.room?.lab && !!d.opts.onLabClose, feedback: !!d.opts.onFeedback });
      if (ov.hidden || ov.dataset.html !== html) { ov.innerHTML = html; ov.dataset.html = html; }
      ov.hidden = false;
    } else if (!match.disconnected) { ov.hidden = true; ov.dataset.html = ''; }
  }

  /** Cliques na troca com o sideboard (sideboardPanel.ts). True quando tratou. */
  const click = (t: HTMLElement) => sideboard.click(t);

  /** Aviso de conexão caída: tentando voltar (`attempt`) ou de vez (`reason`, com sala ou não). */
  function connection(html: string) {
    const ov = $('#fOverlay');
    ov.hidden = false;
    ov.dataset.html = '';
    ov.innerHTML = html;
    d.syncModal();
  }
  return {
    render, click,
    reconnecting(attempt: number) { connection(reconnectingHTML(attempt)); },
    disconnected(reason: string | undefined, room: boolean) { connection(disconnectedHTML(reason, room)); },
  };
}
