import type { FState } from '../forge/client';
import { esc } from './cardtext';

/*
 * Em rede, quando um jogador cai: a faixa com o botão para votar e pular o turno dele. Só votam os que estão
 * online, e passa com a maioria deles. A ponte confere tudo de novo; a faixa só mostra e manda o voto.
 */

export interface Offline { id: number; name: string }

/** Jogadores desconectados que ainda estão no jogo (nunca você mesmo). */
export function offlinePlayers(s: Pick<FState, 'room' | 'players' | 'you' | 'gameOver'>): Offline[] {
  if (!s.room?.started || s.gameOver) return [];
  return s.room.players
    .filter(p => !p.connected && !p.eliminated && p.playerId !== undefined && p.playerId !== s.you)
    .map(p => ({ id: p.playerId!, name: s.players.find(x => x.id === p.playerId)?.name ?? p.name }));
}

export function skipBarHTML(s: Pick<FState, 'room' | 'players' | 'you' | 'gameOver' | 'skip' | 'spectating'>): string {
  const offline = offlinePlayers(s);
  const vote = s.skip?.vote;
  const skipping = new Set(s.skip?.skipping ?? []);
  if (!offline.length && !vote && !skipping.size) return '';
  const rows: string[] = [];
  if (vote) {
    const mine = vote.mine;
    rows.push(`<div class="skip-row vote" role="group" aria-label="${esc(`Votação para pular o turno de ${vote.name}`)}">
      <span class="skip-text"><strong>Pular o turno de ${esc(vote.name)}?</strong>
        <small>Sim ${vote.yes} · Não ${vote.no} · precisa de ${vote.needed} ${vote.needed === 1 ? 'voto' : 'votos'} entre ${vote.voters} online</small></span>
      ${vote.canVote ? `<span class="skip-actions">
        <button type="button" class="arena-btn ${mine === 'yes' ? 'primary' : 'secondary'}" data-skip-vote="${vote.target}" data-value="true" aria-pressed="${mine === 'yes'}">Sim</button>
        <button type="button" class="arena-btn ${mine === 'no' ? 'primary' : 'secondary'}" data-skip-vote="${vote.target}" data-value="false" aria-pressed="${mine === 'no'}">Não</button>
      </span>` : '<span class="skip-note">Você não vota nesta.</span>'}
    </div>`);
  }
  for (const p of offline) {
    if (vote?.target === p.id) continue;
    if (skipping.has(p.id)) {
      rows.push(`<div class="skip-row approved"><span class="skip-text"><strong>${esc(p.name)} caiu.</strong><small>O turno será pulado: a mesa passa a vez no lugar dessa pessoa, sem jogar nada.</small></span></div>`);
      continue;
    }
    rows.push(`<div class="skip-row"><span class="skip-text"><strong>${esc(p.name)} caiu.</strong><small>A partida espera a volta. Quem está online pode votar para pular o turno.</small></span>
      ${s.spectating || vote ? '' : `<button type="button" class="arena-btn secondary" data-skip-vote="${p.id}" data-value="true">Votar para pular o turno</button>`}</div>`);
  }
  return rows.join('');
}
