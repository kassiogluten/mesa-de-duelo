// O painel "Prepare o próximo jogo" de uma melhor de três: o deck e o sideboard em miniaturas, o filtro, a contagem e o que saiu e entrou.
import type { FState } from '../forge/client';
import { entryKey, isConstructed, type DeckEntry } from '../decks';
import { esc } from './cardtext';
import { tablePlayers } from './commanderTable';
import { CURVE, type DeckRow } from './deckStats';
import { reportButton } from './resultView';
import { copyDelta, sideboardChanges, sideboardGroups, sideboardStats, TYPE_FILTERS, type SideboardFilter, type SideboardSide } from './sideboardDraft';
import type { MatchState } from './tableState';
import './sideboard.css';

type SideboardDraft = NonNullable<MatchState['sideboardDraft']>;
export interface SideboardViewOptions { error: string; busy: boolean; details: string; filter: SideboardFilter; feedback: boolean; ptName(name: string): string }

const ICON_ZOOM = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6" fill="none" stroke="currentColor" stroke-width="2"/><path d="m15 15 5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const ICON_SEARCH = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m16 16 4.5 4.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
const ICON_UNDO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7 4 12l5 5M4 12h11a5 5 0 0 1 0 10h-3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const SIDE_NAME: Record<SideboardSide, string> = { main: 'Deck principal', sideboard: 'Sideboard' };
const copies = (n: number) => `${n} ${n === 1 ? 'cópia' : 'cópias'}`;
const signed = (n: number) => n > 0 ? `+${n}` : `−${-n}`;

function tileHTML(row: DeckRow, side: SideboardSide, original: DeckEntry[], current: DeckEntry[], locked: boolean, ptName: (name: string) => string) {
  const key = entryKey(row), label = row.info?.label ?? ptName(row.name);
  const delta = copyDelta(original, current, key);
  const image = row.info?.image ?? row.info?.imageSmall;
  const target = side === 'main' ? 'o sideboard' : 'o deck principal';
  const face = image ? `<img src="${esc(image)}" alt="" draggable="false" loading="lazy">` : `<span class="sb-card-text"><b>${esc(label)}</b></span>`;
  return `<li class="sb-card${row.count > 1 ? ' stacked' : ''}${delta > 0 ? ' is-in' : delta < 0 ? ' is-out' : ''}" data-sb-key="${esc(key)}" data-sb-side="${side}" data-sb-name="${esc(row.name)}">`
    + `<button type="button" class="sb-card-move" data-sb-move="${side}" data-sb-key="${esc(key)}" data-focus="sb:${side}:${esc(key)}" title="${esc(label)}" aria-label="${esc(label)}, ${copies(row.count)}${delta ? ` (${signed(delta)})` : ''}. Passar uma para ${target}" ${locked ? 'disabled' : ''}>${face}`
    + `<span class="sb-card-count" aria-hidden="true">${row.count}</span>${delta ? `<span class="sb-card-delta" aria-hidden="true">${signed(delta)}</span>` : ''}</button>`
    + `<button type="button" class="sb-card-zoom" data-sb-inspect="${esc(row.name)}" aria-label="Ver ${esc(label)}">${ICON_ZOOM}</button></li>`;
}

function curveHTML(curve: number[]) {
  const max = Math.max(1, ...curve);
  return `<div class="sb-curve" role="img" aria-label="Curva de mana: ${curve.map((n, i) => `${n} de custo ${CURVE[i]}`).join(', ')}">${curve.map((n, i) => `<span><i style="height:${Math.round(n / max * 100)}%"></i><small>${CURVE[i]}</small></span>`).join('')}</div>`;
}

function columnHTML(side: SideboardSide, s: FState, draft: SideboardDraft, o: SideboardViewOptions, locked: boolean) {
  const entries = draft[side], original = s.sideboarding![side];
  const total = entries.reduce((n, e) => n + e.count, 0), before = original.reduce((n, e) => n + e.count, 0);
  const groups = sideboardGroups(entries, o.filter);
  const format = s.config?.format;
  const warn = isConstructed(format) && side === 'main' && total < 60 ? `Faltam ${60 - total} para as 60 cartas do formato.`
    : isConstructed(format) && side === 'sideboard' && total > 15 ? `Passou ${total - 15} do limite de 15 cartas.` : '';
  const stats = side === 'main' ? sideboardStats(entries) : null;
  const known = !!stats && stats.lands + stats.creatures + stats.spells > 0;
  const filtered = !!o.filter.text.trim() || !!o.filter.type;
  const body = groups.map(g => `<section class="sb-group"><h4>${g.label}<span>${g.rows.reduce((n, r) => n + r.count, 0)}</span></h4><ul class="sb-grid">${g.rows.map(r => tileHTML(r, side, original, entries, locked, o.ptName)).join('')}</ul></section>`).join('')
    || `<p class="sb-empty">${filtered ? 'Nenhuma carta com esse filtro.' : side === 'main' ? 'O deck principal está vazio.' : 'Nenhuma carta no sideboard.'}</p>`;
  return `<section class="sb-col" data-sb-drop="${side}" aria-labelledby="fSb-${side}"><header class="sb-col-head"><h3 id="fSb-${side}">${SIDE_NAME[side]} <b>${total}</b>${total !== before ? `<small class="sb-col-delta">${signed(total - before)}</small>` : ''}</h3>`
    + `${stats && known ? `<p class="sb-stats"><span>${stats.lands} terrenos</span><span>${stats.creatures} criaturas</span><span>${stats.spells} outras mágicas</span></p>${curveHTML(stats.curve)}` : ''}</header>`
    + `${warn ? `<p class="sb-warn" role="status">${warn}</p>` : ''}<div class="sb-col-body" data-sb-scroll="${side}">${body}</div></section>`;
}

function changesHTML(s: FState, draft: SideboardDraft, o: SideboardViewOptions, locked: boolean) {
  const { out, into } = sideboardChanges(s.sideboarding!.main, draft.main);
  if (!out.length && !into.length) return '<div class="sb-changes" aria-live="polite"><p class="sb-changes-none">Nenhuma troca: o deck segue igual ao do jogo anterior.</p></div>';
  const chips = (entries: DeckEntry[]) => entries.map(e => `<li>${e.count}× ${esc(o.ptName(e.name))}</li>`).join('');
  const sum = (entries: DeckEntry[]) => entries.reduce((n, e) => n + e.count, 0);
  return `<div class="sb-changes" aria-live="polite">${out.length ? `<div class="sb-out"><span>Saem ${sum(out)}</span><ul>${chips(out)}</ul></div>` : ''}${into.length ? `<div class="sb-in"><span>Entram ${sum(into)}</span><ul>${chips(into)}</ul></div>` : ''}`
    + `<button type="button" class="sb-reset" data-sb-reset ${locked ? 'disabled' : ''}>${ICON_UNDO}Desfazer tudo</button></div>`;
}

/** Se o oponente já confirmou o deck do próximo jogo. A melhor de três é sempre entre dois: um assento meu, o outro dele. */
function opponentHTML(s: FState) {
  const ready = s.match?.ready, name = tablePlayers(s).opponents[0]?.name;
  const mine = s.room?.seat ?? 0;
  const theirs = ready?.filter((_, index) => index !== mine);
  if (!name || theirs?.length !== 1) return '';
  return theirs[0] ? `<p class="sb-opponent is-ready" role="status"><i aria-hidden="true"></i>${esc(name)} já confirmou o deck</p>`
    : `<p class="sb-opponent" role="status"><i aria-hidden="true"></i>${esc(name)} ainda está trocando cartas</p>`;
}

/** Entre os jogos de uma melhor de três: trocar cartas entre o deck e o sideboard. `details` é o resumo do jogo que acabou. */
export function sideboardHTML(s: FState, draft: SideboardDraft, o: SideboardViewOptions) {
  const sb = s.sideboarding!;
  const locked = sb.ready || o.busy;
  const score = s.match ? s.match.wins.join(' × ') : '';
  const { out, into } = sideboardChanges(sb.main, draft.main);
  // As cartas da partida são sempre as mesmas: se o deck principal não mudou, o sideboard também não.
  const changed = out.length + into.length > 0;
  const primary = sb.ready ? 'Aguardando o oponente…' : o.busy ? 'Verificando…' : changed ? 'Confirmar trocas e continuar' : 'Continuar sem trocas';
  return `<div class="sideboard-panel" role="dialog" aria-modal="true" aria-labelledby="fSideboardTitle">
    <header class="sb-head"><h2 id="fSideboardTitle">Prepare o próximo jogo</h2>
    <p>Jogo ${s.match?.gameNumber ?? 1} encerrado${score ? ` · Placar: ${score}` : ''}. Toque numa carta para passá-la para o outro lado, ou arraste. Solte sobre uma carta do outro lado para trocar as duas.</p></header>
    ${o.error ? `<p class="sideboard-error" role="alert">${esc(o.error)}</p>` : ''}
    ${o.details}
    <div class="sb-toolbar"><label class="sb-search">${ICON_SEARCH}<input type="search" data-sb-filter data-focus="sb:filter" value="${esc(o.filter.text)}" placeholder="Buscar carta" aria-label="Buscar carta pelo nome" autocomplete="off" spellcheck="false"></label>
    <div class="sb-types" role="group" aria-label="Mostrar só">${TYPE_FILTERS.map(([value, label]) => `<button type="button" data-sb-type="${value}" data-focus="sb:type:${value}" aria-pressed="${o.filter.type === value}">${label}</button>`).join('')}</div></div>
    <div class="sb-board">${columnHTML('main', s, draft, o, locked)}${columnHTML('sideboard', s, draft, o, locked)}</div>
    <footer class="sb-foot">${changesHTML(s, draft, o, locked)}${opponentHTML(s)}
    <div class="sideboard-actions"><button class="arena-btn secondary" data-ui="sideboard-concede">Desistir da série</button>${sb.ready ? '<button class="arena-btn secondary" data-ui="sideboard-cancel">Voltar a editar</button>' : ''}<button class="arena-btn primary" data-ui="${changed ? 'sideboard-ready' : 'next-game'}" ${locked ? 'disabled' : ''}>${primary}</button></div></footer>
    ${reportButton(o.feedback)}
  </div>`;
}
