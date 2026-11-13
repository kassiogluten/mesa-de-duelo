// Os dois jogadores no editor do Laboratório: vida e veneno, a caixa de pôr carta e as zonas, com as repetidas juntas.
import { cardImageUrls } from '../scryfall';
import { esc } from './cardtext';
import {
  EXILE_MODES, LAB_COUNTERS, ZONES, counterName, nameOf, zoneList, zoneRuns,
  type Draft, type Exiled, type Permanent, type Run, type Side, type Zone,
} from './labModel';

/** O que só a tela guarda: a carta com "Ajustar" aberto, a zona escolhida na caixa de cada jogador e o jogador aberto. */
export interface BoardUi { open: string | null; target: [Zone, Zone]; player: 0 | 1 }
/** A chave do "Ajustar" aberto: a permanente pelo id (que não muda quando outras saem); a do exílio, pela posição. */
export const openKey = (p: number, zone: Zone, side: Side, index: number) =>
  zone === 'battlefield' ? `b:${side.battlefield[index]?.uid}` : `x:${p}:${index}`;

const ZONE_EMPTY: Record<Zone, string> = { battlefield: 'campo', hand: 'mão', library: 'grimório', graveyard: 'cemitério', exile: 'exílio' };

function art(name: string) {
  const url = cardImageUrls([name], ['small'])[0];
  return url ? `<img class="lab-art" src="${esc(url)}" alt="" loading="lazy">` : '<span class="lab-art" aria-hidden="true"></span>';
}
const button = (act: string, key: string, text: string, label: string, extra = '') =>
  `<button type="button" class="lab-icon" data-act="${act}" data-key="${key}:${act}" aria-label="${esc(label)}"${extra}>${text}</button>`;

/** Rótulo de uma permanente para "presa a": o nome e, com repetidas, qual delas. */
function permanentLabel(field: readonly Permanent[], c: Permanent, player: number, index: number) {
  const same = field.filter(o => o.name === c.name).length;
  return `${c.name}${same > 1 ? ` (${field.slice(0, index + 1).filter(o => o.name === c.name).length})` : ''}, Jogador ${player + 1}`;
}

/** Os selos do que está diferente na permanente, para ver sem abrir o "Ajustar". */
function permanentChips(d: Draft, c: Permanent) {
  const host = d.players.flatMap(s => s.battlefield).find(o => o.uid === c.attachedTo);
  return [
    c.tapped ? 'Virada' : '', c.sick ? 'Entrou neste turno' : '',
    ...Object.entries(c.counters).filter(([, n]) => n > 0).map(([type, n]) => `${counterName(type)} ×${n}`),
    host ? `presa a ${host.name}` : '',
  ].filter(Boolean).map(t => `<span class="lab-chip">${esc(t)}</span>`).join('');
}

function permanentAdjust(d: Draft, c: Permanent, canMove: { up: boolean; down: boolean }, key: string) {
  const options = d.players.flatMap((other, player) => other.battlefield.map((o, index) => ({ o, field: other.battlefield, player, index }))).filter(x => x.o.uid !== c.uid);
  const counters = Object.entries(c.counters);
  const free = LAB_COUNTERS.filter(([t]) => !(t in c.counters));
  return `<div class="lab-adjust" id="labAdjust-${esc(key)}">
    <div class="lab-adjust-row"><span class="lab-adjust-label">Estado</span><label><input type="checkbox" data-prop="tapped" data-key="${key}:tapped"${c.tapped ? ' checked' : ''}> Virada</label><label><input type="checkbox" data-prop="sick" data-key="${key}:sick"${c.sick ? ' checked' : ''}> Entrou neste turno</label></div>
    <div class="lab-adjust-row"><span class="lab-adjust-label">Marcadores</span>
      ${counters.map(([type, n]) => `<label class="lab-counter">${esc(counterName(type))}<input type="number" class="input-field" min="0" max="999" value="${n}" data-counter="${esc(type)}" data-key="${key}:counter-${esc(type)}" aria-label="Marcadores de ${esc(counterName(type))} em ${esc(c.name)}"></label>`).join('')}
      ${free.length ? `<select class="input-field lab-small" data-prop="add-counter" data-key="${key}:add-counter" aria-label="Pôr marcador em ${esc(c.name)}"><option value="">Pôr marcador…</option>${free.map(([t, label]) => `<option value="${t}">${label}</option>`).join('')}</select>` : ''}
    </div>
    ${options.length ? `<label class="lab-adjust-row"><span class="lab-adjust-label">Presa a</span><select class="input-field lab-small" data-prop="attach" data-key="${key}:attach"><option value="">nada</option>${options.map(x => `<option value="${x.o.uid}"${c.attachedTo === x.o.uid ? ' selected' : ''}>${esc(permanentLabel(x.field, x.o, x.player, x.index))}</option>`).join('')}</select></label>` : ''}
    ${canMove.up || canMove.down ? `<div class="lab-adjust-row"><span class="lab-adjust-label">Lugar no campo</span><button type="button" class="ghost-btn lab-small" data-act="up" data-key="${key}:up-adj"${canMove.up ? '' : ' disabled'}>↑ Antes</button><button type="button" class="ghost-btn lab-small" data-act="down" data-key="${key}:down-adj"${canMove.down ? '' : ' disabled'}>↓ Depois</button></div>` : ''}
  </div>`;
}

function exileAdjust(entry: Exiled, key: string) {
  return `<div class="lab-adjust" id="labAdjust-${esc(key)}"><label class="lab-adjust-row"><span class="lab-adjust-label">No exílio</span><select class="input-field lab-small" data-prop="exile-mode" data-key="${key}:mode" aria-label="Como ${esc(entry.name)} está no exílio">${EXILE_MODES.map(([mode, label]) => `<option value="${mode}"${entry.mode === mode ? ' selected' : ''}>${label}</option>`).join('')}</select></label></div>`;
}

function rowHTML(d: Draft, ui: BoardUi, side: Side, p: number, zone: Zone, run: Run, i: number, all: Run[]) {
  const entry = zoneList(side, zone)[run.start]!, name = nameOf(entry), group = run.count > 1;
  const key = `${p}:${zone}:${run.start}`;
  const adjustKey = openKey(p, zone, side, run.start), open = ui.open === adjustKey;
  const title = group ? `${run.count}× ${name}` : name;
  const pos = zone === 'library' ? `<span class="lab-pos">${group ? `${run.start + 1}–${run.start + run.count}` : run.start + 1}.</span> ` : '';
  const chips = zone === 'battlefield' && !group ? permanentChips(d, entry as Permanent)
    : zone === 'exile' && (entry as Exiled).mode ? `<span class="lab-chip">${esc(EXILE_MODES.find(([m]) => m === (entry as Exiled).mode)![1])}</span>` : '';
  const tools = [
    group ? button('minus', key, '−', `Tirar uma cópia de ${name}`) + `<span class="lab-qty" aria-hidden="true">${run.count}</span>` + button('plus', key, '+', `Pôr mais uma cópia de ${name}`) : '',
    zone === 'library' && all.length > 1 ? button('up', key, '↑', `Subir ${title} no grimório`, i === 0 ? ' disabled' : '') + button('down', key, '↓', `Descer ${title} no grimório`, i === all.length - 1 ? ' disabled' : '') : '',
    zone === 'battlefield' || zone === 'exile' ? `<button type="button" class="ghost-btn lab-small lab-adjust-btn" data-act="adjust" data-key="${key}:adjust" aria-expanded="${open}" aria-controls="labAdjust-${esc(adjustKey)}"${group ? ` aria-label="Ajustar uma das ${run.count} cópias de ${esc(name)}"` : ''}>Ajustar</button>` : '',
    button('remove', key, '×', group ? `Tirar as ${run.count} cópias de ${name}` : `Tirar ${name}`),
  ].join('');
  const panel = !open ? '' : zone === 'battlefield' ? permanentAdjust(d, entry as Permanent, { up: i > 0, down: i < all.length - 1 }, adjustKey) : exileAdjust(entry as Exiled, adjustKey);
  return `<li class="lab-card${open ? ' open' : ''}" data-start="${run.start}" data-count="${run.count}">
    <div class="lab-card-row">${art(name)}<span class="lab-card-name">${pos}<strong>${esc(title)}</strong>${chips ? `<span class="lab-chips">${chips}</span>` : ''}</span><span class="lab-tools">${tools}</span></div>${panel}</li>`;
}

function zoneHTML(d: Draft, ui: BoardUi, side: Side, p: number, zone: Zone, title: string) {
  const list = zoneList(side, zone);
  const isOpen = (index: number) => ui.open === openKey(p, zone, side, index);
  const all = zoneRuns(d, side, zone, isOpen);
  return `<section class="lab-zone" data-zone="${zone}"><h3>${title} <span class="lab-count">${list.length}</span>${zone === 'library' ? '<span class="lab-hint">a primeira é a do topo</span>' : ''}</h3>
    <ul class="lab-list">${all.map((run, i) => rowHTML(d, ui, side, p, zone, run, i, all)).join('')}</ul></section>`;
}

/** "Mão, cemitério e exílio vazios." */
function emptyLine(empty: Zone[]) {
  if (!empty.length) return '';
  const names = empty.map(z => ZONE_EMPTY[z]);
  const text = names.length > 1 ? `${names.slice(0, -1).join(', ')} e ${names.at(-1)} vazios` : `${names[0]} ${empty[0] === 'hand' ? 'vazia' : 'vazio'}`;
  return `<p class="lab-empty">${esc(text[0]!.toUpperCase() + text.slice(1))}.</p>`;
}

function playerHTML(d: Draft, ui: BoardUi, side: Side, p: number) {
  const filled = ZONES.filter(([zone]) => zoneList(side, zone).length > 0);
  const empty = ZONES.filter(([zone]) => !zoneList(side, zone).length).map(([zone]) => zone);
  const target = ui.target[p]!;
  return `<section class="lab-player" data-player="${p}" role="tabpanel" aria-labelledby="labTab${p}">
    <header class="lab-player-head">
      <p class="lab-player-who">${p === 0 ? 'Você joga com este.' : 'Quem entrar pelo link joga com este.'}</p>
      <label class="lab-stat">Vida<input type="number" class="input-field" data-stat="life" value="${side.life}" min="-999999" max="999999"></label>
      <label class="lab-stat">Veneno<input type="number" class="input-field" data-stat="poison" value="${side.poison}" min="0" max="999"></label>
    </header>
    <form class="lab-add" data-add>
      <div class="lab-add-row"><input class="input-field" list="labNames" autocomplete="off" spellcheck="false" placeholder="Nome da carta, ou 3 Island" data-key="${p}:add" aria-label="Carta para pôr, Jogador ${p + 1}"><button type="submit" class="ghost-btn">Pôr</button></div>
      <fieldset class="lab-pick"><legend>Onde</legend>${ZONES.map(([zone, title]) => `<label><input type="radio" name="labTarget${p}" value="${zone}"${zone === target ? ' checked' : ''}><span>${title}</span></label>`).join('')}</fieldset>
    </form>
    ${filled.map(([zone, title]) => zoneHTML(d, ui, side, p, zone, title)).join('')}
    ${filled.length ? emptyLine(empty) : '<p class="lab-empty">Nenhuma carta ainda: escolha onde e escreva o nome da carta.</p>'}
  </section>`;
}

/** As abas dos dois jogadores e o editor do que está aberto. */
export function boardHTML(d: Draft, ui: BoardUi) {
  const count = (s: Side) => ZONES.reduce((n, [zone]) => n + zoneList(s, zone).length, 0);
  const tabs = d.players.map((side, p) => `<button type="button" role="tab" id="labTab${p}" data-tab-player="${p}" aria-selected="${ui.player === p}" tabindex="${ui.player === p ? 0 : -1}">Jogador ${p + 1} <span class="lab-count">${count(side)}</span></button>`).join('');
  return `<div class="lab-player-tabs" role="tablist" aria-label="Jogador">${tabs}</div>${playerHTML(d, ui, d.players[ui.player], ui.player)}`;
}
