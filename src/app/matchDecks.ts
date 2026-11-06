import type { DeckData } from '../decks';
import { deckBracket } from '../brackets';
import { deckCover } from '../ui/deckStats';
import type { MatchOwner } from '../forge/client';
import { contaSessao } from '../conta/session';
import { reportAuthor } from '../feedbackAuthor';

/** Os decks como vão para o servidor: a lista que a partida usa, a capa e o bracket, e a conta de quem joga. */

/** A sala de teste não tem deck: cada lado joga com as cartas do cenário montado no Laboratório. */
export const LAB_DECK: DeckData = { id: 'laboratorio', name: 'Laboratório', cards: [] };
/** Quem entra numa sala sem deck: escolhe lá dentro, e até lá a mesa guarda este no lugar do deck. */
export const NO_DECK: DeckData = { id: '', name: '', cards: [] };

export const forgeDeck = (d: DeckData) => ({ name: d.name, cards: d.cards, sideboard: d.sideboard ?? [], commanders: d.commanders ?? [], ...(d.tokens?.length ? { tokens: d.tokens } : {}) });
/** Com a conta conectada, a partida fica ligada a ela e ao deck salvo (Minhas partidas). */
export const matchOwner = (d: DeckData, session = contaSessao()): MatchOwner => session ? { conta: session.token, deckId: d.id } : {};
/** O deck que acompanha host, join e room-deck: a lista, a capa, o bracket e a conta; sem deck, só deck: null. */
export const seatDeck = (d: DeckData | null) => d ? { deck: forgeDeck(d), cover: deckCover(d), bracket: deckBracket(d), ...matchOwner(d) } : { deck: null };
/** Deck escolhido para o computador, com o bracket junto para a mesa mostrar na partida. */
export const aiDeck = (d: DeckData) => ({ ...forgeDeck(d), bracket: deckBracket(d) });
/** O nome das salas ou o apelido da conta, para o histórico das partidas contra o computador; nada sem nome. */
export const playerName = (): { name?: string } => { const name = reportAuthor()?.name; return name ? { name } : {}; };
