// Janela de cenários do Laboratório: os prontos (correções e problemas para investigar) e os salvos, com busca.
import type { LabScenario } from '../forge/client';
import { esc } from './cardtext';
import { finder } from './dom';
import { PENDING } from '../pendingNews';
import { READY_SCENARIOS, readyTag, type Ready } from './labModel';

export interface Saved { name: string; scenario: LabScenario }
interface ScenariosOptions {
  saved(): Saved[];
  /** Abre o cenário na mesa do editor; com {@code start}, já cria a sala. */
  open(name: string, scenario: LabScenario, ready: Ready | undefined, start: boolean): void;
  remove(name: string): void;
}
type Tab = 'ready' | 'saved';

const HINT: Record<Tab, string> = {
  ready: 'Mesas montadas para conferir as correções, uma por correção, e os problemas ainda para investigar.',
  saved: 'Os cenários que você salvou neste aparelho.',
};
/** Sem acento e em minúsculas, para a busca achar "exilio" em "exílio". */
const plain = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const cardsIn = (s: LabScenario) => s.players.reduce((n, p) => n + p.hand.length + p.library.length + p.graveyard.length + p.exile.length + p.battlefield.length, 0);
const tagClass = (r: Ready) => !r.versao ? ' investigate' : r.versao === PENDING ? ' next' : '';

export function scenariosDialogHTML() {
  return `<dialog class="lab-dialog lab-scenarios" id="labScenarios" aria-labelledby="labScenariosTitle">
    <header class="lab-dialog-head"><h2 id="labScenariosTitle">Cenários</h2><button type="button" class="lab-icon" data-scn="close" aria-label="Fechar">×</button></header>
    <div class="lab-tabs" role="tablist" aria-label="Que cenários">
      <button type="button" role="tab" id="labTabReady" data-tab="ready" aria-controls="labScenarioList">Prontos <span class="lab-count">${READY_SCENARIOS.length}</span></button>
      <button type="button" role="tab" id="labTabSaved" data-tab="saved" aria-controls="labScenarioList">Salvos <span class="lab-count" id="labSavedCount">0</span></button>
    </div>
    <input type="search" class="input-field" id="labScenarioSearch" placeholder="Buscar por nome, carta ou versão" aria-label="Buscar cenário" autocomplete="off">
    <p class="lab-hint" id="labScenarioHint"></p>
    <ul class="lab-scn-list" id="labScenarioList" role="tabpanel"></ul>
  </dialog>`;
}

export function mountScenarios(dialog: HTMLDialogElement, o: ScenariosOptions) {
  const $ = finder(dialog);
  let tab: Tab = 'ready';
  const search = $<HTMLInputElement>('#labScenarioSearch');

  function render() {
    const query = plain(search.value.trim());
    const saved = o.saved();
    $('#labSavedCount').textContent = String(saved.length);
    for (const b of dialog.querySelectorAll<HTMLElement>('[data-tab]')) {
      const on = b.dataset.tab === tab;
      b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1;
    }
    $('#labScenarioList').setAttribute('aria-labelledby', tab === 'ready' ? 'labTabReady' : 'labTabSaved');
    $('#labScenarioHint').textContent = HINT[tab];
    const match = (...parts: (string | undefined)[]) => !query || plain(parts.filter(Boolean).join(' ')).includes(query);
    const actions = (i: number, extra = '') => `<div class="lab-scn-actions"><button type="button" class="ghost-btn" data-scn="open" data-i="${i}">Abrir</button><button type="button" class="ghost-btn lab-play" data-scn="start" data-i="${i}">▶ Jogar agora</button>${extra}</div>`;
    const items = tab === 'ready'
      ? READY_SCENARIOS.map((r, i) => ({ r, i })).filter(({ r }) => match(r.nome, readyTag(r), r.item, r.conferir, JSON.stringify(r.cenario))).map(({ r, i }) =>
        `<li><div class="lab-scn-text"><span class="lab-tag${tagClass(r)}">${esc(readyTag(r))}</span><strong>${esc(r.nome)}</strong><p>${esc(r.conferir)}</p></div>${actions(i)}</li>`)
      : saved.map((s, i) => ({ s, i })).filter(({ s }) => match(s.name, JSON.stringify(s.scenario))).map(({ s, i }) =>
        `<li><div class="lab-scn-text"><strong>${esc(s.name)}</strong><p>${cardsIn(s.scenario)} cartas na mesa</p></div>${actions(i, `<button type="button" class="ghost-btn danger" data-scn="delete" data-i="${i}" aria-label="Apagar ${esc(s.name)}">Apagar</button>`)}</li>`);
    const empty = query ? `Nenhum cenário com “${esc(search.value.trim())}”.`
      : tab === 'saved' ? 'Nenhum cenário salvo ainda. Monte a mesa e use Salvar.' : 'Nenhum cenário pronto.';
    $('#labScenarioList').innerHTML = items.length ? items.join('') : `<li class="lab-scn-empty">${empty}</li>`;
  }

  search.addEventListener('input', render);
  dialog.addEventListener('keydown', e => {
    // Setas trocam de aba, como em toda lista de abas.
    const current = (e.target as HTMLElement).closest<HTMLElement>('[data-tab]');
    if (!current || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    tab = tab === 'ready' ? 'saved' : 'ready'; render();
    dialog.querySelector<HTMLElement>(`[data-tab="${tab}"]`)?.focus();
  });
  dialog.addEventListener('click', e => {
    // Clicar fora da caixa (no fundo escuro) fecha.
    if (e.target === dialog) { dialog.close(); return; }
    const el = e.target as HTMLElement;
    const tabButton = el.closest<HTMLElement>('[data-tab]');
    if (tabButton) { tab = tabButton.dataset.tab as Tab; render(); return; }
    const action = el.closest<HTMLElement>('[data-scn]');
    if (!action) return;
    if (action.dataset.scn === 'close') { dialog.close(); return; }
    const i = Number(action.dataset.i);
    if (action.dataset.scn === 'delete') { const s = o.saved()[i]; if (s) o.remove(s.name); render(); return; }
    const start = action.dataset.scn === 'start';
    if (tab === 'ready') { const r = READY_SCENARIOS[i]; if (r) { dialog.close(); o.open(r.nome, r.cenario, r, start); } }
    else { const s = o.saved()[i]; if (s) { dialog.close(); o.open(s.name, s.scenario, undefined, start); } }
  });

  return {
    show(which?: Tab) {
      if (which) tab = which;
      else if (tab === 'saved' && !o.saved().length) tab = 'ready';
      search.value = ''; render(); dialog.showModal(); search.focus();
    },
  };
}
