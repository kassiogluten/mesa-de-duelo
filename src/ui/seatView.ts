// Os jogadores na mesa: o retrato (vida, mana na reserva, marcadores, emblemas), os montes (grimório, cemitério, exílio), a
// zona de comando, o assento de cada oponente com três ou mais jogadores (à vista ou oculto) e a tela de foco num oponente.
import { aiStyleName, DEFAULT_AI_STYLE } from '../aiStyle';
import type { FCard, FPlayer, FState } from '../forge/client';
import { esc, pip } from './cardtext';
import { countSealsHTML } from './cardCounts';
import { emblemLabel, emblemSource, label } from './cardFaces';
import { proliferateBoardClass } from './proliferate';
import { forecastBadgeHTML, forecastText } from './combatForecast';
import { canPlayCommander } from './commanderTable';
import { dungeonBadgesHTML, dungeonText, withDungeonBadges } from './dungeon';
import { awaitingDecision } from './awaitingDecision';
import { playerCountersHTML, playerCountersText as countersText } from './playerCounters';
import { playerStatusHTML, playerStatusText } from './playerStatus';
import { seatHandHTML } from './revealedHand';
import { focusedByAttack, type SeatMemory } from './seatVisibility';
import { sleeveClass } from './sleeves';
import { turnHighlight } from './turnHighlight';
import { bracketLabel, isBracket } from '../brackets';
import { bracketTitle } from './deckStats';
import { turnTimeText } from './clock';
import { backRow, canUse, fieldRow, isBackRow, type BoardView } from './permanentView';
import type { SeatState } from './tableState';
import { lossReasonText } from './lossReason';
import { EXPAND, EYE_OFF, FOCUS, ICON_CLOSE, ICON_EYE, PILE_ICON_EXILE, PILE_ICON_GY } from './icons';

/** O que os assentos precisam da mesa, além das peças do campo. */
/** Estilo do computador no retrato; o equilibrado, que é o padrão, não aparece. */
const shownStyle = (p: FPlayer) => p.ai && p.aiStyle && p.aiStyle !== DEFAULT_AI_STYLE ? aiStyleName(p.aiStyle) : '';

export interface SeatView extends BoardView {
  image(name: string | undefined, size: 'small' | 'normal', print?: FCard['print']): string | undefined;
  /** Retrato de cada jogador (0 é você), quando veio com a partida. */
  portraits: (string | undefined)[];
  /** Arte do tapete atrás do campo do jogador. */
  matArt(s: FState, p: FPlayer, idx: number): string | undefined;
  /** Tipos de marcador de jogador que mudaram neste desenho, para o selo pulsar. */
  counterBumps: Map<number, Set<string>>;
  /** Mágicas conjuradas neste turno, por todos (estado ao vivo). */
  spellsTotal: number | undefined;
  activePlayer: FState['activePlayer'] | undefined;
  /** Nome de um comandante ou planeswalker, para a previsão do combate. */
  cardName(id: number): string;
  seats: SeatState;
  seatMemory: SeatMemory;
  /** A troca de turno que este desenho mostra (só no desenho em que mudou). */
  seatTurn: { from: number | null; to: number | null } | null;
}

export const matStyle = (art: string | undefined) => art ? `--mat:url(${JSON.stringify(art)})` : '';
export function avatar(v: SeatView, s: FState, p: FPlayer, idx: number) {
  const cls = ['avatar', idx === 0 ? 'me' : 'opp'];
  if (s.activePlayer === p.id && !s.gameOver) cls.push('active');
  if (!p.eliminated && (s.input.selectablePlayers?.includes(p.id) || v.attackTargets(s).some(target => target.kind === 'player' && target.id === p.id))) cls.push('selectable-player');
  if (p.eliminated) cls.push('eliminated');
  const prolif = proliferateBoardClass(s, 'player', p.id);
  if (prolif) cls.push(prolif);
  if (prolif && s.input.selection?.players?.includes(p.id)) cls.push('choice-selected');
  // Mana da mesma cor num símbolo só, com a quantidade. Pagando um custo, cada símbolo vira um botão que gasta uma.
  const spend = p.id === s.you && !!s.input.paying;
  const colors = Object.values(p.pool).filter(n => n > 0).length;
  const pool = Object.entries(p.pool).filter(([, n]) => n > 0).map(([c, n]) => {
    const html = `${pip(c)}${n > 1 ? `<b class="pool-n" aria-hidden="true">×${n}</b>` : ''}`;
    return spend ? `<button class="pool-mana" data-mana="${c}" aria-label="Usar mana ${c} da reserva (${n} disponíve${n > 1 ? 'is' : 'l'})">${html}</button>` : `<span class="pool-stack">${html}</span>`;
  }).join('');
  const art = v.portraits[idx];
  const offline = s.room?.players.find(rp => rp.playerId !== undefined ? rp.playerId === p.id : rp.seat !== undefined && p.seat !== undefined ? rp.seat === p.seat : rp.name === p.name)?.connected === false;
  const forecast = s.forecast?.find(f => f.player === p.id);
  return `<div class="${cls.join(' ')}" data-pid="${p.id}" role="button" tabindex="0" aria-label="${esc(p.name)}${shownStyle(p) ? `, computador ${shownStyle(p).toLowerCase()}` : ''}${isBracket(p.bracket) ? `, ${bracketLabel(p.bracket)}` : ''}, ${p.life} de vida${playerCountersText(v, p)}${forecast ? `. ${esc(forecastText(forecast, p.id === s.you ? null : p.name, v.cardName))}` : ''}${offline ? ', desconectado' : ''}${p.eliminated ? `, eliminado${eliminatedWhy(v, s, p, ': ')}` : ''}">
    <div class="portrait" ${art ? `style="background-image:url('${art}')"` : ''}>${pool ? `<div class="pool${spend ? ' spend' : ''}" data-n="${colors}">${pool}</div>` : ''}</div>
    ${idx === 0 ? lifeHTML(v, p, cls) : opponentLifeHTML(v, s, p, cls)}
    ${forecast ? forecastBadgeHTML(forecast, idx === 0) : ''}
    ${playerCounters(v, p)}
    <div class="pname">${esc(p.name)}${shownStyle(p) ? ` <small class="pstyle" title="Estilo do computador">${shownStyle(p)}</small>` : ''}</div>
    ${emblems(v, p)}
    ${p.eliminated ? `<span class="seat-eliminated"${eliminatedWhy(v, s, p) ? ` title="Eliminado: ${eliminatedWhy(v, s, p)}"` : ''}>Eliminado</span>` : ''}
    ${offline ? '<div class="offline">desconectado</div>' : ''}
  </div>`;
}
/**
 * A vida. Com bracket, o balão dele abre ao passar o mouse ou ao tocar na vida (o mesmo aberto-fechado dos marcadores);
 * quando o retrato é um alvo possível, tocar nele escolhe o jogador, e o bracket fica só no mouse e no leitor de tela.
 */
function lifeHTML(v: SeatView, p: FPlayer, cls: string[]) {
  if (!isBracket(p.bracket)) return `<div class="life">${p.life}</div>`;
  const key = `bracket-${p.id}`, choosing = cls.includes('selectable-player') || cls.some(c => c.startsWith('prolif'));
  const open = v.openCounter === key;
  return `<div class="life has-bracket${open ? ' open' : ''}"${choosing ? '' : ` data-ctr="${key}"`}>${p.life}</div><span class="life-tip" aria-hidden="true">${esc(bracketTitle(p.bracket))}</span>`;
}
/**
 * A vida do oponente abre um cartão (ao passar o mouse ou ao tocar): nome inteiro, bracket, tempo do turno (correndo, no
 * turno dele; senão, quanto durou o último), mão e dano de comandante recebido. No celular o cabeçalho do Commander deixa o
 * nome e a ampulheta só aqui. Quando o retrato é um alvo possível, tocar nele escolhe o jogador e o cartão fica só no mouse.
 */
function opponentLifeHTML(v: SeatView, s: FState, p: FPlayer, cls: string[]) {
  const key = `life-${p.id}`, choosing = cls.includes('selectable-player') || cls.some(c => c.startsWith('prolif'));
  const open = v.openCounter === key;
  return `<div class="life has-card${open ? ' open' : ''}"${choosing ? '' : ` data-ctr="${key}"`}>${p.life}</div><span class="life-tip life-card" aria-hidden="true">${lifeCardLines(v, s, p).map(line => `<span>${line}</span>`).join('')}</span>`;
}
export function lifeCardLines(v: Pick<SeatView, 'cardName'>, s: Pick<FState, 'activePlayer' | 'gameOver' | 'turnElapsedMs' | 'players' | 'you'>, p: FPlayer) {
  const lines = [`<b>${esc(p.name)}</b>`];
  // Quem já perdeu: o motivo logo abaixo do nome (vida a 0, dano de comandante, veneno...).
  if (p.eliminated && eliminatedWhy(v, s, p)) lines.push(`<b class="life-card-damage">Eliminado: ${eliminatedWhy(v, s, p)}</b>`);
  if (isBracket(p.bracket)) lines.push(esc(bracketTitle(p.bracket)));
  // O tempo do turno anda junto com o relógio do topo (tableClocks atualiza todo [data-turn-timer]).
  if (s.activePlayer === p.id && !s.gameOver) lines.push(`Turno atual: <span data-turn-timer>${turnTimeText(s.turnElapsedMs ?? 0)}</span>`);
  else if (p.lastTurnMs != null) lines.push(`Último turno: ${turnTimeText(p.lastTurnMs)}`);
  lines.push(p.handCount === 1 ? '1 carta na mão' : `${p.handCount} cartas na mão`);
  // Dano de comandante recebido, uma linha por comandante, com o dono: dois jogadores podem ter o mesmo comandante.
  for (const d of (p.commanderDamage ?? []).filter(d => d.damage > 0)) {
    const owner = s.players.find(o => o.commanders?.some(c => c.id === d.commanderId));
    const whose = owner ? ` (${owner.id === s.you ? 'seu' : `de ${esc(owner.name)}`})` : '';
    lines.push(`Dano de ${esc(v.cardName(d.commanderId))}${whose}: <b class="life-card-damage">${d.damage}/21</b>`);
  }
  return lines;
}
/** O motivo da eliminação, já escapado, com `prefix` na frente; vazio sem motivo conhecido. */
function eliminatedWhy(v: Pick<SeatView, 'cardName'>, s: Pick<FState, 'players' | 'you'>, p: FPlayer, prefix = '') {
  const reason = lossReasonText(s, p, p.id === s.you, v.cardName);
  return reason ? prefix + esc(reason) : '';
}
export const playerCountersText = (v: SeatView, p: FPlayer) => countersText(p.counters, p.ringTempted) + playerStatusText(p, v.activePlayer, v.spellsTotal) + dungeonText(p);
export const playerCounters = (v: SeatView, p: FPlayer) => withDungeonBadges(playerCountersHTML(p.id, p.counters, v.counterBumps.get(p.id), v.openCounter, p.ringTempted),
  playerStatusHTML(p, v.activePlayer, v.openCounter, v.counterBumps.get(p.id), v.spellsTotal) + dungeonBadgesHTML(p, v.openCounter));
export function emblems(v: SeatView, p: FPlayer) {
  const list = p.emblems ?? [];
  if (!list.length) return '';
  return `<div class="emblems">${list.map(c => {
    const art = v.image(emblemSource(c), 'small');
    return `<div class="emblem" data-peek="${c.id}" tabindex="0" aria-label="${esc(emblemLabel(c))}">
      <div class="emblem-art" ${art ? `style="background-image:url('${art}')"` : ''}></div></div>`;
  }).join('')}</div>`;
}
export function piles(v: SeatView, s: FState, p: FPlayer) {
  const top = p.graveyard[p.graveyard.length - 1];
  const gyLive = p.graveyard.some(c => canUse(s, c)) ? ' actionable' : '';
  // Exílio só aparece com cartas: é onde ficam as tramadas (plot), as de Aventura e afins, que dá para conjurar dali.
  const ex = p.exile[p.exile.length - 1];
  const exLive = p.exile.some(c => canUse(s, c)) ? ' actionable' : '';
  const exile = ex ? `<div class="pile gy exile${exLive}" data-gy="${p.id}" data-zone="exile" role="button" tabindex="0" title="Exílio" aria-label="Ver exílio de ${esc(p.name)} (${p.exile.length})"><div class="gy-top" data-peek="${ex.id}">${v.face(ex, 'small')}</div>${PILE_ICON_EXILE}<span>${p.exile.length}</span></div>` : '';
  // Topo do grimório à vista (Vizier of the Menagerie, Courser of Kruphix...): tocar joga a carta quando dá, senão mostra.
  const lt = p.libraryTop;
  const library = lt
    ? `<div class="pile lib top-visible${canUse(s, lt) ? ' actionable' : ''}" title="Grimório"><div class="gy-top" data-fid="${lt.id}" data-library-top role="button" tabindex="0" aria-label="${esc(label(lt))}, topo do grimório de ${esc(p.name)}${canUse(s, lt) ? '. Jogar' : ''}">${v.face(lt, 'small')}</div><span>${p.library}</span></div>`
    : `<div class="pile lib${sleeveClass(p.sleeve)}" title="Grimório"><div class="back"></div><span>${p.library}</span></div>`;
  return `${library}
    <div class="pile gy${gyLive}" data-gy="${p.id}" data-zone="gy" role="button" tabindex="0" title="Cemitério" aria-label="Ver cemitério de ${esc(p.name)} (${p.graveyard.length})">${top ? `<div class="gy-top" data-peek="${top.id}">${v.face(top, 'small')}</div>` : '<div class="gy-empty"></div>'}${PILE_ICON_GY}<span>${p.graveyard.length}</span></div>${exile}`;
}
export function commandCards(v: SeatView, s: FState, p: FPlayer) {
  return (p.commandZone ?? []).map(c => {
    const commander = p.commanders?.find(item => item.id === c.id);
    const playable = canPlayCommander(s, c.id, s.input.gen);
    return `<div class="command-slot"><button class="command-card${playable ? ' playable' : ''}" data-fid="${c.id}" data-command-card aria-label="${playable ? 'Conjurar' : 'Inspecionar'} ${esc(label(c))}. Taxa de comandante: ${commander?.tax ?? 0} manas. Conjurado da zona de comando ${commander?.casts ?? 0} vezes.">${v.face(c, 'normal')}${countSealsHTML(c, v.playerName, s.you)}<span class="command-tax">+${commander?.tax ?? 0}</span></button></div>`;
  }).join('');
}
export function damageButton(p: FPlayer) {
  // Só aparece depois do primeiro dano de comandante: "Dano 0/21" não diz nada.
  const highest = Math.max(0, ...(p.commanderDamage ?? []).map(item => item.damage));
  if (highest <= 0) return '';
  return `<button class="commander-damage${highest >= 15 ? ' danger' : ''}" data-gy="${p.id}" data-zone="damage" aria-label="Ver dano de comandante recebido por ${esc(p.name)}">Dano <b>${highest}/21</b></button>`;
}
export function seatRow(id: string, kind: 'lands' | 'creatures', name: string, content: string) {
  const zone = kind === 'lands' ? 'terrenos' : 'criaturas';
  return `<div class="seat-row ${kind}-lane"><div class="row ${kind}" id="${id}" tabindex="0" aria-label="${zone} de ${esc(name)}. Role horizontalmente para ver todas as cartas.">${content}</div><button class="seat-scroll back-scroll" data-ui="row-scroll" data-scroll-row="${id}" data-scroll-direction="-1" aria-label="Ver ${zone} anteriores de ${esc(name)}" hidden>‹</button><button class="seat-scroll forward-scroll" data-ui="row-scroll" data-scroll-row="${id}" data-scroll-direction="1" aria-label="Ver mais ${zone} de ${esc(name)}" hidden>›</button></div>`;
}
/** Abre o campo do oponente em tela cheia. */
export const focusButton = (p: FPlayer, extra = '') => `<button type="button" class="seat-view-btn focus-open${extra}" data-focus-seat="${p.id}" title="Ver o campo de ${esc(p.name)} em tela cheia" aria-label="Ver o campo de ${esc(p.name)} em tela cheia">${EXPAND}</button>`;
/** O que a mesa espera de você agora, para avisar na tela de foco sem tirar a vista do oponente. */
export function focusDecisionText(s: FState) {
  const input = s.input;
  if (s.gameOver || s.spectating) return '';
  if (input.blocking) return 'Você está sendo atacado: declare os bloqueadores.';
  if (input.attacking) return 'Seu combate: declare os atacantes.';
  if (s.question || input.paying || awaitingDecision(s)) return 'Sua vez de decidir.';
  if (input.priority && s.stack.length) return 'Há algo na pilha para você responder.';
  if (input.priority && s.activePlayer === s.you) return 'É o seu turno.';
  return '';
}
/** Campo do oponente em tela cheia: cabeçalho, troca de oponente, as duas fileiras grandes e as zonas, só para olhar. */
export function focusHTML(v: SeatView, s: FState, visual: FState, p: FPlayer, opponents: FPlayer[], idx: number) {
  const art = v.matArt(s, p, idx);
  const decision = focusDecisionText(s);
  const others = opponents.filter(o => o.id !== p.id);
  const portrait = v.portraits[idx];
  return `${art ? `<div class="playmat" aria-hidden="true" style="${esc(matStyle(art))}"></div>` : ''}
    <header class="focus-head">
      <div class="focus-who"><span class="focus-portrait"${portrait ? ` style="background-image:url('${esc(portrait)}')"` : ''} aria-hidden="true"></span><div><h2 id="fFocusTitle">${esc(p.name)}</h2><p class="focus-life"><b>${p.life}</b> de vida · ${p.handCount ?? p.hand.length} na mão</p></div>${playerCounters(v, p)}${damageButton(p)}</div>
      ${others.length ? `<div class="focus-switch" role="group" aria-label="Trocar de oponente">${others.map(o => `<button type="button" class="focus-other" data-focus-seat="${o.id}" aria-label="Focar em ${esc(o.name)}, ${o.life} de vida"><span>${esc(o.name)}</span><b>${o.life}</b></button>`).join('')}</div>` : ''}
      <button type="button" class="arena-btn secondary focus-close" data-ui="focus-close">${ICON_CLOSE}Fechar</button>
    </header>
    ${decision ? `<p class="focus-decision" role="status"><span>${esc(decision)}</span><button type="button" class="arena-btn primary" data-ui="focus-close">Voltar à mesa</button></p>` : '<p class="focus-decision" role="status" hidden></p>'}
    <div class="focus-field" aria-label="Campo de ${esc(p.name)}">
      <div class="row creatures">${fieldRow(v, visual, p.battlefield.filter(c => !isBackRow(c)))}</div>
      <div class="row lands">${backRow(v, visual, p)}</div>
    </div>
    <footer class="focus-zones"><div class="piles">${piles(v, visual, p)}</div>${p.commandZone?.length ? `<div class="focus-command" aria-label="Zona de comando de ${esc(p.name)}">${commandCards(v, visual, p)}</div>` : ''}</footer>`;
}
/**
 * Exibição do campo de cada oponente: com um oponente só, o botão de tela cheia; com dois ou mais, um botão (olho com
 * seta) que abre o menu com tela cheia, "Ver só" (ou "Ver todos") e "Ocultar". O menu aberto fica em v.seats.menu.
 */
export function seatControls(v: SeatView, p: FPlayer, shown: boolean, count: number) {
  if (count < 2) return `<div class="seat-view" role="group" aria-label="Exibição do campo de ${esc(p.name)}">${focusButton(p)}</div>`;
  const solo = v.seats.solo === p.id, open = v.seats.menu === p.id;
  const item = (attrs: string, icon: string, text: string) => `<button type="button" role="menuitem" class="seat-menu-item" ${attrs}>${icon}<span>${text}</span></button>`;
  return `<div class="seat-view seat-menu${open ? ' open' : ''}">
    <button type="button" class="seat-view-btn seat-menu-btn" data-seat-menu="${p.id}" aria-haspopup="menu" aria-expanded="${open}" aria-controls="fSeatMenu-${p.id}" title="Exibição do campo de ${esc(p.name)}" aria-label="Exibição do campo de ${esc(p.name)}">${ICON_EYE}${CARET}</button>
    ${open ? `<div class="seat-menu-list" id="fSeatMenu-${p.id}" role="menu" aria-label="Exibição do campo de ${esc(p.name)}">
      ${item(`data-focus-seat="${p.id}"`, EXPAND, 'Tela cheia')}
      ${item(`data-seat-solo="${p.id}" aria-pressed="${solo}"`, FOCUS, solo ? 'Ver todos os oponentes' : `Ver só ${esc(p.name)}`)}
      ${shown && !solo ? item(`data-seat-hide="${p.id}"`, EYE_OFF, 'Ocultar campo') : ''}
    </div>` : ''}
  </div>`;
}
const CARET = '<svg class="seat-menu-caret" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>';
/** Destaque do assento de quem joga o turno; no desenho em que o turno passa, a classe que anima a troca. */
export function seatTurnClass(v: SeatView, s: FState, p: FPlayer) {
  const current = turnHighlight(s, p.id) ? ' current-seat' : '';
  return current + (v.seatTurn?.to === p.id ? ' turn-arrived' : v.seatTurn?.from === p.id ? ' turn-left' : '');
}
/** Oponente oculto: faixa compacta com retrato, vida, mão, marcadores e dano de comandante, e um botão para voltar. */
export function collapsedSeat(v: SeatView, s: FState, p: FPlayer, index: number) {
  return `<section class="table-seat collapsed${p.eliminated ? ' eliminated' : ''}${seatTurnClass(v, s, p)}" data-seat-player="${p.id}" aria-label="Campo de ${esc(p.name)} oculto${p.eliminated ? ', eliminado' : ''}">
    <header class="seat-heading"><div class="avatar-slot">${avatar(v, s, p, index + 1)}</div>${seatHandHTML(p)}${playerCounters(v, p)}${damageButton(p)}</header>
    <p class="seat-summary">${p.battlefield.filter(c => c.creature).length} criaturas · ${p.battlefield.filter(c => c.land).length} terrenos</p>
    <div class="seat-zones"><div class="piles">${piles(v, s, p)}</div></div>
    ${focusButton(p, ' seat-focus')}
    <button type="button" class="seat-show" data-seat-show="${p.id}" aria-label="Mostrar o campo de ${esc(p.name)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg><span>Mostrar campo</span></button>
  </section>`;
}
export function opponentSeat(v: SeatView, s: FState, p: FPlayer, index: number, count = 1, forced: string | null = null) {
  const chosen = v.seats.solo !== null ? v.seats.solo === p.id : !v.seats.hidden.has(p.id);
  const focused = focusedByAttack(v.seatMemory, p.id);
  return `<section class="table-seat${p.eliminated ? ' eliminated' : ''}${seatTurnClass(v, s, p)}${forced && !chosen ? ' forced' : ''}" data-seat-player="${p.id}" aria-label="Campo de ${esc(p.name)}${p.eliminated ? ', eliminado' : ''}">
    ${(art => art ? `<div class="playmat" aria-hidden="true" style="${esc(matStyle(art))}"></div>` : '')(v.matArt(s, p, index + 1))}
    <header class="seat-heading"><div class="avatar-slot">${avatar(v, s, p, index + 1)}</div>${seatHandHTML(p)}${p.commandZone?.length ? `<div class="seat-command" aria-label="Zona de comando de ${esc(p.name)}">${commandCards(v, s, p)}</div>` : ''}${playerCounters(v, p)}${damageButton(p)}${seatControls(v, p, true, count)}</header>
    ${forced && !chosen ? `<p class="seat-forced" role="status">À vista: ${esc(forced)}</p>` : focused ? '<p class="seat-forced focused">Em foco: atacando você</p>' : ''}
    <div class="seat-zones"><div class="piles">${piles(v, s, p)}</div></div>
    <div id="fField-${p.id}" class="field opp${s.activePlayer === p.id ? ' turn' : ''}">${seatRow(`fLands-${p.id}`, 'lands', p.name, backRow(v, s, p))}${seatRow(`fCreatures-${p.id}`, 'creatures', p.name, fieldRow(v, s, p.battlefield.filter(c => !isBackRow(c))))}</div>
  </section>`;
}
