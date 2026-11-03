import '../../src/style.css';
import { mountLobby } from '../../src/ui/lobby';
import type { FRoom } from '../../src/forge/client';

/*
 * Sala de espera sem a ponte: a tela inicial já dentro de uma sala, com a prateleira Seu deck. Escolher um deck
 * marca o seu lugar como pronto, como a ponte faria. Pelo console, window.fixture muda a sala:
 * fixture.room({ format: 'commander', players: 4, ready: [true, false] }) e fixture.choose('id-do-deck').
 */

const lobby = mountLobby(document.querySelector('#scrLobby')!, {
  onPlay: async () => {}, onFreePlay() {}, onHost: async () => {}, onJoin: async () => {}, onJoinLab: async () => {}, onWatch: async () => {},
  onValidate: async () => ({ valid: true, issues: [], rulesVersion: 'fixture', engineVersion: 'fixture' }),
  onLookup: async () => { throw new Error('Sem servidor na página de teste.'); },
  onListRooms: async () => [],
  onCancelRoom() {}, onSay() {}, onFillWithComputers() {}, onDecks() {}, onEditDeck() {},
  async onChooseRoomDeck(deck) {
    await new Promise(r => setTimeout(r, 150));
    const me = current.players.find(p => p.seat === current.seat);
    const commander = deck.commanders?.map(c => c.name).join(' + ');
    if (me) Object.assign(me, { ready: true, commander, cover: deck.commanders?.[0]?.name ?? deck.cards[0]?.name });
    lobby.showRoom(current);
  },
});

const NAMES = ['Ana', 'Você', 'Caio', 'Dora'];
let current: FRoom;
function room({ format = 'commander' as FRoom['config']['format'], players = 4, seated = 3, seat = 1, ready = [true, false, false] } = {}) {
  current = {
    code: 'K7QM', seat, token: 't', started: false, public: true, capacity: players,
    config: { format, matchLength: 'bo1', playerCount: players },
    players: Array.from({ length: seated }, (_, i) => ({ seat: i, name: NAMES[i], connected: true, rematch: false, ready: ready[i] ?? true,
      ...(ready[i] ?? true) && i === 0 && format === 'commander' ? { commander: 'Atarka, World Render', cover: 'Atarka, World Render', bracket: 3 } : {} })),
  };
  lobby.showRoom(current);
}
room();
(window as any).fixture = { room, lobby, choose: (id: string) => (document.querySelector(`#roomDeckTiles [data-deck="${CSS.escape(id)}"]`) as HTMLElement | null)?.click() };
