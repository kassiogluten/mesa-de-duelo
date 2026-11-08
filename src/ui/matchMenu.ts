// O menu da partida e a barra do topo, a cada desenho: formato e sala, quem assiste, as saídas (desistir, parar de
// assistir, fechar a sala de teste), recomeçar, o placar da melhor de três e o botão Desfazer.
import type { FState } from '../forge/client';
import { matchBarHTML, matchFormatName, seriesText } from './matchBar';
import { undoButtonState } from './undo';
import { finder } from './dom';

/** `labClose`: a mesa sabe voltar ao Laboratório (sala de teste). */
export function syncMatchMenu(root: HTMLElement, s: FState, o: { multiplayer: boolean; labClose: boolean; setHTML(el: HTMLElement, html: string): void }) {
  const $ = finder(root);
  const formatName = matchFormatName(s);
  $('#fFormatTag').textContent = formatName; $('#fFormatTag').hidden = !formatName;
  $('#fRoomTag').textContent = s.room && !s.room.computer ? `Sala ${s.room.code}` : '';
  $('#fRoomTag').hidden = !s.room || !!s.room.computer;
  const audience = s.room?.spectators ?? s.audience?.spectators ?? [];
  // Contra o computador a partida entra na lista de salas para assistir; o jogador pode tirá-la (e quem assiste sai).
  const watchable = $('#fMenuWatchable');
  watchable.hidden = !s.audience || !!s.watching;
  watchable.querySelector('.game-menu-label')!.textContent = s.audience?.listed ? 'Tirar da lista de salas' : 'Deixar assistirem (lista de salas)';
  $('#fAudience').textContent = audience.length ? `Assistindo: ${audience.join(', ')}` : '';
  $('#fAudience').hidden = !audience.length;
  // Na sala de teste, a saída é fechar a sala e voltar ao Laboratório, em vez de desistir.
  const lab = !!s.room?.lab && !s.watching && o.labClose;
  $('#fMenuLab').hidden = !lab;
  // Com o jogo em andamento, a saída é Conceder (que pergunta se continua na mesa ou sai). Fora dele, Sair da partida,
  // menos entre os jogos da melhor de três, em que o painel do sideboard tem Desistir da série.
  const me = s.players.find(p => p.id === s.you);
  const playing = !lab && !s.watching && !s.gameOver && !!me && !me.eliminated;
  $('#fMenuConcede').hidden = !playing;
  $('#fMenuExit').hidden = lab || playing || (!s.watching && !!s.sideboarding);
  $('#fMenuExit').querySelector('.game-menu-label')!.textContent = s.watching ? 'Parar de assistir' : 'Sair da partida';
  // Em rede não dá para recomeçar no meio: a revanche só existe no fim da partida, com os dois de acordo.
  $('#fMenuRematch').hidden = !!s.room || (s.config?.matchLength === 'bo3' && !s.match?.over);
  // O placar só existe na melhor de três; numa partida única, "Jogo 1 · 0 × 0" não diz nada.
  const series = seriesText(s);
  $('#fSeries').hidden = !series; $('#fSeries').textContent = series;
  // Na barra do topo ficam o placar e quem caiu; formato e sala ficam no menu. No Commander com vários jogadores a
  // faixa é dos assentos e o placar também fica só no menu.
  o.setHTML($('#fMatchBar'), o.multiplayer ? '' : matchBarHTML(s));
  const undoButton = undoButtonState(s), undoEl = $('#fUndo') as HTMLButtonElement;
  undoEl.hidden = undoButton.hidden; undoEl.disabled = undoButton.disabled;
  undoEl.title = undoButton.title; undoEl.setAttribute('aria-label', undoButton.title || 'Desfazer');
}
