// O toque de cada tipo de criatura ao entrar no campo: o som dele (o urso rosna, o elfo traz sininhos da floresta, o lobo uiva) e, para alguns, um bicho que atravessa a tela (esquilo, rato, aranha, morcego).
import type { PresentationEvent } from './presentationTimeline';
import { critter, type CritterKind } from './screenCritters';

export interface CreatureTouch { sound?: string; critter?: CritterKind }

/**
 * Tipo de criatura (como o Forge escreve, em inglês) → o som (arquivo em audio/criaturas/) e o bicho. Só tipos com
 * cara de bicho ou de criatura fantástica: Human, Soldier, Wizard e os outros comuns demais ficam em silêncio.
 */
export const CREATURE_TOUCHES: Readonly<Record<string, CreatureTouch>> = {
  Bear: { sound: 'bear' }, Elf: { sound: 'elf' }, Wolf: { sound: 'wolf' }, Werewolf: { sound: 'wolf' },
  Cat: { sound: 'cat' }, Dog: { sound: 'dog' }, Bird: { sound: 'bird' }, Dragon: { sound: 'dragon' },
  Zombie: { sound: 'zombie' }, Goblin: { sound: 'goblin' }, Frog: { sound: 'frog' }, Snake: { sound: 'snake' },
  Insect: { sound: 'insect' }, Angel: { sound: 'angel' }, Merfolk: { sound: 'merfolk' }, Horse: { sound: 'horse' },
  Unicorn: { sound: 'horse' }, Dinosaur: { sound: 'dinosaur' }, Skeleton: { sound: 'skeleton' }, Spirit: { sound: 'spirit' },
  Ooze: { sound: 'ooze' }, Elephant: { sound: 'elephant' }, Demon: { sound: 'demon' },
  Squirrel: { sound: 'squirrel', critter: 'squirrel' }, Rat: { sound: 'rat', critter: 'rat' },
  Spider: { critter: 'spider' }, Bat: { sound: 'bat', critter: 'bat' },
};

/** Os subtipos da face à mostra ("Creature — Elf Druid" → Elf, Druid). */
export function subtypes(typeLine = '') {
  const face = typeLine.split(' // ')[0]!, dash = face.indexOf('—');
  return dash < 0 ? [] : face.slice(dash + 1).trim().split(/\s+/).filter(Boolean);
}

/**
 * O toque de uma criatura entrando no campo (fichas juntas contam como uma entrada só): o do primeiro subtipo que
 * tem toque, na ordem impressa. Virada para baixo não tem tipo à mostra.
 */
export function creatureTouch(event: PresentationEvent): (CreatureTouch & { type: string }) | null {
  if (event.type !== 'entered') return null;
  const cards = event.entries?.length ? event.entries : event.card ? [event.card] : [];
  for (const card of cards) {
    if (!card.creature || card.faceDown) continue;
    for (const type of subtypes(card.typeLine)) {
      const touch = CREATURE_TOUCHES[type];
      if (touch) return { type, ...touch };
    }
  }
  return null;
}

/** Um bicho atravessando a tela no máximo a cada tanto, para a mesa cheia de esquilos não virar um desfile. */
export const CRITTER_GAP = 25_000;

export function createCreatureTouches(deps: {
  host: HTMLElement;
  /** Toca um som avulso (de audio/), respeitando o mudo, o volume e o pacote de sons. */
  sound(path: string, level: number, delay: number): void;
}) {
  let lastCritter = -Infinity;
  return {
    /** Chamado em cada passo da apresentação, depois do som da própria jogada. */
    observe(event: PresentationEvent, audible: boolean) {
      const touch = creatureTouch(event);
      if (!touch || !audible || document.hidden) return;
      // O som entra logo depois do da carta chegando ao campo, um pouco mais baixo.
      if (touch.sound) deps.sound(`criaturas/${touch.sound}.mp3`, .8, .22);
      if (touch.critter && performance.now() - lastCritter > CRITTER_GAP) {
        lastCritter = performance.now();
        void critter(deps.host, touch.critter);
      }
    },
  };
}
