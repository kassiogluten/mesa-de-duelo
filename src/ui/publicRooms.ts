import type { PublicRoom } from '../forge/client';
import { esc } from './cardtext';
import { undoBadgeHTML } from './undo';

/*
 * Salas públicas na tela inicial: a lista que a ponte manda ({type:"list-rooms"}), com o botão de entrar nas
 * que têm lugar e o de assistir nas que já começaram. Entrar por aqui segue o mesmo caminho de buscar pelo
 * código, com as mesmas regras de sala cheia e deck do formato; a lista só mostra o que já é público.
 */

/** null: ainda carregando a primeira vez; 'error': a ponte não respondeu. */
export type PublicRoomsState = PublicRoom[] | null | 'error';

const FORMAT = { standard: 'Standard', pauper: 'Pauper', sacola50: 'Sacola 50', commander: 'Commander', free: 'Livre' } as const;
const formatLabel = (room: PublicRoom) => FORMAT[room.config.format] ?? room.config.format;
const lengthLabel = (room: PublicRoom) => room.config.format === 'commander' ? '' : room.config.matchLength === 'bo3' ? 'Melhor de três' : 'Partida única';
const seatsLabel = (room: PublicRoom) => `${room.players}/${room.capacity} jogadores`;

/** Só as que ainda dá para entrar, caso a ponte mande alguma cheia ou começada. */
export function joinableRooms(rooms: PublicRoom[]): PublicRoom[] {
  return rooms.filter(room => !room.started && room.players < room.capacity);
}

/** As que já começaram: dá para assistir. */
export function watchableRooms(rooms: PublicRoom[]): PublicRoom[] {
  return rooms.filter(room => room.started);
}

const watchersLabel = (room: PublicRoom) => room.spectators ? `${room.spectators} assistindo` : '';

export function publicRoomsHTML(state: PublicRoomsState, disabled = false): string {
  if (state === null) return '<p class="public-rooms-empty">Procurando salas…</p>';
  if (state === 'error') return '<p class="public-rooms-empty">Não foi possível ver as salas agora. Tente atualizar.</p>';
  const rooms = joinableRooms(state), live = watchableRooms(state);
  if (!rooms.length && !live.length) return '<p class="public-rooms-empty">Nenhuma sala pública aberta.</p>';
  const open = rooms.map(room => {
    const details = [formatLabel(room), lengthLabel(room), seatsLabel(room)].filter(Boolean).join(' · ');
    const label = `Entrar na sala de ${room.host}: ${formatLabel(room)}, ${room.players} de ${room.capacity} jogadores${room.config.undo ? ', com Desfazer ligado' : ''}`;
    return `<li class="public-room"><span class="public-room-text"><strong>Sala de ${esc(room.host)}</strong><small>${esc(details)}</small>${room.config.undo ? undoBadgeHTML() : ''}</span><button type="button" class="arena-btn secondary" data-join-room="${esc(room.code)}" aria-label="${esc(label)}"${disabled ? ' disabled' : ''}>Entrar</button></li>`;
  });
  const playing = live.map(room => {
    const details = [formatLabel(room), `${room.players} jogadores`, watchersLabel(room)].filter(Boolean).join(' · ');
    const label = `Assistir à partida da sala de ${room.host}: ${formatLabel(room)}, em andamento${room.config.undo ? ', com Desfazer ligado' : ''}`;
    return `<li class="public-room live"><span class="public-room-text"><strong>Sala de ${esc(room.host)}</strong><small><span class="public-room-live">Em andamento</span>${esc(details)}</small>${room.config.undo ? undoBadgeHTML() : ''}</span><button type="button" class="arena-btn secondary" data-watch-room="${esc(room.code)}" aria-label="${esc(label)}"${disabled ? ' disabled' : ''}>Assistir</button></li>`;
  });
  return `<ul class="public-room-list">${[...open, ...playing].join('')}</ul>`;
}
