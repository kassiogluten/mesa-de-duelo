// Os dois oponentes a mais do laboratório de efeitos com 4 jogadores (?jogadores=4): Commander com o campo de cada um já cheio, para o teste de desempenho pesar como uma mesa de Commander de verdade.

const CREATURES: [string, number, number, string, string[]][] = [
  ['Llanowar Elves', 1, 1, '{G}', []], ['Serra Angel', 4, 4, '{3}{W}{W}', ['FLYING', 'VIGILANCE']], ['Vampire Nighthawk', 2, 3, '{1}{B}{B}', ['FLYING', 'DEATHTOUCH', 'LIFELINK']],
  ['Hill Giant', 3, 3, '{3}{R}', []], ['Wood Elves', 1, 1, '{2}{G}', []], ['Solemn Simulacrum', 2, 2, '{4}', []], ['Eternal Witness', 2, 1, '{1}{G}{G}', []],
];
const OTHERS: [string, Record<string, unknown>][] = [
  ['Sol Ring', { typeLine: 'Artifact', manaCost: '{1}' }], ['Arcane Signet', { typeLine: 'Artifact', manaCost: '{2}' }],
  ['Rhystic Study', { typeLine: 'Enchantment', manaCost: '{2}{U}' }], ['Command Tower', { land: true, typeLine: 'Land' }],
];
const SEATS: [id: number, name: string, commander: string, cost: string, land: string][] = [
  [36, 'Oponente 2', 'Atraxa, Praetors\' Voice', '{G}{W}{U}{B}', 'Island'],
  [49, 'Oponente 3', 'Krenko, Mob Boss', '{2}{R}{R}', 'Mountain'],
];

/** Os jogadores 3 e 4, cada um com o comandante na zona de comando e umas 20 permanentes (criaturas, fichas, artefatos e terrenos). */
export function extraOpponents(newId: () => number) {
  return SEATS.map(([id, name, commander, cost, land], i) => {
    const base = (cardName: string, extra: Record<string, unknown>) => ({ id: newId(), controller: id, name: cardName, tapped: false, token: false, creature: false, ...extra });
    const creature = ([n, p, t, c, k]: (typeof CREATURES)[number], extra: Record<string, unknown> = {}) =>
      base(n, { creature: true, power: p, toughness: t, basePower: p, baseToughness: t, damage: 0, manaCost: c, typeLine: 'Creature', keywords: k, ...extra });
    const battlefield = [
      ...CREATURES.map((c, k) => creature(c, { tapped: (k + i) % 3 === 0 })),
      ...Array.from({ length: 5 }, () => base(i ? 'Goblin' : 'Saproling', { creature: true, token: true, power: 1, toughness: 1, basePower: 1, baseToughness: 1, damage: 0, typeLine: 'Token Creature' })),
      ...OTHERS.map(([n, extra]) => base(n, extra)),
      ...Array.from({ length: 6 }, (_, k) => base(land, { land: true, typeLine: `Basic Land — ${land}`, tapped: k < 3 })),
    ];
    const zone = base(commander, { creature: true, power: 4, toughness: 4, manaCost: cost, typeLine: 'Legendary Creature' });
    return {
      id, seat: i + 2, name, ai: true, life: 40 - i * 7, library: 80, handCount: 5, hand: [], pool: {}, graveyard: [], exile: [], battlefield,
      commandZone: [zone], commanders: [{ id: zone.id, name: commander, casts: i, tax: i * 2 }],
    };
  });
}
