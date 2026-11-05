import type { PublicRoom } from '../forge/client';
import { joinableRooms, publicRoomsHTML, watchableRooms, type PublicRoomsState } from './publicRooms';
import { publicRoomsStatusText } from './lobbyView';

/** De quanto em quanto tempo a lista de salas públicas se atualiza sozinha, com a tela à vista. */
const ROOMS_EVERY_MS = 10_000;

export interface RoomsPollerOptions {
  $: <T extends HTMLElement = HTMLElement>(selector: string) => T;
  /** Só procura com "Outra pessoa" escolhido, fora de uma sala e com a aba à vista. */
  wanted(): boolean;
  /** A tela à vista e sem pedido em andamento: a vez de atualizar sozinha. */
  idle(): boolean;
  /** Os botões da lista ficam desligados (pedido em andamento ou já numa sala). */
  disabled(): boolean;
  listRooms(): Promise<PublicRoom[]>;
  /** A lista chegou: a contagem do cabeçalho aproveita. */
  onRooms(rooms: PublicRoom[]): void;
}

/** A lista de salas públicas da aba "Entrar numa sala": busca, redesenha sem perder o foco e se atualiza sozinha. */
export function createRoomsPoller(o: RoomsPollerOptions) {
  const { $ } = o;
  let publicRooms: PublicRoomsState = null, roomsHTML = '', roomsRequest = 0;
  let roomsTimer: ReturnType<typeof setInterval> | undefined;
  function sync() {
    if (o.wanted() && !roomsTimer) {
      void load();
      roomsTimer = setInterval(() => { if (o.idle()) void load(); }, ROOMS_EVERY_MS);
    } else if (!o.wanted() && roomsTimer) { clearInterval(roomsTimer); roomsTimer = undefined; }
  }
  async function load(announce = false) {
    const request = ++roomsRequest, list = $('#publicRoomList');
    if (publicRooms === null) render();
    list.setAttribute('aria-busy', 'true');
    let next: PublicRoomsState;
    try { next = await o.listRooms(); } catch { next = 'error'; }
    if (request !== roomsRequest) return;
    list.setAttribute('aria-busy', 'false');
    publicRooms = next;
    if (Array.isArray(next)) o.onRooms(next);
    render();
    if (announce) {
      const count = Array.isArray(next) ? joinableRooms(next).length : -1, live = Array.isArray(next) ? watchableRooms(next).length : 0;
      $('#publicRoomsStatus').textContent = publicRoomsStatusText(count, live);
    }
  }
  function render() {
    const list = $('#publicRoomList'), html = publicRoomsHTML(publicRooms, o.disabled());
    if (html === roomsHTML) return;
    // A lista muda sozinha: quem estava com o foco num "Entrar" continua nele, ou vai para o Atualizar se a sala sumiu.
    const focused = document.activeElement as HTMLElement | null;
    const focusJoin = focused && list.contains(focused) ? focused.dataset.joinRoom : undefined, focusWatch = focused && list.contains(focused) ? focused.dataset.watchRoom : undefined;
    list.innerHTML = roomsHTML = html;
    if (focusJoin !== undefined) (list.querySelector<HTMLElement>(`[data-join-room="${CSS.escape(focusJoin)}"]`) ?? $('[data-lobby=rooms-refresh]')).focus({preventScroll: true});
    else if (focusWatch !== undefined) (list.querySelector<HTMLElement>(`[data-watch-room="${CSS.escape(focusWatch)}"]`) ?? $('[data-lobby=rooms-refresh]')).focus({preventScroll: true});
  }
  document.addEventListener('visibilitychange', () => sync());
  return { sync, load };
}
