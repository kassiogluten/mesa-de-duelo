// Real-engine regression: node forge-bridge/scripts/test-choice-screens.mjs ws://127.0.0.1:7172/ws
// Play modes (cast or cycle) and simultaneous trigger order, including the repeated set Forge sends pre-ordered.
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

await session({name: 'Play modes', cards: [{name: 'Mountain', count: 6}, {name: 'Sweltering Suns', count: 6}]},
  {name: 'Idle', cards: [{name: 'Forest', count: 60}]}, async ({ ctx, own, priority, until, send }) => {
    const suns = () => own()?.hand.find(card => card.name === 'Sweltering Suns');
    const untapped = () => own()?.battlefield.filter(card => card.land && !card.tapped).length ?? 0;
    await until(() => priority() && ctx.state.activePlayer === ctx.state.you && ctx.state.phase === 'MAIN1' && untapped() >= 3 && suns()
      && ctx.state.input.actionable.includes(suns().id), 'three Mountains and Sweltering Suns', () => false);
    const card = suns();
    send({type: 'card', id: card.id, gen: ctx.state.input.gen});
    await until(() => ctx.state.question?.purpose === 'play-mode', 'play-mode question');
    const q = ctx.state.question;
    assert.equal(q.card?.id, card.id);
    const byMode = Object.fromEntries(q.options.map(o => [o.mode, o]));
    assert.ok(byMode.cast && byMode.cycling, JSON.stringify(q.options));
    assert.equal(byMode.cast.spell, true);
    assert.equal(byMode.cast.cost, '{1}{R}{R}');
    assert.equal(byMode.cycling.cost, '{3}');
    assert.ok(Array.isArray(byMode.cycling.extra));
    send({type: 'answer', id: q.id, indices: []});
    await until(() => !ctx.state.question && own().hand.some(item => item.id === card.id), 'cancel keeps the card in hand');
    console.log('PASS play modes: cast and cycling with separate mana costs; cancel plays nothing');
  });

await session({name: 'Trigger order', cards: [{name: 'Plains', count: 8}, {name: 'Soul Warden', count: 6}, {name: "Soul's Attendant", count: 6}]},
  {name: 'Bears', cards: [{name: 'Forest', count: 8}, {name: 'Grizzly Bears', count: 12}]}, async ({ ctx, until, send }) => {
    const seen = [];
    const isLifeCreature = card => card.creature && ['Soul Warden', "Soul's Attendant"].includes(card.name);
    for (let round = 0; round < 2; round++) {
      await until(() => ctx.state?.question?.purpose === 'triggers' && !seen.includes(ctx.state.question.id), `trigger order ${round + 1}`, isLifeCreature, 240000);
      const q = ctx.state.question;
      seen.push(q.id);
      assert.equal(q.kind, 'order');
      assert.ok(q.options.length >= 2, `round ${round + 1}: every trigger must be offered (${q.options.length})`);
      for (const o of q.options) {
        assert.equal(o.kind, 'ability');
        assert.ok(o.card?.name, JSON.stringify(o));
        assert.ok(o.ability && !o.ability.startsWith(o.card.name), JSON.stringify(o));
      }
      send({type: 'answer', id: q.id, indices: q.options.map((_, i) => i).reverse()});
      await until(() => ctx.state.question?.id !== q.id, 'order accepted');
    }
    console.log('PASS trigger order: source card and ability text; the repeated set still offers every trigger');
  });
