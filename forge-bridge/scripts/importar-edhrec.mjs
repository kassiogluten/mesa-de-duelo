#!/usr/bin/env node
// Importa a lista média de um comandante no EDHREC (average-decks) como deck pronto de Commander em shared/starter-decks.json,
// com o bracket calculado pelas cartas e o preço do Scryfall. É o caminho dos 5 decks de cada coleção nova (CLAUDE.md).
//
//   node forge-bridge/scripts/importar-edhrec.mjs <slug-do-edhrec>="Nome em português" [...] [--sem-preco]
//
//   O slug é o fim da página do comandante (edhrec.com/commanders/whtz-the-bibliophile). O deck ganha o id
//   commander-edhrec-<slug>; rodar de novo com o mesmo slug atualiza o deck no lugar (e desfaz as trocas abaixo).
//
// Depois, o CommanderDeckTest aponta as cartas que a IA do Forge não joga (AI:RemoveDeck): troque cada uma à mão por
// outra da mesma função e da mesma identidade de cor, e recalcule o bracket e o preço (deck-info.mjs).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { bracketOf, deckPrice } from './deck-info.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const DECKS_FILE = path.join(ROOT, 'shared/starter-decks.json');
const PRICE_CACHE = path.join(os.tmpdir(), 'mesa-precons-precos.json');
const withPrice = !process.argv.includes('--sem-preco');
const wanted = process.argv.slice(2).filter(a => !a.startsWith('--')).map(a => {
  const m = a.match(/^([a-z0-9-]+)=(.+)$/);
  if (!m) throw new Error(`Use <slug>="Nome": ${a}`);
  return { slug: m[1], name: m[2] };
});
if (!wanted.length) throw new Error('Informe ao menos um <slug>="Nome em português".');

const bracket = await bracketOf();
const cache = fs.existsSync(PRICE_CACHE) ? JSON.parse(fs.readFileSync(PRICE_CACHE, 'utf8')) : {};
const decks = JSON.parse(fs.readFileSync(DECKS_FILE, 'utf8'));
const byName = (a, b) => a.name.localeCompare(b.name, 'en');

for (const { slug, name } of wanted) {
  const res = await fetch(`https://json.edhrec.com/pages/average-decks/${slug}.json`, { headers: { 'User-Agent': 'MesaDeDuelo/1.0' } });
  if (!res.ok) throw new Error(`EDHREC respondeu ${res.status} para ${slug}`);
  const { deck: source } = await res.json();
  const commanders = source.commander_v2.map(([n, count]) => ({ name: n, count })).sort(byName);
  const counts = new Map();
  for (const [n, count] of Object.values(source.cards).flat()) counts.set(n, (counts.get(n) ?? 0) + count);
  for (const c of commanders) counts.delete(c.name);
  const cards = [...counts].map(([n, count]) => ({ name: n, count })).sort(byName);
  const id = `commander-edhrec-${slug}`;
  const deck = { id, name, builtin: true, format: 'commander', bracket: bracket({ cards, commanders }), commanders, cards, sideboard: [] };
  const old = decks.find(d => d.id === id);
  if (withPrice) {
    deck.price = await deckPrice([...commanders, ...cards], cache);
    fs.writeFileSync(PRICE_CACHE, JSON.stringify(cache));
  } else if (old?.price) deck.price = old.price;
  if (old) decks[decks.indexOf(old)] = deck; else decks.push(deck);
  const total = [...commanders, ...cards].reduce((s, e) => s + e.count, 0);
  console.log(`${id.padEnd(48)} ${name.padEnd(28)} ${total} cartas B${deck.bracket}${deck.price ? ` US$ ${deck.price.usd}` : ''}`);
  await new Promise(r => setTimeout(r, 1000));
}
fs.writeFileSync(DECKS_FILE, JSON.stringify(decks, null, 2) + '\n');
