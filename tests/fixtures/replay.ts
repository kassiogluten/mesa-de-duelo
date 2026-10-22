import '../../src/style.css';
import { createForgeTableView } from '../../src/ui/forgeTable';
import { applyPatch, frameAt, readJson, type Patch, type RecordedMessage, type RecordedNote, type Recording } from '../../src/forge/recording';
import type { FState } from '../../src/forge/client';
import { adminError, adminFetch, adminSession } from '../../src/admin/session';

/*
 * Repetição de partida (item 28): abre um relato (.json.gz do servidor ou o arquivo de "Baixar gravação") e entrega
 * os estados gravados à mesa de verdade, sem a ponte, na ordem e com as animações. Abra /tests/fixtures/replay.html
 * no `npm run dev` (ou com ?arquivo=URL, ou ?relato=R-XXXX vindo da área de admin, com a sessão dela). Como no laboratório de efeitos, a mesa fica num quadro do tamanho escolhido
 * (?mesa abre só a mesa, que recebe os estados do painel).
 */

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

if (new URLSearchParams(location.search).has('mesa')) table(); else panel();

// ---------------------------------------------------------------- mesa
function table() {
  let reduce = false;
  const media = window.matchMedia.bind(window);
  window.matchMedia = (query: string) => query.includes('prefers-reduced-motion')
    ? { matches: reduce, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false } as MediaQueryList
    : media(query);
  const still = document.createElement('style');
  still.textContent = '*,*::before,*::after{animation-duration:0s!important;animation-iteration-count:1!important;transition:none!important}';

  const view = createForgeTableView(document.querySelector('#table')!, { onExit() {}, onRematch() {} });
  // Cliques na repetição não vão a lugar nenhum: o painel só mostra o que a mesa tentou mandar.
  const client: any = { state: null, connected: true, send(msg: unknown) { parent.postMessage({ replay: 'sent', msg }, '*'); } };
  let attached = false;
  window.addEventListener('message', ({ data }) => {
    if (data?.cmd === 'state') {
      client.state = data.state;
      if (data.reset || !attached) { view.attach(client, []); attached = true; }
      view.render();
    }
    if (data?.cmd === 'style') {
      try { localStorage.setItem('mesa:cards', data.value); } catch { /* opcional */ }
      const select = document.querySelector<HTMLSelectElement>('#fCardStyle');
      if (select) { select.value = data.value; select.dispatchEvent(new Event('change', { bubbles: true })); }
    }
    if (data?.cmd === 'reduce') { reduce = !!data.value; if (reduce) document.head.append(still); else still.remove(); }
  });
  parent.postMessage({ replay: 'ready' }, '*');
}

// ---------------------------------------------------------------- painel
interface Loaded {
  recording: Recording | null;
  report?: Record<string, any>;
  stored?: { code?: string; receivedAt?: string; bridge?: Record<string, any> | null };
}
interface Item { at: number; v: number | null; kind: 'ação' | 'nota'; label: string; detail?: string; serious?: boolean }

function normalize(data: any): Loaded {
  if (data?.format === 'mesa-gravacao') return { recording: data };
  if (data?.report) return { recording: data.report.recording ?? null, report: data.report, stored: data };
  if (data?.v && 'recording' in data) return { recording: data.recording ?? null, report: data };
  throw new Error('Este arquivo não é um relato nem uma gravação da Mesa de Duelo.');
}

function describe(m: RecordedMessage, names: Map<number, string>) {
  const msg = m.msg as Record<string, any>, card = (id: unknown) => typeof id === 'number' ? `${names.get(id) ?? 'carta'} #${id}` : '?';
  switch (msg.type) {
    case 'card': return `Clicou em ${card(msg.id)}`;
    case 'player': return `Escolheu o jogador #${msg.id}`;
    case 'stack': return `Escolheu na pilha #${msg.id}`;
    case 'attack': return `Atacar com ${card(msg.attacker)} → #${msg.defender}`;
    case 'attack-all': return `Atacar com todas → #${msg.defender}`;
    case 'attack-group': return `Grupo de ataque (${(msg.attackers ?? []).length}) → ${msg.defender ?? 'sem defensor'}`;
    case 'block': return `Bloquear ${card(msg.attacker)} com ${card(msg.blocker)}`;
    case 'answer': return `Respondeu à pergunta #${msg.id}${msg.indices ? ` (opções ${msg.indices.join(', ')})` : msg.value !== undefined ? ` (${msg.value ? 'sim' : 'não'})` : msg.amounts ? ` (${msg.amounts.join(', ')})` : ''}`;
    case 'ok': return 'OK';
    case 'cancel': return 'Cancelar';
    case 'pass-turn': return 'Passar o turno';
    case 'resolve-all': return 'Resolver tudo';
    case 'mana': return `Gastar mana ${msg.color}`;
    default: return msg.type;
  }
}

function panel() {
  document.title = 'Repetição de partida';
  document.body.innerHTML = '';
  const css = document.createElement('style');
  css.textContent = `
    body { margin: 0; background: #070b14; color: #e9eef7; font: 500 13px/1.4 system-ui, sans-serif; display: flex; height: 100dvh; overflow: hidden; }
    #side { width: 360px; flex: none; display: flex; flex-direction: column; box-sizing: border-box; background: #0c1222; border-right: 1px solid #f2b54c44; }
    #top { flex: none; padding: 12px 14px 8px; border-bottom: 1px solid #ffffff18; } #info { flex: none; overflow: auto; max-height: 34%; padding: 0 14px 8px; border-bottom: 1px solid #ffffff18; } #info:empty { display: none; }
    #side h1 { font-size: 15px; color: #f2b54c; margin: 0 0 6px; } #side h2 { font-size: 11px; color: #9aa5bb; text-transform: uppercase; letter-spacing: .06em; margin: 12px 0 5px; }
    #side p { margin: 0 0 5px; color: #c7cfdd; } #side dl { display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; margin: 0; } #side dt { color: #9aa5bb; } #side dd { margin: 0; overflow-wrap: anywhere; }
    #side select, #side input[type=range] { width: 100%; box-sizing: border-box; margin: 2px 0 6px; }
    #side select { padding: 5px 6px; border-radius: 6px; border: 1px solid #ffffff30; background: #131d30; color: inherit; font: inherit; }
    #side button { white-space: nowrap; margin: 2px 2px 2px 0; padding: 5px 9px; border-radius: 7px; border: 1px solid #ffffff30; background: #ffffff10; color: inherit; font: 600 12px system-ui; cursor: pointer; }
    #side button:hover { background: #ffffff22; } #side button.on { border-color: #f2b54c; color: #ffe2a0; } #side button:disabled { opacity: .4; cursor: default; }
    #drop { display: block; padding: 10px; border: 1px dashed #ffffff40; border-radius: 8px; text-align: center; color: #9aa5bb; cursor: pointer; } #drop.over { border-color: #f2b54c; color: #ffe2a0; }
    #drop input { display: none; } #msg { color: #ffe2a0; min-height: 18px; } .quote { white-space: pre-wrap; padding: 6px 8px; border-left: 2px solid #f2b54c; background: #ffffff08; }
    #pos { font-variant-numeric: tabular-nums; color: #ffe2a0; } .ctl { display: flex; gap: 6px; align-items: center; } .ctl > select { flex: 1; }
    #list { flex: 1; min-height: 120px; overflow: auto; margin: 0; padding: 4px 0; list-style: none; }
    #list li { display: grid; grid-template-columns: 44px 1fr; gap: 6px; padding: 4px 14px; cursor: pointer; border-left: 3px solid transparent; }
    #list li:hover { background: #ffffff0c; } #list li.past { opacity: .55; } #list li.here { border-left-color: #f2b54c; background: #f2b54c14; opacity: 1; }
    #list li.nota { color: #c7cfdd; } #list li.serious { color: #ff9f86; } #list time { color: #9aa5bb; font-variant-numeric: tabular-nums; } #list small { display: block; color: #9aa5bb; white-space: pre-wrap; }
    #stage { flex: 1; position: relative; display: grid; place-items: center; overflow: hidden; background: repeating-linear-gradient(45deg, #0a0f1b 0 12px, #0c1220 12px 24px); }
    #frame { position: absolute; left: 50%; top: 50%; border: 0; background: #000; box-shadow: 0 0 0 1px #ffffff22, 0 20px 50px #000a; transform-origin: 50% 50%; }
    #size { position: absolute; top: 8px; right: 10px; font-size: 11px; color: #9aa5bb; }
    pre.snapshot { max-height: 160px; overflow: auto; font-size: 11px; background: #ffffff08; padding: 6px; }`;
  document.head.append(css);
  const side = document.createElement('aside'); side.id = 'side';
  const stage = document.createElement('div'); stage.id = 'stage';
  const frame = document.createElement('iframe'); frame.id = 'frame'; frame.title = 'Mesa'; frame.src = `${location.pathname}?mesa`;
  const sizeTag = document.createElement('span'); sizeTag.id = 'size';
  stage.append(frame, sizeTag); document.body.append(side, stage);
  const opt = (value: string, text: string) => `<option value="${value}">${text}</option>`;
  side.innerHTML = `<div id="top">
    <h1>Repetição de partida</h1>
    <label id="drop">Abrir relato ou gravação (.json.gz)<input type="file" accept=".gz,.json,application/gzip,application/json"></label>
    <p id="msg"></p>
    <div class="ctl"><button data-c="start" title="Início">⏮</button><button data-c="prev" title="Quadro anterior (←)">◀</button><button data-c="play" title="Tocar ou pausar (espaço)">▶ Tocar</button><button data-c="next" title="Próximo quadro (→)">▶|</button><button data-c="report" title="Ir ao momento do relato">⏭ Relato</button><button data-c="error" title="Próximo erro">Erro ›</button></div>
    <input type="range" id="seek" min="0" max="0" value="0" aria-label="Quadro">
    <p id="pos">Nenhuma partida aberta.</p>
    <div class="ctl"><select id="speed" aria-label="Velocidade">${opt('0.5', '0,5×')}${opt('1', '1×')}${opt('2', '2×')}${opt('4', '4×')}${opt('10', '10×')}</select>
      <select id="style" aria-label="Aparência das cartas">${opt('full', 'Imagem completa')}${opt('art', 'Arte e texto')}${opt('arena', 'Arena')}</select></div>
    <label><input type="checkbox" id="reduce"> Reduzir movimento</label>
    <div id="sizes"></div>
  </div><div id="info"></div><ol id="list" aria-label="Ações e erros"></ol>`;
  const $ = <T extends HTMLElement>(sel: string) => side.querySelector<T>(sel)!;
  ($('#speed') as HTMLSelectElement).value = '1';

  let data: Loaded | null = null, recording: Recording | null = null;
  let items: Item[] = [];
  let cursor = -1, cursorState: FState | null = null, playing = false, timer = 0;
  const send = (msg: unknown) => frame.contentWindow?.postMessage(msg, '*');
  const clock = (at: number) => { const s = Math.max(0, Math.round((at - (recording?.startedAt ?? at)) / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

  function frameForVersion(v: number | null, at: number) {
    const frames = recording!.frames;
    let best = 0;
    for (let i = 0; i < frames.length; i++) {
      if (v !== null && frames[i].v !== null ? frames[i].v! <= v : frames[i].at <= at) best = i; else if (frames[i].at > at) break;
    }
    return best;
  }

  function goTo(index: number, sequential = false) {
    if (!recording?.frames.length) return;
    index = Math.max(0, Math.min(recording.frames.length - 1, index));
    const f = recording.frames[index];
    // Avançando um quadro, aplica só a diferença; pulando, remonta do quadro inteiro mais próximo e zera as animações.
    cursorState = sequential && index === cursor + 1 && cursorState && f.d ? applyPatch(cursorState, JSON.parse(f.d) as Patch) as FState : frameAt(recording, index);
    const reset = !(sequential && index === cursor + 1);
    cursor = index;
    send({ cmd: 'state', state: structuredClone(cursorState), reset });
    ($('#seek') as HTMLInputElement).value = String(index);
    const s = cursorState;
    $('#pos').textContent = `Quadro ${index + 1} de ${recording.frames.length} · ${clock(f.at)} · turno ${s.turn} · ${s.phase ?? '—'}${s.question ? ' · pergunta aberta' : ''}`;
    side.querySelectorAll<HTMLElement>('#list li').forEach(li => {
      const at = Number(li.dataset.at);
      li.classList.toggle('past', at < f.at);
      li.classList.toggle('here', at >= f.at && at < (recording!.frames[index + 1]?.at ?? Infinity));
    });
    side.querySelector('#list li.here')?.scrollIntoView({ block: 'nearest' });
  }

  function stop() { playing = false; clearTimeout(timer); $('[data-c="play"]').textContent = '▶ Tocar'; }
  function play() {
    if (!recording || cursor >= recording.frames.length - 1) { stop(); return; }
    playing = true; $('[data-c="play"]').textContent = '⏸ Pausar';
    const speed = Number(($('#speed') as HTMLSelectElement).value);
    const gap = Math.min(3000, recording.frames[cursor + 1].at - recording.frames[cursor].at) / speed;
    timer = window.setTimeout(() => { goTo(cursor + 1, true); if (playing) play(); }, Math.max(16, gap));
  }

  function reportMoment() {
    const created = Date.parse(data?.report?.createdAt ?? '');
    return Number.isFinite(created) ? frameForVersion(null, created) : recording!.frames.length - 1;
  }

  function show(loaded: Loaded, name: string) {
    stop();
    data = loaded; recording = loaded.recording; cursor = -1; cursorState = null;
    const report = loaded.report, meta = recording?.meta, bridge = loaded.stored?.bridge;
    const rows = (pairs: [string, unknown][]) => `<dl>${pairs.filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
    const device = report?.device ?? meta?.device;
    const prefs = { ...report?.preferences, ...meta?.preferences };
    $('#info').innerHTML = `${report ? `<h2>Relato ${esc(loaded.stored?.code ?? '')}</h2>${rows([['tipo', report.kind === 'erro' ? 'Algo deu errado' : 'Sugestão'], ['quando', new Date(report.createdAt).toLocaleString('pt-BR')], ['de onde', report.from]])}<p class="quote">${esc(report.description)}</p>` : ''}
      ${meta ? `<h2>Partida</h2>${rows([['mesa', meta.app], ['regras', meta.rulesVersion], ['motor', meta.engineVersion], ['formato', meta.format], ['em rede', meta.net ? 'sim' : 'não'], ['jogadores', meta.players?.map(p => `${p.name}${p.ai ? ' (IA)' : ''}`).join(', ')],
        ['quadros', `${recording!.frames.length}${recording!.droppedFrames ? ` (${recording!.droppedFrames} cortados)` : ''}`], ['duração', clock(recording!.endedAt)]])}` : '<p>Sem partida anexada.</p>'}
      ${device ? `<h2>Aparelho</h2>${rows([['tela', `${device.viewport} (tela ${device.screen}, ${device.pixelRatio}×)`], ['toque', device.touch ? 'sim' : 'não'], ['instalado', device.installed ? 'sim' : 'não'], ['navegador', device.userAgent]])}` : ''}
      ${Object.keys(prefs).length ? `<h2>Preferências</h2>${rows(Object.entries(prefs))}` : ''}
      ${report?.diagnostics ? `<details><summary>Relatório do painel de erros</summary><pre class="snapshot">${esc(report.diagnostics)}</pre></details>` : ''}
      ${bridge ? `<h2>Diário da ponte</h2>${rows([['assento do relato', bridge.reporterSeat], ['ações', `${bridge.actions?.length ?? 0}${bridge.droppedActions ? ` (+${bridge.droppedActions} antigas)` : ''}`]])}
        ${(bridge.snapshots ?? []).map((s: any, i: number) => `<details><summary>Retrato ${i}: jogo ${s.gameNumber}, turno ${s.turn}, ${esc(s.phase)} (${s.reason === 'relato' ? 'no relato' : 'começo do turno'})</summary><pre class="snapshot">${esc(s.state)}</pre></details>`).join('')}` : ''}`;
    if (!recording?.frames.length) { $('#msg').textContent = `${name}: sem gravação para repetir.`; $('#list').innerHTML = ''; return; }
    // Nomes das cartas por id, de todos os quadros, para a lista de ações dizer em que carta o jogador clicou.
    const names = new Map<number, string>();
    let state: any = null;
    for (const f of recording.frames) {
      state = f.k !== undefined ? JSON.parse(f.k) : applyPatch(state, JSON.parse(f.d!));
      for (const p of state.players ?? []) for (const zone of ['hand', 'battlefield', 'graveyard', 'exile', 'commandZone'])
        for (const c of p[zone] ?? []) if (c?.name && !names.has(c.id)) names.set(c.id, c.name);
    }
    items = [
      ...recording.sent.map((m): Item => ({ at: m.at, v: m.v, kind: 'ação', label: describe(m, names), detail: m.gen !== undefined ? `pedido ${m.gen}, quadro ${m.v ?? '—'}` : undefined })),
      ...recording.notes.map((n: RecordedNote): Item => ({ at: n.at, v: n.v, kind: 'nota', label: `${n.kind}: ${n.text}`, detail: n.detail, serious: n.kind !== 'aviso' })),
    ].sort((a, b) => a.at - b.at);
    $('#list').innerHTML = items.map((item, i) => `<li class="${item.kind === 'nota' ? 'nota' : ''}${item.serious ? ' serious' : ''}" data-i="${i}" data-at="${item.at}"><time>${clock(item.at)}</time><span>${esc(item.label)}${item.detail ? `<small>${esc(item.detail)}</small>` : ''}</span></li>`).join('');
    ($('#seek') as HTMLInputElement).max = String(recording.frames.length - 1);
    const sizes: [string, string][] = [['desktop', 'Computador'], ['tablet', 'Tablet'], ['phone', 'Celular deitado']];
    if (device?.viewport) sizes.unshift(['player', `Tela do jogador (${device.viewport})`]);
    $('#sizes').innerHTML = sizes.map(([k, t]) => `<button data-s="${k}">${t}</button>`).join('');
    playerSize = device?.viewport?.split('×').map(Number) as [number, number] | undefined;
    // A mesa na aparência que o jogador usava.
    const style = prefs.cards === 'arte e texto' ? 'art' : prefs.cards === 'arena' ? 'arena' : null;
    if (style) { ($('#style') as HTMLSelectElement).value = style; send({ cmd: 'style', value: style }); }
    resize(device?.viewport ? 'player' : size);
    $('#msg').textContent = `${name} aberto.`;
    goTo(0);
  }

  async function open(bytes: Uint8Array, name: string) {
    try { show(normalize(await readJson(bytes)), name); }
    catch (e) { $('#msg').textContent = `Não consegui abrir ${name}: ${(e as Error).message}`; }
  }

  const input = $<HTMLInputElement>('#drop input');
  input.addEventListener('change', async () => { const file = input.files?.[0]; if (file) await open(new Uint8Array(await file.arrayBuffer()), file.name); });
  const drop = $('#drop');
  for (const type of ['dragenter', 'dragover']) document.addEventListener(type, e => { e.preventDefault(); drop.classList.add('over'); });
  document.addEventListener('dragleave', () => drop.classList.remove('over'));
  document.addEventListener('drop', async e => {
    e.preventDefault(); drop.classList.remove('over');
    const file = e.dataTransfer?.files[0];
    if (file) await open(new Uint8Array(await file.arrayBuffer()), file.name);
  });

  side.addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
    const li = (e.target as HTMLElement).closest<HTMLElement>('#list li');
    if (li && recording) { stop(); const item = items[Number(li.dataset.i)]; goTo(frameForVersion(item.v, item.at)); return; }
    if (!b) return;
    if (b.dataset.s) { resize(b.dataset.s); return; }
    if (!recording) return;
    switch (b.dataset.c) {
      case 'start': stop(); goTo(0); break;
      case 'prev': stop(); goTo(cursor - 1); break;
      case 'next': stop(); goTo(cursor + 1, true); break;
      case 'play': if (playing) stop(); else play(); break;
      case 'report': stop(); goTo(reportMoment()); break;
      case 'error': {
        stop();
        const at = recording.frames[cursor]?.at ?? 0;
        const next = items.find(item => item.serious && item.at > at);
        if (next) goTo(frameForVersion(next.v, next.at)); else $('#msg').textContent = 'Nenhum erro depois deste quadro.';
        break;
      }
    }
  });
  $('#seek').addEventListener('input', e => { stop(); goTo(Number((e.target as HTMLInputElement).value)); });
  side.addEventListener('change', e => {
    const t = e.target as HTMLInputElement;
    if (t.id === 'style') send({ cmd: 'style', value: t.value });
    if (t.id === 'reduce') send({ cmd: 'reduce', value: t.checked });
  });
  document.addEventListener('keydown', e => {
    if (!recording || (e.target as HTMLElement).closest('input, select, textarea')) return;
    if (e.key === ' ') { e.preventDefault(); if (playing) stop(); else play(); }
    if (e.key === 'ArrowRight') { stop(); goTo(cursor + 1, true); }
    if (e.key === 'ArrowLeft') { stop(); goTo(cursor - 1); }
  });
  window.addEventListener('message', ({ data: msg }) => {
    // A mesa recarregou (ou acabou de abrir): devolve o quadro atual e as opções.
    if (msg?.replay === 'ready') {
      send({ cmd: 'style', value: ($('#style') as HTMLSelectElement).value });
      send({ cmd: 'reduce', value: ($('#reduce') as HTMLInputElement).checked });
      if (cursorState) send({ cmd: 'state', state: structuredClone(cursorState), reset: true });
    }
    // A mesa manda as próprias preferências ao abrir; só os cliques interessam aqui.
    if (msg?.replay === 'sent' && msg.msg?.type !== 'preferences') $('#msg').textContent = `A mesa tentou enviar ${JSON.stringify(msg.msg)} (ignorado na repetição).`;
  });

  const SIZES: Record<string, [number, number] | null> = { desktop: null, tablet: [1024, 768], phone: [844, 390] };
  let size = 'desktop';
  let playerSize: [number, number] | undefined;
  function resize(next = size) {
    size = next;
    const box = stage.getBoundingClientRect();
    const fixed = size === 'player' ? playerSize ?? null : SIZES[size] ?? null;
    const [w, h] = fixed ?? [box.width, box.height];
    frame.style.width = `${w}px`; frame.style.height = `${h}px`;
    const scale = Math.min(1, (box.width - 24) / w, (box.height - 24) / h);
    frame.style.transform = `translate(-50%, -50%)${fixed ? ` scale(${scale})` : ''}`;
    sizeTag.textContent = `${Math.round(w)}×${Math.round(h)}${fixed && scale < 1 ? ` (mostrado a ${Math.round(scale * 100)}%)` : ''}`;
    side.querySelectorAll<HTMLButtonElement>('[data-s]').forEach(b => b.classList.toggle('on', b.dataset.s === size));
  }
  $('#sizes').innerHTML = [['desktop', 'Computador'], ['tablet', 'Tablet'], ['phone', 'Celular deitado']].map(([k, t]) => `<button data-s="${k}">${t}</button>`).join('');
  new ResizeObserver(() => resize()).observe(stage);
  resize();

  const code = new URLSearchParams(location.search).get('relato');
  if (code) {
    if (!adminSession()) $('#msg').textContent = 'Entre na área de admin (/admin.html) para abrir relatos pelo código.';
    else void adminFetch(`relatos/${encodeURIComponent(code)}`).then(async r => r.ok ? open(new Uint8Array(await r.arrayBuffer()), code) : void ($('#msg').textContent = await adminError(r)),
      () => { $('#msg').textContent = 'Não consegui falar com a ponte.'; });
  }
  const url = new URLSearchParams(location.search).get('arquivo');
  if (url) void fetch(url).then(r => r.arrayBuffer()).then(b => open(new Uint8Array(b), url.split('/').pop() ?? url), () => { $('#msg').textContent = `Não consegui baixar ${url}.`; });
}
