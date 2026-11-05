import { KEYS, loadJSON, saveJSON } from '../storage';
import type { LabPhase, LabPlayer, LabScenario } from '../forge/client';
import { autocompleteNames, cardImageUrls, resolveCardNames } from '../scryfall';
import { esc } from './cardtext';
import READY from '../lab-cenarios.json';
import './lab.css';

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

type Zone = 'battlefield' | 'hand' | 'library' | 'graveyard' | 'exile';
const ZONES: [Zone, string, string][] = [
  ['battlefield', 'Campo', ''],
  ['hand', 'Mão', ''],
  ['library', 'Grimório', 'A primeira é a do topo.'],
  ['graveyard', 'Cemitério', ''],
  ['exile', 'Exílio', ''],
];
const PHASES: [LabPhase, string][] = [
  ['upkeep', 'Manutenção'], ['draw', 'Compra'], ['main1', 'Fase principal 1'],
  ['combat', 'Início do combate'], ['main2', 'Fase principal 2'], ['end', 'Etapa final'],
];
/** Marcadores que o servidor aceita, com o nome que o jogador vê. */
export const LAB_COUNTERS: [string, string][] = [
  ['P1P1', '+1/+1'], ['M1M1', '−1/−1'], ['LOYALTY', 'Lealdade'], ['DEFENSE', 'Defesa'], ['CHARGE', 'Carga'],
  ['LORE', 'Conhecimento'], ['STUN', 'Atordoamento'], ['SHIELD', 'Escudo'], ['OIL', 'Óleo'], ['TIME', 'Tempo'],
  ['FADE', 'Desvanecer'], ['AGE', 'Idade'], ['QUEST', 'Missão'],
];
/** Mesmos limites do servidor (Lab.java). */
const MAX_PER_ZONE = 250;

/** No editor, a permanente tem um id para "presa a" continuar certo quando outras cartas saem ou mudam de lugar. */
interface Permanent { uid: number; name: string; tapped: boolean; sick: boolean; counters: Record<string, number>; attachedTo: number | null }
interface Side { life: number; poison: number; hand: string[]; library: string[]; graveyard: string[]; exile: string[]; battlefield: Permanent[] }
interface Draft { active: 0 | 1; phase: LabPhase; players: [Side, Side] }
interface Saved { name: string; scenario: LabScenario }
/** Cenário pronto para conferir à mão uma correção do CHANGELOG (item é o título em negrito, sem o ponto). */
export interface Ready { nome: string; versao: string; item: string; conferir: string; cenario: LabScenario }
export const READY_SCENARIOS = READY as unknown as Ready[];

const DRAFT_KEY = KEYS.labRascunho, SAVED_KEY = KEYS.labCenarios;
const load = <T>(key: string): T | null => loadJSON<T | null>(key, null);
const store = (key: string, value: unknown) => { saveJSON(key, value); };

let nextUid = 1;
const emptySide = (): Side => ({ life: 20, poison: 0, hand: [], library: [], graveyard: [], exile: [], battlefield: [] });
const emptyDraft = (): Draft => ({ active: 0, phase: 'main1', players: [emptySide(), emptySide()] });

/** O cenário que vai para o servidor: "presa a" vira jogador e posição no campo. */
export function toScenario(d: Draft): LabScenario {
  const where = new Map<number, { player: number; index: number }>();
  d.players.forEach((p, player) => p.battlefield.forEach((c, index) => where.set(c.uid, { player, index })));
  const side = (p: Side): LabPlayer => ({
    life: p.life, poison: p.poison, hand: [...p.hand], library: [...p.library], graveyard: [...p.graveyard], exile: [...p.exile],
    battlefield: p.battlefield.map(c => {
      const counters = Object.fromEntries(Object.entries(c.counters).filter(([, n]) => n > 0));
      const to = c.attachedTo === null ? undefined : where.get(c.attachedTo);
      return { name: c.name, ...(c.tapped ? { tapped: true } : {}), ...(c.sick ? { sick: true } : {}), ...(Object.keys(counters).length ? { counters } : {}), ...(to ? { attachedTo: to } : {}) };
    }),
  });
  return { active: d.active, phase: d.phase, players: [side(d.players[0]), side(d.players[1])] };
}

/** O contrário de toScenario, aceitando o que vier de um cenário colado (o servidor confere o resto). */
export function fromScenario(s: Partial<LabScenario>): Draft {
  const names = (v: unknown) => Array.isArray(v) ? v.filter((n): n is string => typeof n === 'string') : [];
  const num = (v: unknown, def: number) => typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : def;
  const players = (Array.isArray(s.players) ? s.players : []).slice(0, 2);
  while (players.length < 2) players.push({} as LabPlayer);
  const sides = players.map(p => {
    const field = Array.isArray(p?.battlefield) ? p.battlefield.filter(c => c && typeof c.name === 'string') : [];
    return {
      life: num(p?.life, 20), poison: num(p?.poison, 0),
      hand: names(p?.hand), library: names(p?.library), graveyard: names(p?.graveyard), exile: names(p?.exile),
      battlefield: field.map(c => ({ uid: nextUid++, name: c.name, tapped: !!c.tapped, sick: !!c.sick, counters: { ...(c.counters ?? {}) }, attachedTo: null as number | null })),
      raw: field,
    };
  });
  sides.forEach(side => side.raw.forEach((c, i) => {
    const to = c.attachedTo;
    if (to && sides[to.player]?.battlefield[to.index]) side.battlefield[i].attachedTo = sides[to.player].battlefield[to.index].uid;
  }));
  const strip = ({ raw: _raw, ...side }: Side & { raw: unknown }): Side => side;
  return {
    active: s.active === 1 ? 1 : 0,
    phase: PHASES.some(([p]) => p === s.phase) ? s.phase! : 'main1',
    players: [strip(sides[0]), strip(sides[1])],
  };
}

/** "3 Island" ou "3x Island": quantas cópias e o nome. */
export function parseEntry(text: string): { count: number; name: string } {
  const m = /^\s*(\d{1,4})\s*x?\s+(.+?)\s*$/i.exec(text);
  return m ? { count: Math.max(1, Math.min(MAX_PER_ZONE, Number(m[1]))), name: m[2] } : { count: 1, name: text.trim() };
}

export function mountLab(root: HTMLElement, opts: LabOptions): LabView {
  let draft: Draft = (() => { const s = load<LabScenario>(DRAFT_KEY); return s ? fromScenario(s) : emptyDraft(); })();
  let saved: Saved[] = load<Saved[]>(SAVED_KEY) ?? [];
  let busy = false;
  root.innerHTML = `<div class="lab">
    <header class="lab-top">
      <button type="button" class="ghost-btn" data-lab="back">← Voltar</button>
      <div class="lab-title"><h1>Laboratório</h1><p>Monte a mesa do jeito que quiser e jogue de verdade, com as regras do servidor: para achar erros, conferir correções, testar combos e ver até onde as regras aguentam.</p></div>
    </header>
    <section class="lab-bar" aria-label="Cenários prontos">
      <label class="lab-field lab-ready">Cenários prontos<select class="input-field" id="labReady">${READY_SCENARIOS.map((r, i) => `<option value="${i}">${esc(r.versao)} · ${esc(r.nome)}</option>`).join('')}</select></label>
      <button type="button" class="ghost-btn" data-lab="ready">Editar</button>
      <button type="button" class="ghost-btn" data-lab="ready-start">▶ Iniciar agora</button>
      <p class="lab-hint">Mesas montadas para conferir as correções da mesa, uma por correção.</p>
    </section>
    <aside class="lab-guide" id="labGuide" aria-live="polite" hidden></aside>
    <section class="lab-bar" aria-label="Cenários salvos">
      <label class="lab-field">Cenários salvos<select class="input-field" id="labSaved"></select></label>
      <button type="button" class="ghost-btn" data-lab="load">Editar</button>
      <button type="button" class="ghost-btn" data-lab="load-start">▶ Iniciar agora</button>
      <button type="button" class="ghost-btn danger" data-lab="delete">Apagar</button>
      <span class="lab-sep" aria-hidden="true"></span>
      <label class="lab-field">Nome do cenário<input class="input-field" id="labName" maxlength="60" placeholder="Memnarch contra Jace"></label>
      <button type="button" class="ghost-btn" data-lab="save">Salvar</button>
      <span class="lab-sep" aria-hidden="true"></span>
      <button type="button" class="ghost-btn" data-lab="export">Copiar cenário</button>
      <button type="button" class="ghost-btn" data-lab="import">Colar cenário</button>
      <button type="button" class="ghost-btn" data-lab="clear">Limpar a mesa</button>
    </section>
    <section class="lab-bar lab-turn" aria-label="Começo da partida">
      <div class="lab-field" role="group" aria-labelledby="labActiveLabel"><span id="labActiveLabel">Turno de</span><div class="lab-segments"><button type="button" data-active="0">Jogador 1</button><button type="button" data-active="1">Jogador 2</button></div></div>
      <label class="lab-field">Começa em<select class="input-field" id="labPhase">${PHASES.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></label>
    </section>
    <div class="lab-players" id="labPlayers"></div>
    <p class="lab-help">Você joga como Jogador 1. O Jogador 2 entra pelo link da sala: abra o link numa outra aba para jogar pelos dois lados, ou mande para outra pessoa. A partida não entra no seu histórico.</p>
    <footer class="lab-foot">
      <p class="lobby-status" id="labStatus" role="status" aria-live="polite"></p>
      <button type="button" class="arena-btn primary big" data-lab="host">Criar sala de teste</button>
    </footer>
    <datalist id="labNames"></datalist>
    <dialog class="lab-dialog" id="labImport" aria-labelledby="labImportTitle">
      <h2 id="labImportTitle">Colar cenário</h2>
      <p>Cole o texto de um cenário copiado com “Copiar cenário”. Ele substitui a mesa montada.</p>
      <textarea class="input-field" id="labImportText" rows="8" spellcheck="false"></textarea>
      <footer><button type="button" class="arena-btn secondary" data-lab="import-cancel">Cancelar</button><button type="button" class="arena-btn primary" data-lab="import-ok">Usar este cenário</button></footer>
    </dialog>
  </div>`;
  const $ = <T extends HTMLElement = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;

  const setStatus = (text: string, error = false) => { const el = $('#labStatus'); el.textContent = text; el.classList.toggle('error', error); };
  const persist = () => store(DRAFT_KEY, toScenario(draft));
  /** O que conferir no cenário pronto aberto; some quando a mesa troca por outra. */
  const setGuide = (r?: Ready) => {
    const el = $('#labGuide');
    el.hidden = !r;
    el.innerHTML = r ? `<strong>O que conferir</strong> <span class="lab-pos">(${esc(r.versao)} · ${esc(r.item)})</span><p>${esc(r.conferir)}</p>` : '';
  };

  function art(name: string) {
    const url = cardImageUrls([name], ['small'])[0];
    return url ? `<img class="lab-art" src="${esc(url)}" alt="" loading="lazy">` : '<span class="lab-art" aria-hidden="true"></span>';
  }
  /** Rótulo de uma permanente para "presa a": o nome e, com repetidas, qual delas. */
  function permanentLabel(player: number, index: number) {
    const field = draft.players[player].battlefield, c = field[index];
    const same = field.filter(o => o.name === c.name).length;
    return `${c.name}${same > 1 ? ` (${field.slice(0, index + 1).filter(o => o.name === c.name).length})` : ''} · Jogador ${player + 1}`;
  }
  function permanentHTML(p: number, c: Permanent, i: number) {
    const options = draft.players.flatMap((side, player) => side.battlefield.map((o, index) => ({ o, player, index }))).filter(x => x.o.uid !== c.uid);
    const counters = Object.entries(c.counters);
    return `<li class="lab-card lab-perm" data-uid="${c.uid}">${art(c.name)}<div class="lab-card-body">
      <div class="lab-card-head"><strong>${esc(c.name)}</strong>${cardTools(p, 'battlefield', i)}</div>
      <div class="lab-flags"><label><input type="checkbox" data-prop="tapped"${c.tapped ? ' checked' : ''}> Virada</label><label><input type="checkbox" data-prop="sick"${c.sick ? ' checked' : ''}> Entrou neste turno</label>
      ${counters.map(([type, n]) => `<label class="lab-counter">${esc(LAB_COUNTERS.find(([t]) => t === type)?.[1] ?? type)}<input type="number" class="input-field" min="0" max="999" value="${n}" data-counter="${esc(type)}" aria-label="Marcadores de ${esc(LAB_COUNTERS.find(([t]) => t === type)?.[1] ?? type)} em ${esc(c.name)}"></label>`).join('')}
        <select class="input-field lab-add-counter" data-prop="add-counter" aria-label="Pôr marcador em ${esc(c.name)}"><option value="">+ Marcador</option>${LAB_COUNTERS.filter(([t]) => !(t in c.counters)).map(([t, label]) => `<option value="${t}">${label}</option>`).join('')}</select>
      ${options.length ? `<label class="lab-attach">Presa a<select class="input-field" data-prop="attach"><option value="">nada</option>${options.map(x => `<option value="${x.o.uid}"${c.attachedTo === x.o.uid ? ' selected' : ''}>${esc(permanentLabel(x.player, x.index))}</option>`).join('')}</select></label>` : ''}</div>
    </div></li>`;
  }
  function cardTools(p: number, zone: Zone, i: number) {
    const size = zone === 'battlefield' ? draft.players[p].battlefield.length : draft.players[p][zone].length;
    return `<span class="lab-tools">${size > 1 ? `<button type="button" class="lab-icon" data-move="-1" data-index="${i}" aria-label="Subir"${i === 0 ? ' disabled' : ''}>↑</button><button type="button" class="lab-icon" data-move="1" data-index="${i}" aria-label="Descer"${i === size - 1 ? ' disabled' : ''}>↓</button>` : ''}<button type="button" class="lab-icon" data-remove="${i}" aria-label="Tirar">×</button></span>`;
  }
  function zoneHTML(p: number, zone: Zone, title: string, hint: string) {
    const side = draft.players[p];
    const list = zone === 'battlefield'
      ? side.battlefield.map((c, i) => permanentHTML(p, c, i)).join('')
      : side[zone].map((name, i) => `<li class="lab-card">${art(name)}<div class="lab-card-body"><div class="lab-card-head"><strong>${zone === 'library' ? `<span class="lab-pos">${i + 1}.</span> ` : ''}${esc(name)}</strong>${cardTools(p, zone, i)}</div></div></li>`).join('');
    const count = zone === 'battlefield' ? side.battlefield.length : side[zone].length;
    return `<section class="lab-zone" data-zone="${zone}"><h3>${title} <span class="lab-count">${count}</span></h3>${hint ? `<p class="lab-hint">${hint}</p>` : ''}
      ${list ? `<ul class="lab-list">${list}</ul>` : ''}
      <form class="lab-add" data-add="${zone}"><input class="input-field" list="labNames" autocomplete="off" spellcheck="false" placeholder="Carta (ou 3 Island)" aria-label="Pôr carta em ${title}, Jogador ${p + 1}"><button type="submit" class="ghost-btn">Pôr</button></form></section>`;
  }
  function render() {
    for (const b of root.querySelectorAll<HTMLButtonElement>('[data-active]')) b.setAttribute('aria-pressed', String(Number(b.dataset.active) === draft.active));
    $<HTMLSelectElement>('#labPhase').value = draft.phase;
    $<HTMLSelectElement>('#labSaved').innerHTML = saved.length ? saved.map((s, i) => `<option value="${i}">${esc(s.name)}</option>`).join('') : '<option value="">Nenhum salvo</option>';
    $<HTMLSelectElement>('#labSaved').disabled = !saved.length;
    for (const action of ['load', 'load-start', 'delete']) $<HTMLButtonElement>(`[data-lab=${action}]`).disabled = !saved.length;
    // Redesenhar troca os campos: o foco volta para o campo de pôr carta onde estava.
    const focused = document.activeElement?.closest<HTMLElement>('[data-add]');
    const focusKey = focused ? `${focused.closest<HTMLElement>('[data-player]')?.dataset.player}:${focused.dataset.add}` : '';
    $('#labPlayers').innerHTML = draft.players.map((side, p) => `<section class="lab-player" data-player="${p}" aria-labelledby="labPlayer${p}">
      <h2 id="labPlayer${p}">Jogador ${p + 1} <small>${p === 0 ? 'você' : 'quem entrar pelo link'}</small></h2>
      <div class="lab-stats"><label class="lab-field">Vida<input type="number" class="input-field" data-stat="life" value="${side.life}" min="-999999" max="999999"></label><label class="lab-field">Veneno<input type="number" class="input-field" data-stat="poison" value="${side.poison}" min="0" max="999"></label></div>
      ${ZONES.map(([zone, title, hint]) => zoneHTML(p, zone, title, hint)).join('')}
    </section>`).join('');
    if (focusKey) {
      const [p, zone] = focusKey.split(':');
      root.querySelector<HTMLInputElement>(`[data-player="${p}"] [data-add="${zone}"] input`)?.focus();
    }
    for (const action of ['host', 'ready-start']) $<HTMLButtonElement>(`[data-lab=${action}]`).disabled = busy;
    if (busy) $<HTMLButtonElement>('[data-lab=load-start]').disabled = true;
    $<HTMLButtonElement>('[data-lab=host]').textContent = busy ? 'Criando a sala…' : 'Criar sala de teste';
  }
  const changed = () => { persist(); render(); };
  const cardNames = () => draft.players.flatMap(s => [...s.hand, ...s.library, ...s.graveyard, ...s.exile, ...s.battlefield.map(c => c.name)]);

  const sideOf = (el: Element) => Number(el.closest<HTMLElement>('[data-player]')!.dataset.player);
  const zoneOf = (el: Element) => el.closest<HTMLElement>('[data-zone]')!.dataset.zone as Zone;
  const permanentOf = (el: Element) => {
    const uid = Number(el.closest<HTMLElement>('[data-uid]')?.dataset.uid);
    return draft.players[sideOf(el)].battlefield.find(c => c.uid === uid);
  };

  async function add(form: HTMLFormElement) {
    const input = form.querySelector('input')!, p = sideOf(form), zone = form.dataset.add as Zone;
    const { count, name } = parseEntry(input.value);
    if (!name) return;
    const side = draft.players[p], size = zone === 'battlefield' ? side.battlefield.length : side[zone].length;
    if (size + count > MAX_PER_ZONE) { setStatus(`No máximo ${MAX_PER_ZONE} cartas em cada zona.`, true); return; }
    setStatus('Procurando a carta…');
    let found: string | undefined;
    try { found = (await resolveCardNames([name])).found.get(name.toLowerCase()); }
    catch { setStatus('Não foi possível procurar a carta agora. Confira a conexão e tente de novo.', true); return; }
    if (!found) { setStatus(`Não encontrei a carta “${name}”. Confira o nome (em inglês ou português).`, true); return; }
    for (let i = 0; i < count; i++) {
      if (zone === 'battlefield') side.battlefield.push({ uid: nextUid++, name: found, tapped: false, sick: false, counters: {}, attachedTo: null });
      else side[zone].push(found);
    }
    input.value = '';
    setStatus('');
    changed();
  }

  root.addEventListener('submit', e => {
    const form = (e.target as HTMLElement).closest<HTMLFormElement>('[data-add]');
    if (!form) return;
    e.preventDefault();
    void add(form);
  });

  let suggestTimer: ReturnType<typeof setTimeout> | undefined, suggestFor = '';
  root.addEventListener('input', e => {
    const target = e.target as HTMLInputElement;
    if (target.closest('[data-add]')) {
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
    }
  });

  root.addEventListener('change', e => {
    const target = e.target as HTMLInputElement | HTMLSelectElement;
    if (target.id === 'labPhase') { draft.phase = target.value as LabPhase; persist(); return; }
    if (!target.closest('[data-player]')) return;
    const p = sideOf(target), side = draft.players[p];
    if (target.dataset.stat) {
      const n = Math.trunc(Number(target.value));
      if (Number.isFinite(n)) side[target.dataset.stat as 'life' | 'poison'] = target.dataset.stat === 'poison' ? Math.max(0, Math.min(999, n)) : Math.max(-999999, Math.min(999999, n));
      persist(); return;
    }
    const c = permanentOf(target);
    if (!c) return;
    const prop = target.dataset.prop;
    if (prop === 'tapped' || prop === 'sick') { c[prop] = (target as HTMLInputElement).checked; persist(); return; }
    if (prop === 'attach') { c.attachedTo = target.value ? Number(target.value) : null; persist(); return; }
    if (prop === 'add-counter' && target.value) { c.counters[target.value] = 1; changed(); return; }
    if (target.dataset.counter) {
      const n = Math.max(0, Math.min(999, Math.trunc(Number(target.value)) || 0));
      if (n === 0) { delete c.counters[target.dataset.counter]; changed(); return; }
      c.counters[target.dataset.counter] = n; persist();
    }
  });

  root.addEventListener('click', e => {
    const el = e.target as HTMLElement;
    const active = el.closest<HTMLElement>('[data-active]');
    if (active) { draft.active = Number(active.dataset.active) as 0 | 1; changed(); return; }
    const move = el.closest<HTMLButtonElement>('[data-move]'), remove = el.closest<HTMLButtonElement>('[data-remove]');
    if (move || remove) {
      const p = sideOf(el), zone = zoneOf(el), side = draft.players[p];
      const list: unknown[] = zone === 'battlefield' ? side.battlefield : side[zone];
      if (remove) {
        const [gone] = list.splice(Number(remove.dataset.remove), 1);
        // O que estava preso à carta tirada fica solto.
        if (zone === 'battlefield') for (const s of draft.players) for (const c of s.battlefield) if (c.attachedTo === (gone as Permanent).uid) c.attachedTo = null;
      } else {
        const i = Number(move!.dataset.index), j = i + Number(move!.dataset.move);
        if (j >= 0 && j < list.length) [list[i], list[j]] = [list[j], list[i]];
      }
      changed(); return;
    }
    const action = el.closest<HTMLElement>('[data-lab]')?.dataset.lab;
    if (!action) return;
    if (action === 'back') opts.onBack();
    else if (action === 'host') void host();
    else if (action === 'save') {
      const name = $<HTMLInputElement>('#labName').value.trim();
      if (!name) { setStatus('Dê um nome ao cenário para salvar.', true); $('#labName').focus(); return; }
      saved = [{ name, scenario: toScenario(draft) }, ...saved.filter(s => s.name !== name)];
      store(SAVED_KEY, saved); render(); setStatus(`Cenário “${name}” salvo neste aparelho.`);
    } else if (action === 'load' || action === 'load-start' || action === 'delete') {
      const s = saved[Number($<HTMLSelectElement>('#labSaved').value)];
      if (!s) return;
      if (action !== 'delete') {
        draft = fromScenario(s.scenario); $<HTMLInputElement>('#labName').value = s.name; changed(); setGuide(); setStatus(`Cenário “${s.name}” aberto.`);
        if (action === 'load-start') void host();
      } else { saved = saved.filter(o => o !== s); store(SAVED_KEY, saved); render(); setStatus(`Cenário “${s.name}” apagado.`); }
    } else if (action === 'ready' || action === 'ready-start') {
      const r = READY_SCENARIOS[Number($<HTMLSelectElement>('#labReady').value)];
      if (!r) return;
      draft = fromScenario(r.cenario); $<HTMLInputElement>('#labName').value = r.nome; changed(); setGuide(r); setStatus(`Cenário “${r.nome}” aberto.`);
      if (action === 'ready-start') void host();
      else void resolveCardNames(cardNames()).then(render).catch(() => {});
    } else if (action === 'clear') { draft = emptyDraft(); changed(); setGuide(); setStatus('Mesa limpa.'); }
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
        draft = fromScenario(parsed); changed(); setGuide();
        $<HTMLDialogElement>('#labImport').close(); setStatus('Cenário colado.');
      } catch { setStatus('Esse texto não é um cenário do Laboratório.', true); $<HTMLDialogElement>('#labImport').close(); }
    }
  });

  async function host() {
    if (busy) return;
    const total = draft.players.reduce((n, s) => n + s.hand.length + s.library.length + s.graveyard.length + s.exile.length + s.battlefield.length, 0);
    if (!total) { setStatus('Ponha pelo menos uma carta na mesa.', true); return; }
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
