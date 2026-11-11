/** A aba Ranking: os jogadores do histórico com partidas, vitórias e derrotas, no mês ou desde o começo. */
import { esc } from '../ui/cardtext';
import { FORMATS, when } from './adminShared';

/** Um jogador como a ponte conta (veja PlayerRanking.java): conta ou apelido; "-" junta quem jogou sem nenhum dos dois. */
export interface RankedPlayer {
  key: string; name?: string; account: boolean;
  played: number; won: number; lost: number; tied: number; conceded: number; dropped: number; last?: string;
  decks: Tally[]; opponents: Tally[];
  recent: { id: string; endedAt: string; format: string; mode: 'ia' | 'rede'; deck?: string; against: string; result: Result }[];
}
interface Tally { name: string; played: number; won: number }
type Result = 'vitoria' | 'derrota' | 'concedeu' | 'empate' | 'queda';

export type SortKey = 'won' | 'name' | 'played' | 'lost' | 'rate' | 'conceded' | 'dropped' | 'last';
export interface RankingState { month: string; months: string[]; matches: number; players: RankedPlayer[]; sort: SortKey; desc: boolean; open: string | null }

const COLUMNS: [SortKey, string, string][] = [
  ['name', 'Jogador', 'Nome ou apelido mais recente'], ['played', 'Partidas', 'Partidas jogadas, em rede e contra a IA'],
  ['won', 'Vitórias', 'Partidas vencidas'], ['lost', 'Derrotas', 'Partidas perdidas, contando as concedidas'],
  ['rate', '% vitórias', 'Vitórias sobre as partidas com resultado (a queda fica de fora)'],
  ['conceded', 'Concedidas', 'Partidas que o jogador concedeu'], ['dropped', 'Quedas', 'Partidas que acabaram sem vencedor porque alguém caiu'],
  ['last', 'Última', 'Fim da partida mais recente'],
];
const RESULTS: Record<Result, string> = { vitoria: 'venceu', derrota: 'perdeu', concedeu: 'concedeu', empate: 'empate', queda: 'queda' };

export const playerLabel = (p: RankedPlayer) => p.name ?? 'Sem apelido';
/** Vitórias sobre as partidas que tiveram resultado; null sem nenhuma. */
export const winRate = (p: RankedPlayer) => { const decided = p.won + p.lost + p.tied; return decided ? p.won / decided : null; };
const percent = (rate: number | null) => rate === null ? '—' : `${Math.round(100 * rate)}%`;
const monthName = (month: string) => new Date(`${month}-15T12:00:00Z`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

/** A ordem da tabela; empates seguem a ordem da ponte (vitórias, porcentagem, partidas). */
export function sortedPlayers(players: RankedPlayer[], sort: SortKey, desc: boolean): RankedPlayer[] {
  const value = (p: RankedPlayer): number | string => sort === 'name' ? playerLabel(p).toLocaleLowerCase('pt-BR') : sort === 'rate' ? winRate(p) ?? -1 : sort === 'last' ? p.last ?? '' : p[sort];
  return players.map((p, i) => ({ p, i })).sort((a, b) => {
    const x = value(a.p), y = value(b.p);
    const cmp = typeof x === 'string' ? x.localeCompare(y as string, 'pt-BR') : x - (y as number);
    return (desc ? -cmp : cmp) || a.i - b.i;
  }).map(({ p }) => p);
}

function detailHTML(p: RankedPlayer) {
  const tallies = (title: string, list: Tally[]) => `<div><h3>${title}</h3>${list.length ? `<ol>${list.map(t => `<li><strong>${esc(t.name)}</strong> <small>${t.played} ${t.played === 1 ? 'partida' : 'partidas'} · ${t.won} ${t.won === 1 ? 'vitória' : 'vitórias'}</small></li>`).join('')}</ol>` : '<p class="adm-muted">Nenhum.</p>'}</div>`;
  return `<div class="adm-rank-detail">${tallies('Decks mais usados', p.decks)}${tallies('Contra quem mais jogou', p.opponents)}
    <div class="adm-rank-recent"><h3>Últimas partidas</h3><ul>${p.recent.map(m => `<li><span class="adm-rank-result r-${m.result}">${RESULTS[m.result]}</span>
      <span>${esc(FORMATS[m.format] ?? m.format)}${m.deck ? ` · ${esc(m.deck)}` : ''} · contra ${esc(m.against || '—')}</span><time>${when(m.endedAt)}</time></li>`).join('')}</ul></div></div>`;
}

export function rankingHTML(s: RankingState) {
  const players = sortedPlayers(s.players, s.sort, s.desc);
  const period = s.month ? `em ${monthName(s.month)}` : 'desde o começo';
  const head = COLUMNS.map(([key, label, title]) => {
    const on = s.sort === key;
    return `<th scope="col"${on ? ` aria-sort="${s.desc ? 'descending' : 'ascending'}"` : ''}><button type="button" data-rank-sort="${key}" title="${esc(title)}">${label}${on ? (s.desc ? ' ▼' : ' ▲') : ''}</button></th>`;
  }).join('');
  const rows = players.map((p, i) => {
    const open = s.open === p.key;
    return `<tr class="${open ? 'on' : ''}"><td>${i + 1}</td><th scope="row"><button type="button" data-rank-player="${esc(p.key)}" aria-expanded="${open}">${esc(playerLabel(p))}</button>${p.account ? ' <span class="adm-status" title="Entrou com a conta">conta</span>' : ''}</th>
      <td>${p.played}</td><td>${p.won}</td><td>${p.lost}</td><td>${percent(winRate(p))}</td><td>${p.conceded}</td><td>${p.dropped}</td><td>${p.last ? when(p.last) : '—'}</td></tr>
      ${open ? `<tr class="adm-rank-open"><td colspan="${COLUMNS.length + 1}">${detailHTML(p)}</td></tr>` : ''}`;
  }).join('');
  return `<div class="adm-head"><h1>Ranking</h1><p class="adm-muted">${s.players.length} ${s.players.length === 1 ? 'jogador' : 'jogadores'} · ${s.matches} ${s.matches === 1 ? 'partida' : 'partidas'} ${period}</p>
      <label class="adm-month">Período<select data-rank-month><option value=""${s.month ? '' : ' selected'}>Desde o começo</option>${s.months.map(m => `<option value="${m}"${m === s.month ? ' selected' : ''}>${esc(monthName(m))}</option>`).join('')}</select></label>
      <button class="adm-ghost" data-act="ranking">Atualizar</button></div>
    <p class="adm-muted adm-rank-note">Partidas em rede e contra a IA juntas; a IA só aparece como oponente. Quem entrou com a conta é contado pela conta, os demais pelo apelido. Toque num jogador para ver os decks, os oponentes e as últimas partidas.</p>
    ${players.length ? `<div class="adm-card adm-rank-wrap"><table class="adm-rank"><thead><tr><th scope="col">#</th>${head}</tr></thead><tbody>${rows}</tbody></table></div>`
      : `<p class="adm-empty">Nenhuma partida ${period}.</p>`}`;
}
