#!/usr/bin/env node
// Medição (ROADMAP 124): simula a fila de animações da mesa (tablePresentation.ts) sobre os eventos que a
// AiSpeedProbe grava em forge-bridge/target/ai-speed-events*.jsonl, e diz quanto a mesa termina de mostrar cada turno
// depois do servidor e quantas vezes a fila passa de 12 e pula para o fim. Modos normal e "Rápido sem resposta".
//   node --import ./tests/register.mjs scripts/medir-apresentacao.mjs forge-bridge/target/ai-speed-events.jsonl
import { readFileSync } from 'node:fs';
const { PresentationTimeline, presentationDuration } = await import(process.cwd() + '/src/ui/presentationTimeline.ts');

const lines = readFileSync(process.argv[2], 'utf8').trim().split('\n').map(l => JSON.parse(l));
const tables = [...new Set(lines.map(l => l.table))];

for (const fast of [false, true]) for (const table of tables) {
  const tl = new PresentationTimeline();
  const rows = lines.filter(l => l.table === table);
  let now = 0, busyUntil = 0, presented = 0, dropped = 0, steps = 0;
  const turnOfSeq = new Map(); // seq -> turno
  const turnServerEnd = new Map(), turnServerStart = new Map(), turnTableEnd = new Map(), turnActive = new Map();
  let turn = 0;
  const first = rows[0].ms;
  function advance() {
    let e = tl.advance();
    while (e?.audioOnly) e = tl.advance();
    if (!e) { busyUntil = Infinity; return; }
    const ev = e.event; let d = presentationDuration(ev, fast);
    if (ev.type === 'damage' && ev.combat) tl.takeWhile(x => x.type === 'damage' && !!x.combat && (x.step ?? 'regular') === (ev.step ?? 'regular'));
    else if (ev.type === 'damage' && !ev.prevented && ev.sourceId !== undefined) tl.takeWhile(x => x.type === 'damage' && !x.combat && !x.prevented && x.sourceId === ev.sourceId);
    steps++;
    busyUntil = now + d;
    const t = turnOfSeq.get(ev.seq) ?? 0;
    turnTableEnd.set(t, Math.max(turnTableEnd.get(t) ?? 0, busyUntil));
  }
  function runUntil(t) {
    while (busyUntil !== Infinity && busyUntil <= t) { now = busyUntil; if (tl.current || tl.queued) { tl.current = null; advance(); } else busyUntil = Infinity; }
    now = t;
  }
  busyUntil = Infinity;
  let silent = true;
  for (const r of rows) {
    const t = r.ms - first;
    runUntil(t);
    for (const e of r.events) {
      if (e.type === 'turn' && e.turn) { turn = e.turn; turnServerStart.set(turn, t); }
      turnOfSeq.set(e.seq, turn);
      turnServerEnd.set(turn, t);
      turnActive.set(turn, r.activePlayer);
    }
    const before = tl.current, queuedBefore = tl.queued;
    tl.ingest('m', r.events, { silent });
    silent = false;
    if (before && !tl.current) { dropped++; busyUntil = Infinity; }
    if (!tl.current && tl.queued && busyUntil === Infinity) advance();
  }
  runUntil(1e12);
  console.log(`\n== mesa ${fast ? 'RÁPIDO SEM RESPOSTA' : 'NORMAL'}: ${table}`);
  console.log(`   passos mostrados=${steps}, vezes que a fila passou de 12 e pulou para o fim=${dropped}`);
  let lagSum = 0, n = 0;
  for (const [t, start] of [...turnServerStart].sort((a, b) => a[0] - b[0])) {
    const se = turnServerEnd.get(t), te = turnTableEnd.get(t) ?? se, ns = turnServerStart.get(t + 1);
    const server = ((ns ?? se) - start) / 1000, table = (te - start) / 1000;
    console.log(`   turno ${String(t).padStart(2)} (jogador ${turnActive.get(t)}): servidor ${server.toFixed(1).padStart(5)} s | mesa termina de mostrar ${table.toFixed(1).padStart(5)} s depois do início | atraso no fim do turno ${(Math.max(0, te - (ns ?? se)) / 1000).toFixed(1)} s`);
    lagSum += Math.max(0, te - (ns ?? se)); n++;
  }
  console.log(`   atraso médio da mesa no fim do turno: ${(lagSum / n / 1000).toFixed(1)} s`);
}
