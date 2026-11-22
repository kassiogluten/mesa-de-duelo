// Página de teste da mesa: as escolhas da masmorra, qual masmorra entrar (as cartas lado a lado) e para qual sala ir (a carta ao lado do mapa).
type View = { render(): void };
type Room = { name: string; text: string; next: string[] };

const room = (name: string, text: string, ...next: string[]): Room => ({ name, text, next });
const image = (n: number) => `https://api.scryfall.com/cards/tafr/${n}?format=image&version=normal`;

/** As três masmorras de Adventures in the Forgotten Realms, com as salas como o servidor as manda. */
const DUNGEONS: { id: number; name: string; image: string; rooms: Room[] }[] = [
  { id: 801, name: 'Dungeon of the Mad Mage', image: image(20), rooms: [
    room('Yawning Portal', 'You gain 1 life.', 'Dungeon Level'), room('Dungeon Level', 'Scry 1.', 'Goblin Bazaar', 'Twisted Caverns'),
    room('Goblin Bazaar', 'Create a Treasure token.', 'Lost Level'), room('Twisted Caverns', "Target creature can't attack until your next turn.", 'Lost Level'),
    room('Lost Level', 'Scry 2.', 'Runestone Caverns', "Muiral's Graveyard"), room('Runestone Caverns', 'Exile the top two cards of your library. You may play them.', 'Deep Mines'),
    room("Muiral's Graveyard", 'Create two 1/1 black Skeleton creature tokens.', 'Deep Mines'), room('Deep Mines', 'Scry 3.', "Mad Wizard's Lair"),
    room("Mad Wizard's Lair", 'Draw three cards and reveal them. You may cast one of them without paying its mana cost.')] },
  { id: 802, name: 'Lost Mine of Phandelver', image: image(21), rooms: [
    room('Cave Entrance', 'Scry 1.', 'Goblin Lair', 'Mine Tunnels'), room('Goblin Lair', 'Create a 1/1 red Goblin creature token.', 'Storeroom', 'Dark Pool'),
    room('Mine Tunnels', 'Create a Treasure token.', 'Dark Pool', 'Fungi Cavern'), room('Storeroom', 'Put a +1/+1 counter on target creature.', 'Temple of Dumathoin'),
    room('Dark Pool', 'Each opponent loses 1 life and you gain 1 life.', 'Temple of Dumathoin'), room('Fungi Cavern', 'Target creature gets -4/-0 until your next turn.', 'Temple of Dumathoin'),
    room('Temple of Dumathoin', 'Draw a card.')] },
  { id: 803, name: 'Tomb of Annihilation', image: image(22), rooms: [
    room('Trapped Entry', 'Each player loses 1 life.', 'Veils of Fear', 'Oubliette'), room('Veils of Fear', 'Each player loses 2 life unless they discard a card.', 'Sandfall Cell'),
    room('Oubliette', 'Discard a card and sacrifice an artifact, a creature, and a land.', 'Cradle of the Death God'),
    room('Sandfall Cell', 'Each player loses 2 life unless they sacrifice an artifact, a creature, or a land.', 'Cradle of the Death God'),
    room('Cradle of the Death God', 'Create The Atropal, a legendary 4/4 black God Horror creature token with deathtouch.')] },
];

const dungeonCard = (d: typeof DUNGEONS[number]) => ({ id: d.id, name: d.name, controller: 10, tapped: false, token: true, manaCost: '', typeLine: 'Dungeon', image: d.image });

export function dungeonChoices(state: any, view: View) {
  const me = () => state.players.find((p: any) => p.id === 10);
  return {
    /** Se aventurar sem masmorra em andamento: as três masmorras para escolher. */
    dungeonChoice() {
      me().dungeon = undefined;
      state.question = { id: 810, method: 'getChoices', kind: 'choose', purpose: 'dungeon-choice', title: 'Em qual masmorra você vai se aventurar?', min: 1, max: 1,
        options: DUNGEONS.map(d => ({ kind: 'card', label: d.name, card: dungeonCard(d), dungeon: { ...d, rooms: d.rooms } })) };
      view.render();
    },
    /** Na Mina Perdida, na Entrada da Caverna: as duas salas seguintes, com a carta da masmorra ao lado do mapa. */
    dungeonRoom() {
      const d = DUNGEONS[1]!;
      me().dungeon = { id: d.id, name: d.name, image: d.image, room: 'Cave Entrance', rooms: d.rooms };
      state.question = { id: 811, method: 'getChoices', kind: 'choose', purpose: 'dungeon-room', title: `Para qual sala de ${d.name} você vai?`, min: 1, max: 1,
        dungeonOwner: 10, card: dungeonCard(d), options: [
          { kind: 'ability', label: 'Goblin Lair', ability: 'Create a 1/1 red Goblin creature token.', room: 'Goblin Lair' },
          { kind: 'ability', label: 'Mine Tunnels', ability: 'Create a Treasure token.', room: 'Mine Tunnels' }] };
      view.render();
    },
  };
}
