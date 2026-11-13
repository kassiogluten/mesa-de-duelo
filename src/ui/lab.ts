// Tela do Laboratório: monta a mesa de teste à mão e cria a sala com ela.
import { KEYS, loadJSON, saveJSON } from '../storage';
import type { LabPhase, LabScenario } from '../forge/client';
import { autocompleteNames, resolveCardNames } from '../scryfall';
import { esc } from './cardtext';
import './lab.css';
import { finder } from './dom';
import { ICON_DOTS } from './icons';
import { boardHTML, openKey, type BoardUi } from './labBoard';
import { previewHTML } from './labPreview';
import {
  MAX_PER_ZONE, PHASES, emptyDraft, fromScenario, moveRun, nameOf, newPermanent, parseEntry, readyTag, toScenario, zoneList, zoneRuns,
  type Draft, type Exiled, type Permanent, type Ready, type Zone,
} from './labModel';
import { mountScenarios, scenariosDialogHTML, type Saved } from './labScenarios';

export { LAB_COUNTERS, READY_SCENARIOS, fromScenario, parseEntry, toScenario, type Ready } from './labModel';

/**
 * Laboratório: monta a mesa à mão (vida, veneno e as cartas de cada zona dos dois jogadores, de quem é o turno e em
 * que etapa começa) e cria uma sala de teste no servidor com ela. Quem cria joga como Jogador 1; o Jogador 2 entra
 * pelo link da sala, em outra aba ou outra pessoa. Serve para achar erros, conferir correções e testar combos.
 */
export interface LabOptions {
  onBack(): void;
  /** Cria a sala de teste; rejeita com o motivo para mostrar na tela. */
  onHost(scenario: LabScenario): Promise<void>;
}
export interface LabView { open(): void }

const DRAFT_KEY = KEYS.labRascunho, SAVED_KEY = KEYS.labCenarios;
const load = <T>(key: string): T | null => loadJSON<T | null>(key, null);
const store = (key: string, value: unknown) => { saveJSON(key, value); };

export function mountLab(root: HTMLElement, opts: LabOptions): LabView {
  let draft: Draft = (() => { const s = load<LabScenario>(DRAFT_KEY); return s ? fromScenario(s) : emptyDraft(); })();
  let saved: Saved[] = load<Saved[]>(SAVED_KEY) ?? [];
  let busy = false;
  /** O nome do cenário aberto (vem no Salvar); some quando a mesa é limpa ou colada. */
  let currentName = '';
  const ui: BoardUi = { open: null, target: ['battlefield', 'battlefield'], player: 0 };
  root.innerHTML = `<div class="lab">
    <header class="lab-top">
      <button type="button" class="ghost-btn" data-lab="back">← Voltar</button>
      <div class="lab-title"><h1>Laboratório</h1><p>Monte a mesa do jeito que quiser e jogue de verdade, com as regras do servidor: para achar erros, conferir correções e testar combos.</p></div>
    </header>
    <section class="lab-bar" aria-label="Cenário e começo da partida">
      <div class="lab-scenario">
        <p class="lab-current" id="labCurrent"></p>
        <div class="lab-actions">
          <button type="button" class="ghost-btn" data-lab="scenarios" aria-haspopup="dialog">Cenários</button>
          <button type="button" class="ghost-btn" data-lab="save" aria-haspopup="dialog">Salvar</button>
          <button type="button" class="ghost-btn lab-preview-btn" data-lab="preview" aria-haspopup="dialog">Ver a mesa</button>
          <div class="lab-more">
            <button type="button" class="lab-icon lab-more-btn" data-lab="more" aria-haspopup="menu" aria-expanded="false" aria-label="Mais opções">${ICON_DOTS}</button>
            <div class="lab-menu" role="menu" aria-label="Mais opções" hidden>
              <button type="button" role="menuitem" data-lab="export">Copiar cenário</button>
              <button type="button" role="menuitem" data-lab="import">Colar cenário</button>
              <button type="button" role="menuitem" class="danger" data-lab="clear">Limpar a mesa</button>
            </div>
          </div>
        </div>
      </div>
      <div class="lab-start">
        <div class="lab-field" role="group" aria-labelledby="labActiveLabel"><span id="labActiveLabel">Turno de</span><div class="lab-segments"><button type="button" data-active="0">Jogador 1</button><button type="button" data-active="1">Jogador 2</button></div></div>
        <label class="lab-field">Começa em<select class="input-field" id="labPhase">${PHASES.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></label>
      </div>
    </section>
    <aside class="lab-guide" id="labGuide" aria-live="polite" hidden></aside>
    <div class="lab-work">
      <div class="lab-editor" id="labPlayers"></div>
      <aside class="lab-preview" aria-labelledby="labPreviewTitle">
        <h2 class="lab-preview-title" id="labPreviewTitle">Prévia da mesa</h2><div class="lab-preview-body" id="labPreview"></div>
        <footer class="lab-foot">
          <p class="lobby-status" id="labStatus" role="status" aria-live="polite"></p>
          <button type="button" class="arena-btn primary big" data-lab="host">Criar sala de teste</button>
        </footer>
      </aside>
    </div>
    <p class="lab-help">Você joga como Jogador 1. O Jogador 2 entra pelo link da sala: abra o link numa outra aba para jogar pelos dois lados, ou mande para outra pessoa. A partida não entra no seu histórico.</p>
    <datalist id="labNames"></datalist>
    ${scenariosDialogHTML()}
    <dialog class="lab-dialog" id="labSave" aria-labelledby="labSaveTitle">
      <form id="labSaveForm">
        <h2 id="labSaveTitle">Salvar cenário</h2>
        <p>Fica neste aparelho, em Cenários, na aba Salvos. Com um nome que já existe, substitui o antigo.</p>
        <label class="lab-field">Nome<input class="input-field" id="labName" maxlength="60" placeholder="Memnarch contra Jace" autocomplete="off" required></label>
        <footer><button type="button" class="arena-btn secondary" data-lab="save-cancel">Cancelar</button><button type="submit" class="arena-btn primary">Salvar</button></footer>
      </form>
    </dialog>
    <dialog class="lab-dialog lab-preview-dialog" id="labPreviewDialog" aria-labelledby="labPreviewDialogTitle">
      <header class="lab-dialog-head"><h2 id="labPreviewDialogTitle">Prévia da mesa</h2><button type="button" class="lab-icon" data-lab="preview-close" aria-label="Fechar">×</button></header>
      <div class="lab-preview-body" id="labPreviewDialogBody"></div>
    </dialog>
    <dialog class="lab-dialog" id="labImport" aria-labelledby="labImportTitle">
      <h2 id="labImportTitle">Colar cenário</h2>
      <p>Cole o texto de um cenário copiado com “Copiar cenário”. Ele substitui a mesa montada.</p>
      <textarea class="input-field" id="labImportText" rows="8" spellcheck="false"></textarea>
      <footer><button type="button" class="arena-btn secondary" data-lab="import-cancel">Cancelar</button><button type="button" class="arena-btn primary" data-lab="import-ok">Usar este cenário</button></footer>
    </dialog>
  </div>`;
  const $ = finder(root);

  let statusTimer: ReturnType<typeof setTimeout> | undefined;
  /** O aviso flutua sobre a mesa: o que só informa some sozinho; o erro fica até a próxima ação. */
  const setStatus = (text: string, error = false) => {
    const el = $('#labStatus'); el.textContent = text; el.classList.toggle('error', error);
    clearTimeout(statusTimer);
    if (text && !error && !busy) statusTimer = setTimeout(() => { if (el.textContent === text) el.textContent = ''; }, 4000);
  };
  /** A prévia da mesa (ao lado, ou na janela no celular) acompanha cada mudança. */
  const renderPreview = () => {
    const html = previewHTML(draft, ui.player);
    $('#labPreview').innerHTML = html;
    if ($<HTMLDialogElement>('#labPreviewDialog').open) $('#labPreviewDialogBody').innerHTML = html;
  };
  const persist = () => { store(DRAFT_KEY, toScenario(draft)); renderPreview(); };
  let guide: Ready | undefined;
  /** O que conferir no cenário pronto aberto; some quando a mesa troca por outra. */
  const setGuide = (r?: Ready) => {
    guide = r;
    const el = $('#labGuide');
    el.hidden = !r;
    el.innerHTML = r ? `<strong>O que conferir</strong> <span class="lab-pos">(${r.item ? `${esc(readyTag(r))}, ${esc(r.item)}` : 'para investigar, ainda sem correção'})</span><p>${esc(r.conferir)}</p>` : '';
  };

  function render() {
    for (const b of root.querySelectorAll<HTMLButtonElement>('[data-active]')) b.setAttribute('aria-pressed', String(Number(b.dataset.active) === draft.active));
    $<HTMLSelectElement>('#labPhase').value = draft.phase;
    $('#labCurrent').innerHTML = currentName ? `<span class="lab-current-label">${guide ? 'Cenário pronto' : 'Cenário'}</span> ${esc(currentName)}` : '<span class="lab-current-label">Mesa sem nome</span>';
    // Redesenhar troca os controles: o foco volta para o mesmo controle, ou para a caixa de pôr carta do jogador.
    const key = root.contains(document.activeElement) ? document.activeElement?.getAttribute('data-key') ?? '' : '';
    $('#labPlayers').innerHTML = boardHTML(draft, ui);
    renderPreview();
    if (key) {
      const back = root.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`)
        ?? (/^\d:/.test(key) ? root.querySelector<HTMLElement>(`[data-key="${key[0]}:add"]`) : null);
      back?.focus();
    }
    $<HTMLButtonElement>('[data-lab=host]').disabled = busy;
    $<HTMLButtonElement>('[data-lab=host]').textContent = busy ? 'Criando a sala…' : 'Criar sala de teste';
  }
  const changed = () => { persist(); render(); };
  const cardNames = () => draft.players.flatMap(s => [...s.hand, ...s.library, ...s.graveyard, ...s.exile.map(nameOf), ...s.battlefield.map(c => c.name)]);

  const playerOf = (el: Element) => Number(el.closest<HTMLElement>('[data-player]')?.dataset.player);
  const zoneOf = (el: Element) => el.closest<HTMLElement>('[data-zone]')?.dataset.zone as Zone | undefined;
  /** A carta da linha (a primeira, numa linha de repetidas). */
  const rowOf = (el: Element) => {
    const li = el.closest<HTMLElement>('[data-start]'), p = playerOf(el), zone = zoneOf(el), side = draft.players[p];
    if (!li || !zone || !side) return null;
    return { p, zone, side, start: Number(li.dataset.start), count: Number(li.dataset.count) };
  };
  /** Tirar uma permanente solta o que estava preso a ela. */
  const detach = (gone: Permanent[]) => {
    const uids = new Set(gone.map(c => c.uid));
    for (const s of draft.players) for (const c of s.battlefield) if (c.attachedTo !== null && uids.has(c.attachedTo)) c.attachedTo = null;
  };

  async function add(form: HTMLFormElement) {
    const input = form.querySelector('input')!, p = playerOf(form), side = draft.players[p], zone = ui.target[p];
    const { count, name } = parseEntry(input.value);
    if (!name || !side || !zone) return;
    if (zoneList(side, zone).length + count > MAX_PER_ZONE) { setStatus(`No máximo ${MAX_PER_ZONE} cartas em cada zona.`, true); return; }
    setStatus('Procurando a carta…');
    let found: string | undefined;
    try { found = (await resolveCardNames([name])).found.get(name.toLowerCase()); }
    catch { setStatus('Não foi possível procurar a carta agora. Confira a conexão e tente de novo.', true); return; }
    if (!found) { setStatus(`Não encontrei a carta “${name}”. Confira o nome (em inglês ou português).`, true); return; }
    for (let i = 0; i < count; i++) {
      if (zone === 'battlefield') side.battlefield.push(newPermanent(found));
      else if (zone === 'exile') side.exile.push({ name: found, mode: '' });
      else side[zone].push(found);
    }
    input.value = '';
    setStatus('');
    changed();
  }

  root.addEventListener('submit', e => {
    const form = e.target as HTMLFormElement;
    e.preventDefault();
    if (form.id === 'labSaveForm') { save(); return; }
    if (form.matches('[data-add]')) void add(form);
  });

  let suggestTimer: ReturnType<typeof setTimeout> | undefined, suggestFor = '';
  root.addEventListener('input', e => {
    const target = e.target as HTMLInputElement;
    if (!target.closest('[data-add]') || target.type === 'radio') return;
    const { name } = parseEntry(target.value);
    clearTimeout(suggestTimer);
    suggestTimer = setTimeout(() => {
      if (name === suggestFor) return;
      suggestFor = name;
      void autocompleteNames(name).then(names => {
        if (suggestFor !== name) return;
        $('#labNames').innerHTML = names.map(n => `<option value="${esc(n)}"></option>`).join('');
      }).catch(() => {});
    }, 250);
  });

  root.addEventListener('change', e => {
    const target = e.target as HTMLInputElement | HTMLSelectElement;
    if (target.id === 'labPhase') { draft.phase = target.value as LabPhase; persist(); return; }
    if (!target.closest('[data-player]')) return;
    const p = playerOf(target), side = draft.players[p];
    if (!side) return;
    if (target.type === 'radio') { ui.target[p] = target.value as Zone; return; }
    if (target.dataset.stat) {
      const n = Math.trunc(Number(target.value));
      if (Number.isFinite(n)) side[target.dataset.stat as 'life' | 'poison'] = target.dataset.stat === 'poison' ? Math.max(0, Math.min(999, n)) : Math.max(-999999, Math.min(999999, n));
      persist(); return;
    }
    const row = rowOf(target);
    if (!row) return;
    if (target.dataset.prop === 'exile-mode') {
      const entry = side.exile[row.start];
      if (entry) { entry.mode = target.value as Exiled['mode']; changed(); }
      return;
    }
    const c = side.battlefield[row.start];
    if (!c || row.zone !== 'battlefield') return;
    const prop = target.dataset.prop;
    if (prop === 'tapped' || prop === 'sick') c[prop] = (target as HTMLInputElement).checked;
    else if (prop === 'attach') c.attachedTo = target.value ? Number(target.value) : null;
    else if (prop === 'add-counter' && target.value) c.counters[target.value] = 1;
    else if (target.dataset.counter) {
      const n = Math.max(0, Math.min(999, Math.trunc(Number(target.value)) || 0));
      if (n === 0) delete c.counters[target.dataset.counter];
      else c.counters[target.dataset.counter] = n;
    } else return;
    changed();
  });

  /** Os botões de uma linha: menos e mais uma cópia, subir e descer, ajustar e tirar. */
  function rowAction(act: string, el: HTMLElement) {
    const row = rowOf(el);
    if (!row) return;
    const { p, zone, side, start, count } = row;
    const list = zoneList(side, zone) as unknown[];
    const isOpen = (index: number) => ui.open === openKey(p, zone, side, index);
    if (act === 'adjust') { const key = openKey(p, zone, side, start); ui.open = ui.open === key ? null : key; render(); return; }
    if (act === 'minus' || act === 'remove') {
      const gone = list.splice(act === 'minus' ? start + count - 1 : start, act === 'minus' ? 1 : count);
      if (zone === 'battlefield') detach(gone as Permanent[]);
    } else if (act === 'plus') {
      if (list.length >= MAX_PER_ZONE) { setStatus(`No máximo ${MAX_PER_ZONE} cartas em cada zona.`, true); return; }
      const first = list[start] as string | Exiled | Permanent;
      list.splice(start + count, 0, zone === 'battlefield' ? newPermanent(nameOf(first)) : zone === 'exile' ? { ...(first as Exiled) } : first);
    } else if (act === 'up' || act === 'down') {
      const all = zoneRuns(draft, side, zone, isOpen);
      const at = all.findIndex(r => r.start === start), dir = act === 'up' ? -1 : 1, other = all[at + dir];
      if (at < 0 || !other) return;
      moveRun(list, all[at]!, dir, all);
      // Onde a carta foi parar: o "Ajustar" aberto no exílio (achado pela posição) e o foco vão junto com ela.
      const to = dir < 0 ? other.start : start + other.count;
      if (zone === 'exile' && ui.open === openKey(p, zone, side, start)) ui.open = openKey(p, zone, side, to);
      changed();
      // No campo, os botões de lugar ficam no "Ajustar" da permanente, que é achada pelo id: o foco já voltou certo.
      if (zone !== 'library') return;
      const keyOf = (a: string) => `[data-key="${p}:${zone}:${to}:${a}"]`;
      const again = root.querySelector<HTMLButtonElement>(keyOf(act));
      (again && !again.disabled ? again : root.querySelector<HTMLElement>(keyOf(act === 'up' ? 'down' : 'up')))?.focus();
      return;
    } else return;
    changed();
  }

  const menu = $('.lab-menu'), moreBtn = $<HTMLButtonElement>('[data-lab=more]');
  const closeMenu = () => { menu.hidden = true; moreBtn.setAttribute('aria-expanded', 'false'); document.removeEventListener('pointerdown', outside); };
  const outside = (e: Event) => { if (!(e.target as Element).closest('.lab-more')) closeMenu(); };
  menu.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeMenu(); moreBtn.focus(); return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = [...menu.querySelectorAll<HTMLElement>('[role=menuitem]')], i = items.indexOf(document.activeElement as HTMLElement);
    items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
  });

  function openScenario(name: string, scenario: LabScenario, ready: Ready | undefined, start: boolean) {
    draft = fromScenario(scenario); currentName = name; ui.open = null;
    setGuide(ready); changed(); setStatus(`Cenário “${name}” aberto.`);
    if (start) void host();
    else void resolveCardNames(cardNames()).then(render).catch(() => {});
  }
  const scenarios = mountScenarios($<HTMLDialogElement>('#labScenarios'), {
    saved: () => saved,
    open: openScenario,
    remove(name) { saved = saved.filter(s => s.name !== name); store(SAVED_KEY, saved); setStatus(`Cenário “${name}” apagado.`); },
  });

  function save() {
    const name = $<HTMLInputElement>('#labName').value.trim();
    if (!name) { $('#labName').focus(); return; }
    saved = [{ name, scenario: toScenario(draft) }, ...saved.filter(s => s.name !== name)];
    store(SAVED_KEY, saved); currentName = name; guide = undefined; setGuide();
    $<HTMLDialogElement>('#labSave').close(); render(); setStatus(`Cenário “${name}” salvo neste aparelho.`);
  }

  root.addEventListener('click', e => {
    const el = e.target as HTMLElement;
    const active = el.closest<HTMLElement>('[data-active]');
    if (active) { draft.active = Number(active.dataset.active) as 0 | 1; changed(); return; }
    // Aba de um jogador, ou a metade dele na prévia: o editor passa a mostrar esse jogador.
    const tab = el.closest<HTMLElement>('[data-tab-player], #labPreview [data-preview-player]');
    if (tab) { showPlayer(Number(tab.dataset.tabPlayer ?? tab.dataset.previewPlayer) as 0 | 1); return; }
    const act = el.closest<HTMLElement>('[data-act]');
    if (act && root.querySelector('#labPlayers')!.contains(act)) { rowAction(act.dataset.act!, act); return; }
    const action = el.closest<HTMLElement>('[data-lab]')?.dataset.lab;
    if (!action) return;
    if (menu.contains(el)) closeMenu();
    if (action === 'back') opts.onBack();
    else if (action === 'host') void host();
    else if (action === 'scenarios') scenarios.show();
    else if (action === 'preview') { $('#labPreviewDialogBody').innerHTML = previewHTML(draft, ui.player); $<HTMLDialogElement>('#labPreviewDialog').showModal(); }
    else if (action === 'preview-close') $<HTMLDialogElement>('#labPreviewDialog').close();
    else if (action === 'more') {
      if (!menu.hidden) { closeMenu(); return; }
      menu.hidden = false; moreBtn.setAttribute('aria-expanded', 'true');
      document.addEventListener('pointerdown', outside);
      menu.querySelector<HTMLElement>('[role=menuitem]')?.focus();
    } else if (action === 'save') { $<HTMLInputElement>('#labName').value = currentName; $<HTMLDialogElement>('#labSave').showModal(); $<HTMLInputElement>('#labName').select(); }
    else if (action === 'save-cancel') $<HTMLDialogElement>('#labSave').close();
    else if (action === 'clear') { draft = emptyDraft(); currentName = ''; ui.open = null; setGuide(); changed(); setStatus('Mesa limpa.'); }
    else if (action === 'export') {
      const text = JSON.stringify(toScenario(draft));
      void navigator.clipboard.writeText(text).then(() => setStatus('Cenário copiado. Cole em “Colar cenário” em outro aparelho ou mande para alguém.'),
        () => setStatus('Não deu para copiar daqui. Tente de novo.', true));
    } else if (action === 'import') { $<HTMLTextAreaElement>('#labImportText').value = ''; $<HTMLDialogElement>('#labImport').showModal(); }
    else if (action === 'import-cancel') $<HTMLDialogElement>('#labImport').close();
    else if (action === 'import-ok') {
      try {
        const parsed = JSON.parse($<HTMLTextAreaElement>('#labImportText').value) as Partial<LabScenario>;
        if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.players)) throw new Error();
        draft = fromScenario(parsed); currentName = ''; ui.open = null; setGuide(); changed();
        $<HTMLDialogElement>('#labImport').close(); setStatus('Cenário colado.');
        // As imagens e os tipos das cartas (a prévia separa os terrenos) chegam da busca.
        void resolveCardNames(cardNames()).then(render).catch(() => {});
      } catch { setStatus('Esse texto não é um cenário do Laboratório.', true); $<HTMLDialogElement>('#labImport').close(); }
    }
  });

  function showPlayer(p: 0 | 1, focus = false) {
    if (ui.player === p) return;
    ui.player = p; ui.open = null; render();
    if (focus) root.querySelector<HTMLElement>(`[data-tab-player="${p}"]`)?.focus();
  }
  // Setas trocam de jogador nas abas, como em toda lista de abas.
  root.addEventListener('keydown', e => {
    if (!(e.target as HTMLElement).closest('[data-tab-player]') || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    showPlayer(ui.player === 0 ? 1 : 0, true);
  });
  // Clicar fora da janela da prévia (no fundo escuro) fecha.
  $('#labPreviewDialog').addEventListener('click', e => { if (e.target === e.currentTarget) $<HTMLDialogElement>('#labPreviewDialog').close(); });

  async function host() {
    if (busy) return;
    if (!cardNames().length) { setStatus('Ponha pelo menos uma carta na mesa.', true); return; }
    busy = true; render(); setStatus('Criando a sala de teste…');
    try { await opts.onHost(toScenario(draft)); setStatus(''); }
    catch (error) { setStatus(error instanceof Error ? error.message : 'Não foi possível criar a sala de teste.', true); }
    finally { busy = false; render(); }
  }

  return {
    open() {
      render();
      // As imagens das cartas do cenário (a busca guarda no cache) aparecem quando chegam.
      const names = cardNames();
      if (names.length) void resolveCardNames(names).then(render).catch(() => {});
    },
  };
}
