// Real-engine regression: node forge-bridge/scripts/test-resolve-all.mjs ws://127.0.0.1:7172/ws
// Two Lightning Bolts on the stack: one "resolve-all" resolves both without further priority clicks.
// A third Mountain and Bolt stay available, so Forge's "no actions" auto-pass doesn't resolve them first.
import assert from 'node:assert/strict';

const endpoint = process.argv[2] || 'ws://127.0.0.1:7172/ws';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function session(you, opponent, body) {
  const ws = new WebSocket(endpoint);
  const actions = new Map();
  let failure;
  const ctx = { state: null };
  const send = value => ws.send(JSON.stringify(value));
  const once = value => {
    const key = JSON.stringify(value);
    if (Date.now() - (actions.get(key) || 0) > 1700) { actions.set(key, Date.now()); send(value); }
  };
  ws.addEventListener('message', ({data}) => {
    const message = JSON.parse(data);
    if (['error', 'validation-error'].includes(message.type)) failure = new Error(JSON.stringify(message));
    if (message.type === 'state') ctx.state = message;
  });
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, {once: true}); ws.addEventListener('error', reject, {once: true}); });
  const own = () => ctx.state?.players.find(player => player.id === ctx.state.you);
  const priority = () => ctx.state?.input.priority && ctx.state.input.ok.enabled && !ctx.state.question;
  function advance(cast) {
    const { input, question } = ctx.state;
    if (question) {
      once(question.kind === 'confirm' ? {type: 'answer', id: question.id, value: true}
        : question.kind === 'text' ? {type: 'answer', id: question.id, text: question.initial || '0'}
          : {type: 'answer', id: question.id, indices: Array.from({length: question.kind === 'order' ? question.options.length : Math.max(0, question.min ?? 1)}, (_, i) => i)});
    } else if (['play-draw', 'mulligan'].includes(input.opening) && input.ok.enabled) once({type: 'ok', gen: input.gen});
    else if (input.paying && input.ok.enabled) once({type: 'ok', gen: input.gen});
    else if (priority()) {
      const mine = ctx.state.activePlayer === ctx.state.you && ctx.state.phase === 'MAIN1';
      const land = own().hand.find(card => card.land && input.actionable.includes(card.id));
      const spell = cast && own().hand.find(card => cast(card) && input.actionable.includes(card.id));
      if (mine && land) once({type: 'card', id: land.id, gen: input.gen});
      else if (mine && spell) once({type: 'card', id: spell.id, gen: input.gen});
      else once({type: 'ok', gen: input.gen});
    } else if (input.ok.enabled) once({type: 'ok', gen: input.gen});
    else if (ctx.state.phase === 'CLEANUP' && input.selectable.length) once({type: 'card', id: input.selectable[0], gen: input.gen});
  }
  async function until(test, label, cast, timeout = 60000) {
    const deadline = Date.now() + timeout;
    while (!test()) {
      if (failure) throw failure;
      if (Date.now() > deadline || ctx.state?.gameOver) throw new Error(`${label}: ${JSON.stringify({turn: ctx.state?.turn, phase: ctx.state?.phase, question: ctx.state?.question, hand: own()?.hand.map(c => c.name)})}`);
      if (cast !== undefined && ctx.state) advance(cast);
      await wait(60);
    }
  }
  try {
    send({type: 'start', config: {format: 'free', matchLength: 'bo1'}, you, opponent});
    await body({ ctx, own, priority, until, send });
  } finally {
    if (ws.readyState === WebSocket.OPEN) { send({type: 'leave'}); await wait(200); }
    ws.close();
  }
}

await session({name: 'Resolve all', cards: [{name: 'Mountain', count: 8}, {name: 'Lightning Bolt', count: 12}]},
  {name: 'Idle', cards: [{name: 'Forest', count: 60}]}, async ({ ctx, own, priority, until, send }) => {
    const opponent = () => ctx.state.players.find(p => p.id !== ctx.state.you);
    const bolts = () => own()?.hand.filter(c => c.name === 'Lightning Bolt') ?? [];
    const untapped = () => own()?.battlefield.filter(c => c.land && !c.tapped).length ?? 0;
    await until(() => priority() && ctx.state.activePlayer === ctx.state.you && ctx.state.phase === 'MAIN1' && untapped() >= 3 && bolts().length >= 3,
      'three Mountains and three Bolts', () => false, 240000);
    const life = opponent().life;
    async function cast() {
      const before = ctx.state.stack.length;
      const bolt = bolts().find(c => ctx.state.input.actionable.includes(c.id));
      assert.ok(bolt, 'castable Bolt');
      send({type: 'card', id: bolt.id, gen: ctx.state.input.gen});
      await until(() => ctx.state.input.selectablePlayers?.includes(opponent().id), 'Bolt target');
      send({type: 'player', id: opponent().id, gen: ctx.state.input.gen});
      await until(() => {
        if (ctx.state.input.paying && ctx.state.input.ok.enabled) send({type: 'ok', gen: ctx.state.input.gen});
        if (process.env.DEBUG) console.log(JSON.stringify({stack: ctx.state.stack.length, life: opponent().life, pr: ctx.state.input.priority, ok: ctx.state.input.ok, msg: ctx.state.input.message?.slice(0, 80), paying: !!ctx.state.input.paying, tg: !!ctx.state.input.targeting}));
        return ctx.state.stack.length > before && priority();
      }, 'Bolt on the stack with priority back');
    }
    await cast();
    await cast();
    assert.equal(ctx.state.stack.length, 2);
    send({type: 'resolve-all', gen: ctx.state.input.gen});
    // Nothing else is sent: both must resolve on their own.
    await until(() => ctx.state.stack.length === 0 && opponent().life === life - 6, 'both Bolts resolved', undefined, 20000);
    console.log(`PASS resolve all: two Bolts resolved with one click (${life} -> ${opponent().life})`);
  });
