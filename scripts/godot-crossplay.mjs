#!/usr/bin/env node
// Teste de crossplay nos dois sentidos: a mesa no PC (Godot, tools/room_check.gd) cria uma sala e o cliente da mesa do
// navegador (src/forge/client.ts, o mesmo código do site) entra com o código; depois o site cria e a mesa no PC entra.
// Nos dois, as duas mesas têm que ver a mesma partida, com os dois nomes.
//   npm run godot:crossplay      (servidor local ligado: npm run forge)
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const URL_WS = process.env.FORGE_URL ?? 'ws://127.0.0.1:7171/ws';
const { ForgeClient } = await import('../src/forge/client.ts');
const starter = (await import('../shared/starter-decks.json', { with: { type: 'json' } })).default;
const raw = starter.filter(d => d.format === 'standard')[1];
const deck = { name: raw.name, cards: raw.cards, sideboard: raw.sideboard ?? [], commanders: [] };
const NAMES = ['Mesa no PC', 'Mesa do navegador'];

/** Uma rodada: `godotHosts` diz quem cria a sala. Resolve com as duas visões da partida. */
function round(godotHosts) {
  return new Promise((resolve, reject) => {
    const seen = { godot: null, web: null };
    let web, godot;
    const timer = setTimeout(() => finish(new Error('tempo esgotado')), 90_000);
    function finish(error) {
      clearTimeout(timer);
      try { web?.send({ type: 'concede' }); } catch { /* já fechado */ }
      setTimeout(() => { web?.close(); godot?.kill(); }, 1000);
      error ? reject(error) : resolve(seen);
    }
    const check = () => { if (seen.godot && seen.web) finish(); };
    function startGodot(code) {
      godot = spawn(process.execPath, [join(ROOT, 'scripts', 'godot.mjs'), '--headless', '--script', 'res://tools/room_check.gd', ...(code ? ['--', code] : [])], { cwd: ROOT });
      godot.stderr.on('data', d => { const t = String(d); if (/ERRO|SCRIPT ERROR/.test(t)) console.error(t.trim()); });
      godot.stdout.on('data', data => {
        for (const line of String(data).split('\n').map(l => l.trim()).filter(Boolean)) {
          const room = line.match(/^SALA (\w+)/);
          if (room) joinWeb(room[1]);
          const match = line.match(/^PARTIDA (\S*) JOGADORES (.*)$/);
          if (match) { seen.godot = { match: match[1], players: match[2].split(', ') }; check(); }
        }
      });
      godot.on('exit', code => { if (code !== 0 && !(seen.godot && seen.web)) finish(new Error(`a mesa no PC saiu com ${code}`)); });
    }
    async function webClient() {
      web = new ForgeClient();
      await web.connect(URL_WS);
      let readied = false, states = 0;
      web.onRoom = room => {
        if (!godotHosts && !seen.code) { seen.code = room.code; console.log(`A mesa do navegador criou a sala ${room.code}; a mesa no PC vai entrar.`); startGodot(room.code); }
        if (!readied && room.players.length >= 2) { readied = true; web.send({ type: 'room-ready', on: true }); }
      };
      web.onState = s => { if (++states === 1) { seen.web = { match: s.matchId, players: s.players.map(p => p.name) }; check(); } };
      web.onNotice = (text, error) => { if (error) console.error(`servidor: ${text}`); };
    }
    async function joinWeb(code) {
      console.log(`A mesa no PC criou a sala ${code}; a mesa do navegador vai entrar.`);
      await webClient();
      web.send({ type: 'join', code, name: NAMES[1], deck });
    }
    if (godotHosts) startGodot(null);
    else webClient().then(() => web.send({ type: 'host', name: NAMES[1], deck, config: { format: 'standard', matchLength: 'bo1', playerCount: 2 }, visibility: 'private' }));
  });
}

let failed = false;
for (const godotHosts of [true, false]) {
  try {
    const seen = await round(godotHosts);
    const same = seen.godot.match === seen.web.match;
    const both = NAMES.every(n => seen.godot.players.includes(n) && seen.web.players.includes(n));
    console.log(`  mesa no PC: partida ${seen.godot.match} com ${seen.godot.players.join(' e ')}`);
    console.log(`  navegador:  partida ${seen.web.match} com ${seen.web.players.join(' e ')}`);
    if (!same || !both) { failed = true; console.error('FALHOU: as duas mesas não estão na mesma partida'); }
  } catch (error) { failed = true; console.error(`FALHOU: ${error.message}`); }
  await new Promise(r => setTimeout(r, 1500));
}
console.log(failed ? 'Crossplay com falha.' : 'OK: crossplay nos dois sentidos entre a mesa no PC e a mesa do navegador.');
process.exit(failed ? 1 : 0);
