import type { FState } from '../forge/client';
import { esc } from './cardtext';

/*
 * Em rede, quando um jogador cai ou demora mais de 2 minutos para decidir: a faixa com o botão para votar e pular o
 * turno (de quem caiu) ou a vez (de quem demora, até o fim do turno). Só votam os que estão online, e passa com a
 * maioria deles. A ponte confere tudo de novo; a faixa só mostra e manda o voto.
 */

export interface Offline { id: number; name: string }

type SkipState = Pick<FState, 'room' | 'players' | 'you' | 'gameOver'> & { skip?: FState['skip'] };

/** Jogadores desconectados que ainda estão no jogo (nunca você mesmo). */
export function offlinePlayers(s: Pick<FState, 'room' | 'players' | 'you' | 'gameOver'>): Offline[] {
  if (!s.room?.started || s.gameOver) return [];
  return s.room.players
    .filter(p => !p.connected && !p.eliminated && p.playerId !== undefined && p.playerId !== s.you)
    .map(p => ({ id: p.playerId!, name: s.players.find(x => x.id === p.playerId)?.name ?? p.name }));
}

/** Jogadores conectados que a mesa espera há mais de 2 minutos (nunca você mesmo), segundo a ponte. */
export function slowPlayers(s: SkipState): Offline[] {
  if (!s.room?.started || s.gameOver) return [];
  return (s.skip?.slow ?? []).filter(id => id !== s.you)
    .map(id => ({ id, name: s.players.find(x => x.id === id)?.name ?? '' })).filter(p => p.name);
}

/** hideVote: a votação está na janela do centro (voteDialog), então a faixa não a repete. */
export function skipBarHTML(s: Pick<FState, 'room' | 'players' | 'you' | 'gameOver' | 'skip' | 'spectating'>, hideVote = false): string {
  const offline = offlinePlayers(s), slow = slowPlayers(s);
  const vote = s.skip?.vote;
  const skipping = new Set(s.skip?.skipping ?? []);
  if (!offline.length && !slow.length && !vote && !skipping.size) return '';
  const rows: string[] = [];
  if (vote && !hideVote) {
    const mine = vote.mine;
    const what = vote.slow ? 'a vez' : 'o turno';
    const title = vote.target === s.you ? `Pular a sua vez?` : `Pular ${what} de ${esc(vote.name)}?`;
    rows.push(`<div class="skip-row vote" role="group" aria-label="${esc(`Votação para pular ${what} de ${vote.name}`)}">
      <span class="skip-text"><strong>${title}</strong>
        <small>Sim ${vote.yes} · Não ${vote.no} · precisa de ${vote.needed} ${vote.needed === 1 ? 'voto' : 'votos'} entre ${vote.voters} online</small></span>
      ${vote.canVote ? `<span class="skip-actions">
        <button type="button" class="arena-btn ${mine === 'yes' ? 'primary' : 'secondary'}" data-skip-vote="${vote.target}" data-value="true" aria-pressed="${mine === 'yes'}">Sim</button>
        <button type="button" class="arena-btn ${mine === 'no' ? 'primary' : 'secondary'}" data-skip-vote="${vote.target}" data-value="false" aria-pressed="${mine === 'no'}">Não</button>
      </span>` : `<span class="skip-note">${vote.target === s.you ? 'Decida a sua jogada para encerrar a votação.' : 'Você não vota nesta.'}</span>`}
    </div>`);
  }
  if (skipping.has(s.you) && !s.spectating) rows.push(`<div class="skip-row approved"><span class="skip-text"><strong>A mesa está passando a sua vez.</strong><small>A votação passou: até o fim deste turno, a mesa passa a vez no seu lugar, sem jogar nada.</small></span></div>`);
  for (const p of offline) {
    if (vote?.target === p.id) continue;
    if (skipping.has(p.id)) {
      rows.push(`<div class="skip-row approved"><span class="skip-text"><strong>${esc(p.name)} caiu.</strong><small>O turno será pulado: a mesa passa a vez no lugar dessa pessoa, sem jogar nada.</small></span></div>`);
      continue;
    }
    rows.push(`<div class="skip-row"><span class="skip-text"><strong>${esc(p.name)} caiu.</strong><small>A partida espera a volta. Quem está online pode votar para pular o turno.</small></span>
      ${s.spectating || vote ? '' : `<button type="button" class="arena-btn secondary" data-skip-vote="${p.id}" data-value="true">Votar para pular o turno</button>`}</div>`);
  }
  const offlineIds = new Set(offline.map(p => p.id));
  for (const id of skipping) {
    const p = s.players.find(x => x.id === id);
    if (!p || id === s.you || offlineIds.has(id)) continue;
    rows.push(`<div class="skip-row approved"><span class="skip-text"><strong>A vez de ${esc(p.name)} está sendo pulada.</strong><small>Até o fim deste turno, a mesa passa a vez no lugar dessa pessoa, sem jogar nada.</small></span></div>`);
  }
  for (const p of slow) {
    if (vote?.target === p.id || skipping.has(p.id)) continue;
    rows.push(`<div class="skip-row"><span class="skip-text"><strong>${esc(p.name)} está demorando.</strong><small>A mesa espera há mais de 2 minutos. Quem está online pode votar para pular a vez até o fim deste turno.</small></span>
      ${s.spectating || vote ? '' : `<button type="button" class="arena-btn secondary" data-skip-vote="${p.id}" data-value="true">Votar para pular a vez</button>`}</div>`);
  }
  return rows.join('');
}
