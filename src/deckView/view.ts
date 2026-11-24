// Tela de detalhes de um deck (/deck/<id> e o link público /d/<código>): análise, cartas com a troca de arte, mão de teste e compartilhar.
// decks.css antes: as regras desta tela vencem as da visualização de deck nas janelas que usam as duas.
import '../ui/decks.css';
import './deckView.css';
import { allDecks, countEntries, deckEntries, entryKey, FORMAT_LABEL, hasCommandZone, loadUserDecks, saveUserDecks, totalDeckSize, validDeck, type DeckData } from '../decks';
import { cacheGet, fetchByNames, fetchPrintings, rememberPrinting } from '../scryfall';
import { cardInfo } from '../cards';
import { contasLigadas, onContaChange } from '../conta/session';
import { esc, pip } from '../ui/cardtext';
import { deckArt, deckColors, bracketBadgeHTML, deckPriceHTML } from '../ui/deckStats';
import { inspectCard, showCardPreview, hideCardPreview } from '../ui/cardInspector';
import { openDeckExport } from '../ui/deckExport';
import { mountAppHeader } from '../ui/appHeader';
import { deckTokens, type TokenKind } from '../deckTokens';
import type { Route } from '../app/router';
import { cardFunctions, publicDeck, publicLink, PUBLIC_CODE } from './api';
import { choosePrint, type DeckSection } from './artChoice';
import { openPrintPicker } from './printPicker';
import { overviewHTML, type FunctionsState } from './overview';
import { cardsHTML, type CardsMode } from './cardsTab';
import { handHTML } from './handTab';
import { drawCard, mulligan, newHand, putOnBottom, type SampleHand } from './sampleHand';
import { copyText, forgetPublicCodes, openShare, publicCodes } from './share';

/** O que a tela de onde o deck foi aberto oferece (a tela inicial: escolher o deck; a sala: escolher ou fazer a sua versão). */
export interface DeckViewActions {
  selected?: boolean;
  pickLabel?: string;
  onPick?(): void;
  onCopy?(): void;
  onEdit?(): void;
}
export interface DeckViewOptions {
  onBack(): void;
  onPlay(): void;
  onDecks(): void;
  /** Abrir o deck no editor de Meus decks. */
  onEdit(deckId: string): void;
  /** Meus decks mudaram (cópia, arte): as outras telas se redesenham. */
  onChange(): void;
  /** A tela passou a mostrar outro deck (a cópia recém-feita): o endereço acompanha. */
  onRouteChange(): void;
}
type Tab = 'overview' | 'cards' | 'hand';
type Source = 'own' | 'builtin' | 'public';

export function mountDeckView(root: HTMLElement, opts: DeckViewOptions) {
  root.classList.add('deck-workspace', 'dv-screen');
  root.innerHTML = '<header class="dv-shell"></header><main class="dv-content" id="dvContent"></main>';
  mountAppHeader(root.querySelector<HTMLElement>('.dv-shell')!, { active: 'decks', onPlay: opts.onPlay, onDecks: opts.onDecks });
  const content = root.querySelector<HTMLElement>('#dvContent')!;

  let deck: DeckData | null = null, source: Source = 'own';
  let code: string | null = null, author = '', updatedAt = '';
  /** O código do link, quando o deck é um deck da conta que está compartilhado. */
  let ownCode: string | null = null;
  let actions: DeckViewActions | undefined;
  let tab: Tab = 'overview', cardsMode: CardsMode = 'images';
  let functions: FunctionsState = null, tokens: TokenKind[] = [], hand: SampleHand | null = null;
  let message = '', notice = '', loading = false;
  /** O id pedido no endereço, para ele continuar lá quando o deck não existe neste aparelho. */
  let requested = '';
  let seq = 0;

  const editable = () => source === 'own';
  const label = (name: string) => cacheGet(name)?.pt?.name || name;

  function heroHTML(d: DeckData) {
    const art = deckArt(d);
    const who = source === 'public' ? (author ? `Compartilhado por ${esc(author)}` : 'Deck compartilhado') : source === 'builtin' ? (d.precon ? `Precon oficial · ${esc(d.precon.series)} (${d.precon.year})` : 'Deck pronto') : 'Seu deck';
    const updated = source === 'public' && updatedAt ? ` · atualizado em ${new Date(updatedAt).toLocaleDateString('pt-BR')}` : '';
    const counts = `${totalDeckSize(d)} cartas${d.sideboard?.length ? ` · ${countEntries(d.sideboard)} no sideboard` : ''}`;
    const commanders = d.commanders?.length ? `<p class="dv-commanders">${d.commanders.map(c => esc(label(c.name))).join(' e ')}</p>` : '';
    const buttons: string[] = [];
    if (actions?.onPick) buttons.push(`<button type="button" class="dw-button primary" data-act="pick" ${actions.selected ? 'disabled' : ''}>${actions.selected ? 'Deck escolhido' : esc(actions.pickLabel ?? 'Escolher este deck')}</button>`);
    if (source === 'own') buttons.push('<button type="button" class="dw-button" data-act="edit">Editar deck</button>');
    if (source === 'own' && contasLigadas()) buttons.push(`<button type="button" class="dw-button" data-act="share">${ownCode ? 'Compartilhado' : 'Compartilhar'}</button>`);
    if (source === 'builtin') buttons.push('<button type="button" class="dw-button" data-act="copy">Criar uma cópia</button>');
    if (source === 'public') buttons.push('<button type="button" class="dw-button primary" data-act="copy">Copiar para meus decks</button>', '<button type="button" class="dw-button" data-act="copy-link">Copiar link</button>');
    buttons.push('<button type="button" class="dw-button" data-act="export">Exportar lista</button>');
    return `<section class="dv-hero"${art ? ` style="--dv-art:url('${esc(art)}')"` : ''}><div class="dv-hero-text"><button type="button" class="dw-button subtle dv-back" data-act="back">← Voltar</button><p class="dw-eyebrow">${esc(FORMAT_LABEL[d.format ?? 'free'])} · ${who}${updated}</p><h1 tabindex="-1" id="dvTitle">${esc(d.name)}</h1>${commanders}<p class="dv-meta"><span class="dv-pips">${deckColors(d).map(pip).join('')}</span><span>${counts}</span>${bracketBadgeHTML(d, 'dv-badge')}${deckPriceHTML(d, 'dv-badge', true)}</p></div><div class="dw-actions dv-actions">${buttons.join('')}</div></section>`;
  }

  function panelHTML(d: DeckData) {
    if (tab === 'cards') return cardsHTML(d, cardsMode, editable());
    if (tab === 'hand') return handHTML(hand ??= newHand(d.cards, hasCommandZone(d.format)), !!d.commanders?.length);
    return overviewHTML(d, functions, tokens);
  }

  function render() {
    hideCardPreview(true);
    if (!deck) {
      content.innerHTML = `<section class="dv-empty">${loading ? '<p class="dv-loading">Abrindo o deck…</p>' : `<h1 tabindex="-1">${esc(message || 'Deck não encontrado.')}</h1><div class="dw-actions"><button type="button" class="dw-button primary" data-act="decks">Meus decks</button><button type="button" class="dw-button" data-act="play">Jogar</button></div>`}</section>`;
      return;
    }
    const tabs: [Tab, string][] = [['overview', 'Visão geral'], ['cards', 'Cartas'], ['hand', 'Mão de teste']];
    content.innerHTML = `${heroHTML(deck)}${notice ? `<p class="dv-notice" role="status">${esc(notice)}</p>` : ''}<nav class="dv-tabs" role="tablist" aria-label="Detalhes do deck">${tabs.map(([id, text]) => `<button type="button" role="tab" id="dvTab-${id}" aria-controls="dvPanel" aria-selected="${tab === id}" tabindex="${tab === id ? 0 : -1}" data-tab="${id}">${text}</button>`).join('')}</nav><div class="dv-panel-wrap" id="dvPanel" role="tabpanel" aria-labelledby="dvTab-${tab}">${panelHTML(deck)}</div>`;
  }

  /** Busca os dados das cartas, as impressões escolhidas, as funções e as fichas, redesenhando a cada parte. */
  function load(d: DeckData) {
    const mine = ++seq, live = () => mine === seq && deck === d;
    functions = null; tokens = [];
    void fetchByNames(deckEntries(d).map(e => e.name)).then(() => { if (live()) render(); return fetchPrintings(deckEntries(d)); })
      .then(() => { if (live()) render(); }, () => { if (live()) { notice = 'Algumas cartas não puderam ser carregadas. A lista continua disponível.'; render(); } })
      .then(() => {
        const ids = [...new Set(d.cards.map(e => cacheGet(e.name)?.oracle_id).filter((id): id is string => !!id))];
        return cardFunctions(ids).then(map => { if (live()) { functions = map; render(); } }, () => { if (live()) { functions = 'erro'; render(); } });
      });
    deckTokens(d).then(kinds => { if (live()) { tokens = kinds; render(); } }, () => {});
  }

  function show(d: DeckData, from: Source, extra: { code?: string; author?: string; updatedAt?: string } = {}) {
    deck = d; source = from; code = extra.code ?? null; author = extra.author ?? ''; updatedAt = extra.updatedAt ?? '';
    ownCode = null; hand = null; notice = ''; message = ''; loading = false;
    if (from === 'own') void publicCodes().then(map => { if (deck === d) { ownCode = map.get(d.id) ?? null; render(); } });
    render(); load(d);
    scrollTo({ top: 0 });
    root.querySelector<HTMLElement>('#dvTitle')?.focus({ preventScroll: true });
  }

  async function openCode(c: string) {
    deck = null; code = c; actions = undefined; tab = 'overview'; message = ''; loading = true; render();
    const mine = ++seq;
    if (!PUBLIC_CODE.test(c)) { loading = false; message = 'Este link de deck está incompleto. Peça o link de novo para quem compartilhou.'; render(); return; }
    try {
      const got = await publicDeck(c);
      if (mine !== seq) return;
      // Um deck seu compartilhado abre como seu (dá para trocar a arte), com o mesmo endereço.
      const ownId = [...(await publicCodes()).entries()].find(([, v]) => v === c)?.[0];
      const local = ownId ? loadUserDecks().find(x => x.id === ownId) : undefined;
      if (mine !== seq) return;
      if (local) { show(local, 'own'); code = c; return; }
      const d = { ...got.deck, id: `publico:${c}`, builtin: true };
      if (!validDeck(d)) throw new Error('Este deck compartilhado veio estragado. Peça o link de novo para quem compartilhou.');
      show(d, 'public', { code: c, author: got.autor, updatedAt: got.atualizadoEm });
    } catch (e) {
      if (mine !== seq) return;
      loading = false; message = e instanceof Error ? e.message : 'Não foi possível abrir este deck agora.'; render();
    }
  }

  /** A cópia do deck pronto ou compartilhado entra em Meus decks, e a tela passa a mostrá-la. */
  function copyDeck(): DeckData | null {
    if (!deck) return null;
    const { precon: _precon, price: _price, ...rest } = structuredClone(deck);
    const copy: DeckData = { ...rest, id: crypto.randomUUID(), builtin: false, name: source === 'builtin' ? `${deck.name} — minha versão` : deck.name,
      sideboard: rest.sideboard ?? [], updatedAt: new Date().toISOString(),
      ...(source === 'builtin' ? { sourceTemplateId: deck.id } : { importSource: publicLink(code ?? '') }) };
    const result = saveUserDecks([...loadUserDecks(), copy]);
    if (!result.ok) { notice = result.error; render(); return null; }
    opts.onChange();
    tab = tab === 'hand' ? 'overview' : tab;
    show(copy, 'own');
    actions = undefined;
    notice = 'Cópia salva em Meus decks. Agora ela é sua: dá para editar, trocar as artes e compartilhar.';
    render();
    opts.onRouteChange();
    return copy;
  }

  function askCopy(what: string): Promise<boolean> {
    return new Promise(resolve => {
      const dlg = document.createElement('dialog');
      dlg.className = 'dw-preview dv-share';
      dlg.innerHTML = `<header><div><p class="dw-eyebrow">Trocar arte</p><h2>${source === 'builtin' ? 'Deck pronto' : 'Deck de outra pessoa'}</h2></div></header><div class="dv-share-body"><p>${source === 'builtin' ? 'Os decks prontos não mudam.' : 'Este deck é de quem o compartilhou.'} Para trocar a arte de ${esc(what)}, faça uma cópia sua: ela fica em Meus decks e pode ser mudada à vontade.</p><div class="dw-actions"><button type="button" class="dw-button primary" data-yes>Fazer uma cópia</button><button type="button" class="dw-button" data-no>Agora não</button></div></div>`;
      document.body.append(dlg);
      let answer = false;
      dlg.addEventListener('click', e => { const t = e.target as HTMLElement; if (t.closest('[data-yes]')) { answer = true; dlg.close(); } else if (t === dlg || t.closest('[data-no]')) dlg.close(); });
      dlg.addEventListener('close', () => { dlg.remove(); resolve(answer); });
      dlg.showModal();
    });
  }

  async function changeArt(section: DeckSection, key: string) {
    if (!deck) return;
    let entry = (section === 'cards' ? deck.cards : deck[section])?.find(e => entryKey(e) === key);
    if (!entry) return;
    if (!editable()) {
      if (!await askCopy(label(entry.name))) return;
      const copy = copyDeck();
      entry = copy ? (section === 'cards' ? copy.cards : copy[section])?.find(e => entryKey(e) === key) : undefined;
      if (!entry) return;
    }
    const sc = cacheGet(entry.name), oracleId = sc?.oracle_id;
    if (!oracleId) { notice = 'Os dados desta carta ainda não chegaram. Tente de novo em instantes.'; render(); return; }
    const target = entry, deckId = deck!.id;
    openPrintPicker({
      label: label(target.name), name: target.name, oracleId, defaultImage: cardInfo(sc).image,
      current: target.set ? { set: target.set, cn: target.cn } : undefined,
      onPick(print) {
        const decks = loadUserDecks(), d = decks.find(x => x.id === deckId);
        if (!d) return;
        if (print) rememberPrinting(target.name, { set: print.set, cn: print.cn }, { image_uris: print.image, faceNames: print.faces?.map(f => f.name ?? ''), faceImages: print.faces?.map(f => f.image) });
        if (!choosePrint(d, section, key, print)) return;
        d.updatedAt = new Date().toISOString();
        const result = saveUserDecks(decks);
        if (!result.ok) { notice = result.error; render(); return; }
        deck = d; opts.onChange();
        notice = print ? `${label(target.name)} agora com a arte de ${print.setName ?? print.set.toUpperCase()}. Na partida, todos veem esta arte.` : `${label(target.name)} voltou à arte padrão da mesa.`;
        render();
      },
    });
  }

  function leaveWith(run?: () => void) { opts.onBack(); run?.(); }

  root.addEventListener('click', e => {
    const target = e.target as HTMLElement;
    const act = target.closest<HTMLElement>('[data-act]')?.dataset.act;
    if (act === 'back') { opts.onBack(); return; }
    if (act === 'decks') { opts.onDecks(); return; }
    if (act === 'play') { opts.onPlay(); return; }
    if (!deck) return;
    if (act === 'pick') { leaveWith(actions?.onPick); return; }
    if (act === 'edit') { if (actions?.onEdit) leaveWith(actions.onEdit); else opts.onEdit(deck.id); return; }
    if (act === 'copy') { if (actions?.onCopy) leaveWith(actions.onCopy); else copyDeck(); return; }
    if (act === 'export') { openDeckExport(deck); return; }
    if (act === 'share') { const d = deck; openShare(d, c => { if (deck === d) { ownCode = c; render(); } }); return; }
    if (act === 'copy-link' && code) { void copyText(publicLink(code)).then(ok => { notice = ok ? 'Link copiado.' : publicLink(code!); render(); }); return; }
    const tabButton = target.closest<HTMLElement>('[data-tab]');
    if (tabButton) { tab = tabButton.dataset.tab as Tab; notice = ''; render(); root.querySelector<HTMLElement>(`#dvTab-${tab}`)?.focus(); return; }
    const mode = target.closest<HTMLElement>('[data-cards-mode]')?.dataset.cardsMode;
    if (mode === 'images' || mode === 'list') { cardsMode = mode; render(); return; }
    const art = target.closest<HTMLElement>('[data-art]');
    if (art) { void changeArt(art.dataset.section as DeckSection, art.dataset.art!); return; }
    const handAct = target.closest<HTMLElement>('[data-hand]')?.dataset.hand;
    if (handAct === 'new') hand = newHand(deck.cards, hasCommandZone(deck.format));
    if (handAct === 'mulligan' && hand) hand = mulligan(hand);
    if (handAct === 'draw' && hand) hand = drawCard(hand);
    const bottom = target.closest<HTMLElement>('[data-bottom]')?.dataset.bottom;
    if (bottom !== undefined && hand) hand = putOnBottom(hand, Number(bottom));
    if (handAct || bottom !== undefined) { render(); return; }
    const card = target.closest<HTMLElement>('[data-inspect]');
    if (card) inspectCard({ name: card.dataset.inspect!, print: card.dataset.set ? { set: card.dataset.set, cn: card.dataset.cn } : undefined }, card);
  });
  // Na lista, passar o mouse mostra a carta, como no editor.
  root.addEventListener('pointerover', e => {
    if (e.pointerType !== 'mouse') return;
    const row = (e.target as HTMLElement).closest<HTMLElement>('.dv-row-main, .dv-link');
    if (row?.dataset.inspect) showCardPreview({ name: row.dataset.inspect, print: row.dataset.set ? { set: row.dataset.set, cn: row.dataset.cn } : undefined }, row);
  });
  root.addEventListener('pointerout', e => { if ((e.target as HTMLElement).closest('.dv-row-main, .dv-link')) hideCardPreview(); });
  // Setas entre as abas, como pede o padrão de abas.
  root.addEventListener('keydown', e => {
    const t = e.target as HTMLElement;
    if (!t.matches('[role=tab]') || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return;
    const tabs = [...root.querySelectorAll<HTMLElement>('[role=tab]')], i = tabs.indexOf(t);
    tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]?.click();
  });
  onContaChange(() => { forgetPublicCodes(); if (deck && source === 'own') show(deck, 'own'); });

  return {
    /** Abre um deck já carregado, com as ações da tela de onde veio. */
    openDeck(d: DeckData, from?: DeckViewActions) {
      actions = from; tab = 'overview';
      const own = !d.builtin && loadUserDecks().some(x => x.id === d.id);
      show(d, own ? 'own' : 'builtin');
    },
    /** Abre pelo endereço (/deck/<id> ou /d/<código>). */
    openRoute(route: Extract<Route, { screen: 'deck' }>) {
      if ('code' in route) {
        if (code === route.code && deck) return;
        void openCode(route.code);
        return;
      }
      if (deck?.id === route.deckId && !code) return;
      actions = undefined; tab = 'overview';
      const d = allDecks().find(x => x.id === route.deckId);
      if (d) { show(d, d.builtin ? 'builtin' : 'own'); return; }
      deck = null; code = null; requested = route.deckId; loading = false; message = 'Este deck não está neste aparelho. Ele pode ter sido apagado, ou foi guardado em outro aparelho sem a conta.'; render();
    },
    route(): Route {
      if (code) return { screen: 'deck', code };
      return { screen: 'deck', deckId: deck?.id ?? requested };
    },
    /** Meus decks mudaram por fora (outra aba, a conta): o deck aberto acompanha. */
    refresh() {
      if (!deck) return;
      if (source !== 'own') { render(); return; }
      const d = loadUserDecks().find(x => x.id === deck!.id);
      if (!d) { deck = null; message = 'Este deck foi apagado.'; render(); return; }
      deck = d; render();
    },
  };
}
