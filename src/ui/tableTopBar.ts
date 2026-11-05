// As faixas da mesa: a do turno novo (ou do combate extra), o menu da partida, o voto que a mesa espera de você (na
// janela do centro) e a faixa do alto com os outros votos e o desfazer.
import type { FState } from '../forge/client';
import { syncMatchMenu } from './matchMenu';
import { skipBarHTML } from './skipVote';
import { undoBarHTML } from './undo';
import { voteDialog } from './voteDialog';
import type { TableCtx } from './tableContext';
import type { createTurnBuzz } from './turnBuzz';

export interface TopBarDeps extends Pick<TableCtx, 'root' | '$' | 'setHTML' | 'opts' | 'match' | 'audio'> {
  showBanner(s: FState, newTurn: boolean): void;
  turnBuzz: ReturnType<typeof createTurnBuzz>;
}

export function createTableTopBar(d: TopBarDeps) {
  const { root, $ } = d;
  let lastCombat = '';
  /** O voto aberto na janela do centro, para avisar (som e vibração) só quando chega um novo. */
  let lastVoteKey = '';

  /** A faixa do turno novo ou do combate extra. */
  function banner(s: FState) {
    const match = d.match();
    const newTurn = s.turn !== match.lastTurn && !s.gameOver && s.turn > 0;
    // Um combate extra começando ganha a mesma faixa, no mesmo turno.
    const combatKey = `${s.turn}:${s.combatNumber ?? 0}`;
    const extraCombatStarts = !newTurn && !s.gameOver && (s.combatNumber ?? 0) > 1 && combatKey !== lastCombat;
    if (s.combatNumber) lastCombat = combatKey;
    if (newTurn || extraCombatStarts) {
      match.lastTurn = s.turn;
      d.showBanner(s, newTurn);
    }
  }
  /** O menu da partida, o voto do centro e a faixa do alto. */
  function bars(s: FState, multiplayer: boolean) {
    syncMatchMenu(root, s, { multiplayer, labClose: !!d.opts.onLabClose, setHTML: d.setHTML });
    // O voto que a mesa espera de você vai para o centro; a faixa do alto fica com o resto (quem falta, quem caiu).
    const vote = voteDialog(s);
    const skipBar = skipBarHTML(s, vote?.kind === 'skip') + (vote?.kind === 'undo' ? '' : undoBarHTML(s));
    const voteEl = $('#fVote');
    if (vote) {
      d.setHTML(voteEl, vote.html);
      voteEl.hidden = false;
      if (vote.key !== lastVoteKey) { d.audio.cue('turn-self', .45); d.turnBuzz.nudge(); }
    } else voteEl.hidden = true;
    lastVoteKey = vote?.key ?? '';
    d.setHTML($('#fSkipBar'), skipBar);
    $('#fSkipBar').hidden = !skipBar;
    $('#fMatchBar').hidden = multiplayer || !$('#fMatchBar').hasChildNodes();
  }
  return { banner, bars };
}
