import type { FState } from '../forge/client';
import { esc } from './cardtext';

/*
 * O voto que a mesa espera de você, no centro da tela (item 82): o pedido de desfazer de outro jogador e a votação
 * para pular o turno de quem caiu. Bloqueia a mesa até você votar, porque a partida fica parada esperando. Depois do
 * voto (ou com o pedido resolvido), volta a faixa do alto, que mostra quem ainda falta.
 */

export interface VoteDialog {
  /** Muda quando chega outro pedido: a janela toca o aviso e pega o foco de novo. */
  key: string;
  kind: 'undo' | 'skip';
  html: string;
}

type VoteState = Pick<FState, 'undo' | 'skip' | 'spectating' | 'gameOver'>;

export function voteDialog(s: VoteState): VoteDialog | null {
  if (s.spectating || s.gameOver) return null;
  const r = s.undo?.request;
  if (r && !r.mine && r.canVote && !r.vote) return {
    key: `undo:${r.player ?? r.name}:${r.step.turn}:${r.step.text}`, kind: 'undo',
    html: `<section class="vote-dialog" role="alertdialog" aria-modal="true" aria-labelledby="fVoteTitle" aria-describedby="fVoteText">
      <p class="vote-kicker">Pedido de desfazer</p>
      <h2 id="fVoteTitle">${esc(r.name)} pediu para desfazer</h2>
      <p class="vote-step">${esc(r.step.text.charAt(0).toUpperCase() + r.step.text.slice(1))}</p>
      <p class="vote-help" id="fVoteText">A mesa volta para antes dessa decisão, para todos. Só volta se todos aceitarem.</p>
      <div class="vote-actions"><button type="button" class="arena-btn secondary" data-undo="no">Recusar</button><button type="button" class="arena-btn primary" data-undo="yes" data-vote-start>Aceitar</button></div>
    </section>`,
  };
  const v = s.skip?.vote;
  if (v && v.canVote && !v.mine) return {
    key: `skip:${v.target}`, kind: 'skip',
    html: `<section class="vote-dialog" role="alertdialog" aria-modal="true" aria-labelledby="fVoteTitle" aria-describedby="fVoteText">
      <p class="vote-kicker">Votação</p>
      <h2 id="fVoteTitle">Pular ${v.slow ? 'a vez' : 'o turno'} de ${esc(v.name)}?</h2>
      <p class="vote-help" id="fVoteText">${v.slow
        ? `${esc(v.name)} está demorando: a mesa espera há mais de 2 minutos. Com a vez pulada, a mesa passa a vez no lugar dessa pessoa até o fim deste turno, sem jogar nada.`
        : `${esc(v.name)} caiu e a partida está esperando. Com o turno pulado, a mesa passa a vez no lugar dessa pessoa, sem jogar nada.`} Precisa de ${v.needed} ${v.needed === 1 ? 'voto' : 'votos'} entre ${v.voters} online.</p>
      <div class="vote-actions"><button type="button" class="arena-btn secondary" data-skip-vote="${v.target}" data-value="false">Não</button><button type="button" class="arena-btn primary" data-skip-vote="${v.target}" data-value="true" data-vote-start>Sim, pular</button></div>
    </section>`,
  };
  return null;
}
