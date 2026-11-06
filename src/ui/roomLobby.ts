import { cardInfo } from '../cards';
import { FORMAT_LABEL, type DeckFormat } from '../decks';
import type { FRoom, RoomSaying } from '../forge/client';
import { cacheGet, fetchByNames } from '../scryfall';
import { esc } from './cardtext';
import { bracketLabel, isBracket } from '../brackets';
import { bracketTitle } from './deckStats';
import './roomLobby.css';
import { finder } from './dom';

/** Lobby da sala em rede: o que se vê depois de criar ou entrar, até a mesa encher e a partida começar. */
export interface RoomLobby {
  render(room: FRoom | null): void;
  /** Balão de mensagem pronta sobre o lugar de quem mandou. */
  say(seat: number, key: RoomSaying): void;
  setStatus(message: string, error: boolean): void;
  /** Onde a tela inicial desenha a prateleira "Seu deck", para escolher ou trocar o deck sem sair da sala. */
  readonly decks: HTMLElement;
}
export interface RoomLobbyOptions {
  onSay(key: RoomSaying): void;
  onLeave(): void;
  /** O anfitrião completa os lugares vazios com computadores e a partida começa. */
  onFillWithComputers(): void;
  /** Pronto (ou não) no próprio lugar: a partida começa com a mesa cheia e todos prontos. */
  onReady(on: boolean): void;
}

export const SAYINGS: [RoomSaying, string][] = [['hello', 'Oi, pessoal!'], ['back', 'Já volto'], ['invite', 'Vou chamar mais gente'], ['glhf', 'Boa partida!']];
/** Quanto tempo o balão fica sobre o lugar. */
const SAID_MS = 6000;
/** Igual ao intervalo mínimo da ponte: antes disso, outro clique seria ignorado lá. */
const SAY_EVERY_MS = 1500;
const formatName = (f: DeckFormat) => FORMAT_LABEL[f];
const ptName = (name: string) => cacheGet(name)?.pt?.name || name;
const artOf = (name: string | undefined) => { const sc = name ? cacheGet(name) : null; return sc ? cardInfo(sc).artCrop : undefined; };
/** Link de convite: abre a tela inicial já na sala (veja o "?sala=" em main.ts). */
export const roomLink = (code: string) => `${location.origin}${location.pathname}?sala=${encodeURIComponent(code)}`;

/** Os menus do topo levam para fora da sala: pergunta antes. "Ficar na sala" vem em foco: na dúvida, ninguém sai. */
export function confirmLeaveRoom(code: string, to: 'play' | 'decks' | 'salas'): Promise<boolean> {
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const dlg = document.createElement('dialog');
  dlg.className = 'conta-dialogo room-leave';
  dlg.setAttribute('aria-labelledby', 'roomLeaveTitle'); dlg.setAttribute('aria-describedby', 'roomLeaveText');
  dlg.innerHTML = `<h2 id="roomLeaveTitle">Sair da sala ${esc(code)}?</h2>`
    + `<p id="roomLeaveText">Você está esperando jogadores. ${to === 'decks' ? 'Para ir a Meus decks, você sai da sala' : to === 'salas' ? 'Para ver as outras salas, você sai desta' : 'Para voltar à escolha de formato e deck, você sai da sala'}.</p>`
    + `<footer><button type="button" class="arena-btn secondary" data-leave="yes">${to === 'decks' ? 'Sair e ir para Meus decks' : to === 'salas' ? 'Sair e ver as salas' : 'Sair da sala'}</button><button type="button" class="arena-btn primary" data-leave="no">Ficar na sala</button></footer>`;
  document.body.append(dlg);
  return new Promise(resolve => {
    let answer = false;
    dlg.addEventListener('click', e => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-leave]');
      if (btn) { answer = btn.dataset.leave === 'yes'; dlg.close(); }
      else if (e.target === dlg) dlg.close();
    });
    dlg.addEventListener('close', () => { dlg.remove(); if (!answer && opener?.isConnected) opener.focus({ preventScroll: true }); resolve(answer); });
    dlg.showModal();
    dlg.querySelector<HTMLElement>('[data-leave="no"]')?.focus();
  });
}

export function mountRoomLobby(el: HTMLElement, opts: RoomLobbyOptions): RoomLobby {
  let room: FRoom | null = null;
  const said = new Map<number, { key: RoomSaying; timer: ReturnType<typeof setTimeout> }>();
  const requested = new Set<string>();
  let copiedTimer: ReturnType<typeof setTimeout> | undefined;
  el.innerHTML = `<header class="room-lobby-head"><p class="room-kicker" id="roomKicker"></p><h1>Sala <strong class="room-lobby-code" id="roomLobbyCode"></strong></h1><p class="room-progress" id="roomProgress"></p></header>
    <section class="room-share" aria-labelledby="roomShareTitle"><h2 id="roomShareTitle">Chame quem falta</h2>
      <div class="room-link-row"><input id="roomLinkField" class="input-field" readonly aria-label="Link de convite"><button type="button" class="arena-btn primary" data-room="copy">Copiar link</button><button type="button" class="arena-btn secondary" data-room="share" hidden>Compartilhar</button><a class="arena-btn secondary" data-room="open-tab" target="_blank" rel="noopener" hidden>Abrir em outra aba</a></div>
      <p class="room-share-help" id="roomShareHelp"></p></section>
    <ol class="room-seat-grid" id="roomSeatGrid" aria-label="Lugares da mesa"></ol>
    <div class="room-sayings" role="group" aria-labelledby="roomSayingsLabel"><span id="roomSayingsLabel">Mandar para a sala</span>${SAYINGS.map(([key, text]) => `<button type="button" class="ghost-btn" data-say="${key}">${esc(text)}</button>`).join('')}</div>
    <p class="sr-only" id="roomSaid" aria-live="polite"></p>
    <footer class="room-lobby-foot"><p class="lobby-status" id="roomStatus" role="status" aria-live="polite"></p><button type="button" class="arena-btn secondary" data-room="leave">Sair da sala</button><button type="button" class="arena-btn secondary" data-room="fill" hidden></button><button type="button" class="arena-btn primary room-ready-btn" data-room="ready" aria-pressed="false" hidden>Pronto</button></footer>
    <section class="room-decks" id="roomDecks" aria-labelledby="roomDecksTitle" hidden></section>`;
  const $ = finder(el);
  $('[data-room=share]').hidden = typeof navigator.share !== 'function';

  function seatsHTML(r: FRoom) {
    const capacity = r.capacity ?? r.config.playerCount ?? 2;
    return Array.from({length: capacity}, (_, seat) => {
      const player = r.players.find((p, i) => (p.seat ?? i) === seat);
      if (!player) return `<li class="room-seat open"><span class="seat-art" aria-hidden="true"><span class="seat-plus">+</span></span><span class="seat-info"><strong class="seat-name">Lugar livre</strong><span class="seat-state">Aguardando jogador…</span></span></li>`;
      const art = artOf(player.cover), me = seat === r.seat, bubble = said.get(seat);
      const tags = [seat === 0 ? 'Anfitrião' : '', me ? 'Você' : ''].filter(Boolean);
      const commander = player.commander?.split(' + ').map(ptName).join(' + ');
      // Pontes antigas não mandam ready: lá todo mundo entrava com deck.
      const choosing = player.ready === false;
      const confirmed = !choosing && player.confirmed === true;
      const state = !player.connected ? 'Reconectando…' : choosing ? (me ? 'Escolha seu deck abaixo' : 'Escolhendo o deck…')
        : confirmed ? '✓ Pronto' : player.confirmed === false ? (me ? 'Toque em Pronto para começar' : 'Ainda não está pronto') : 'Na sala';
      return `<li class="room-seat${me ? ' me' : ''}${player.connected ? '' : ' away'}${choosing ? ' choosing' : ''}${confirmed ? ' confirmed' : ''}"><span class="seat-art"${art ? ` style="background-image:url('${esc(art)}')"` : ''} aria-hidden="true"></span><span class="seat-info">${tags.length ? `<span class="seat-tags">${tags.map(t => `<span>${t}</span>`).join('')}</span>` : ''}<strong class="seat-name">${esc(player.name)}</strong>${commander ? `<span class="seat-commander">${esc(commander)}</span>` : ''}${isBracket(player.bracket) ? `<span class="deck-bracket seat-bracket" title="${esc(bracketTitle(player.bracket))}">${bracketLabel(player.bracket)}</span>` : ''}<span class="seat-state">${state}</span></span>${bubble ? `<span class="seat-bubble">${esc(SAYINGS.find(([k]) => k === bubble.key)?.[1] ?? '')}</span>` : ''}</li>`;
    }).join('');
  }
  function render(next: FRoom | null) {
    const entering = !room && !!next;
    room = next;
    el.hidden = !next;
    if (!next) {
      for (const {timer} of said.values()) clearTimeout(timer);
      said.clear(); $('#roomStatus').textContent = '';
      return;
    }
    const capacity = next.capacity ?? next.config.playerCount ?? 2, full = next.players.length >= capacity;
    const choosing = next.players.filter(p => p.ready === false).length;
    // Pontes antigas não mandam confirmed: lá a partida começava sozinha, sem Pronto.
    const usesReady = !next.lab && next.players.some(p => p.confirmed !== undefined);
    const waiting = usesReady ? next.players.filter(p => p.ready !== false && !p.confirmed).length : 0;
    const mine = next.players.find((p, i) => (p.seat ?? i) === next.seat);
    $('#roomKicker').textContent = next.lab ? 'Sala de teste · Laboratório' : `${next.public ? 'Sala pública' : 'Sala privada'} · ${formatName(next.config.format)} · ${next.config.matchLength === 'bo3' ? 'Melhor de três' : 'Partida única'}`;
    $('#roomShareTitle').textContent = next.lab ? 'Chame o outro lado' : 'Chame quem falta';
    $<HTMLAnchorElement>('[data-room=open-tab]').hidden = !next.lab;
    $<HTMLAnchorElement>('[data-room=open-tab]').href = roomLink(next.code);
    $('#roomLobbyCode').textContent = next.code;
    $('#roomProgress').textContent = full
      ? choosing ? `Mesa completa. A partida começa quando ${choosing === 1 ? 'o último jogador escolher o deck' : 'todos escolherem o deck'}${usesReady ? ' e tocar em Pronto' : ''}.`
        : waiting ? `Mesa completa. A partida começa quando ${waiting === 1 ? 'o último jogador tocar' : 'todos tocarem'} em Pronto.` : 'Mesa completa. A partida vai começar.'
      : `${next.players.length} de ${capacity} jogadores. A partida começa quando a mesa encher e todos ${usesReady ? 'tocarem em Pronto' : 'tiverem deck'}.`;
    // Só o anfitrião, e não na sala de teste: os lugares vazios viram computadores com decks prontos do formato.
    const free = capacity - next.players.length, fill = $<HTMLButtonElement>('[data-room=fill]');
    fill.hidden = full || next.seat !== 0 || !!next.lab;
    // Os computadores só entram com todos os humanos já com deck e prontos; tocar aqui já é o Pronto do anfitrião.
    const othersWaiting = next.players.filter(p => p !== mine && p.ready !== false && usesReady && !p.confirmed).length;
    fill.disabled = choosing > 0 || othersWaiting > 0;
    fill.title = choosing ? 'Espere todos escolherem o deck.' : othersWaiting ? 'Espere todos tocarem em Pronto.' : '';
    const ready = $<HTMLButtonElement>('[data-room=ready]'), on = !!mine?.confirmed;
    ready.hidden = !usesReady || !mine;
    ready.disabled = mine?.ready === false;
    ready.title = mine?.ready === false ? 'Escolha seu deck antes.' : on ? 'Toque de novo se ainda não quiser começar.' : '';
    ready.setAttribute('aria-pressed', String(on));
    ready.textContent = on ? '✓ Pronto' : 'Pronto';
    fill.textContent = free === 1 ? 'Completar com um computador e começar' : `Completar com ${free} computadores e começar`;
    $<HTMLInputElement>('#roomLinkField').value = roomLink(next.code);
    $('#roomShareHelp').textContent = next.lab
      ? `Para jogar pelos dois lados, abra o link numa outra aba: ela entra como Jogador 2. Ou mande o link (ou o código ${next.code}) para outra pessoa. A mesa começa como você montou assim que o Jogador 2 entrar.`
      : `Quem abrir o link vai direto para a sala. Ou passe o código ${next.code}, para digitar em Entrar numa sala.${next.public ? ' A sala também aparece na lista de salas públicas.' : ''}`;
    $('#roomSeatGrid').innerHTML = seatsHTML(next);
    const missing = next.players.map(p => p.cover).filter((name): name is string => !!name && !cacheGet(name) && !requested.has(name));
    if (missing.length) {
      for (const name of missing) requested.add(name);
      void fetchByNames(missing).then(() => { if (room) $('#roomSeatGrid').innerHTML = seatsHTML(room); }).catch(() => {});
    }
    if (entering) { scrollTo({top: 0}); $('[data-room=copy]').focus({preventScroll: true}); }
  }
  async function copy() {
    if (!room) return;
    const link = roomLink(room.code), button = $('[data-room=copy]');
    try { await navigator.clipboard.writeText(link); }
    catch { $<HTMLInputElement>('#roomLinkField').select(); setStatus('Não deu para copiar daqui: o link ficou selecionado para você copiar.', true); return; }
    button.textContent = 'Link copiado';
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => { button.textContent = 'Copiar link'; }, 2000);
  }
  function setStatus(message: string, error: boolean) { $('#roomStatus').textContent = message; $('#roomStatus').classList.toggle('error', error); }
  el.addEventListener('click', e => {
    const target = e.target as HTMLElement;
    const action = target.closest<HTMLElement>('[data-room]')?.dataset.room;
    if (action === 'copy') void copy();
    // Quem fecha a janela de compartilhar sem escolher não precisa de aviso.
    if (action === 'share' && room) void navigator.share({title: 'Mesa de Duelo', text: `Vem jogar na sala ${room.code}`, url: roomLink(room.code)}).catch(() => {});
    if (action === 'leave') opts.onLeave();
    if (action === 'ready' && room) { const b = $<HTMLButtonElement>('[data-room=ready]'); if (!b.disabled) opts.onReady(b.getAttribute('aria-pressed') !== 'true'); }
    if (action === 'fill') { ($('[data-room=fill]') as HTMLButtonElement).disabled = true; setStatus('Completando a mesa com computadores…', false); opts.onFillWithComputers(); }
    const say = target.closest<HTMLButtonElement>('[data-say]');
    if (say && !say.disabled) {
      opts.onSay(say.dataset.say as RoomSaying);
      const buttons = [...el.querySelectorAll<HTMLButtonElement>('[data-say]')];
      for (const b of buttons) b.disabled = true;
      setTimeout(() => { for (const b of buttons) b.disabled = false; }, SAY_EVERY_MS);
    }
  });
  return { render, setStatus, decks: $('#roomDecks'), say(seat, key) {
    if (!room) return;
    const previous = said.get(seat);
    if (previous) clearTimeout(previous.timer);
    said.set(seat, {key, timer: setTimeout(() => { said.delete(seat); if (room) $('#roomSeatGrid').innerHTML = seatsHTML(room); }, SAID_MS)});
    $('#roomSeatGrid').innerHTML = seatsHTML(room);
    const name = room.players.find((p, i) => (p.seat ?? i) === seat)?.name;
    $('#roomSaid').textContent = `${seat === room.seat ? 'Você' : name ?? 'Alguém'}: ${SAYINGS.find(([k]) => k === key)?.[1] ?? ''}`;
  }};
}
