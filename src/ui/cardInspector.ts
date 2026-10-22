import { cacheGet, fetchByNames } from '../scryfall';
import { esc, manaHTML, richText } from './cardtext';
import { cardSides, flipButtonHTML, turnCard } from './cardFlip';
import './cardInspector.css';

export interface InspectorCard {
  name?: string; image?: string; text?: string; manaCost?: string; typeLine?: string;
  power?: number | string; toughness?: number | string; basePower?: number; baseToughness?: number;
  keywords?: string[]; counters?: Record<string, number>; copyOf?: string; token?: boolean;
  attachedTo?: number; attachedToPlayer?: number; faceDown?: boolean; damage?: number;
  classLevel?: number; classMaxLevel?: number;
}
const keywords: Record<string, string> = { FLYING: 'Voar', FIRST_STRIKE: 'Iniciativa', DOUBLE_STRIKE: 'Golpe duplo', TRAMPLE: 'Atropelar', HASTE: 'Ímpeto', VIGILANCE: 'Vigilância', REACH: 'Alcance', DEATHTOUCH: 'Toque mortífero', LIFELINK: 'Vínculo com a vida', HEXPROOF: 'Resistência à magia', INDESTRUCTIBLE: 'Indestrutível', MENACE: 'Ameaçar', DEFENDER: 'Defensor' };
let preview: HTMLElement | null = null;
let modal: HTMLDialogElement | null = null;
let hovered: InspectorCard | null = null;
let origin: HTMLElement | undefined;
let generation = 0;
let showTimer: ReturnType<typeof setTimeout> | undefined;
let hideTimer: ReturnType<typeof setTimeout> | undefined;
/** Posição do mouse quando a prévia acompanha o cursor (só na mesa de partida); null = prévia no canto, como antes. */
let pointer: { x: number; y: number } | null = null;
let followFrame = 0;

function safeImage(value?: string) {
  if (!value) return undefined;
  try { const url = new URL(value, location.href); return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined; } catch { return undefined; }
}
/** Faces da carta para o botão de virar; na mesa, a face à mostra fica sendo a "frente". */
function sidesOf(card: InspectorCard) {
  const sides = card.faceDown || !card.name ? null : cardSides(cacheGet(card.name));
  if (sides?.kind === 'dfc' && card.image && card.image === sides.images[1]) sides.images.reverse();
  return sides;
}
function content(card: InspectorCard, compact: boolean) {
  const hidden = card.faceDown || !card.name;
  const sc = hidden ? null : cacheGet(card.name!);
  const name = hidden ? 'Carta virada para baixo' : sc?.pt?.name || card.name!;
  const text = hidden ? 'As informações desta carta estão ocultas.' : card.text ?? sc?.pt?.text ?? sc?.oracle_text ?? 'Carregando informações da carta…';
  const image = hidden ? undefined : safeImage(card.image ?? sc?.pt?.image_uris?.normal ?? sc?.image_uris?.normal);
  const cost = hidden ? '' : card.manaCost ?? sc?.mana_cost ?? '';
  const type = hidden ? '' : card.typeLine ?? sc?.pt?.type_line ?? sc?.type_line ?? '';
  const power = hidden ? undefined : card.power ?? sc?.power;
  const toughness = hidden ? undefined : card.toughness ?? sc?.toughness;
  const current = card.basePower !== undefined && (card.basePower !== power || card.baseToughness !== toughness);
  const sides = image ? sidesOf(card) : null;
  return `<header class="ci-head"><div><h2 id="${compact ? 'ci-preview-name' : 'ci-name'}">${esc(name)}</h2>${cost ? `<div class="ci-cost">${manaHTML(cost)}</div>` : ''}</div><span class="ci-actions">${sides ? flipButtonHTML(sides, 'ci-control') : ''}${compact ? '<button type="button" class="ci-control" data-ci-pin aria-label="Ampliar os detalhes da carta">Ampliar</button>' : '<button type="button" class="ci-control" data-ci-close aria-label="Fechar detalhes da carta">Fechar</button>'}</span></header>
  <div class="ci-body${image ? '' : ' ci-no-image'}">${image ? `<img class="ci-image" src="${esc(image)}" alt="${esc(name)}" draggable="false">` : ''}<div class="ci-details">
    ${type ? `<p class="ci-type">${esc(type)}</p>` : ''}<div class="ci-rules">${richText(text)}</div>
    ${power !== undefined && toughness !== undefined ? `<p class="ci-strength"><strong>${esc(String(power))} / ${esc(String(toughness))}</strong>${current ? ` <span>Base: ${card.basePower}/${card.baseToughness}</span>` : ''}${card.damage ? ` · ${card.damage} de dano marcado` : ''}</p>` : ''}
    ${card.keywords?.length ? `<ul class="ci-keywords">${card.keywords.map(k => `<li>${esc(keywords[k] ?? k.replaceAll('_', ' ').toLowerCase())}</li>`).join('')}</ul>` : ''}
    ${Object.entries(card.counters ?? {}).length ? `<p>Marcadores: ${Object.entries(card.counters!).map(([k,v]) => `${esc(k)} × ${v}`).join(', ')}</p>` : ''}
    ${card.classLevel ? `<p class="ci-strength"><strong>Nível ${card.classLevel}${card.classMaxLevel ? ` de ${card.classMaxLevel}` : ''}</strong>${card.classMaxLevel && card.classLevel >= card.classMaxLevel ? ' <span>Nível máximo</span>' : ''}</p>` : ''}
    ${card.token ? '<p class="ci-note">Ficha</p>' : ''}${card.copyOf ? `<p class="ci-note">Cópia de ${esc(card.copyOf)}</p>` : ''}
    ${card.attachedTo !== undefined || card.attachedToPlayer !== undefined ? '<p class="ci-note">Anexada a uma carta ou a um jogador na mesa.</p>' : ''}
  </div></div>`;
}
function fill(el: HTMLElement, card: InspectorCard, compact: boolean) {
  const focused = document.activeElement;
  const restoreControl = focused instanceof HTMLElement && el.contains(focused) && focused.matches('.ci-control');
  const scrollTop = el.querySelector('.ci-body')?.scrollTop ?? 0;
  el.innerHTML = content(card, compact);
  const body = el.querySelector('.ci-body');
  if (body) body.scrollTop = scrollTop;
  if (restoreControl) el.querySelector<HTMLElement>('.ci-control')?.focus({preventScroll: true});
  el.querySelector('img')?.addEventListener('error', e => {
    (e.target as HTMLElement).remove(); el.querySelector('.ci-body')?.classList.add('ci-no-image');
  }, { once: true });
  el.querySelector<HTMLElement>('[data-flip]')?.addEventListener('click', e => {
    const sides = sidesOf(card);
    if (sides) turnCard(el.querySelector<HTMLImageElement>('.ci-image'), e.currentTarget as HTMLElement, sides);
  });
  el.querySelector('[data-ci-pin]')?.addEventListener('click', () => inspectCard(card, origin));
  el.querySelector('[data-ci-close]')?.addEventListener('click', () => modal?.close());
}
function resolve(el: HTMLElement, card: InspectorCard, compact: boolean, ticket: number) {
  if (card.faceDown || !card.name || (card.text !== undefined && card.image)) return;
  void fetchByNames([card.name]).then(() => {
    if (ticket !== generation || !el.isConnected) return;
    fill(el, card, compact);
    if (!cacheGet(card.name!) && card.text === undefined) {
      const rules = el.querySelector('.ci-rules');
      if (rules) rules.textContent = 'Não foi possível encontrar esta carta. Tente inspecioná-la novamente.';
    }
  }).catch(() => {
    if (ticket !== generation) return;
    const rules = el.querySelector('.ci-rules');
    if (rules && !card.text && !cacheGet(card.name!)?.oracle_text) rules.textContent = 'Não foi possível carregar o texto. Tente inspecionar a carta novamente.';
  });
}
function ensurePreview() {
  if (preview) return preview;
  preview = document.createElement('aside');
  preview.className = 'card-inspector-preview';
  preview.setAttribute('aria-label', 'Detalhes da carta');
  preview.hidden = true;
  preview.addEventListener('mouseenter', () => clearTimeout(hideTimer));
  preview.addEventListener('mouseleave', () => hideCardPreview());
  preview.addEventListener('focusin', () => clearTimeout(hideTimer));
  preview.addEventListener('focusout', e => { if (!preview!.contains(e.relatedTarget as Node)) hideCardPreview(); });
  document.body.append(preview);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal?.open) hideCardPreview(true); });
  // The transient card must never cover controls after the player moves to another action.
  const dismissOutside = (event: Event) => {
    const target = event.target as Node | null;
    if (target && !preview!.contains(target) && !origin?.contains(target)) hideCardPreview(true);
  };
  document.addEventListener('pointerdown', dismissOutside, true);
  document.addEventListener('focusin', dismissOutside);
  return preview;
}
/** Prévia ao lado do cursor: à direita dele se couber, senão à esquerda; centrada na altura do cursor, sem sair da tela. */
function placeAtPointer(el: HTMLElement) {
  if (!pointer) { el.classList.remove('following'); el.style.removeProperty('left'); el.style.removeProperty('top'); return; }
  const gap = 22, margin = 8, w = el.offsetWidth, h = el.offsetHeight;
  const left = pointer.x + gap + w <= innerWidth - margin ? pointer.x + gap : Math.max(margin, pointer.x - gap - w);
  const top = Math.min(Math.max(margin, pointer.y - h / 2), Math.max(margin, innerHeight - h - margin));
  el.classList.add('following');
  el.style.left = `${Math.round(left)}px`; el.style.top = `${Math.round(top)}px`;
}
/** Acompanha o mouse enquanto a prévia aberta estiver seguindo o cursor (um reposicionamento por quadro). */
export function followCardPreview(x: number, y: number) {
  if (!pointer || !preview || preview.hidden) return;
  pointer = { x, y };
  if (followFrame) return;
  followFrame = requestAnimationFrame(() => { followFrame = 0; if (preview && !preview.hidden) placeAtPointer(preview); });
}
export function showCardPreview(card: InspectorCard, trigger?: HTMLElement, at?: { x: number; y: number }) {
  if (modal?.open || card.faceDown || !card.name) return;
  clearTimeout(hideTimer); clearTimeout(showTimer);
  const el = ensurePreview();
  el.classList.toggle('on-table', !!trigger?.closest('.arena.forge'));
  const immediate = !el.hidden;
  origin = trigger;
  pointer = at ?? null;
  showTimer = setTimeout(() => {
    hovered = card;
    const ticket = ++generation;
    // A native dialog's contents must remain in its top layer.
    const parent = trigger?.closest('dialog[open]') ?? document.body;
    if (el.parentElement !== parent) parent.append(el);
    fill(el, card, true); el.hidden = false; placeAtPointer(el); resolve(el, card, true, ticket);
  }, immediate ? 0 : 120);
}
export function hideCardPreview(immediate = false) {
  clearTimeout(showTimer); clearTimeout(hideTimer);
  const hide = () => { if (preview) preview.hidden = true; hovered = null; if (!modal?.open) generation++; };
  if (immediate) hide(); else hideTimer = setTimeout(hide, 180);
}
export function inspectCard(card: InspectorCard = hovered ?? {}, trigger?: HTMLElement) {
  hideCardPreview(true);
  const previous = trigger ?? origin ?? document.activeElement as HTMLElement;
  if (modal?.open) modal.close();
  const el = document.createElement('dialog');
  modal = el; el.className = 'card-inspector'; el.setAttribute('aria-labelledby', 'ci-name');
  document.body.append(el); fill(el, card, false);
  const ticket = ++generation;
  el.addEventListener('close', () => { if (modal === el) { modal = null; generation++; } el.remove(); if (!modal?.open && previous?.isConnected) previous.focus({ preventScroll: true }); }, { once: true });
  el.addEventListener('click', e => { if (e.target === el) { const r=el.getBoundingClientRect(); if (e.clientX<r.left || e.clientX>r.right || e.clientY<r.top || e.clientY>r.bottom) el.close(); } });
  el.showModal(); resolve(el, card, false, ticket);
}
