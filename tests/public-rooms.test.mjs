import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const uri = code => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText).toString('base64')}`;
const cardtext = uri(await readFile(new URL('../src/ui/cardtext.ts', import.meta.url), 'utf8'));
const undo = uri((await readFile(new URL('../src/ui/undo.ts', import.meta.url), 'utf8')).replace("'./cardtext'", JSON.stringify(cardtext)));
const { joinableRooms, watchableRooms, publicRoomsHTML } = await import(uri((await readFile(new URL('../src/ui/publicRooms.ts', import.meta.url), 'utf8')).replace("'./cardtext'", JSON.stringify(cardtext)).replace("'./undo'", JSON.stringify(undo))));

const room = (over = {}) => ({ code: 'WXYZ', host: 'Ana', config: { format: 'pauper', matchLength: 'bo1' }, capacity: 2, players: 1, started: false, ...over });

test('empty, loading and failed lists say so instead of showing nothing', () => {
  assert.match(publicRoomsHTML([]), /Nenhuma sala pública aberta\./);
  assert.match(publicRoomsHTML(null), /Procurando salas/);
  assert.match(publicRoomsHTML('error'), /Não foi possível ver as salas agora/);
  assert.doesNotMatch(publicRoomsHTML([]), /data-join-room/);
});

test('each open room shows host, format and seats with a labelled join button', () => {
  const html = publicRoomsHTML([room(), room({ code: 'KLMN', host: 'Bia', config: { format: 'commander', matchLength: 'bo1', playerCount: 4 }, capacity: 4, players: 2 })]);
  assert.match(html, /<ul class="public-room-list">/);
  assert.match(html, /Sala de Ana<\/strong><small>Pauper · Partida única · 1\/2 jogadores<\/small>/);
  assert.match(html, /Sala de Bia<\/strong><small>Commander · 2\/4 jogadores<\/small>/, 'Commander has no match length to show');
  assert.match(html, /<button type="button" class="arena-btn secondary" data-join-room="WXYZ" aria-label="Entrar na sala de Ana: Pauper, 1 de 2 jogadores">Entrar<\/button>/);
  assert.match(html, /data-join-room="KLMN"/);
});

test('full or started rooms never get a join button, even if the bridge sends them', () => {
  const rooms = [room({ code: 'FULL', players: 2 }), room({ code: 'LIVE', started: true, players: 2 }), room({ code: 'OPEN' })];
  assert.deepEqual(joinableRooms(rooms).map(r => r.code), ['OPEN']);
  const html = publicRoomsHTML(rooms);
  assert.doesNotMatch(html, /FULL/);
  assert.doesNotMatch(html, /data-join-room="LIVE"/);
  assert.match(publicRoomsHTML([room({ players: 2 })]), /Nenhuma sala pública aberta/);
});

test('started rooms stay listed after the open ones, with a watch button and how many are watching', () => {
  const rooms = [room({ code: 'LIVE', host: 'Bia', started: true, players: 2, spectators: 3 }), room({ code: 'OPEN' })];
  assert.deepEqual(watchableRooms(rooms).map(r => r.code), ['LIVE']);
  const html = publicRoomsHTML(rooms);
  assert.ok(html.indexOf('data-join-room="OPEN"') < html.indexOf('data-watch-room="LIVE"'), 'open rooms come first');
  assert.match(html, /<li class="public-room live">/);
  assert.match(html, /Sala de Bia<\/strong><small><span class="public-room-live">Em andamento<\/span>Pauper · 2 jogadores · 3 assistindo<\/small>/);
  assert.match(html, /data-watch-room="LIVE" aria-label="Assistir à partida da sala de Bia: Pauper, em andamento">Assistir<\/button>/);
  assert.match(publicRoomsHTML([room({ started: true, players: 2 })]), /Pauper · 2 jogadores<\/small>/, 'no watcher count when nobody watches');
  assert.match(publicRoomsHTML([room({ started: true, players: 2 })], true), /data-watch-room="WXYZ"[^>]* disabled>Assistir/);
});

test('host names are escaped and buttons can be disabled while busy', () => {
  const html = publicRoomsHTML([room({ host: '<b>"Zé"</b>' })], true);
  assert.doesNotMatch(html, /<b>/);
  assert.match(html, /Sala de &lt;b&gt;/);
  assert.match(html, /data-join-room="WXYZ"[^>]* disabled>Entrar/);
});

test('a room created with Desfazer says so in the list, also for screen readers', () => {
  const html = publicRoomsHTML([room({ config: { format: 'pauper', matchLength: 'bo1', undo: true } }), room({ code: 'KLMN', started: true, players: 2, config: { format: 'pauper', matchLength: 'bo1', undo: true } })]);
  assert.equal(html.match(/class="undo-badge"/g)?.length, 2);
  assert.match(html, /aria-label="Entrar na sala de Ana: Pauper, 1 de 2 jogadores, com Desfazer ligado"/);
  assert.match(html, /em andamento, com Desfazer ligado"/);
  assert.doesNotMatch(publicRoomsHTML([room()]), /Desfazer/);
});

test('Commander rooms show the brackets of the seated players', () => {
  const commander = { format: 'commander', matchLength: 'bo1', playerCount: 4 };
  assert.match(publicRoomsHTML([room({ config: commander, capacity: 4, brackets: [3] })]), /<small>Commander · Bracket 3 · 1\/4 jogadores<\/small>/);
  const mixed = publicRoomsHTML([room({ config: commander, capacity: 4, players: 2, brackets: [4, 2] })]);
  assert.match(mixed, /Commander · Brackets 2 a 4 · 2\/4 jogadores/);
  assert.match(mixed, /aria-label="Entrar na sala de Ana: Commander, Brackets 2 a 4, 2 de 4 jogadores"/);
  assert.match(publicRoomsHTML([room({ config: commander, started: true, players: 4, brackets: [3, 3] })]), /Commander · Bracket 3 · 4 jogadores/);
  assert.doesNotMatch(publicRoomsHTML([room()]), /Bracket/);
});
