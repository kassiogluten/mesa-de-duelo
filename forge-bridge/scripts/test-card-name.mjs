// Real-engine regression: node forge-bridge/scripts/test-card-name.mjs ws://127.0.0.1:7172/ws
// Silverquill Silencer names a card on entering: the question must arrive as plain names marked "card-name".
import assert from 'node:assert/strict';

const endpoint = process.argv[2] || 'ws://127.0.0.1:7172/ws';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

const ws = new WebSocket(endpoint);
const actions = new Map();
let state, failure, lastLandTurn = -1, questionBytes = 0;
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
    if (message.question?.purpose === 'card-name') questionBytes = data.length;
  }
});
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, {once: true});
  ws.addEventListener('error', reject, {once: true});
});
const own = () => state?.players.find(player => player.id === state.you);
const priority = () => state?.input.priority && state.input.ok.enabled && !state.question;
const silencer = () => own()?.hand.find(card => card.name === 'Silverquill Silencer');
const lands = () => own()?.battlefield.filter(card => card.land && !card.tapped) || [];
const naming = () => state?.question?.purpose === 'card-name';

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
    you: {name: 'Card name fixture', cards: [{name: 'Plains', count: 6}, {name: 'Swamp', count: 6}, {name: 'Silverquill Silencer', count: 6}]},
    opponent: {name: 'Opponent fixture', cards: [{name: 'Forest', count: 60}]}});

  const castable = () => priority() && state.activePlayer === state.you && state.phase === 'MAIN1'
    && lastLandTurn === state.turn && silencer() && state.input.actionable.includes(silencer().id);
  await until(castable, 'castable Silverquill Silencer', true);
  send({type: 'card', id: silencer().id, gen: state.input.gen});
  await until(naming, 'card name question', true);

  const q = state.question;
  assert.equal(q.kind, 'choose');
  assert.equal(q.max, 1);
  assert.ok(q.options.length > 1000, `only ${q.options.length} names`);
  assert.ok(q.options.every(o => typeof o === 'string'), 'names must be plain text');
  assert.ok(!q.options.includes('Plains'), 'lands cannot be named');
  const bolt = q.options.indexOf('Lightning Bolt');
  assert.ok(bolt >= 0, 'Lightning Bolt is nameable');
  send({type: 'answer', id: q.id, indices: [bolt]});
  await until(() => !naming() && own().battlefield.some(card => card.name === 'Silverquill Silencer'), 'Silencer resolved', true);
  console.log(`PASS Silverquill Silencer: ${q.options.length} plain names (${Math.round(questionBytes / 1024)} KB state), named Lightning Bolt`);
} finally {
  if (ws.readyState === WebSocket.OPEN) { send({type: 'leave'}); await wait(200); }
  ws.close();
}
