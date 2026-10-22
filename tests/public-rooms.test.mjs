import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const uri = code => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText).toString('base64')}`;
const cardtext = uri(await readFile(new URL('../src/ui/cardtext.ts', import.meta.url), 'utf8'));
const { joinableRooms, publicRoomsHTML } = await import(uri((await readFile(new URL('../src/ui/publicRooms.ts', import.meta.url), 'utf8')).replace("'./cardtext'", JSON.stringify(cardtext))));

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
  const rooms = [room({ code: 'FULL', players: 2 }), room({ code: 'LIVE', started: true }), room({ code: 'OPEN' })];
  assert.deepEqual(joinableRooms(rooms).map(r => r.code), ['OPEN']);
  const html = publicRoomsHTML(rooms);
  assert.doesNotMatch(html, /FULL|LIVE/);
  assert.match(publicRoomsHTML([room({ players: 2 })]), /Nenhuma sala pública aberta/);
});

test('host names are escaped and buttons can be disabled while busy', () => {
  const html = publicRoomsHTML([room({ host: '<b>"Zé"</b>' })], true);
  assert.doesNotMatch(html, /<b>/);
  assert.match(html, /Sala de &lt;b&gt;/);
  assert.match(html, /data-join-room="WXYZ"[^>]* disabled>Entrar/);
});
