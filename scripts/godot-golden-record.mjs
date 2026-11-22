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
};

const OUT = process.env.GOLDEN_RECORD;
const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\\/g, '/');

/**
 * Embrulha a função: cada chamada grava { fn, args, out }. Funções passadas como argumento (o `translate` dos nomes)
 * viram { $translate: true } e o mapa das traduções que a chamada pediu vai em `names`, para o porte refazer a mesma
 * tradução. Argumento ausente (undefined) fica null no JSON.
 */
globalThis.__goldenWrap = (name, fn) => function (...args) {
  const names = {};
  const plain = args.map(a => typeof a === 'function' ? (n => { const r = a(n); names[n] = r; return r; }) : a);
  const out = fn.apply(this, plain);
  try {
    const record = { fn: name, args: args.map(a => typeof a === "function" ? { $translate: true } : a), out: out === undefined ? null : out };
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
