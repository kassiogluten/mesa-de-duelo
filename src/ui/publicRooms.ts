import type { PublicRoom } from '../forge/client';
import { esc } from './cardtext';

/*
 * Salas públicas na tela inicial: a lista que a ponte manda ({type:"list-rooms"}) e o botão de entrar.
 * Entrar por aqui segue o mesmo caminho de buscar pelo código, com as mesmas regras de sala cheia,
 * partida começada e deck do formato; a lista só mostra o que já é público.
 */

/** null: ainda carregando a primeira vez; 'error': a ponte não respondeu. */
export type PublicRoomsState = PublicRoom[] | null | 'error';

const FORMAT = { pauper: 'Pauper', commander: 'Commander', free: 'Livre' } as const;
const formatLabel = (room: PublicRoom) => FORMAT[room.config.format] ?? room.config.format;
const lengthLabel = (room: PublicRoom) => room.config.format === 'commander' ? '' : room.config.matchLength === 'bo3' ? 'Melhor de três' : 'Partida única';
const seatsLabel = (room: PublicRoom) => `${room.players}/${room.capacity} jogadores`;

/** Só as que ainda dá para entrar, caso a ponte mande alguma cheia ou começada. */
export function joinableRooms(rooms: PublicRoom[]): PublicRoom[] {
  return rooms.filter(room => !room.started && room.players < room.capacity);
}

export function publicRoomsHTML(state: PublicRoomsState, disabled = false): string {
  if (state === null) return '<p class="public-rooms-empty">Procurando salas…</p>';
  if (state === 'error') return '<p class="public-rooms-empty">Não foi possível ver as salas agora. Tente atualizar.</p>';
  const rooms = joinableRooms(state);
  if (!rooms.length) return '<p class="public-rooms-empty">Nenhuma sala pública aberta.</p>';
  return `<ul class="public-room-list">${rooms.map(room => {
    const details = [formatLabel(room), lengthLabel(room), seatsLabel(room)].filter(Boolean).join(' · ');
    const label = `Entrar na sala de ${room.host}: ${formatLabel(room)}, ${room.players} de ${room.capacity} jogadores`;
    return `<li class="public-room"><span class="public-room-text"><strong>Sala de ${esc(room.host)}</strong><small>${esc(details)}</small></span><button type="button" class="arena-btn secondary" data-join-room="${esc(room.code)}" aria-label="${esc(label)}"${disabled ? ' disabled' : ''}>Entrar</button></li>`;
  }).join('')}</ul>`;
}
