// Quais permanentes mudaram de face no campo entre dois desenhos: a dupla face que transformou, a que virou cópia de outra e a carta virada para baixo que virou de face para cima (ou o contrário).
import type { FCard } from '../forge/client';

/**
 * `before` e `now` são o nome de cada permanente no campo ('' na virada para baixo). Devolve as que continuam no campo
 * com outro nome; quem acabou de entrar ou já saiu não conta.
 */
export function faceTurns(before: ReadonlyMap<number, string>, now: ReadonlyMap<number, string>): number[] {
  return [...now].filter(([id, name]) => before.has(id) && before.get(id) !== name).map(([id]) => id);
}

/** Lembra os nomes do campo entre um desenho e outro da mesma partida. */
export function createFaceWatch() {
  let names = new Map<number, string>(), match = '', day: string | undefined;
  return {
    /**
     * O campo deste desenho: `onField` são as permanentes que estão nele e `turned`, as que mudaram de face desde o
     * desenho anterior da mesma partida. `flat` diz que o dia virou noite (ou o contrário) no mesmo desenho: aí a mesa
     * inteira vira junto, e cada carta só gira no lugar, sem subir.
     */
    see(players: { battlefield: Pick<FCard, 'id' | 'name' | 'faceDown'>[] }[], matchId: string, dayTime?: string) {
      const now = new Map(players.flatMap(p => p.battlefield.map(c => [c.id, c.faceDown ? '' : c.name ?? ''] as [number, string])));
      const same = match === matchId;
      const turned = same ? faceTurns(names, now) : [], flat = same && day !== dayTime;
      names = now; match = matchId; day = dayTime;
      return { onField: new Set(now.keys()), turned, flat };
    },
  };
}
