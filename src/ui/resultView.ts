// O fim de cada jogo: a janela de resultado (com o resumo, a revanche e as saídas), a barra de quem assiste e as janelas
// de conexão caída. O painel de sideboard entre os jogos fica em sideboardView.ts.
import type { FState } from '../forge/client';
import { esc } from './cardtext';
import { tablePlayers } from './commanderTable';
import { lossReasonText } from './lossReason';
import { gameSummaryHTML } from './lifeChart';
import { turnTimeText } from './phaseHud';
import { ICON_FLAG, ICON_EYE, ICON_HOME, ICON_REPLAY } from './icons';
import type { EndingTitle, GameHighlight } from './gameEnding';
import './gameEnding.css';

/** O coração da vitória por um fio, batendo devagar. */
const HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2z" fill="currentColor"/></svg>';

export function gameResult(s: FState) {
  const played = s.match?.gameMs != null ? ` · ${turnTimeText(s.match.gameMs)} de jogo` : '';
  const quitter = s.match?.abandoned ? s.match.concededBy : undefined;
  // Desistência (entre os jogos ou saindo da sala): quem desistiu perde e o outro vence, com o placar dos jogos.
  if (quitter) {
    const mine = !s.watching && quitter === tablePlayers(s).me?.name;
    const series = s.config?.matchLength === 'bo3' ? ' da série' : '';
    const score = `Placar: ${s.match!.wins.join(' × ')}`;
    if (s.watching) return { tone: 'draw', title: `${esc(quitter)} desistiu${series}`, detail: score };
    return { tone: mine ? 'lose' : 'win', title: mine ? 'Derrota' : 'Vitória', detail: `${mine ? 'Você desistiu' : `${esc(quitter)} desistiu`}${series} · ${score}` };
  }
  const abandoned = !!s.match?.abandoned;
  // Quem assiste não vence nem perde: o título diz quem venceu.
  if (s.watching) return {
    tone: 'draw',
    title: abandoned ? 'Partida encerrada' : s.winner ? `${esc(s.winner)} venceu` : 'Empate',
    detail: abandoned ? `Placar: ${s.match!.wins.join(' × ')}${played}` : `Turno ${s.turn}${played}`,
  };
  const me = tablePlayers(s).me;
  const won = !abandoned && s.winner === me?.name;
  // Na derrota, o motivo numa linha própria: "Eliminado: sua vida chegou a 0."
  const reason = !abandoned && !won && s.winner && me ? lossReasonText(s, me, true) : null;
  return {
    tone: won ? 'win' : !abandoned && s.winner ? 'lose' : 'draw',
    title: abandoned ? 'Partida encerrada' : won ? 'Vitória' : s.winner ? 'Derrota' : 'Empate',
    detail: abandoned ? `Placar: ${s.match!.wins.join(' × ')}${played}` : `Turno ${s.turn}${played}${s.winner ? ` · ${esc(s.winner)} venceu` : ''}${reason ? `<br>Eliminado: ${esc(reason)}.` : ''}`,
  };
}

/** Quem assiste: o aviso e um botão por jogador, para ver a partida da mesa de cada um. */
export function watchBarHTML(s: FState) {
  const seats = s.players.map(p => `<button class="arena-btn ${p.id === s.you ? 'primary' : 'secondary'}" data-ui="watch-player" data-player="${p.id}" aria-pressed="${p.id === s.you}" title="${esc(p.name)}">${esc(p.name)}</button>`).join('');
  return `<span class="spectating-label">Assistindo. Ver a mesa de:</span><span class="watch-seats" role="group" aria-label="Ver a mesa de">${seats}</span>`;
}

export function rematchButton(s: FState) {
  const r = s.room;
  if (s.watching) return '';
  if (!r) return '<button class="arena-btn primary" data-ui="rematch">Jogar de novo</button>';
  const mine = r.players[r.seat];
  const others = r.players.filter((_, index) => index !== r.seat);
  if (!others.length || others.some(p => !p.connected)) return '';
  if (mine?.rematch) return `<button class="arena-btn primary" disabled>${others.length > 1 ? 'Aguardando os jogadores…' : 'Aguardando o oponente…'}</button>`;
  return `<button class="arena-btn primary" data-ui="rematch">${others.some(p => p.rematch) ? 'Aceitar revanche' : 'Pedir revanche'}</button>`;
}

export function rematchNote(s: FState) {
  const room = s.room;
  if (!room) return '';
  return room.players.filter((_, index) => index !== room.seat).map(other => !other.connected ? `<p class="q-hint">${esc(other.name)} saiu da sala.</p>` : other.rematch ? `<p class="q-hint">${esc(other.name)} quer jogar de novo.</p>` : '').join('');
}

/** "Relatar um problema" no fim de um jogo: abre o relato já em "Algo deu errado", com a partida que acabou anexada. */
export function reportButton(feedback: boolean) {
  return feedback ? `<button class="result-report" data-ui="result-report" aria-haspopup="dialog">${ICON_FLAG}Relatar um problema</button>` : '';
}

export function lifeDetails(s: FState, open: boolean, ptName: (name: string) => string) {
  const summary = gameSummaryHTML(s, ptName);
  return summary ? `<details class="life-details" data-life-details${open ? ' open' : ''}><summary>Ver gráfico de vida</summary>${summary}</details>` : '';
}
/**
 * Os títulos do jogo (a virada, em dourado; a vitória por um fio, com o coração batendo) e o destaque do jogo, com o
 * botão para ver a jogada de novo na mesa. `art`: a miniatura da carta do destaque.
 */
export function endingHTML(titles: EndingTitle[], highlight: GameHighlight | null, art?: string) {
  const ribbons = titles.map(t => `<div class="ending-title ${t.kind}"><b>${t.kind === 'thread' ? HEART : ''}<span>${t.title}</span></b><small>${esc(t.detail)}</small></div>`).join('');
  const thumb = art ? `<span class="gh-thumb" style="background-image:url('${art}')" aria-hidden="true"></span>` : '';
  const best = highlight ? `<div class="game-highlight">${thumb}<span class="gh-body"><b>Destaque do jogo · ${highlight.kind}</b><span>${esc(highlight.text)}</span></span>
    <button class="arena-btn secondary gh-replay" data-ui="result-replay">${ICON_REPLAY}Ver de novo</button></div>` : '';
  return `${ribbons ? `<div class="ending-titles">${ribbons}</div>` : ''}${best}`;
}

/** A janela do fim do jogo: quem venceu, os títulos e o destaque, o resumo (gráfico de vida), a revanche e as saídas. */
export function resultHTML(s: FState, o: { result: ReturnType<typeof gameResult>; summary: string; still: boolean; lab: boolean; feedback: boolean; ending?: string }) {
  return `<div role="dialog" aria-modal="true" aria-label="Resultado da partida" class="result ${o.result.tone}${o.summary ? ' has-summary' : ''}${o.still ? ' still' : ''}">
    <h2>${o.result.title}</h2><p>${o.result.detail}</p>
    ${o.ending ?? ''}
    ${o.summary}
    ${rematchNote(s)}
    <div class="result-btns">${rematchButton(s)}<button class="arena-btn secondary" data-ui="observe">${ICON_EYE}Ver campo de batalha</button>${o.lab ? `<button class="arena-btn secondary" data-ui="lab-close">${ICON_HOME}Laboratório</button>` : `<button class="arena-btn secondary" data-ui="exit">${ICON_HOME}Início</button>`}</div>
    ${reportButton(o.feedback)}
  </div>`;
}
/** A conexão caiu e o navegador tenta voltar sozinho. */
export function reconnectingHTML(attempt: number) {
  return `<div role="dialog" aria-modal="true" aria-label="Reconectando" class="result draw still"><h2>Reconectando…</h2>
    <p>A conexão com o servidor caiu. Voltando à partida${attempt > 1 ? ` (tentativa ${attempt})` : ''}.</p>
    <div class="result-btns"><button class="arena-btn secondary" data-ui="exit">${ICON_HOME}Início</button></div></div>`;
}
/** A conexão não voltou; `room`: partida em rede, que fica guardada no servidor. */
export function disconnectedHTML(reason: string | undefined, room: boolean) {
  return `<div role="dialog" aria-modal="true" aria-label="Conexão perdida" class="result draw"><h2>Conexão perdida</h2>
    <p>${reason ? esc(reason) : room ? 'Não consegui voltar sozinho. A partida fica guardada no servidor por alguns minutos.' : 'O servidor parou de responder.'}</p>
    <div class="result-btns"><button class="arena-btn primary" data-ui="rematch">${room ? 'Reconectar' : 'Tentar de novo'}</button><button class="arena-btn secondary" data-ui="exit">${ICON_HOME}Início</button></div></div>`;
}
