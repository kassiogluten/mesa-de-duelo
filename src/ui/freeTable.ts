import type { DeckData, DeckFormat } from '../decks';
import { cardInfo } from '../cards';
import { cacheGet, fetchByNames } from '../scryfall';
import {
  History, addCounter, createToken, draw, locate, mill, move, mulligan, newSandbox, parseSandbox, shuffleLibrary,
  toggleFaceDown, toggleTap, untapAll, type Position, type SCard, type Sandbox, type Zone,
} from '../free/sandbox';
import { esc } from './cardtext';
import { colorFromCost, faceHTML } from './face';
import { hideCardPreview, inspectCard, showCardPreview, type InspectorCard } from './cardInspector';
import { toggleFullscreen } from './landscape';
import './freeTable.css';

/** Jogo da mesa livre guardado no navegador, para voltar a ele depois de recarregar a página. */
export const FREE_KEY = 'mesa:livre';
export function loadFreeTable(): Sandbox | null {
  try { return parseSandbox(localStorage.getItem(FREE_KEY)); } catch { return null; }
}

const ZONE_NAME: Record<Zone, string> = { library: 'Grimório', hand: 'Mão', battlefield: 'Campo de batalha', graveyard: 'Cemitério', exile: 'Exílio', command: 'Zona de comando' };
const LONG_PRESS = 480;

export interface FreeTableOptions { onExit(): void }
export interface FreeTable { open(deck: DeckData, format: DeckFormat): void; resume(saved: Sandbox): void }

export function createFreeTableView(root: HTMLElement, opts: FreeTableOptions): FreeTable {
  let s: Sandbox | null = null;
  const history = new History();
  let viewing: Zone | null = null;
  let menu: { id?: number; pile?: Zone; x: number; y: number } | null = null;
  let tokenForm = false;
  let pressTimer: ReturnType<typeof setTimeout> | undefined;
  let pressed = false;

  const info = (name: string) => { const sc = cacheGet(name); return sc ? cardInfo(sc) : null; };
  const label = (c: SCard) => c.faceDown ? 'Carta com a face para baixo' : info(c.name)?.label ?? c.name;
  const isLand = (c: SCard) => !c.custom && info(c.name)?.type === 'land';

  function save() {
    try { if (s) localStorage.setItem(FREE_KEY, JSON.stringify(s)); else localStorage.removeItem(FREE_KEY); } catch { /* sem armazenamento */ }
  }
  /** Toda ação passa por aqui: guarda o estado anterior para desfazer, salva e redesenha. */
  function act(fn: (s: Sandbox) => void) {
    if (!s) return;
    history.push(s);
    fn(s);
    menu = null;
    save(); render();
  }

  function face(c: SCard, size: 'small' | 'normal') {
    if (c.faceDown) return '<div class="face"><div class="back" style="width:100%;height:100%"></div></div>';
    const i = c.custom ? null : info(c.name);
    const power = c.custom?.power ?? cacheGet(c.name)?.power;
    const toughness = c.custom?.toughness ?? cacheGet(c.name)?.toughness;
    return faceHTML({
      name: i?.label ?? c.name, manaCost: i?.manaCost ?? '', typeLine: c.custom ? 'Ficha' : cacheGet(c.name)?.pt?.type_line || cacheGet(c.name)?.type_line || '',
      power: power === undefined ? undefined : Number(power) || 0, toughness: toughness === undefined ? undefined : Number(toughness) || 0,
      creature: c.custom ? power !== undefined && power !== '' : i?.type === 'creature', color: colorFromCost(i?.manaCost ?? '', i?.type === 'land'),
      image: c.custom ? undefined : size === 'small' ? i?.imageSmall ?? i?.image : i?.image,
    });
  }
  function counters(c: SCard) {
    const list = Object.entries(c.counters);
    return list.length ? `<div class="ft-counters">${list.map(([k, v]) => `<span>${esc(k)}${v > 1 ? ` ×${v}` : ''}</span>`).join('')}</div>` : '';
  }
  function cardHTML(c: SCard, zone: Zone, size: 'small' | 'normal' = 'small') {
    const aria = `${label(c)}${c.tapped ? ', virada' : ''}${c.token ? ', ficha' : ''}${Object.entries(c.counters).map(([k, v]) => `, ${v} ${k}`).join('')}`;
    return `<div class="ft-card${c.tapped ? ' tapped' : ''}" data-id="${c.id}" data-zone="${zone}" role="button" tabindex="0" draggable="true" aria-label="${esc(aria)}">${face(c, size)}${c.token ? '<span class="ft-tag">Ficha</span>' : ''}${counters(c)}</div>`;
  }

  function pile(zone: Zone, title: string) {
    const cards = s!.zones[zone];
    const top = cards.at(-1);
    const shown = zone === 'library' ? '<div class="face"><div class="back" style="width:100%;height:100%"></div></div>' : top ? face(top, 'small') : '';
    return `<button class="ft-pile${cards.length ? '' : ' empty'}" data-pile="${zone}" data-drop="${zone}" aria-label="${title}: ${cards.length} ${cards.length === 1 ? 'carta' : 'cartas'}">
      <span class="ft-pile-face">${shown}</span><span class="ft-pile-label">${title}</span><span class="ft-pile-n">${cards.length}</span></button>`;
  }

  function counter(kind: 'life' | 'oppLife' | 'turn', title: string) {
    return `<div class="ft-counter" role="group" aria-label="${title}"><span>${title}</span><button class="ft-step" data-step="${kind}" data-d="-1" aria-label="${title}: menos um">−</button><strong aria-live="polite">${s![kind]}</strong><button class="ft-step" data-step="${kind}" data-d="1" aria-label="${title}: mais um">+</button></div>`;
  }

  function menuHTML() {
    if (!menu || !s) return '';
    const items: [string, string][] = [];
    if (menu.pile) {
      const z = menu.pile;
      if (z === 'library') items.push(['draw', 'Comprar uma carta'], ['mill', 'Moer uma carta'], ['shuffle', 'Embaralhar'], ['mulligan', 'Nova mão (mulligan)']);
      items.push(['view', `Ver ${ZONE_NAME[z].toLowerCase()}`]);
    } else {
      const found = locate(s, menu.id!);
      if (!found) return '';
      const { zone, card: c } = found;
      if (zone === 'battlefield') {
        items.push(['tap', c.tapped ? 'Desvirar' : 'Virar'], ['face', c.faceDown ? 'Pôr com a face para cima' : 'Pôr com a face para baixo'],
          ['c:+1/+1:1', 'Pôr marcador +1/+1'], ...(c.counters['+1/+1'] ? [['c:+1/+1:-1', 'Tirar marcador +1/+1'] as [string, string]] : []),
          ['c:-1/-1:1', 'Pôr marcador −1/−1'], ...(c.counters['-1/-1'] ? [['c:-1/-1:-1', 'Tirar marcador −1/−1'] as [string, string]] : []),
          ['c:marcador:1', 'Pôr outro marcador'], ...(c.counters.marcador ? [['c:marcador:-1', 'Tirar outro marcador'] as [string, string]] : []),
          ['copy', 'Criar uma ficha cópia']);
      }
      if (zone === 'hand') items.push(['to:battlefield', 'Jogar no campo'], ['facedown', 'Jogar com a face para baixo']);
      const targets: [Zone, Position, string][] = [
        ['battlefield', 'top', 'Pôr no campo'], ['hand', 'top', 'Devolver para a mão'], ['graveyard', 'top', 'Pôr no cemitério'], ['exile', 'top', 'Exilar'],
        ['library', 'top', 'Pôr no topo do grimório'], ['library', 'bottom', 'Pôr no fundo do grimório'], ['command', 'top', 'Pôr na zona de comando'],
      ];
      for (const [to, pos, text] of targets) {
        if (to === zone && to !== 'library') continue;
        if (zone === 'hand' && to === 'battlefield') continue;
        if (to === 'command' && !c.commander) continue;
        items.push([`to:${to}:${pos}`, text]);
      }
      if (!c.faceDown) items.push(['inspect', 'Ampliar']);
    }
    const left = Math.min(menu.x, innerWidth - 230), top = Math.min(menu.y, innerHeight - items.length * 36 - 16);
    return `<div class="ft-menu" role="menu" style="left:${Math.max(8, left)}px;top:${Math.max(8, top)}px">${items.map(([a, t]) => `<button role="menuitem" data-act="${a}">${t}</button>`).join('')}</div>`;
  }

  function viewerHTML() {
    if (!viewing || !s) return '';
    const cards = [...s.zones[viewing]].reverse();
    return `<div class="ft-viewer" role="dialog" aria-modal="true" aria-label="${ZONE_NAME[viewing]}"><div class="ft-viewer-box">
      <header><h2>${ZONE_NAME[viewing]} <small>${cards.length} ${cards.length === 1 ? 'carta' : 'cartas'}${viewing === 'library' ? ' · do topo para o fundo' : ''}</small></h2>
      <div>${viewing === 'library' ? '<button class="ghost-btn" data-act="shuffle">Embaralhar</button>' : ''}<button class="ghost-btn" data-ui="close-viewer">Fechar</button></div></header>
      <div class="ft-viewer-cards">${cards.length ? cards.map(c => cardHTML(viewing === 'library' ? { ...c, faceDown: false } : c, viewing!, 'normal')).join('') : '<p class="ft-empty">Nenhuma carta aqui.</p>'}</div>
      <p class="ft-hint">Toque em uma carta para escolher para onde ela vai.</p></div></div>`;
  }

  function tokenHTML() {
    if (!tokenForm) return '';
    return `<div class="ft-viewer" role="dialog" aria-modal="true" aria-label="Criar ficha"><form class="ft-viewer-box ft-token" data-token>
      <header><h2>Criar ficha</h2></header>
      <label>Nome<input class="input-field" name="name" maxlength="40" placeholder="Saproling" required autocomplete="off"></label>
      <div class="ft-token-pt"><label>Poder<input class="input-field" name="power" maxlength="3" inputmode="numeric" placeholder="1"></label><label>Resistência<input class="input-field" name="toughness" maxlength="3" inputmode="numeric" placeholder="1"></label></div>
      <div class="ft-token-actions"><button type="button" class="ghost-btn" data-ui="close-token">Cancelar</button><button type="submit" class="arena-btn primary">Criar</button></div></form></div>`;
  }

  function render() {
    if (!s) return;
    const field = root.querySelector('.ft-field');
    const scroll = field ? [field.scrollTop, field.scrollLeft] : [0, 0];
    const lands = s.zones.battlefield.filter(isLand), others = s.zones.battlefield.filter(c => !isLand(c));
    root.innerHTML = `<div class="free-table">
      <header class="ft-top">
        <button class="ghost-btn" data-ui="exit">Sair</button>
        <div class="ft-title"><strong>Mesa livre</strong><span>${esc(s.deckName)} · sem regras automáticas</span></div>
        ${counter('turn', 'Turno')}${counter('life', 'Sua vida')}${counter('oppLife', 'Oponente')}
        <div class="ft-actions">
          <button class="ghost-btn" data-act="draw" title="Atalho: C">Comprar</button>
          <button class="ghost-btn" data-act="untap" title="Atalho: D">Desvirar tudo</button>
          <button class="ghost-btn" data-ui="token">Criar ficha</button>
          <button class="ghost-btn" data-ui="undo" ${history.size ? '' : 'disabled'} title="Atalho: Ctrl+Z">Desfazer</button>
          <button class="ghost-btn" data-ui="restart">Recomeçar</button>
          <button class="ghost-btn" data-ui="fullscreen" aria-label="Tela cheia">⛶</button>
        </div>
      </header>
      <main class="ft-field" data-drop="battlefield" aria-label="Campo de batalha">
        <div class="ft-row" aria-label="Permanentes">${others.map(c => cardHTML(c, 'battlefield')).join('') || '<p class="ft-empty">Arraste ou toque nas cartas da mão para colocá-las no campo.</p>'}</div>
        <div class="ft-row lands" aria-label="Terrenos">${lands.map(c => cardHTML(c, 'battlefield')).join('')}</div>
      </main>
      <footer class="ft-bottom">
        <div class="ft-piles">${pile('library', 'Grimório')}${pile('graveyard', 'Cemitério')}${pile('exile', 'Exílio')}${s.zones.command.length || s.format === 'commander' ? pile('command', 'Comando') : ''}</div>
        <div class="ft-hand" data-drop="hand" aria-label="Sua mão: ${s.zones.hand.length} cartas">${s.zones.hand.map(c => cardHTML(c, 'hand', 'normal')).join('')}</div>
      </footer>
      ${viewerHTML()}${tokenHTML()}${menuHTML()}
    </div>`;
    const nextField = root.querySelector('.ft-field');
    if (nextField) [nextField.scrollTop, nextField.scrollLeft] = scroll;
    root.querySelector<HTMLElement>('.ft-menu button')?.focus({ preventScroll: true });
    if (tokenForm) root.querySelector<HTMLInputElement>('[data-token] input')?.focus();
  }

  function start(next: Sandbox) {
    s = next; viewing = null; menu = null; tokenForm = false; history.clear();
    save(); render();
    const names = [...new Set(Object.values(next.zones).flat().filter(c => !c.custom).map(c => c.name))];
    void fetchByNames(names).then(() => { if (s === next) render(); }).catch(() => {});
  }

  /** Ação principal (toque): da mão vai para o campo; no campo vira/desvira; nas outras zonas abre o menu. */
  function primary(el: HTMLElement) {
    const id = Number(el.dataset.id), zone = el.dataset.zone as Zone;
    if (zone === 'hand') act(s => move(s, id, 'battlefield'));
    else if (zone === 'battlefield') act(s => toggleTap(s, id));
    else openMenu(el, { id });
  }
  function openMenu(el: HTMLElement, target: { id?: number; pile?: Zone }, point?: { x: number; y: number }) {
    hideCardPreview(true);
    const r = el.getBoundingClientRect();
    menu = { ...target, x: point?.x ?? r.left + r.width / 2, y: point?.y ?? r.top + r.height / 2 };
    render();
  }

  function runAction(a: string) {
    if (!s) return;
    const id = menu?.id;
    if (a === 'view') { viewing = menu?.pile ?? null; menu = null; render(); return; }
    if (a === 'inspect' && id !== undefined) {
      const c = locate(s, id)?.card; menu = null; render();
      if (c) inspectCard(inspector(c));
      return;
    }
    act(s => {
      if (a === 'draw') draw(s);
      else if (a === 'mill') mill(s);
      else if (a === 'shuffle') shuffleLibrary(s);
      else if (a === 'mulligan') mulligan(s);
      else if (a === 'untap') untapAll(s);
      else if (id === undefined) return;
      else if (a === 'tap') toggleTap(s, id);
      else if (a === 'face') toggleFaceDown(s, id);
      else if (a === 'copy') createToken(s, '', { copyOf: id });
      else if (a === 'facedown') { move(s, id, 'battlefield'); toggleFaceDown(s, id); }
      else if (a.startsWith('c:')) { const [, kind, d] = a.split(':'); addCounter(s, id, kind, Number(d)); }
      else if (a.startsWith('to:')) { const [, to, pos] = a.split(':'); move(s, id, to as Zone, (pos as Position) ?? 'top'); }
    });
  }

  function inspector(c: SCard): InspectorCard {
    return c.custom ? { name: c.name, text: 'Ficha criada na mesa.', typeLine: 'Ficha', power: c.custom.power, toughness: c.custom.toughness, token: true, counters: c.counters }
      : { name: c.name, counters: c.counters, token: c.token, faceDown: c.faceDown };
  }

  root.addEventListener('click', e => {
    const t = e.target as HTMLElement;
    if (pressed) { pressed = false; return; }
    const action = t.closest<HTMLElement>('[data-act]')?.dataset.act;
    if (action) { runAction(action); return; }
    const ui = t.closest<HTMLElement>('[data-ui]')?.dataset.ui;
    if (ui === 'exit') { if (confirm('Sair da mesa livre? O jogo atual será descartado.')) { s = null; save(); hideCardPreview(true); opts.onExit(); } return; }
    if (ui === 'undo') { const prev = history.undo(); if (prev) { s = prev; menu = null; save(); render(); } return; }
    if (ui === 'restart') { if (confirm('Recomeçar com o grimório embaralhado e uma nova mão?')) start(newSandbox({ id: 'livre', ...s!.deck }, s!.format)); return; }
    if (ui === 'token') { tokenForm = true; menu = null; render(); return; }
    if (ui === 'close-token') { tokenForm = false; render(); return; }
    if (ui === 'close-viewer') { viewing = null; render(); return; }
    if (ui === 'fullscreen') { void toggleFullscreen(); return; }
    const step = t.closest<HTMLElement>('[data-step]');
    if (step) { const k = step.dataset.step as 'life' | 'oppLife' | 'turn', d = Number(step.dataset.d); act(s => { s[k] = Math.max(k === 'turn' ? 1 : -999, s[k] + d); }); return; }
    if (menu && !t.closest('.ft-menu')) { menu = null; render(); return; }
    const pileEl = t.closest<HTMLElement>('[data-pile]');
    if (pileEl) {
      const z = pileEl.dataset.pile as Zone;
      if (z === 'library') act(s => draw(s)); else { viewing = z; render(); }
      return;
    }
    const cardEl = t.closest<HTMLElement>('.ft-card');
    if (cardEl) {
      // Dentro da janela de uma zona, o toque sempre abre o menu (a carta pode ir para qualquer lugar).
      if (cardEl.closest('.ft-viewer')) openMenu(cardEl, { id: Number(cardEl.dataset.id) }, { x: e.clientX, y: e.clientY });
      else primary(cardEl);
      return;
    }
    if (t.classList.contains('ft-viewer')) { viewing = null; tokenForm = false; render(); }
  });

  root.addEventListener('contextmenu', e => {
    const t = e.target as HTMLElement;
    const cardEl = t.closest<HTMLElement>('.ft-card'), pileEl = t.closest<HTMLElement>('[data-pile]');
    if (!cardEl && !pileEl) return;
    e.preventDefault();
    if (menu) return;
    if (cardEl) openMenu(cardEl, { id: Number(cardEl.dataset.id) }, { x: e.clientX, y: e.clientY });
    else openMenu(pileEl!, { pile: pileEl!.dataset.pile as Zone }, { x: e.clientX, y: e.clientY });
  });

  // Toque longo abre o menu no celular (nem todo navegador dispara o menu de contexto).
  root.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse') return;
    pressed = false;
    const t = e.target as HTMLElement;
    const cardEl = t.closest<HTMLElement>('.ft-card'), pileEl = t.closest<HTMLElement>('[data-pile]');
    if (!cardEl && !pileEl) return;
    clearTimeout(pressTimer);
    pressTimer = setTimeout(() => {
      pressed = true;
      if (cardEl) openMenu(cardEl, { id: Number(cardEl.dataset.id) }, { x: e.clientX, y: e.clientY });
      else openMenu(pileEl!, { pile: pileEl!.dataset.pile as Zone }, { x: e.clientX, y: e.clientY });
    }, LONG_PRESS);
  });
  for (const type of ['pointerup', 'pointercancel', 'pointermove'] as const) root.addEventListener(type, e => {
    if (type === 'pointermove' && Math.abs((e as PointerEvent).movementX) + Math.abs((e as PointerEvent).movementY) < 4) return;
    clearTimeout(pressTimer);
  });

  // Arrastar entre as zonas (mouse).
  root.addEventListener('dragstart', e => {
    const cardEl = (e.target as HTMLElement).closest<HTMLElement>('.ft-card');
    if (!cardEl || !e.dataTransfer) return;
    hideCardPreview(true);
    e.dataTransfer.setData('text/x-mesa-card', cardEl.dataset.id!);
    e.dataTransfer.effectAllowed = 'move';
  });
  root.addEventListener('dragover', e => {
    const drop = (e.target as HTMLElement).closest<HTMLElement>('[data-drop]');
    if (!drop || !e.dataTransfer?.types.includes('text/x-mesa-card')) return;
    e.preventDefault();
    root.querySelectorAll('.drop-over').forEach(el => el !== drop && el.classList.remove('drop-over'));
    drop.classList.add('drop-over');
  });
  root.addEventListener('dragleave', e => (e.target as HTMLElement).closest?.('[data-drop]')?.classList.remove('drop-over'));
  root.addEventListener('drop', e => {
    const drop = (e.target as HTMLElement).closest<HTMLElement>('[data-drop]');
    const id = Number(e.dataTransfer?.getData('text/x-mesa-card'));
    if (!drop || !id) return;
    e.preventDefault();
    const to = drop.dataset.drop as Zone;
    if (locate(s!, id)?.zone === to && to !== 'battlefield') { render(); return; }
    act(s => { if (locate(s, id)?.zone !== to) move(s, id, to); });
  });

  root.addEventListener('mouseover', e => {
    const cardEl = (e.target as HTMLElement).closest<HTMLElement>('.ft-card');
    if (!cardEl || menu || !s) return;
    const c = locate(s, Number(cardEl.dataset.id))?.card;
    if (c && !c.faceDown && cardEl.dataset.zone !== 'library') showCardPreview(inspector(c), cardEl);
  });
  root.addEventListener('mouseout', e => { if ((e.target as HTMLElement).closest('.ft-card')) hideCardPreview(); });

  root.addEventListener('submit', e => {
    const form = (e.target as HTMLElement).closest<HTMLFormElement>('[data-token]');
    if (!form) return;
    e.preventDefault();
    const data = new FormData(form);
    const name = String(data.get('name') ?? ''), power = String(data.get('power') ?? '').trim(), toughness = String(data.get('toughness') ?? '').trim();
    tokenForm = false;
    act(s => { createToken(s, name, { power: power || undefined, toughness: toughness || undefined }); });
  });

  root.addEventListener('keydown', e => {
    const t = e.target as HTMLElement;
    if (t.closest('input, textarea, select')) return;
    if (e.key === 'Escape' && (menu || viewing || tokenForm)) { if (menu) menu = null; else { viewing = null; tokenForm = false; } render(); return; }
    const cardEl = t.closest<HTMLElement>('.ft-card');
    if (cardEl && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); if (cardEl.closest('.ft-viewer')) openMenu(cardEl, { id: Number(cardEl.dataset.id) }); else primary(cardEl); return; }
    if (cardEl && (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10'))) { e.preventDefault(); openMenu(cardEl, { id: Number(cardEl.dataset.id) }); }
  });
  document.addEventListener('keydown', e => {
    if (!s || root.closest('[hidden]') || (e.target as HTMLElement).closest('input, textarea, select, dialog')) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); const prev = history.undo(); if (prev) { s = prev; menu = null; save(); render(); } return; }
    if (e.ctrlKey || e.metaKey || e.altKey || menu || viewing || tokenForm) return;
    if (e.key.toLowerCase() === 'c') act(s => draw(s));
    if (e.key.toLowerCase() === 'd') act(s => untapAll(s));
  });

  return {
    open(deck, format) { start(newSandbox(deck, format)); },
    resume(saved) { start(saved); },
  };
}
