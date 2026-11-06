// Fichas do deck na tela: a aba Fichas do editor, a seção da visualização e a janela para escolher a série.
import './decks.css';
import type { DeckData } from '../decks';
import { chosenToken, tokenImage, tokenPrintings, type TokenKind, type TokenPrinting } from '../deckTokens';
import { esc } from './cardtext';

const COLOR_WORD: Record<string, string> = { W: 'branca', U: 'azul', B: 'preta', R: 'vermelha', G: 'verde' };
const TYPE_WORD: [RegExp, string][] = [[/\bCreature\b/, 'Criatura'], [/\bArtifact\b/, 'Artefato'], [/\bEnchantment\b/, 'Encantamento'], [/\bLand\b/, 'Terreno'], [/\bPlaneswalker\b/, 'Planeswalker'], [/\bBattle\b/, 'Batalha']];
const list = (words: string[]) => words.length > 1 ? `${words.slice(0, -1).join(', ')} e ${words[words.length - 1]}` : words[0] ?? '';

/** "Criatura 1/1 branca", "Artefato": o que a ficha é, em português. */
export function tokenDescription(kind: Pick<TokenKind, 'typeLine' | 'colors' | 'power' | 'toughness'>) {
  const type = TYPE_WORD.find(([re]) => re.test(kind.typeLine))?.[1] ?? 'Ficha';
  const colors = list([...kind.colors].map(c => COLOR_WORD[c] ?? c));
  return [type, kind.power !== undefined ? `${kind.power}/${kind.toughness}` : '', colors].filter(Boolean).join(' ');
}
/** "de Hare Apparent", "de Hare Apparent e mais 2". */
const sourcesText = (kind: TokenKind, ptName: (n: string) => string) =>
  `de ${ptName(kind.sources[0]!)}${kind.sources.length > 1 ? ` e mais ${kind.sources.length - 1}` : ''}`;
const printLabel = (p: { set: string; cn: string }) => `(${p.set.toUpperCase()}) ${p.cn}`;

/** A arte de cada ficha no deck: a da série escolhida ou a padrão. */
const artOf = (deck: DeckData, kind: TokenKind, version: 'art_crop' | 'small' | 'normal') => {
  const chosen = chosenToken(deck, kind.oracleId);
  return chosen ? tokenImage(chosen, version) : kind.image?.[version];
};

/** A aba Fichas do editor: `kinds` nulo enquanto procura; `error` quando o Scryfall não respondeu. */
export function tokensTabHTML(deck: DeckData, kinds: TokenKind[] | null, error: boolean, ptName: (n: string) => string) {
  if (error) return '<div class="dw-empty compact"><h3>Não foi possível procurar as fichas agora.</h3><div class="dw-actions"><button type="button" class="dw-button" data-b="retry-tokens">Tentar de novo</button></div></div>';
  if (!kinds) return '<p class="dw-note">Procurando as fichas que as cartas do deck criam…</p>';
  if (!kinds.length) return '<div class="dw-empty compact"><h3>Nenhuma carta do deck cria fichas.</h3></div>';
  return `<section class="dw-card-group dw-tokens"><h3>Fichas que as cartas do deck criam<span>${kinds.length}</span></h3><ul>${kinds.map(kind => {
    const chosen = chosenToken(deck, kind.oracleId), art = artOf(deck, kind, 'art_crop');
    return `<li><button type="button" class="dw-card-name" data-token="${esc(kind.oracleId)}" data-focus="token:${esc(kind.oracleId)}" aria-label="${deck.builtin ? 'Ver' : 'Trocar a série de'} ${esc(kind.name)}"><span class="dw-card-art">${art ? `<img src="${esc(art)}" alt="" loading="lazy">` : ''}</span><span>${esc(kind.name)}<small class="dw-token-what">${esc(tokenDescription(kind))} · ${esc(sourcesText(kind, ptName))}</small></span>${chosen ? `<small class="dw-print" title="Série escolhida">${esc(printLabel(chosen))}</small>` : '<small class="dw-print dw-print-auto" title="Segue a carta que criou a ficha">Automática</small>'}</button>${deck.builtin ? '' : `<button type="button" class="dw-button" data-token="${esc(kind.oracleId)}">Trocar série</button>`}</li>`;
  }).join('')}</ul><p class="dw-note">Automática: a ficha segue a série da carta que a criou. A série escolhida vale para você e para quem joga contra você.</p></section>`;
}

/** A seção Fichas da visualização do deck: só para ver, com a série escolhida de cada uma. */
export function tokensPreviewHTML(deck: DeckData, kinds: TokenKind[]) {
  if (!kinds.length) return '';
  return `<details class="dw-preview-side dp-tokens"><summary>Fichas <b>${kinds.length}</b></summary><div class="dw-token-strip">${kinds.map(kind => {
    const chosen = chosenToken(deck, kind.oracleId), img = artOf(deck, kind, 'small');
    return `<figure>${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : ''}<figcaption>${esc(kind.name)}<small>${chosen ? esc(printLabel(chosen)) : 'Automática'}</small></figcaption></figure>`;
  }).join('')}</div></details>`;
}

/** A janela com a ficha em todas as séries; a primeira opção é sempre Automática. Num deck pronto, só para ver. */
export function openTokenPicker(deck: DeckData, kind: TokenKind, onPick: (print: TokenPrinting | null) => void) {
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const dlg = document.createElement('dialog');
  dlg.className = 'deck-preview dw-preview dw-token-picker'; dlg.setAttribute('aria-labelledby', 'dwTokenTitle');
  dlg.innerHTML = `<header class="dp-head"><div><h2 id="dwTokenTitle">${esc(kind.name)}</h2><p><span>${esc(tokenDescription(kind))}${deck.builtin ? '' : ' · Escolha a arte que a mesa mostra para esta ficha.'}</span></p></div><button type="button" class="dp-close" data-close aria-label="Fechar">×</button></header><div class="dp-body"><p class="dw-note">Procurando as séries…</p></div>`;
  document.body.append(dlg);
  const body = dlg.querySelector<HTMLElement>('.dp-body')!;
  let prints: TokenPrinting[] = [];
  const render = () => {
    const chosen = chosenToken(deck, kind.oracleId);
    const same = (p: TokenPrinting) => !!chosen && chosen.set === p.set && chosen.cn === p.cn;
    body.innerHTML = `<div class="dw-token-grid" role="group" aria-label="Séries de ${esc(kind.name)}"><button type="button" class="dw-token-choice auto" data-print="" aria-pressed="${!chosen}" ${deck.builtin ? 'disabled' : ''}><b>Automática</b><small>segue a carta que criou</small></button>${prints.map((p, i) => `<button type="button" class="dw-token-choice" data-print="${i}" aria-pressed="${same(p)}" ${deck.builtin ? 'disabled' : ''} aria-label="${esc(p.setName)}, ${esc(printLabel(p))}">${p.image?.small ? `<img src="${esc(p.image.small)}" alt="" loading="lazy">` : ''}<small>${esc(p.setName.replace(/ Tokens$/, ''))}<br>${esc(printLabel(p))}</small></button>`).join('')}</div>${prints.length ? '' : '<p class="dw-note">O Scryfall não tem outras séries desta ficha.</p>'}`;
    body.querySelector<HTMLElement>('[aria-pressed="true"]')?.focus();
  };
  tokenPrintings(kind.oracleId).then(list => { prints = list; if (dlg.open) render(); }, () => {
    if (dlg.open) body.innerHTML = '<p class="dw-error">Não foi possível buscar as séries desta ficha agora. Tente de novo daqui a pouco.</p>';
  });
  dlg.addEventListener('click', e => {
    const target = e.target as HTMLElement;
    if (target === dlg || target.closest('[data-close]')) { dlg.close(); return; }
    const choice = target.closest<HTMLButtonElement>('[data-print]');
    if (!choice || choice.disabled) return;
    onPick(choice.dataset.print ? prints[Number(choice.dataset.print)] ?? null : null);
    dlg.close();
  });
  dlg.addEventListener('close', () => { dlg.remove(); if (opener?.isConnected) opener.focus({ preventScroll: true }); });
  dlg.showModal();
}
