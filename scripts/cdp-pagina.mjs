// Conversa com o Chrome do agent-browser pelo protocolo dele (o agent-browser não tem os comandos): frear a CPU das páginas
// e gravar um rastro (trace) do navegador inteiro. Usado por scripts/medir-efeitos.mjs e scripts/medir-cada-efeito.mjs.

/** Abre a conexão com o Chrome em `url` (o `agent-browser get cdp-url`). */
export async function connectCdp(url) {
  const ws = new WebSocket(url);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', () => reject(new Error('sem conexão com o protocolo do Chrome')), { once: true });
  });
  let id = 0;
  const waiting = new Map(), listeners = new Map();
  ws.addEventListener('message', ({ data }) => {
    const m = JSON.parse(data);
    if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); return; }
    for (const fn of listeners.get(m.method) ?? []) fn(m.params);
  });
  const send = (method, params = {}, sessionId) => new Promise(resolve => {
    const n = ++id; waiting.set(n, resolve);
    ws.send(JSON.stringify({ id: n, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  const on = (method, fn) => { if (!listeners.has(method)) listeners.set(method, []); listeners.get(method).push(fn); };

  return {
    send, on,
    /** Freia a CPU de todas as páginas abertas (o freio vale enquanto a conexão estiver aberta). */
    async throttle(rate) {
      const { result } = await send('Target.getTargets');
      let pages = 0;
      for (const target of result.targetInfos.filter(t => t.type === 'page')) {
        const attached = await send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
        const set = await send('Emulation.setCPUThrottlingRate', { rate }, attached.result.sessionId);
        if (!set.error) pages++;
      }
      if (!pages) throw new Error('não consegui frear a CPU de nenhuma página');
    },
    /** Começa um rastro do navegador inteiro; `stop()` devolve os eventos. */
    async trace(categories = ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'toplevel', 'blink.console', 'gpu']) {
      const events = [];
      on('Tracing.dataCollected', p => events.push(...p.value));
      const done = new Promise(resolve => on('Tracing.tracingComplete', resolve));
      const started = await send('Tracing.start', { transferMode: 'ReportEvents', traceConfig: { includedCategories: categories } });
      if (started.error) throw new Error(`rastro recusado: ${started.error.message}`);
      return { async stop() { await send('Tracing.end'); await done; return events; } };
    },
    close: () => ws.close(),
  };
}

/** Nomes do trabalho de desenho da página (estilo, layout, pintura e o envio para o compositor). */
const RENDER = new Set(['UpdateLayoutTree', 'Layout', 'PrePaint', 'Paint', 'Layerize', 'Commit']);

/**
 * Soma o trabalho de um rastro entre duas marcas `console.timeStamp(inicio)` e `console.timeStamp(fim)` da página cujo
 * endereço contém `urlPart`: a linha principal da página (tudo, e só o desenho), o compositor dela, a pintura em blocos
 * (raster) e a linha principal do processo da placa de vídeo (que, com o WebGL emulado, faz o trabalho da placa). Em ms.
 */
export function traceWork(events, { urlPart, start = 'medir-inicio', end = 'medir-fim' }) {
  const threads = new Map(), processes = new Map();
  for (const e of events) {
    if (e.ph !== 'M') continue;
    if (e.name === 'thread_name') threads.set(`${e.pid}:${e.tid}`, e.args.name);
    if (e.name === 'process_name') processes.set(e.pid, e.args.name);
  }
  const frames = events.filter(e => e.name === 'TracingStartedInBrowser').flatMap(e => e.args?.data?.frames ?? []);
  const marks = events.filter(e => e.name === 'TimeStamp' && [start, end].includes(e.args?.data?.message));
  const startMark = marks.find(e => e.args.data.message === start), endMark = marks.findLast(e => e.args.data.message === end);
  const pagePid = startMark?.pid ?? frames.find(f => f.url?.includes(urlPart))?.processId;
  if (!startMark || !endMark) return null;
  const from = startMark.ts, until = endMark.ts;
  const thread = e => threads.get(`${e.pid}:${e.tid}`) ?? '';
  // Cada conta junta os intervalos (uma tarefa dentro de outra não conta duas vezes) e corta na janela.
  const buckets = { main: [], render: [], compositor: [], raster: [], gpu: [] };
  for (const e of events) {
    if (e.ph !== 'X' || !e.dur || e.ts + e.dur < from || e.ts > until) continue;
    const name = thread(e), span = [Math.max(e.ts, from), Math.min(e.ts + e.dur, until), `${e.pid}:${e.tid}`];
    const task = e.name === 'ThreadControllerImpl::RunTask' || e.name === 'RunTask';
    if (e.pid === pagePid && name === 'CrRendererMain') { if (task) buckets.main.push(span); else if (RENDER.has(e.name)) buckets.render.push(span); }
    else if (e.pid === pagePid && name === 'Compositor' && task) buckets.compositor.push(span);
    else if (e.name === 'RasterTask') buckets.raster.push(span);
    else if (name === 'CrGpuMain' && task && /gpu/i.test(processes.get(e.pid) ?? '')) buckets.gpu.push(span);
  }
  const union = spans => {
    let total = 0;
    const byThread = Map.groupBy(spans, s => s[2]);
    for (const list of byThread.values()) {
      list.sort((a, b) => a[0] - b[0]);
      let [lo, hi] = list[0];
      for (const [a, b] of list.slice(1)) { if (a > hi) { total += hi - lo; lo = a; hi = b; } else hi = Math.max(hi, b); }
      total += hi - lo;
    }
    return total / 1000;
  };
  const work = { seconds: (until - from) / 1e6 };
  for (const [key, spans] of Object.entries(buckets)) work[key] = spans.length ? union(spans) : 0;
  return work;
}
