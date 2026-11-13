// Bracket e preço de um deck pronto, para os scripts que importam decks para shared/starter-decks.json.
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const ROOT = path.resolve(import.meta.dirname, '../..');

/** O bracket calculado pelas cartas (src/brackets.ts), com o mínimo 2 dos decks prontos. */
export async function bracketOf() {
  const source = fs.readFileSync(path.join(ROOT, 'src/brackets.ts'), 'utf8')
    .replace(/^import lists from .*$/m, `const lists = ${fs.readFileSync(path.join(ROOT, 'shared/commander-brackets.json'), 'utf8')};`);
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  const mod = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
  // Sem nada que pese, o deck fica no nível de pré-montado (2), como os outros decks prontos.
  return deck => Math.max(2, mod.estimateBracket(deck).min);
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
/** A edição mais barata em dólar (a comum; sem ela, a foil), com cache entre execuções. A busca do Scryfall aceita 2 por segundo. */
export async function cheapest(name, cache) {
  if (cache[name] !== undefined) return cache[name];
  const query = encodeURIComponent(`!"${name}" (usd>0 or usdfoil>0)`);
  for (let attempt = 0; attempt < 6; attempt++) {
    await sleep(550);
    const res = await fetch(`https://api.scryfall.com/cards/search?q=${query}&unique=prints&order=usd&dir=asc&include_extras=false`, { headers: { 'User-Agent': 'MesaDeDuelo/1.0', Accept: 'application/json' } });
    if (res.status === 429 || res.status >= 500) { await sleep(30000); continue; }
    if (res.status === 404) { cache[name] = null; return null; }
    const body = await res.json();
    const lowest = key => Math.min(...body.data.map(c => Number(c.prices?.[key])).filter(v => v > 0));
    const price = [lowest('usd'), lowest('usd_foil')].find(Number.isFinite);
    return cache[name] = price ?? null;
  }
  throw new Error(`Scryfall não respondeu para ${name}`);
}

/** Preço do deck inteiro, em dólar, com a data de hoje. */
export async function deckPrice(entries, cache) {
  let usd = 0;
  for (const e of entries) {
    const price = await cheapest(e.name, cache);
    if (price == null) console.warn(`  sem preço: ${e.name}`);
    usd += (price ?? 0) * e.count;
  }
  return { usd: Math.round(usd * 100) / 100, date: new Date().toISOString().slice(0, 10) };
}
