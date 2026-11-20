// Game Changers na mesa: as cartas da lista oficial do Commander que contam nesta partida (só nas com as regras do Commander) e o selo de gema que elas levam na pilha e no campo.
import type { FCard, FState } from '../forge/client';
import { isGameChanger } from '../brackets';
import { commanderRules } from '../decks';
import { ICON_GEM } from './icons';
import { esc } from './cardtext';

/** O que o balão do selo diz. */
export const GAME_CHANGER_TIP = 'Game Changer: carta da lista oficial do Commander, das que mais pesam no bracket do deck';

/** Carta que leva o selo nesta partida: da lista, de frente para cima e não uma ficha (a cópia de uma não conta). */
export function gameChangerCard(s: Pick<FState, 'config'>, card: Pick<FCard, 'name'> & Partial<Pick<FCard, 'token' | 'faceDown'>> | undefined) {
  return !!card?.name && !card.token && !card.faceDown && commanderRules(s.config?.format) && isGameChanger(card.name);
}

/** O selo de gema, no canto de cima à direita da carta. */
export const gameChangerBadge = () => `<span class="badge game-changer" title="${esc(GAME_CHANGER_TIP)}">${ICON_GEM}</span>`;
