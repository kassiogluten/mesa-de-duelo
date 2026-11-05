// Decisões do começo da partida (quem começa, mulligan) mostradas no centro da mesa.
import type { FState } from '../forge/client';
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
function waitingCopy(state: FState, wait: NonNullable<FState['input']['openingWait']>) {
  const name = state.players.find(p => p.id === wait.player)?.name ?? 'O oponente';
  if (wait.step === 'start') return [`${name} está escolhendo quem começa`, 'Depois cada um decide se mantém a mão ou faz mulligan.'];
  return [`${name} está decidindo a mão`, wait.kept ? 'Você manteve a sua mão.' : 'Em seguida é a sua vez de manter ou fazer mulligan.'];
}

/** Present the engine's opening decisions in the center, without changing their actions. */
export function applyOpeningPresentation(root: HTMLElement, state: FState) {
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
    heading.innerHTML = '<h1></h1><p></p>';
    arena.append(heading);
  }
  const { openingStartingPlayer, openingReturnCount, openingWait } = state.input;
  if (opening === 'waiting' && openingWait) {
    const [title, line] = waitingCopy(state, openingWait);
    heading.querySelector('h1')!.textContent = title!;
    heading.querySelector('p')!.textContent = line!;
    return;
  }
  heading.querySelector('h1')!.textContent = (opening === 'play-draw' || opening === 'starting-player') ? 'Quem começa?'
    : opening === 'mulligan-bottom'
      ? openingReturnCount == null ? 'Escolha as cartas para devolver'
        : openingReturnCount === 1 ? 'Devolva 1 carta' : `Devolva ${openingReturnCount} cartas`
      : 'Sua mão inicial';
  heading.querySelector('p')!.textContent = (opening === 'play-draw' || opening === 'starting-player') ? 'Escolha quem joga o primeiro turno.'
    : opening === 'mulligan-bottom' ? 'As cartas escolhidas vão para o fundo do grimório.'
      : openingStartingPlayer == null ? 'Mantenha estas cartas ou tente uma nova mão.'
        : openingStartingPlayer === state.you ? 'Você joga primeiro.' : 'O oponente joga primeiro.';
}
