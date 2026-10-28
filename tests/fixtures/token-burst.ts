import '../../src/style.css';
import { createForgeTableView } from '../../src/ui/forgeTable';

/*
 * Rajada de fichas (item 43 do roadmap): a mesa de verdade, sem a ponte, recebendo os eventos de criar várias fichas de
 * uma vez, como a ponte manda (um `entered` por ficha, cada um com o quadro do campo naquele momento). O exemplo é
 * Hare Apparent: ao entrar, cria uma ficha de Coelho 1/1 para cada outro Hare Apparent seu. Abra
 * /tests/fixtures/token-burst.html no `npm run dev`. O painel mede quanto a mesa leva para mostrar tudo.
 */

interface Command { cmd: string; [key: string]: any }

const ME = 10, OPP = 23;
const HARE_TEXT = 'When this creature enters, create a number of 1/1 white Rabbit creature tokens equal to the number of other creatures you control named Hare Apparent.\nA deck can have any number of cards named Hare Apparent.';
let nextId = 1000;
const hare = () => ({ id: nextId++, controller: ME, name: 'Hare Apparent', creature: true, power: 2, toughness: 2, basePower: 2, baseToughness: 2, damage: 0,
  manaCost: '{1}{W}', typeLine: 'Creature — Rabbit Noble', text: HARE_TEXT, tapped: false, token: false, keywords: [] as string[] });
const rabbit = () => ({ id: nextId++, controller: ME, name: 'Rabbit', creature: true, power: 1, toughness: 1, basePower: 1, baseToughness: 1, damage: 0,
  manaCost: '', typeLine: 'Token Creature — Rabbit', text: '', tapped: false, token: true, sick: true, keywords: [] as string[] });
const land = () => ({ id: nextId++, controller: ME, name: 'Plains', land: true, typeLine: 'Basic Land — Plains', tapped: false, token: false, creature: false });
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

if (new URLSearchParams(location.search).has('mesa')) table(); else panel();

// ---------------------------------------------------------------- mesa
function table() {
  let reduce = false;
  const media = window.matchMedia.bind(window);
  window.matchMedia = (query: string) => query.includes('prefers-reduced-motion')
    ? { matches: reduce, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false } as MediaQueryList
    : media(query);

  let players: any[] = [];
  let state: any;
  let seq = 0;
  let batch: any[] = [];
  let busy = false;

  const me = () => players[0];
  function setup(hares: number) {
    players = [
      { id: ME, seat: 0, name: 'Você', ai: false, life: 20, library: 40, handCount: 0, hand: [], pool: {}, graveyard: [], exile: [], battlefield: [] },
      { id: OPP, seat: 1, name: 'Oponente', ai: true, life: 20, library: 40, handCount: 4, hand: [], pool: {}, graveyard: [], exile: [], battlefield: [] },
    ];
    for (let i = 0; i < 4; i++) me().battlefield.push(land());
    for (let i = 0; i < hares; i++) me().battlefield.push(hare());
    state = {
      type: 'state', config: { format: 'free', matchLength: 'bo1' }, you: ME, players, turn: 6, phase: 'MAIN1', activePlayer: ME, gameOver: false,
      log: [], decks: [], stack: [], combat: [], castable: [], events: [], eventCursor: seq, matchId: 'token-burst',
      input: { gen: 1, priority: false, message: 'Rajada de fichas: use o painel.', ok: { label: 'OK', enabled: false }, cancel: { label: '', enabled: false }, selectable: [], actionable: [] },
    };
  }
  const hares = () => me().battlefield.filter((c: any) => c.name === 'Hare Apparent');

  function frame() {
    return structuredClone({ turn: state.turn, phase: state.phase, activePlayer: state.activePlayer, stack: state.stack, combat: state.combat,
      players: players.map(p => ({ id: p.id, life: p.life, battlefield: p.battlefield, handCount: p.handCount, library: p.library })) });
  }
  function emit(type: string, extra: Record<string, unknown>) { batch.push({ seq: ++seq, stateVersion: seq, type, ...extra, frame: frame() }); }
  /** Um estado da ponte: os eventos desde o último, com um objeto novo a cada estado, como a ponte manda. */
  function flush() {
    state.events = [...state.events, ...batch].slice(-80); state.eventCursor = seq; batch = [];
    state.input.gen++;
    client.state = { ...state, players: players.map(p => ({ ...p })) };
    view.render();
  }

  /** O gatilho de um Hare: vai para a pilha e, quando resolve, cria uma ficha por outro Hare (uma `entered` cada). */
  function trigger(source: any) {
    const item = { id: nextId++, text: `${source.name} - ${HARE_TEXT.split('\n')[0]}`, source: structuredClone(source), controller: ME, trigger: true };
    state.stack = [item, ...state.stack];
    emit('ability-activated', { card: structuredClone(source), sourceId: source.id, actor: ME, trigger: true, text: item.text, stackId: item.id, to: 'Stack' });
    return item;
  }
  function resolveTop() {
    // Como a ponte: enquanto o gatilho resolve, ele continua no topo da pilha no quadro de cada ficha.
    const [item, ...rest] = state.stack;
    const count = hares().filter((h: any) => h.id !== item.source.id).length;
    for (let i = 0; i < count; i++) {
      const token = rabbit();
      me().battlefield.push(token);
      emit('entered', { card: structuredClone(token), sourceId: token.id, actor: ME, from: null, to: 'Battlefield', stackId: item.id, sourceName: item.source.name });
    }
    state.stack = rest;
    emit('resolved', { card: structuredClone(item.source), sourceId: item.source.id, actor: ME, stackId: item.id, trigger: true, from: 'Stack' });
    return count;
  }

  async function run(c: Command) {
    const gap = Math.max(0, Number(c.gap) || 0);
    let tokens = 0;
    if (c.kind === 'cast') {
      // Conjurar mais um: a mágica vai à pilha, resolve, o Hare entra e o gatilho dele vai à pilha.
      const spell = hare();
      state.stack = [{ id: nextId++, text: HARE_TEXT, source: structuredClone(spell), controller: ME }];
      emit('spell-cast', { card: structuredClone(spell), sourceId: spell.id, actor: ME, from: 'Hand', to: 'Stack', stackId: state.stack[0].id });
      flush(); await sleep(gap);
      state.stack = [];
      me().battlefield.push(spell);
      emit('resolved', { card: structuredClone(spell), sourceId: spell.id, actor: ME, from: 'Stack', to: 'Battlefield' });
      emit('entered', { card: structuredClone(spell), sourceId: spell.id, actor: ME, from: 'Stack', to: 'Battlefield' });
      trigger(spell);
      flush(); await sleep(gap);
      tokens += resolveTop();
      flush();
    } else {
      // Blink em massa (como Ghostly Flicker em todos, ou Brago): todos os Hares voltam juntos, e cada um dispara.
      const all = hares(), blink = nextId++;
      for (const h of all) {
        me().battlefield = me().battlefield.filter((x: any) => x !== h);
        emit('left', { card: structuredClone(h), sourceId: h.id, actor: ME, from: 'Battlefield', to: 'Exile' });
      }
      for (const h of all) { me().battlefield.push(h); emit('entered', { card: structuredClone(h), sourceId: h.id, actor: ME, from: 'Exile', to: 'Battlefield', stackId: blink, sourceName: 'Ghostly Flicker' }); }
      flush(); await sleep(gap);
      for (const h of all) trigger(h);
      flush(); await sleep(gap);
      // Cada gatilho resolve num estado próprio: entre um e outro, os dois jogadores passam a prioridade.
      while (state.stack.length) { tokens += resolveTop(); flush(); await sleep(gap); }
    }
    return tokens;
  }

  // A cada evento apresentado, a mesa anuncia a frase dele: a hora do último anúncio é quando a mesa acabou de mostrar.
  let started = 0, lastChange = 0, steps = 0;
  const announcement = () => document.querySelector('#fAnnouncement');
  let watched: Element | null = null;
  const watcher = new MutationObserver(() => { if (started) { lastChange = performance.now(); steps++; } });
  function watchAnnouncement() {
    const el = announcement();
    if (el && el !== watched) { watcher.disconnect(); watcher.observe(el, { childList: true, characterData: true, subtree: true }); watched = el; }
  }
  async function measure(c: Command) {
    watchAnnouncement();
    const before = hares().length;
    steps = 0; started = performance.now(); lastChange = started;
    const tokens = await run(c);
    const engineDone = performance.now() - started;
    // Espera a mesa ficar quieta: 1,5 s sem nenhum anúncio novo.
    while (performance.now() - lastChange < 1500) await sleep(100);
    const total = lastChange - started;
    started = 0;
    return { hares: before, tokens, engineMs: Math.round(engineDone), tableMs: Math.round(total), steps };
  }

  const view = createForgeTableView(document.querySelector('#table')!, { onExit() { location.reload(); }, onRematch() { location.reload(); } });
  const client: any = { state: null, connected: true, send() {} };
  setup(4);
  client.state = state;
  view.attach(client, []);
  flush();
  window.addEventListener('message', async ({ data }) => {
    if (!data?.cmd || busy) return;
    if (data.cmd === 'reset') { setup(Number(data.hares) || 0); flush(); parent.postMessage({ burst: 'note', note: `Campo com ${hares().length} Hare Apparent.` }, '*'); return; }
    if (data.cmd === 'style') {
      try { localStorage.setItem('mesa:cards', data.value); } catch { /* opcional */ }
      const select = document.querySelector<HTMLSelectElement>('#fCardStyle');
      if (select) { select.value = data.value; select.dispatchEvent(new Event('change', { bubbles: true })); }
      return;
    }
    if (data.cmd === 'reduce') { reduce = !!data.value; return; }
    if (data.cmd === 'run') {
      busy = true;
      parent.postMessage({ burst: 'note', note: 'Rodando… a mesa está mostrando os eventos.' }, '*');
      const result = await measure(data);
      busy = false;
      parent.postMessage({ burst: 'result', kind: data.kind, ...result }, '*');
    }
  });
  (window as any).fixture = { run: (kind: 'cast' | 'blink', gap = 150) => measure({ cmd: 'run', kind, gap }), reset: (n: number) => { setup(n); flush(); } };
}

// ---------------------------------------------------------------- painel
function panel() {
  document.title = 'Rajada de fichas';
  document.body.innerHTML = '';
  const css = document.createElement('style');
  css.textContent = `
    body { margin: 0; background: #070b14; color: #e9eef7; font: 500 13px/1.4 system-ui, sans-serif; display: flex; height: 100dvh; overflow: hidden; }
    #lab { width: 300px; flex: none; overflow: auto; padding: 12px 14px 40px; box-sizing: border-box; background: #0c1222; border-right: 1px solid #f2b54c44; }
    #lab h1 { font-size: 15px; color: #f2b54c; margin: 0 0 4px; } #lab h2 { font-size: 11px; color: #9aa5bb; text-transform: uppercase; letter-spacing: .06em; margin: 14px 0 6px; }
    #lab p { margin: 0 0 6px; color: #c7cfdd; } #note { min-height: 36px; color: #ffe2a0; }
    #lab select, #lab input[type=number] { width: 100%; box-sizing: border-box; margin: 2px 0 6px; padding: 5px 6px; border-radius: 6px; border: 1px solid #ffffff30; background: #131d30; color: inherit; font: inherit; }
    #lab button { margin: 2px 2px 2px 0; padding: 5px 9px; border-radius: 7px; border: 1px solid #ffffff30; background: #ffffff10; color: inherit; font: 600 12px system-ui; cursor: pointer; }
    #lab button:hover { background: #ffffff22; } #lab button.on { border-color: #f2b54c; color: #ffe2a0; }
    #lab table { width: 100%; border-collapse: collapse; font-size: 12px; } #lab td, #lab th { padding: 3px 4px; border-bottom: 1px solid #ffffff18; text-align: right; } #lab th:first-child, #lab td:first-child { text-align: left; }
    #stage { flex: 1; position: relative; display: grid; place-items: center; overflow: hidden; background: repeating-linear-gradient(45deg, #0a0f1b 0 12px, #0c1220 12px 24px); }
    #frame { border: 0; background: #000; box-shadow: 0 0 0 1px #ffffff22, 0 20px 50px #000a; transform-origin: 50% 50%; }
    #size { position: absolute; top: 8px; right: 10px; font-size: 11px; color: #9aa5bb; }`;
  document.head.append(css);
  const lab = document.createElement('aside'); lab.id = 'lab';
  const stage = document.createElement('div'); stage.id = 'stage';
  const frame = document.createElement('iframe'); frame.id = 'frame'; frame.title = 'Mesa'; frame.src = `${location.pathname}?mesa`;
  const sizeTag = document.createElement('span'); sizeTag.id = 'size';
  stage.append(frame, sizeTag); document.body.append(lab, stage);

  const opt = (value: string, text: string) => `<option value="${value}">${text}</option>`;
  lab.innerHTML = `
    <h1>Rajada de fichas</h1><p id="note">Monte o campo com Hare Apparent e crie as fichas. A mesa recebe os eventos como a ponte manda: um por ficha.</p>
    <h2>Campo</h2>
    <label>Hare Apparent no campo</label><input type="number" id="hares" value="4" min="0" max="30">
    <button data-c="reset">Montar campo</button>
    <h2>Criar fichas</h2>
    <label>Espera da ponte entre estados (ms)</label><input type="number" id="gap" value="150" min="0" max="2000" title="Tempo entre um estado e o próximo: prioridade, gatilhos, a IA pensando">
    <button data-run="cast">Conjurar mais um Hare</button>
    <button data-run="blink">Blink em todos (um gatilho por Hare)</button>
    <p>Conjurar: um gatilho cria uma ficha por outro Hare. Blink: cada Hare dispara, e cada gatilho cria uma ficha por outro Hare (N Hares → N × (N−1) fichas).</p>
    <h2>Medições</h2>
    <table><thead><tr><th>Caso</th><th>Hares</th><th>Fichas</th><th>Ponte</th><th>Mesa</th></tr></thead><tbody id="results"></tbody></table>
    <p>"Mesa" é o tempo até o último evento aparecer, contando a espera da ponte.</p>
    <h2>Aparência e tela</h2>
    <select id="style">${opt('full', 'Imagem completa')}${opt('art', 'Arte e texto')}${opt('arena', 'Arena')}</select>
    <label><input type="checkbox" id="reduce"> Reduzir movimento</label>
    <div>${[['desktop', 'Computador'], ['tablet', 'Tablet'], ['phone', 'Celular deitado']].map(([k, t]) => `<button data-s="${k}">${t}</button>`).join('')}</div>`;

  const $ = <T extends HTMLElement>(id: string) => lab.querySelector<T>(`#${id}`)!;
  const send = (cmd: Command) => frame.contentWindow?.postMessage(cmd, '*');
  const seconds = (ms: number) => `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
  window.addEventListener('message', ({ data }) => {
    if (data?.burst === 'note') $('note').textContent = data.note;
    if (data?.burst === 'result') {
      $('note').textContent = `${data.tokens} fichas em ${seconds(data.tableMs)} na mesa (a ponte terminou em ${seconds(data.engineMs)}).`;
      $('results').insertAdjacentHTML('afterbegin', `<tr><td>${data.kind === 'cast' ? 'Conjurar' : 'Blink'}</td><td>${data.hares}</td><td>${data.tokens}</td><td>${seconds(data.engineMs)}</td><td>${seconds(data.tableMs)}</td></tr>`);
    }
  });
  lab.addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!b) return;
    if (b.dataset.c === 'reset') send({ cmd: 'reset', hares: $<HTMLInputElement>('hares').value });
    if (b.dataset.run) send({ cmd: 'run', kind: b.dataset.run, gap: $<HTMLInputElement>('gap').value });
    if (b.dataset.s) resize(b.dataset.s);
  });
  lab.addEventListener('change', e => {
    const t = e.target as HTMLInputElement;
    if (t.id === 'style') send({ cmd: 'style', value: t.value });
    if (t.id === 'reduce') send({ cmd: 'reduce', value: t.checked });
  });

  const SIZES: Record<string, [number, number] | null> = { desktop: null, tablet: [1024, 768], phone: [844, 390] };
  let size = 'desktop';
  function resize(next = size) {
    size = next;
    const box = stage.getBoundingClientRect();
    const [w, h] = SIZES[size] ?? [box.width, box.height];
    frame.style.width = `${w}px`; frame.style.height = `${h}px`;
    const scale = Math.min(1, (box.width - 24) / w, (box.height - 24) / h);
    frame.style.transform = SIZES[size] ? `scale(${scale})` : '';
    sizeTag.textContent = `${Math.round(w)}×${Math.round(h)}${SIZES[size] && scale < 1 ? ` (mostrado a ${Math.round(scale * 100)}%)` : ''}`;
    lab.querySelectorAll<HTMLButtonElement>('[data-s]').forEach(b => b.classList.toggle('on', b.dataset.s === size));
  }
  new ResizeObserver(() => resize()).observe(stage);
  resize();
}
