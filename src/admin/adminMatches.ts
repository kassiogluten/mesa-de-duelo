import { esc } from '../ui/cardtext';
import { FORMATS, when } from './adminShared';

/** A aba Partidas: as partidas vivas na ponte e o histórico do mês, como HTML a partir do que a ponte devolve. */
export interface LiveMatch {
  code: string; room: boolean; watchable?: boolean; format: string; matchLength: string; playerCount: number; createdAt: string; startedAt?: string; matchId: string;
  state: string; gameNumber: number; turn?: number; phase?: string; activePlayer?: string;
  players: { name: string; ai: boolean; seat?: number; connected?: boolean; conceded?: boolean; deck?: string; life?: number; lost?: boolean }[];
}
const ago = (iso: string) => {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  return s < 60 ? `${s} s` : s < 3600 ? `${Math.floor(s / 60)} min` : `${Math.floor(s / 3600)} h ${Math.floor(s / 60) % 60} min`;
};

/** As partidas vivas, com quantos jogam e quantos estão conectados. */
export function liveMatchesHTML(matches: LiveMatch[], contas?: { total: number; aparelhos: number }) {
  const playing = matches.filter(m => m.state === 'jogando').length;
  const online = matches.reduce((n, m) => n + m.players.filter(p => !p.ai && p.connected).length, 0);
  return `<div class="adm-head"><h1>Partidas</h1><p class="adm-muted">${[`${playing} jogando`, matches.length > playing ? `${matches.length - playing} esperando ou encerrando` : null, `${online} ${online === 1 ? 'jogador conectado' : 'jogadores conectados'}`,
      contas && `${contas.total} ${contas.total === 1 ? 'conta' : 'contas'} (${contas.aparelhos} ${contas.aparelhos === 1 ? 'aparelho conectado' : 'aparelhos conectados'})`, `atualizado às ${new Date().toLocaleTimeString('pt-BR')}`].filter(Boolean).join(' · ')}</p>
        <button class="adm-ghost" data-act="matches">Atualizar</button></div>
      ${matches.length ? `<ul class="adm-matches">${matches.map(m => `<li class="adm-card adm-match">
        <div class="adm-row-top"><strong>${esc(m.room ? `Sala ${m.code}` : 'Contra o computador')}</strong><span class="adm-status s-${m.state === 'jogando' ? 'resolvido' : m.state === 'aguardando' ? 'novo' : 'visto'}">${esc(m.state)}</span>
          <time>${m.startedAt ? `há ${ago(m.startedAt)}` : `criada há ${ago(m.createdAt)}`}</time></div>
        <p class="adm-muted">${esc([FORMATS[m.format] ?? m.format, m.matchLength === 'bo3' ? `melhor de três, jogo ${m.gameNumber}` : null, `${m.playerCount} jogadores`,
          m.turn ? `turno ${m.turn}` : null, m.phase, m.activePlayer && `vez de ${m.activePlayer}`].filter(Boolean).join(' · '))}</p>
        <ul class="adm-players">${m.players.map(p => `<li class="${p.lost || p.conceded ? 'out' : ''}"><span class="adm-dot ${p.ai ? 'ai' : p.connected ? 'on' : 'off'}" title="${p.ai ? 'Computador' : p.connected ? 'Conectado' : 'Desconectado'}"></span>
          <strong>${esc(p.name)}</strong>${p.ai ? ' <span class="adm-muted">(IA)</span>' : ''}${p.life !== undefined ? ` · ${p.life} de vida` : ''}${p.lost ? ' · perdeu' : p.conceded ? ' · desistiu' : ''}
          ${p.deck ? `<span class="adm-muted"> · ${esc(p.deck)}</span>` : ''}</li>`).join('')}</ul>
        <p class="adm-muted adm-id">partida ${esc(m.matchId)}${m.room ? '' : ` · código ${esc(m.code)}`}${m.watchable ? ` · <a class="adm-watch" href="./?sala=${encodeURIComponent(m.code)}" target="_blank" rel="noopener">Assistir</a>` : ''}</p></li>`).join('')}</ul>` : '<p class="adm-empty">Nenhuma partida na ponte agora.</p>'}`;;
}

/** Uma partida gravada, como a ponte grava (veja MatchHistory.java): os índices apontam para players. */
export interface PastMatch {
  id: string; startedAt: string; endedAt: string; ms: number; format: string; length: string; mode: 'ia' | 'rede'; public?: boolean;
  /** Como acabou; as linhas gravadas antes do campo existir são todas concluídas. */
  end?: End;
  winner: number | null;
  players: { name?: string; ai: boolean; deck: string; colors: string; commander?: string; wins: number }[];
  games: { winner: number | null; turns: number; ms?: number; end?: string; result: string[]; mull: number[] }[];
}
const LOSS: Record<string, string> = { LifeReachedZero: 'vida', Conceded: 'desistência', Milled: 'grimório vazio', Poisoned: 'veneno', CommanderDamage: 'dano de comandante', SpellEffect: 'efeito de carta', OpponentWon: 'vitória de outro' };
export type End = 'concluida' | 'concedida' | 'queda';
const ENDS: Record<End, [string, string]> = { concluida: ['Concluídas', 'concluída'], concedida: ['Concedidas', 'concedida'], queda: ['Quedas', 'queda'] };
const endOf = (m: PastMatch): End => m.end ?? 'concluida';
const minutes = (ms: number) => ms < 60000 ? `${Math.round(ms / 1000)} s` : ms < 3600000 ? `${Math.round(ms / 60000)} min` : `${Math.floor(ms / 3600000)} h ${Math.round(ms / 60000) % 60} min`;
const monthName = (month: string) => new Date(`${month}-15T12:00:00Z`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
const playerName = (p: PastMatch['players'][number] | undefined, i: number) => p?.name ?? (p?.ai ? 'IA' : i === 0 ? 'Jogador' : `Jogador ${i + 1}`);
const average = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;

export interface HistoryState { month: string; months: string[]; end: End | ''; past: PastMatch[] }
/** O histórico do mês: totais (seguindo o filtro de como acabou), os decks mais jogados e cada partida. `thumbs`: as miniaturas dos comandantes. */
export function historyHTML({ month: historyMonth, months, end: historyEnd, past }: HistoryState, commanderThumbs: (commander?: string) => string) {
  // Os totais seguem o filtro de como a partida acabou.
  const shown = historyEnd ? past.filter(m => endOf(m) === historyEnd) : past;
  const count = (test: (m: PastMatch) => boolean) => shown.filter(test).length;
  const formats = Object.entries(FORMATS).map(([key, label]) => [label, count(m => m.format === key)] as const).filter(([, n]) => n);
  const games = shown.flatMap(m => m.games);
  // Decks humanos e da IA juntos: quantas partidas cada um jogou e quantas venceu.
  const decks = new Map<string, { played: number; won: number }>();
  for (const m of shown) m.players.forEach((p, i) => {
    const d = decks.get(p.deck) ?? { played: 0, won: 0 };
    d.played++; if (m.winner === i) d.won++;
    decks.set(p.deck, d);
  });
  const topDecks = [...decks].sort((a, b) => b[1].played - a[1].played || b[1].won - a[1].won).slice(0, 5);
  const tile = (label: string, value: string, detail = '') => `<div class="adm-card adm-tile${value.length > 12 ? ' long' : ''}"><span>${esc(label)}</span><strong>${esc(value)}</strong>${detail ? `<small>${esc(detail)}</small>` : ''}</div>`;
  const ending = (m: PastMatch, g: PastMatch['games'][number]) => {
    const losses = g.result.map((r, i) => LOSS[r] ? `${playerName(m.players[i], i)} por ${LOSS[r]}` : null).filter(Boolean).join(', ');
    if (g.end === 'Interrupted') return losses ? `interrompido (${losses})` : 'interrompido';
    return losses || (g.winner === null ? 'empate' : '');
  };
  const total = (end: End | '') => end ? past.filter(m => endOf(m) === end).length : past.length;
  return `<div class="adm-head"><h2>Histórico</h2><p class="adm-muted">${historyMonth ? `${shown.length} ${shown.length === 1 ? 'partida' : 'partidas'} em ${esc(monthName(historyMonth))}` : 'Nenhuma partida gravada ainda.'}</p>
      ${months.length ? `<label class="adm-month">Mês<select data-history-month>${months.map(m => `<option value="${m}"${m === historyMonth ? ' selected' : ''}>${esc(monthName(m))}</option>`).join('')}</select></label>` : ''}
      ${historyMonth ? `<label class="adm-month">Fim<select data-history-end>${(['', 'concluida', 'concedida', 'queda'] as const).map(e => `<option value="${e}"${e === historyEnd ? ' selected' : ''}>${e ? ENDS[e][0] : 'Todas'} (${total(e)})</option>`).join('')}</select></label>` : ''}
      <button class="adm-ghost" data-act="history">Atualizar</button>${historyMonth ? '<button class="adm-ghost" data-act="history-download">Baixar .jsonl</button>' : ''}</div>
    ${shown.length ? `<div class="adm-tiles">
      ${tile('Partidas', String(shown.length), `${count(m => m.mode === 'ia')} contra a IA · ${count(m => m.mode === 'rede')} em rede`)}
      ${tile('Formatos', formats.map(([label, n]) => `${label} ${n}`).join(' · '))}
      ${tile('Duração média', minutes(average(shown.map(m => m.ms))), `${games.length} ${games.length === 1 ? 'jogo' : 'jogos'} no total`)}
      ${tile('Turnos por jogo', average(games.map(g => g.turns)).toFixed(1).replace('.', ','), `${games.flatMap(g => g.mull).reduce((a, b) => a + b, 0)} mulligans`)}
      <div class="adm-card adm-tile adm-decks"><span>Decks mais jogados</span><ol>${topDecks.map(([deck, d]) => `<li><strong>${esc(deck)}</strong> <small>${d.played} ${d.played === 1 ? 'partida' : 'partidas'} · ${Math.round(100 * d.won / d.played)}% de vitórias</small></li>`).join('')}</ol></div>
    </div>
    <ul class="adm-past">${shown.map(m => `<li class="adm-card adm-past-row">
      <div class="adm-row-top"><strong>${esc([FORMATS[m.format] ?? m.format, m.length === 'bo3' ? 'melhor de três' : null].filter(Boolean).join(' · '))}</strong>
        <span class="adm-status">${m.mode === 'ia' ? 'contra a IA' : m.public ? 'sala pública' : 'sala privada'}</span>${endOf(m) !== 'concluida' ? `<span class="adm-status e-${endOf(m)}">${ENDS[endOf(m)][1]}</span>` : ''}<time>${when(m.endedAt)}</time></div>
      <ul class="adm-players">${m.players.map((p, i) => `<li class="${m.winner === i ? 'won' : ''}"><span class="adm-dot ${p.ai ? 'ai' : 'on'}"></span>${commanderThumbs(p.commander)}<strong>${esc(playerName(p, i))}</strong>
        <span class="adm-muted"> · ${esc(p.commander ?? p.deck)} (${esc(p.colors)})</span>${m.length === 'bo3' ? ` · ${p.wins} ${p.wins === 1 ? 'vitória' : 'vitórias'}` : ''}${m.winner === i ? ' · venceu' : ''}</li>`).join('')}</ul>
      <p class="adm-muted">${esc([minutes(m.ms), ...m.games.map((g, n) => `${m.games.length > 1 ? `jogo ${n + 1}: ` : ''}${g.turns} turnos${ending(m, g) ? `, ${ending(m, g)}` : ''}`)].join(' · '))}</p></li>`).join('')}</ul>`
    : historyMonth ? `<p class="adm-empty">${historyEnd ? `Nenhuma partida ${ENDS[historyEnd][1]} neste mês.` : 'Nenhuma partida neste mês.'}</p>` : ''}`;;
}
