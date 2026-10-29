import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const uri = code => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText).toString('base64')}`;
const cardtext = uri(await readFile(new URL('../src/ui/cardtext.ts', import.meta.url), 'utf8'));
const source = (await readFile(new URL('../src/ui/dungeon.ts', import.meta.url), 'utf8')).replace("import './dungeon.css';", '').replace("'./cardtext'", JSON.stringify(cardtext));
const { roomDepths, dungeonProgress, nextRooms, dungeonBadgesHTML, dungeonMapHTML, dungeonRoomHTML, dungeonText, withDungeonBadges } = await import(uri(source));

const room = (name, ...next) => ({ name, text: `${name} effect.`, next });
const undercity = {
  id: 9, name: 'Undercity',
  rooms: [room('Secret Entrance', 'Forge', 'Lost Well'), room('Forge', 'Trap!', 'Arena'), room('Lost Well', 'Arena', 'Stash'), room('Trap!', 'Archives'),
    room('Arena', 'Archives', 'Catacombs'), room('Stash', 'Catacombs'), room('Archives', 'Throne of the Dead Three'), room('Catacombs', 'Throne of the Dead Three'), room('Throne of the Dead Three')],
};

test('rooms are laid out by distance from the entrance', () => {
  const depth = roomDepths(undercity);
  assert.deepEqual(['Secret Entrance', 'Lost Well', 'Stash', 'Catacombs', 'Throne of the Dead Three'].map(n => depth.get(n)), [0, 1, 2, 3, 4]);
  assert.deepEqual(dungeonProgress({ ...undercity, room: 'Arena' }), { step: 3, total: 5 });
  assert.deepEqual(dungeonProgress(undercity), { step: 0, total: 5 });
});

test('the next venture goes to the entrance, then to the exits of the current room', () => {
  assert.deepEqual(nextRooms(undercity), ['Secret Entrance']);
  assert.deepEqual(nextRooms({ ...undercity, room: 'Forge' }), ['Trap!', 'Arena']);
  assert.deepEqual(nextRooms({ ...undercity, room: 'Throne of the Dead Three' }), []);
});

test('badges show initiative and the dungeon step, and the map button opens the dungeon view', () => {
  const p = { id: 3, name: 'Ana', initiative: true, dungeon: { ...undercity, room: 'Lost Well' }, completedDungeons: ['Lost Mine of Phandelver'] };
  const html = dungeonBadgesHTML(p);
  assert.match(html, /player-counter initiative/);
  assert.match(html, /data-gy="3" data-zone="dungeon"/);
  assert.match(html, /<b>2<\/b><small>\/5<\/small>/);
  assert.equal(dungeonText(p), ', tem a dianteira, na masmorra Undercity, sala Lost Well, 1 masmorra completada');
  assert.equal(dungeonBadgesHTML({ id: 1, name: 'Bia' }), '');
});

test('badges join the counters column, which stops hiding from screen readers', () => {
  assert.equal(withDungeonBadges('', ''), '');
  assert.equal(withDungeonBadges('', '<b>x</b>'), '<div class="player-counters"><b>x</b></div>');
  assert.equal(withDungeonBadges('<div class="player-counters" aria-hidden="true"><span></span></div>', '<b>x</b>'), '<div class="player-counters"><span></span><b>x</b></div>');
});

test('the map marks the current room, rooms left behind and the next ones', () => {
  const html = dungeonMapHTML({ ...undercity, room: 'Forge' });
  assert.match(html, /dungeon-room current" aria-current="location"><strong>Forge/);
  assert.match(html, /dungeon-room behind"><strong>Lost Well/);
  assert.match(html, /dungeon-room next"><strong>Arena/);
  assert.match(html, /Última sala: completa a masmorra/);
});

test('choosing the next room turns the offered rooms into answer buttons', () => {
  const q = { id: 1, method: 'getChoices', kind: 'choose', purpose: 'dungeon-room', title: 't', dungeonOwner: 3,
    options: [{ label: 'Trap!', room: 'Trap!' }, { label: 'Arena', room: 'Arena' }] };
  const html = dungeonRoomHTML(q, '<h2>t</h2>', { id: 3, name: 'Ana', dungeon: { ...undercity, room: 'Forge' } });
  assert.match(html, /data-q-opt="0" aria-label="Ir para Trap!/);
  assert.match(html, /data-q-opt="1" aria-label="Ir para Arena/);
  assert.doesNotMatch(html, /data-q-opt="\d+" aria-label="Ir para Stash/);
  assert.match(dungeonRoomHTML(q, '', undefined), /<b>Arena<\/b>/);
});
