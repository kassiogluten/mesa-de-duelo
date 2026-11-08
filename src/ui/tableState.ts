import type { DeckEntry } from '../decks';
import type { BlockSelection } from './playContext';
import type { SeatFocus } from './seatVisibility';

/** Seleção em andamento na pergunta aberta. */
/** all: "usar em todas" na ordem das substituições (marcado até o jogador desmarcar). */
export type QuestionDraft = { id: number; picked: number[]; text: string; amounts: string[]; all?: boolean };

/**
 * O que a mesa guarda de uma partida aberta: `attach()` troca o objeto inteiro por um novo, então tudo que entra aqui
 * volta ao começo quando a mesa se liga a outra partida (ou à mesma, depois de reconectar pelo menu).
 * Preferências, elementos da tela, animações e sons ficam fora, porque valem entre partidas.
 */
export function newMatchState() {
  return {
    /** A ponte caiu (reconectando ou de vez): a mesa não manda mais nada até o próximo attach. */
    disconnected: false,
    lastTurn: 0,
    /** No fim do jogo, o jogador fechou o resultado para olhar a mesa; o resultado volta pelo painel de ações. */
    observing: false,
    /** Versão do prompt em que o jogador já clicou num botão; evita clique duplo até o Forge responder. */
    clickedGen: -1,
    qState: null as QuestionDraft | null,
    /** Cemitério, exílio etc. aberto (o jogador dono) ou o grupo de cartas iguais aberto. */
    zoneOf: null as number | null,
    groupIds: null as number[] | null,
    selectedBlocker: null as BlockSelection | null,
    stackGalleryOpen: false,
    stackMinimized: false,
    /** Dano de cada permanente no último desenho: a carta que levou mais dano pisca. */
    lastDamage: new Map<number, number>(),
    // Cartas da sua mão já mostradas. Uma carta nova com compra na fila fica escondida até a animação de compra chegar nela.
    knownHand: new Set<number>(),
    /** Ordem da mão arrumada pelo jogador (ids), só nesta partida (volta a vazia também quando a partida muda). */
    handOrder: [] as number[],
    handPrimed: false,
    /** Cartas compradas ainda em voo (id → quando chegam): continuam escondidas mesmo se a mão for redesenhada no caminho. */
    arriving: new Map<number, number>(),
    /** Vida mostrada por jogador: quando o número muda, ele conta até o novo valor. */
    shownLife: new Map<number, number>(),
    sideboardDraft: null as { id: number; main: DeckEntry[]; sideboard: DeckEntry[] } | null,
    sideboardError: '',
    sideboardBusy: false,
  };
}
export type MatchState = ReturnType<typeof newMatchState>;

/**
 * Oponentes ocultos e o "só este" (partidas com três ou mais jogadores), e o que a mesa fez sozinha: eliminados já
 * ocultados e o foco no oponente que ataca você (ver followSeats). Valem até a partida mudar.
 */
export function newSeatState(match: string) {
  return { match, hidden: new Set<number>(), solo: null as number | null, retired: new Set<number>() as ReadonlySet<number>, focus: null as SeatFocus | null, menu: null as number | null };
}
export type SeatState = ReturnType<typeof newSeatState>;
