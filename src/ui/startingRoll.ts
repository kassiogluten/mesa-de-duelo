// O d6 de quem começa (item 112): os dados de todos rolam no centro da mesa e o vencedor escolhe quem começa.
import type { FState } from '../forge/client';
import type { PresentationEvent } from './presentationTimeline';
import { listNames } from './historyLog';
import './startingRoll.css';

/** Uma rodada: o que cada jogador tirou. Da segunda em diante, só os empatados no maior número da anterior. */
export type RollRound = { player: number; roll: number }[];

/** A rolagem do jogo em curso: a última `starting-roll` do histórico, se nenhum turno começou depois dela. */
export function currentStartingRoll(history: readonly PresentationEvent[]) {
  for (let i = history.length - 1; i >= 0; i--) {
    const event = history[i]!;
    if (event.type === 'turn') return undefined;
    if (event.type === 'starting-roll' && event.rolls?.length) return event;
  }
  return undefined;
}

/** O nome de cada jogador na rolagem ("Você" para quem vê). */
function nameOf(state: FState, id: number) {
  return id === state.you ? 'Você' : state.players.find(p => p.id === id)?.name ?? 'Jogador';
}

/** "Ana 5, Bruno 3; desempate: Ana 6, Caio 2" e quem escolhe, para o histórico e o leitor de tela. */
export function startingRollText(event: Pick<PresentationEvent, 'actor' | 'rolls'>, name: (id: number) => string) {
  const rounds = (event.rolls ?? []).map((round, i) => `${i ? 'desempate: ' : ''}${round.map(r => `${name(r.player)} ${r.roll}`).join(', ')}`);
  const winner = event.actor === undefined ? 'O vencedor' : name(event.actor);
  return `Dados para ver quem começa: ${rounds.join('; ')}. ${winner} escolhe quem começa.`;
}

/** Quanto a animação dura: a primeira rodada, cada desempate e o vencedor em destaque. */
export function startingRollDuration(rounds: number, reduced: boolean) {
  return reduced ? 2200 : ROLL_MS + (rounds - 1) * (TIE_MS + ROLL_MS) + HOLD_MS;
}
const ROLL_MS = 1000, TIE_MS = 650, HOLD_MS = 1700;
/** Quanto o dado da GPU fica na mesa: assenta na metade (quando o de CSS assentaria) e some de 88% em diante. */
const GPU_DIE_MS = (ROLL_MS - 160) * 2;

const shown = new Set<string>();
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Mostra a rolagem uma vez por jogo (inclusive para quem assiste). Enquanto os dados rolam, a escolha "Quem começa?"
 * e a mão inicial ficam escondidas (`data-rolling`), e aparecem quando o vencedor está em destaque.
 */
/**
 * O que a camada GPU faz no sorteio: o dado rolando no lugar e o anel do vencedor (sem ela, os dados em CSS). A camada
 * carrega quando a mesa abre, e o sorteio vem logo em seguida: `effectsReady` a apressa e o sorteio espera por ela.
 */
export interface RollEffects {
  rollDie(el: Element, result: number, hold: number): boolean;
  glow(el: Element, color: string): void;
  effectsReady?(ms: number): Promise<boolean>;
}
/** Quanto o sorteio espera a camada GPU antes de rolar (com os dados parados em "?"); depois disso, rola em CSS. */
const GPU_WAIT_MS = 1500;

/** O sorteio está na mesa: a compra da mão inicial espera ele acabar (nenhuma carta voa por cima dos dados). */
export const rollingNow = (root: HTMLElement) => !!root.querySelector('.arena.forge[data-rolling]');

/** `done`: o sorteio acabou e saiu da mesa (a mão inicial aparece e já pode ser comprada). */
export function applyStartingRoll(root: HTMLElement, state: FState, history: readonly PresentationEvent[], matchId: string, fx?: RollEffects, done?: () => void) {
  const arena = root.querySelector<HTMLElement>('.arena.forge');
  if (!arena) return;
  const event = state.gameOver ? undefined : currentStartingRoll(history);
  const key = event && `${matchId}:${state.match?.gameNumber ?? 1}:${event.seq}`;
  if (!event || !key || shown.has(key)) return;
  shown.add(key);
  play(arena, state, event, fx, done);
}

function play(arena: HTMLElement, state: FState, event: PresentationEvent, fx?: RollEffects, done?: () => void) {
  arena.querySelector('.starting-roll')?.remove();
  const rounds = event.rolls!, reduced = reducedMotion();
  const players = rounds[0]!.map(r => r.player);
  const box = document.createElement('div');
  box.className = 'starting-roll';
  box.setAttribute('role', 'status');
  box.innerHTML = `<p class="sr-title">Quem tirar o maior número escolhe quem começa</p><ol class="sr-dice"></ol><p class="sr-result"></p>`;
  const list = box.querySelector('ol')!;
  const dice = new Map<number, HTMLElement>();
  for (const id of players) {
    const li = document.createElement('li');
    li.className = 'sr-seat'; li.dataset.player = String(id);
    if (id === state.you) li.classList.add('you');
    li.innerHTML = '<span class="sr-die" aria-hidden="true"><b>?</b></span><span class="sr-name"></span>';
    li.querySelector('.sr-name')!.textContent = nameOf(state, id);
    list.append(li); dice.set(id, li);
  }
  const result = box.querySelector<HTMLElement>('.sr-result')!;
  const winnerName = event.actor === undefined ? 'O vencedor' : nameOf(state, event.actor);
  const finalText = event.actor === state.you ? 'Você tirou o maior número e escolhe quem começa.' : `${winnerName} tirou o maior número e escolhe quem começa.`;
  arena.dataset.rolling = '';
  arena.append(box);
  const timers: number[] = [];
  const later = (fn: () => void, ms: number) => { timers.push(window.setTimeout(fn, ms)); };
  const settle = (round: RollRound) => {
    const max = Math.max(...round.map(r => r.roll));
    for (const r of round) {
      const seat = dice.get(r.player)!;
      seat.classList.remove('rolling');
      seat.querySelector('b')!.textContent = String(r.roll);
      seat.classList.toggle('top', r.roll === max);
    }
  };
  const finish = () => {
    for (const [id, seat] of dice) { seat.classList.toggle('winner', id === event.actor); seat.classList.toggle('out', id !== event.actor); }
    const winner = event.actor === undefined ? undefined : dice.get(event.actor)?.querySelector('.sr-die');
    if (winner) fx?.glow(winner, '#f2b54c');
    result.textContent = finalText;
  };
  if (reduced) {
    rounds.forEach(settle); finish();
    leave(startingRollDuration(rounds.length, true));
    return;
  }
  // Os dados ficam parados em "?" até a camada GPU ficar pronta (ou o prazo acabar), e então rolam.
  const ready = fx?.effectsReady ? fx.effectsReady(GPU_WAIT_MS).catch(() => false) : Promise.resolve(false);
  void ready.then(() => {
    if (!box.isConnected) return;
    let at = 0;
    rounds.forEach((round, i) => {
      if (i) {
        // Empate no maior número: só os empatados rolam de novo; os outros apagam.
        later(() => {
          const rolling = new Set(round.map(r => r.player));
          for (const [id, seat] of dice) if (!rolling.has(id)) seat.classList.add('out');
          const tied = listNames(round.map(r => nameOf(state, r.player))).replace(' Você', ' você');
          result.textContent = `Empate! ${tied} rolam de novo.`;
        }, at);
        at += TIE_MS;
      }
      later(() => {
        // A caixa ainda entra crescendo (`sr-in`) na primeira rodada: o dado da GPU é medido com a entrada já no fim,
        // senão assenta deslocado do de CSS.
        const entering = box.getAnimations?.() ?? [];
        const was = entering.map(a => a.currentTime);
        for (const a of entering) a.currentTime = Number(a.effect?.getComputedTiming().endTime) || 0;
        for (const r of round) {
          const seat = dice.get(r.player)!;
          seat.classList.add('rolling');
          // Na camada GPU, o dado rola em 3D no lugar do de CSS e para no resultado na hora em que ele assentaria; o de
          // CSS só volta quando o da GPU começa a sumir (o do maior número sobe um pouco e apareceria por cima dele).
          if (fx?.rollDie(seat.querySelector('.sr-die')!, r.roll, GPU_DIE_MS)) {
            seat.classList.add('gpu-rolling');
            later(() => seat.classList.remove('gpu-rolling'), GPU_DIE_MS * .88);
          }
        }
        entering.forEach((a, i) => { a.currentTime = was[i] ?? null; });
        // O número troca enquanto o dado rola e para no resultado.
        for (let step = 0; step < 7; step++) later(() => {
          for (const r of round) dice.get(r.player)!.querySelector('b')!.textContent = String(1 + ((r.roll + step * 5 + r.player) % 6));
        }, step * 120);
        later(() => settle(round), ROLL_MS - 160);
      }, at);
      at += ROLL_MS;
    });
    later(finish, at);
    leave(startingRollDuration(rounds.length, false));
  });
  /** A caixa sai em `total` ms; sem outro sorteio na mesa, a mão inicial e a escolha aparecem e a compra começa. */
  function leave(total: number) {
    later(() => box.classList.add('leaving'), total - 300);
    later(() => {
      box.remove();
      if (arena.querySelector('.starting-roll')) return;
      delete arena.dataset.rolling;
      done?.();
    }, total);
  }
}
