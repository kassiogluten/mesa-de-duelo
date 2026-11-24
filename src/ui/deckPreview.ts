// Ver um deck a partir da tela inicial e de Meus decks: abre a tela de detalhes do deck (src/deckView/), que a página registra ao montar.
import type { DeckData } from '../decks';
import type { DeckViewActions } from '../deckView/view';

/**
 * As telas que listam decks só pedem para ver um; quem decide como abrir é a página (main.ts), que liga a tela de
 * detalhes e o endereço /deck/<id>. Assim a tela inicial e Meus decks não dependem dela.
 */
let opener: ((deck: DeckData, actions: DeckViewActions) => void) | null = null;
export function setDeckOpener(open: (deck: DeckData, actions: DeckViewActions) => void) { opener = open; }

/** As ações são as da tela de onde o deck foi aberto (escolher o deck, fazer a sua versão, editar). */
export function openDeckPreview(deck: DeckData, actions: DeckViewActions) { opener?.(deck, actions); }
