// Decisões do começo da partida (quem começa, mulligan) mostradas no centro da mesa.
import type { FState } from '../forge/client';
import type { FCard } from '../forge/protocol';
import type { PresentationEvent } from './presentationTimeline';
import { cacheGet } from '../scryfall';
import { hideCardPreview } from './cardInspector';
import './opening.css';

/** A etapa da abertura na mesa: a sua decisão ou, enquanto outro jogador decide a dele, "waiting". */
function openingOf(state: FState) {
  if (state.gameOver) return undefined;
  return state.input.opening ?? (state.input.openingWait ? 'waiting' : undefined);
}

export function suppressOpeningPreview(state: FState) {
  return !!openingOf(state);
}

/** Título e linha de baixo enquanto outro jogador decide: o Forge decide as mãos uma de cada vez. */
function waitingCopy(state: FState, wait: NonNullable<FState['input']['openingWait']>, roll?: PresentationEvent) {
  const name = state.players.find(p => p.id === wait.player)?.name ?? 'O oponente';
  const won = roll?.actor === wait.player ? `${name} tirou o maior número no dado. ` : '';
  if (wait.step === 'start') return [`${name} está escolhendo quem começa`, `${won}Depois cada um decide se mantém a mão ou faz mulligan.`];
  return [`${name} está decidindo a mão`, wait.kept ? 'Você manteve a sua mão.' : 'Em seguida é a sua vez de manter ou fazer mulligan.'];
}

/**
 * Conta como terreno o que pode entrar como terreno: os terrenos e as cartas de dupla face modais com um terreno atrás
 * (Emeria's Call, as Pathways), que na mão mostram a face da mágica.
 */
function landLike(card: Pick<FCard, 'land' | 'name'>) {
  if (card.land) return true;
  const sc = card.name ? cacheGet(card.name) : null;
  return sc?.layout === 'modal_dfc' && /\bLand\b/.test(sc.type_line);
}

/** "3 terrenos · 4 mágicas": a mesa conta, o jogador decide (sem conselho nem cor de alerta). */
export function openingHandCount(hand: Pick<FCard, 'land' | 'name'>[]) {
  const lands = hand.filter(landLike).length, spells = hand.length - lands;
  return `${lands} ${lands === 1 ? 'terreno' : 'terrenos'} · ${spells} ${spells === 1 ? 'mágica' : 'mágicas'}`;
}

/** Present the engine's opening decisions in the center, without changing their actions. */
export function applyOpeningPresentation(root: HTMLElement, state: FState, roll?: PresentationEvent) {
  const arena = root.querySelector<HTMLElement>('.arena.forge');
  if (!arena) return;
  const opening = openingOf(state);
  const previous = arena.dataset.opening;
  let heading = arena.querySelector<HTMLElement>('.opening-copy');
  let shade = arena.querySelector<HTMLElement>('.opening-shade');
  if (!opening) {
    delete arena.dataset.opening;
    heading?.remove(); shade?.remove();
    return;
  }
  arena.dataset.opening = opening;
  if (opening !== previous) hideCardPreview(true);
  if (!shade) {
    shade = document.createElement('div');
    shade.className = 'opening-shade'; shade.setAttribute('aria-hidden', 'true');
    arena.append(shade);
  }
  if (!heading) {
    heading = document.createElement('div');
    heading.className = 'opening-copy';
    heading.innerHTML = '<h1></h1><p></p><p class="opening-count"></p>';
    arena.append(heading);
  }
  const { openingStartingPlayer, openingReturnCount, openingWait } = state.input;
  const count = heading.querySelector<HTMLElement>('.opening-count')!;
  const hand = state.players.find(p => p.id === state.you)?.hand ?? [];
  count.textContent = opening === 'mulligan' && hand.length ? openingHandCount(hand) : '';
  if (opening === 'waiting' && openingWait) {
    const [title, line] = waitingCopy(state, openingWait, roll);
    heading.querySelector('h1')!.textContent = title!;
    heading.querySelector('p')!.textContent = line!;
    return;
  }
  heading.querySelector('h1')!.textContent = (opening === 'play-draw' || opening === 'starting-player') ? 'Quem começa?'
    : opening === 'mulligan-bottom'
      ? openingReturnCount == null ? 'Escolha as cartas para devolver'
        : openingReturnCount === 1 ? 'Devolva 1 carta' : `Devolva ${openingReturnCount} cartas`
      : opening === 'mulligan' && openingReturnCount ? 'Sua nova mão'
      : 'Sua mão inicial';
  heading.querySelector('p')!.textContent = (opening === 'play-draw' || opening === 'starting-player')
    ? `${roll?.actor === state.you ? 'Você tirou o maior número no dado. ' : ''}Escolha quem joga o primeiro turno.`
    : opening === 'mulligan-bottom' ? 'Toque nas cartas que vão para o fundo do grimório.'
      : opening === 'mulligan' && openingReturnCount ? `Se mantiver, você escolhe ${openingReturnCount === 1 ? '1 carta' : `${openingReturnCount} cartas`} para o fundo do grimório.`
      : openingStartingPlayer == null ? 'Mantenha estas cartas ou tente uma nova mão.'
        : openingStartingPlayer === state.you ? 'Você joga primeiro.' : 'O oponente joga primeiro.';
}
