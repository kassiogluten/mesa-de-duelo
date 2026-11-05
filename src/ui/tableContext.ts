// O que as partes da mesa (forgeTable.ts) compartilham: os elementos, a conexão, o estado da partida aberta e as
// ações comuns. Cada parte declara o pedaço que usa (`Pick<TableCtx, ...>`), e a forgeTable.ts monta um objeto só
// com tudo. Os campos que apontam para outras partes são lidos na hora do uso, nunca na criação.
import type { FCard, FState, ForgeClient } from '../forge/client';
import type { Motion } from './motion';
import type { createGameAudio } from './audio';
import type { PresentationTimeline, PresentationEvent, PresentationFrame } from './presentationTimeline';
import type { MatchState } from './tableState';
import type { ActionView } from './actionPanel';
import type { ForgeTableOptions } from './forgeTable';
import type { createCardFaces } from './cardFaces';
import type { createTableSettings } from './tableSettings';

type CardFaces = ReturnType<typeof createCardFaces>;

export interface TableCtx {
  root: HTMLElement;
  $(sel: string): HTMLElement;
  /** Troca o HTML do elemento só quando ele mudou (e ninguém mexeu no elemento desde o último desenho). */
  setHTML(el: HTMLElement, html: string): void;
  opts: ForgeTableOptions;
  client(): ForgeClient | null;
  state(): FState | null | undefined;
  /** A partida aberta (tableState.ts): `attach()` troca o objeto inteiro. */
  match(): MatchState;
  /** Retratos dos jogadores que vieram com a partida (o seu primeiro). */
  portraits(): (string | undefined)[];
  timeline: PresentationTimeline;
  motion: Motion;
  audio: ReturnType<typeof createGameAudio>;
  /** Preferências das Opções (tableSettings.ts), lidas a cada desenho. */
  prefs: ReturnType<typeof createTableSettings>['prefs'];
  /** O quadro da apresentação que a mesa mostra agora (null: o estado de verdade). */
  frame(): PresentationFrame | null;
  findCard(id: number, withPrompt?: boolean): FCard | undefined;
  /** Nome para as frases da mesa; o próprio jogador é "você". */
  playerName(id: number): string;
  /** Nome de um comandante ou planeswalker na frase da previsão do combate. */
  cardName(id: number): string;
  face: CardFaces['face'];
  faceStyle: CardFaces['faceStyle'];
  image: CardFaces['image'];
  eventDescription(event: PresentationEvent, detailed?: boolean): string;
  targetsDescription(targets: PresentationEvent['targets']): string;
  actionView(): ActionView;
  /** Texto para o leitor de tela (repetido, não é lido de novo). */
  announce(text: string): void;
  /** Redesenha lendo os eventos novos do estado. */
  render(): void;
  /** Redesenha só a mesa, sem ler eventos. */
  renderTable(): void;
  stopPresentation(): void;
  syncModal(): void;
  /** A carta (ou o retrato) foi desenhada para o pedido que está valendo agora. */
  renderedInputIsCurrent(el: HTMLElement): boolean;
  showPreview(c: FCard | undefined, trigger?: HTMLElement, pinned?: boolean, at?: { x: number; y: number }): void;
  cardFromElement(el: HTMLElement): FCard | undefined;
  /** Saída animada de um modal respondido. */
  leaveOverlay(el: HTMLElement): void;
}
