// Página Rever partida (S21): repete na mesa uma partida guardada neste aparelho, com tocar, avançar, voltar e pular para um turno.
import './style.css';
import './rever.css';
import type { FState } from './forge/client';
import { decodeFrames, frameAt, type Recording } from './forge/recording';
import { loadReplay } from './replays';
import { replayMarks, turnLabel, frameDelay, type ReplayMark } from './rever/marks';
import { esc } from './ui/cardtext';
import { iniciarTema } from './ui/temas';

iniciarTema();

/*
 * A mesa fica num quadro (rever.html?mesa), como na repetição dos relatos: ela recebe os estados por mensagem e não
 * fala com o servidor. Cliques na mesa não vão a lugar nenhum. Só aparece o que o jogador viu na hora: a gravação
 * guarda o estado que chegou a ele, com a mão dos outros virada para baixo.
 */
const params = new URLSearchParams(location.search);
if (params.has('mesa')) void table(); else void panel(params.get('id') ?? '');

async function table() {
  const { createForgeTableView } = await import('./ui/forgeTable');
  document.body.classList.add('rv-table');
  const root = document.createElement('main'); root.id = 'table'; document.body.append(root);
  const view = createForgeTableView(root, { onExit() { parent.postMessage({ rever: 'exit' }, location.origin); }, onRematch() {} });
  const client: any = { state: null, connected: true, send() { /* repetição: nada vai ao servidor */ } };
  let attached = false;
  window.addEventListener('message', ({ data, origin }) => {
    if (origin !== location.origin || data?.cmd !== 'state') return;
    client.state = data.state;
    if (data.reset || !attached) { view.attach(client, []); attached = true; }
    view.render();
  });
  parent.postMessage({ rever: 'ready' }, location.origin);
}

async function panel(id: string) {
  const app = document.querySelector<HTMLDivElement>('#app')!;
  app.innerHTML = `<div class="rv">
    <header class="rv-bar">
      <a class="rv-back" href="/partidas.html#gravadas">← Minhas partidas</a>
      <p class="rv-title" id="rvTitle">Rever partida</p>
    </header>
    <div class="rv-stage"><iframe class="rv-frame" title="Mesa da partida" src="${location.pathname}?mesa" hidden></iframe><p class="rv-msg" id="rvMsg" role="status">Carregando a partida…</p></div>
    <footer class="rv-controls" aria-label="Controles da repetição" hidden>
      <button type="button" data-rv="start" aria-label="Voltar ao começo" title="Começo">⏮</button>
      <button type="button" data-rv="prev" aria-label="Lance anterior" title="Anterior (←)">◀</button>
      <button type="button" class="rv-play" data-rv="play" aria-label="Tocar" title="Tocar ou pausar (espaço)">▶</button>
      <button type="button" data-rv="next" aria-label="Próximo lance" title="Próximo (→)">▶|</button>
      <input type="range" class="rv-seek" id="rvSeek" min="0" max="0" value="0" aria-label="Momento da partida">
      <span class="rv-pos" id="rvPos" aria-live="off"></span>
      <label class="rv-select"><span class="sr-only">Pular para o turno</span><select id="rvTurn"></select></label>
      <label class="rv-select"><span class="sr-only">Velocidade</span><select id="rvSpeed"><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option><option value="8">8×</option></select></label>
    </footer>
  </div>`;
  const $ = <T extends HTMLElement>(sel: string) => app.querySelector<T>(sel)!;
  const frame = $<HTMLIFrameElement>('.rv-frame'), msg = $('#rvMsg'), seek = $<HTMLInputElement>('#rvSeek'), turnSel = $<HTMLSelectElement>('#rvTurn');
  const recording = id ? await loadReplay(id) : null;
  if (!recording || !recording.frames.length) {
    msg.innerHTML = 'Esta partida não está guardada neste aparelho. <a href="/partidas.html#gravadas">Ver as partidas guardadas</a>';
    return;
  }
  const rec: Recording = recording;
  const marks: ReplayMark[] = replayMarks(decodeFrames(rec));
  const you = rec.meta.you, players = rec.meta.players ?? [];
  const names = players.map(p => p.id === you ? 'Você' : p.ai ? p.name || 'Computador' : p.name).join(' × ');
  const day = new Date(rec.startedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  $('#rvTitle').textContent = `${names} · ${day}`;
  document.title = `Rever: ${names} · Mesa de Duelo`;
  seek.max = String(rec.frames.length - 1);
  const turns = marks.filter((m, i) => i === 0 || m.turn !== marks[i - 1]!.turn || m.game !== marks[i - 1]!.game);
  const games = new Set(marks.map(m => m.game)).size;
  turnSel.innerHTML = turns.map(m => `<option value="${m.index}">${esc(turnLabel(m, games > 1))}</option>`).join('');

  let cursor = -1, playing = false, timer = 0, speed = 1, ready = false;
  const post = (state: FState, reset: boolean) => frame.contentWindow?.postMessage({ cmd: 'state', state, reset }, location.origin);
  function show(index: number) {
    index = Math.max(0, Math.min(rec.frames.length - 1, index));
    if (index === cursor) return;
    // Um lance à frente anima como na partida; um salto monta a mesa de novo, sem animar o caminho.
    const step = index === cursor + 1;
    cursor = index;
    post(frameAt(rec, index), !step);
    seek.value = String(index);
    $('#rvPos').textContent = `Lance ${index + 1} de ${rec.frames.length}`;
    let current = turns[0]!;
    for (const t of turns) if (t.index <= index) current = t;
    turnSel.value = String(current.index);
  }
  function stop() { playing = false; clearTimeout(timer); $('.rv-play').textContent = '▶'; $('.rv-play').setAttribute('aria-label', 'Tocar'); }
  function tick() {
    if (!playing) return;
    if (cursor >= rec.frames.length - 1) { stop(); return; }
    show(cursor + 1);
    timer = window.setTimeout(tick, frameDelay(rec.frames[cursor]!.at, rec.frames[cursor + 1]?.at, speed));
  }
  function play() {
    if (cursor >= rec.frames.length - 1) show(0);
    playing = true; $('.rv-play').textContent = '❚❚'; $('.rv-play').setAttribute('aria-label', 'Pausar');
    timer = window.setTimeout(tick, 300);
  }

  window.addEventListener('message', ({ data, origin }) => {
    if (origin !== location.origin) return;
    if (data?.rever === 'exit') location.href = '/partidas.html#gravadas';
    if (data?.rever !== 'ready' || ready) return;
    ready = true;
    msg.hidden = true; frame.hidden = false; $('.rv-controls').hidden = false;
    show(0);
  });
  app.addEventListener('click', e => {
    const act = (e.target as HTMLElement).closest<HTMLElement>('[data-rv]')?.dataset.rv;
    if (!act || !ready) return;
    if (act === 'play') { if (playing) stop(); else play(); return; }
    stop();
    show(act === 'start' ? 0 : act === 'prev' ? cursor - 1 : cursor + 1);
  });
  seek.addEventListener('input', () => { stop(); show(Number(seek.value)); });
  turnSel.addEventListener('change', () => { stop(); show(Number(turnSel.value)); });
  $<HTMLSelectElement>('#rvSpeed').addEventListener('change', e => { speed = Number((e.target as HTMLSelectElement).value) || 1; });
  document.addEventListener('keydown', e => {
    if (!ready || (e.target as HTMLElement).closest('select, input')) return;
    if (e.key === 'ArrowRight') { stop(); show(cursor + 1); }
    else if (e.key === 'ArrowLeft') { stop(); show(cursor - 1); }
    else if (e.key === ' ') { e.preventDefault(); if (playing) stop(); else play(); }
    else return;
  });
}
