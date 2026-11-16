// Real-engine regression: node forge-bridge/scripts/test-resolving-choice.mjs ws://127.0.0.1:7172/ws
// Mycoloth asks which creatures to devour while it resolves: it stays on top of the stack marked "resolving", so the
// table keeps it there, lit, instead of showing it only in the action box.
import assert from 'node:assert/strict';

const endpoint = process.argv[2] || 'ws://127.0.0.1:7172/ws';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

const ws = new WebSocket(endpoint);
const actions = new Map();
let state, failure, lastLandTurn = -1;
const send = value => ws.send(JSON.stringify(value));
const once = value => {
  const key = JSON.stringify(value);
  if (Date.now() - (actions.get(key) || 0) > 1700) { actions.set(key, Date.now()); send(value); }
};
ws.addEventListener('message', ({data}) => {
  const message = JSON.parse(data);
  if (['error', 'validation-error'].includes(message.type)) failure = new Error(JSON.stringify(message));
  if (message.type === 'state') {
    state = message;
  }
});
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, {once: true});
  ws.addEventListener('error', reject, {once: true});
});
const own = () => state?.players.find(player => player.id === state.you);
const priority = () => state?.input.priority && state.input.ok.enabled && !state.question;
const inHand = n => own()?.hand.find(card => card.name === n && state.input.actionable.includes(card.id));

async function until(test, label, advance = false, timeout = 60000) {
  const deadline = Date.now() + timeout;
  while (!test()) {
    if (failure) throw failure;
    if (Date.now() > deadline || state?.gameOver) throw new Error(`${label}: ${JSON.stringify({turn: state?.turn, phase: state?.phase, question: state?.question?.title})}`);
    if (advance && state) advanceSetup();
    await wait(60);
  }
}

function advanceSetup() {
  const input = state.input, question = state.question;
  if (question) {
    once(question.kind === 'confirm' ? {type: 'answer', id: question.id, value: true}
      : {type: 'answer', id: question.id, indices: Array.from({length: question.kind === 'order' ? question.options.length : Math.max(0, question.min ?? 1)}, (_, i) => i)});
  } else if (['play-draw', 'mulligan'].includes(input.opening) && input.ok.enabled) {
    once({type: 'ok', gen: input.gen});
  } else if (input.paying && input.ok.enabled) {
    once({type: 'ok', gen: input.gen});
  } else if (priority()) {
    const land = own().hand.find(card => card.land && input.actionable.includes(card.id));
    if (state.activePlayer === state.you && state.phase === 'MAIN1' && land && lastLandTurn !== state.turn) {
      lastLandTurn = state.turn;
      once({type: 'card', id: land.id, gen: input.gen});
    } else once({type: 'ok', gen: input.gen});
  } else if (input.ok.enabled) {
    once({type: 'ok', gen: input.gen});
  } else if (state.phase === 'CLEANUP' && input.selectable.length) {
    once({type: 'card', id: input.selectable[0], gen: input.gen});
  }
}

try {
  send({type: 'start', config: {format: 'free', matchLength: 'bo1'},
    you: {name: 'Resolving fixture', cards: [{name: 'Forest', count: 20}, {name: 'Llanowar Elves', count: 20}, {name: 'Mycoloth', count: 20}]},
    opponent: {name: 'Opponent fixture', cards: [{name: 'Island', count: 60}]}});
  const devouring = () => !!state?.input?.selection && state.input.card?.name === 'Mycoloth';
  const deadline = Date.now() + 170000;
  while (!devouring()) {
    if (failure) throw failure;
    if (Date.now() > deadline || state?.gameOver) throw new Error(`no Devour choice: ${JSON.stringify({turn: state?.turn, phase: state?.phase})}`);
    if (state && priority() && state.activePlayer === state.you && state.phase === 'MAIN1' && lastLandTurn === state.turn) {
      const c = inHand('Mycoloth') || inHand('Llanowar Elves');
      if (c) { once({type: 'card', id: c.id, gen: state.input.gen}); await wait(100); continue; }
    }
    if (state) advanceSetup();
    await wait(60);
  }
  const top = state.stack[0];
  assert.equal(top?.source?.name, 'Mycoloth', 'Mycoloth stays on top while you choose');
  assert.equal(top.resolving, true, 'the top item is marked as resolving');
  assert.ok(state.stack.slice(1).every(item => !item.resolving), 'only the top item resolves');
  send({type: 'ok', gen: state.input.gen});
  await until(() => own().battlefield.some(card => card.name === 'Mycoloth'), 'Mycoloth resolved', true);
  assert.ok(state.stack.every(item => !item.resolving), 'nothing marked after it resolves');
  console.log(`PASS Mycoloth devouring: stays on top of the stack marked resolving`);
} finally {
  if (ws.readyState === WebSocket.OPEN) { send({type: 'leave'}); await wait(200); }
  ws.close();
}
