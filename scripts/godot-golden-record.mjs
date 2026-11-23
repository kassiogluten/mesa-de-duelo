// Gancho do carregador dos testes que grava as chamadas às funções de texto da mesa (entrada e saída) num arquivo,
// para scripts/godot-golden.mjs montar os fixtures dourados da mesa no PC. Só liga com GOLDEN_RECORD=<arquivo>.
// Uso: node --import ./tests/register.mjs --import ./scripts/godot-golden-record.mjs --test tests/x.test.mjs
import { registerHooks } from 'node:module';
import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Módulo da mesa → funções exportadas a gravar. */
export const RECORDED = {
  'src/ui/forgeText.ts': ['fixPossessives'],
  'src/ui/shortInstruction.ts': ['shortInstruction', 'validTargetKind', 'targetKind', 'poolCost', 'targetProgress', 'abilityKindLabel', 'paymentButtonLabels', 'counteredUnlessPaid', 'voteRequest'],
  'src/ui/forgeRequest.ts': ['selectionRequest', 'ptTitle'],
  'src/ui/phaseHud.ts': ['turnBannerText', 'upcomingTurnsText', 'dayNightText', 'phaseGroupLabel'],
  'src/ui/clock.ts': ['turnTimeText'],
  'src/ui/opponentStops.ts': ['normalizeStops'],
  'src/ui/matchBar.ts': ['seriesText', 'matchFormatName', 'matchChips'],
  'src/ui/waitAlert.ts': ['waitStage', 'waitNudgeText', 'waitClockTip'],
  'src/ui/eventText.ts': ['eventDescription'],
  'src/ui/historyLog.ts': ['historyTurns', 'listNames'],
};

/**
 * Argumentos que são um objeto com funções (a "vista" da mesa: nomes dos jogadores, das cartas...): cada função é
 * gravada como um mapa chave → resultado, com a chave dada aqui (simples, para o porte refazer igual). Índice do
 * argumento → função → como fazer a chave a partir dos argumentos.
 */
export const VIEWS = {
  eventDescription: { 0: { state: () => '', label: c => c?.name ?? '', findCard: id => String(id), ptName: n => String(n) } },
  historyTurns: { 1: { player: id => id == null ? '' : String(id), card: e => String(e.seq), cardById: (id, e) => `${id}:${e.seq}`, label: c => c?.name ?? '', describe: e => String(e.seq) } },
};

/** Saídas grandes demais para guardar inteiras: só o que o porte precisa acertar. */
export const PROJECT = {
  historyTurns: turns => turns.map(t => ({ key: t.key, turn: t.turn ?? null, actor: t.actor ?? null, lines: t.lines.map(l => ({
    key: l.key, text: l.text, card: l.card?.name ?? null, badges: l.badges ?? [], children: l.children.map(c => ({ text: c.text, card: c.card?.name ?? null })) })) })),
};

/** Monta de volta a vista gravada: cada função devolve o resultado guardado para a chave. */
export function viewFrom(saved, keys) {
  const { $calls = {}, ...props } = saved;
  const view = { ...props };
  for (const [fn, key] of Object.entries(keys)) view[fn] = (...a) => $calls[fn]?.[key(...a)];
  return view;
}

const OUT = process.env.GOLDEN_RECORD;
const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\\/g, '/');

/**
 * Embrulha a função: cada chamada grava { fn, args, out }. Funções passadas como argumento (o `translate` dos nomes)
 * viram { $translate: true } e o mapa das traduções que a chamada pediu vai em `names`, para o porte refazer a mesma
 * tradução. Argumento ausente (undefined) fica null no JSON.
 */
globalThis.__goldenWrap = (name, fn) => function (...args) {
  const names = {};
  const views = {};
  const plain = args.map((a, i) => {
    if (typeof a === 'function') return n => { const r = a(n); names[n] = r; return r; };
    const keys = VIEWS[name]?.[i];
    if (!keys || !a || typeof a !== 'object') return a;
    const calls = {};
    const view = { ...a };
    for (const [fnName, key] of Object.entries(keys)) {
      if (typeof a[fnName] !== 'function') continue;
      view[fnName] = (...x) => { const r = a[fnName](...x); (calls[fnName] ??= {})[key(...x)] = r; return r; };
    }
    views[i] = { a, calls };
    return view;
  });
  const out = fn.apply(this, plain);
  try {
    const saved = args.map((a, i) => {
      if (typeof a === 'function') return { $translate: true };
      const v = views[i];
      if (!v) return a;
      const props = Object.fromEntries(Object.entries(v.a).filter(([, x]) => typeof x !== 'function'));
      return { $view: { ...props, $calls: v.calls } };
    });
    const shown = PROJECT[name] && out != null ? PROJECT[name](out) : out;
    const record = { fn: name, args: saved, out: shown === undefined ? null : shown };
    if (Object.keys(names).length) record.names = names;
    appendFileSync(OUT, JSON.stringify(record) + '\n');
  } catch { /* argumento que não vira JSON: fica de fora */ }
  return out;
};

if (OUT) {
  registerHooks({
    load(url, context, nextLoad) {
      const result = nextLoad(url, context);
      if (!url.startsWith('file:')) return result;
      const file = fileURLToPath(url.split('?')[0]).replace(/\\/g, '/');
      const rel = file.startsWith(ROOT) ? file.slice(ROOT.length) : file;
      const names = RECORDED[rel];
      if (!names) return result;
      let source = String(result.source);
      // `export const f = ...` não pode ser reatribuído: vira `let`, e todas as exportadas são embrulhadas no fim.
      for (const name of names) source = source.replace(new RegExp(`export const ${name}\\b`), `export let ${name}`);
      source += '\n' + names.map(name => `${name} = globalThis.__goldenWrap(${JSON.stringify(name)}, ${name});`).join('\n') + '\n';
      return { ...result, source };
    },
  });
}
