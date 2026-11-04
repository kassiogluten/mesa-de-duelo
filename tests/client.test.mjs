import assert from 'node:assert/strict';
import { test } from 'node:test';

const { ForgeClient } = await import('../src/forge/client.ts');

class Socket {
  static OPEN = 1;
  static latest;
  constructor() { Socket.latest = this; this.readyState = 0; this.sent = []; }
  open() { this.readyState = Socket.OPEN; this.onopen(); }
  send(text) { this.sent.push(JSON.parse(text)); }
  receive(message) { this.onmessage({ data: JSON.stringify(message) }); }
  close() { this.readyState = 3; this.onclose(); }
}
globalThis.WebSocket = Socket;
async function connect() {
  const client = new ForgeClient(), ready = client.connect('ws://example.test');
  const socket = Socket.latest;
  socket.open(); await ready;
  return { client, socket };
}
const deck = { name: 'My deck', cards: [{ name: 'Mountain', count: 60 }], sideboard: [] };

test('overlapping validation and room requests resolve by identity, not response order', async () => {
  const { client, socket } = await connect();
  const validation = client.validateDeck(deck, 'pauper'), room = client.lookupRoom('ABCD');
  const [a, b] = socket.sent;
  assert.notEqual(a.requestId, b.requestId);
  assert.deepEqual(a.deck.sideboard, []);
  socket.receive({ type: 'room-info', requestId: b.requestId, room: { code: 'ABCD', config: { format: 'pauper', matchLength: 'bo3' } } });
  socket.receive({ type: 'validation', requestId: a.requestId, validation: { valid: true, issues: [], rulesVersion: 'snapshot' } });
  assert.equal((await room).config.matchLength, 'bo3');
  assert.equal((await validation).valid, true);
  client.close();
});

test('public room list is a request of its own and the host message carries the visibility', async () => {
  const { client, socket } = await connect();
  const rooms = client.listRooms();
  assert.deepEqual(Object.keys(socket.sent[0]).sort(), ['requestId', 'type']);
  assert.equal(socket.sent[0].type, 'list-rooms');
  const listed = [{ code: 'WXYZ', host: 'Ana', config: { format: 'pauper', matchLength: 'bo1' }, capacity: 2, players: 1, started: false }];
  socket.receive({ type: 'room-list', requestId: socket.sent[0].requestId, rooms: listed });
  assert.deepEqual(await rooms, listed);
  const empty = client.listRooms();
  socket.receive({ type: 'room-list', requestId: socket.sent[1].requestId });
  assert.deepEqual(await empty, [], 'a list without rooms is empty, not undefined');
  client.send({ type: 'host', name: 'Ana', deck, config: { format: 'pauper', matchLength: 'bo1' }, visibility: 'public' });
  assert.equal(socket.sent[2].visibility, 'public');
  client.close();
});

test('request errors reject their request without swallowing live game updates', async () => {
  const { client, socket } = await connect();
  let received;
  client.onState = state => { received = state; };
  const result = client.lookupRoom('ABCD');
  const rejected = assert.rejects(result, /Sala inexistente/);
  socket.receive({ type: 'state', stateVersion: 42, players: [] });
  socket.receive({ type: 'request-error', requestId: socket.sent[0].requestId, text: 'Sala inexistente' });
  await rejected;
  assert.equal(received.stateVersion, 42);
  assert.equal(client.state, received);
  client.close();
});

test('disconnect rejects every pending preflight and reconnect never accepts its stale response', async () => {
  const { client, socket } = await connect();
  const validation = client.validateDeck(deck, 'free'), room = client.lookupRoom('ABCD');
  const rejectionA = assert.rejects(validation, /interrompida/), rejectionB = assert.rejects(room, /interrompida/);
  const oldId = socket.sent[0].requestId;
  socket.close();
  await Promise.all([rejectionA, rejectionB]);
  assert.equal(client.connected, false);
  const ready = client.connect('ws://example.test');
  const next = Socket.latest; next.open(); await ready;
  const fresh = client.validateDeck(deck, 'pauper');
  assert.notEqual(next.sent[0].requestId, oldId);
  next.receive({ type: 'validation', requestId: oldId, validation: { valid: false } });
  next.receive({ type: 'validation', requestId: next.sent[0].requestId, validation: { valid: true } });
  assert.equal((await fresh).valid, true);
  client.close();
});

test('explicit close cancels preflight; offline requests do not wait for a timeout', async () => {
  const { client } = await connect();
  const pending = assert.rejects(client.validateDeck(deck, 'pauper'), /encerrada/);
  client.close(); await pending;
  await assert.rejects(client.lookupRoom('ABCD'), /Conecte-se/);
});

test('choosing the deck inside the room waits for the answer and a refused deck only rejects, without leaving', async () => {
  const { client, socket } = await connect();
  let notices = 0, validations = 0;
  client.onNotice = () => { notices++; };
  client.onValidation = () => { validations++; };
  const ok = client.chooseRoomDeck({ deck, cover: 'Mountain' });
  assert.equal(socket.sent[0].type, 'room-deck');
  assert.equal(socket.sent[0].cover, 'Mountain');
  socket.receive({ type: 'room-deck', requestId: socket.sent[0].requestId });
  await ok;
  const refused = client.chooseRoomDeck({ deck });
  socket.receive({ type: 'validation-error', requestId: socket.sent[1].requestId, target: 'deck', validation: { valid: false, issues: [{ card: 'Black Lotus', message: 'Proibida no formato.' }] } });
  await assert.rejects(refused, /Black Lotus: Proibida no formato\./);
  const late = client.chooseRoomDeck({ deck });
  socket.receive({ type: 'request-error', requestId: socket.sent[2].requestId, text: 'A partida já começou: não dá mais para trocar o deck.' });
  await assert.rejects(late, /já começou/);
  assert.equal(notices + validations, 0, 'the room stays: nothing goes to the general error path');
  client.close();
});
