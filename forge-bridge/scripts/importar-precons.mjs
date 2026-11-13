#!/usr/bin/env node
// Importa os precons de Commander do Forge (forge-gui/res/quest/commanderprecons/*.dck) para shared/starter-decks.json,
// do jeito que saíram da caixa: comandante, cartas e série. O bracket sai das cartas (src/brackets.ts) e o preço do
// Scryfall (a edição mais barata de cada carta, em dólar), como nos outros decks prontos.
//
//   node forge-bridge/scripts/importar-precons.mjs [--sem-preco]
//
// FORGE_DIR aponta para o Forge instalado por instalar-forge.sh (padrão: ~/forge). Os precons que substituem um deck
// pronto adaptado mantêm o id dele, para quem o tinha escolhido continuar com ele; os outros entram no fim do arquivo.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { bracketOf, cheapest } from './deck-info.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const FORGE_DIR = process.env.FORGE_DIR || path.join(os.homedir(), 'forge');
const DCK_DIR = path.join(FORGE_DIR, 'forge-gui/res/quest/commanderprecons');
const DECKS_FILE = path.join(ROOT, 'shared/starter-decks.json');
const PRICE_CACHE = path.join(os.tmpdir(), 'mesa-precons-precos.json');
const withPrice = !process.argv.includes('--sem-preco');

/** As séries, na ordem em que aparecem na escolha de deck. */
const SERIES = {
  '40K': { name: 'Warhammer 40.000', year: 2022 },
  PIP: { name: 'Fallout', year: 2024 },
  LTC: { name: 'O Senhor dos Anéis: Contos da Terra-média', year: 2023 },
  FIC: { name: 'Final Fantasy', year: 2025 },
  WHO: { name: 'Doctor Who', year: 2023 },
  C13: { name: 'Commander 2013', year: 2013 },
  C16: { name: 'Commander 2016', year: 2016 },
  C17: { name: 'Commander 2017', year: 2017 },
  C20: { name: 'Commander 2020 (Ikoria)', year: 2020 },
  BLC: { name: 'Bloomburrow', year: 2024 },
};

/** Nome da caixa → nome em português e, quando substitui um deck pronto adaptado, o id dele. */
const PRECONS = {
  'Forces of the Imperium': { pt: 'Forças do Imperium' },
  'Necron Dynasties': { pt: 'Dinastias Necron' },
  'The Ruinous Powers': { pt: 'Os Poderes Ruinosos' },
  'Tyranid Swarm': { pt: 'Enxame Tirânida' },
  'Hail, Caesar': { pt: 'Salve, César', id: 'commander-caesar' },
  'Mutant Menace': { pt: 'Ameaça Mutante', id: 'commander-mothman' },
  'Science!': { pt: 'Ciência!' },
  'Scrappy Survivors': { pt: 'Sobreviventes Valentes' },
  'Elven Council': { pt: 'Conselho Élfico' },
  'Food and Fellowship': { pt: 'Comida e Companhia', id: 'commander-frodo-sam' },
  'Riders of Rohan': { pt: 'Cavaleiros de Rohan' },
  'The Host of Mordor': { pt: 'A Hoste de Mordor', id: 'commander-sauron' },
  'Counter Blitz': { pt: 'Contra-ataque Relâmpago' },
  'Limit Break': { pt: 'Quebra de Limite', id: 'commander-cloud' },
  'Revival Trance': { pt: 'Transe do Renascimento', id: 'commander-terra' },
  'Scions & Spellcraft': { pt: 'Herdeiros e Feitiçaria', id: 'commander-yshtola' },
  'Blast from the Past': { pt: 'De Volta ao Passado' },
  'Masters of Evil': { pt: 'Mestres do Mal' },
  'Paradox Power': { pt: 'Poder do Paradoxo' },
  'Timey-Wimey': { pt: 'Tempo Enrolado' },
  'Eternal Bargain': { pt: 'Barganha Eterna' },
  'Evasive Maneuvers': { pt: 'Manobras Evasivas' },
  'Mind Seize': { pt: 'Captura Mental' },
  'Nature of the Beast': { pt: 'Natureza da Fera' },
  'Power Hungry': { pt: 'Sede de Poder' },
  'Breed Lethality': { pt: 'Linhagem Letal' },
  'Entropic Uprising': { pt: 'Revolta Entrópica' },
  'Invent Superiority': { pt: 'Superioridade Inventiva' },
  'Open Hostility': { pt: 'Hostilidade Aberta' },
  'Stalwart Unity': { pt: 'Unidade Inabalável' },
  'Arcane Wizardry': { pt: 'Magia Arcana' },
  'Draconic Domination': { pt: 'Dominação Dracônica' },
  'Feline Ferocity': { pt: 'Ferocidade Felina' },
  'Vampiric Bloodlust': { pt: 'Sede de Sangue Vampírica' },
  'Arcane Maelstrom': { pt: 'Turbilhão Arcano' },
  'Enhanced Evolution': { pt: 'Evolução Aprimorada' },
  'Ruthless Regiment': { pt: 'Regimento Implacável' },
  'Symbiotic Swarm': { pt: 'Enxame Simbiótico' },
  'Timeless Wisdom': { pt: 'Sabedoria Atemporal' },
  'Animated Army': { pt: 'Exército Animado', id: 'commander-bello' },
  'Family Matters': { pt: 'Assuntos de Família' },
  'Peace Offering': { pt: 'Oferta de Paz', id: 'commander-bumbleflower' },
  'Squirreled Away': { pt: 'Guardado para o Inverno', id: 'commander-chatterfang' },
};

const slug = text => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** "Nome [SET] [ano].dck": um dos arquivos tem espaço antes do ".dck". */
function fileInfo(file) {
  const m = file.match(/^(.+?) \[([A-Z0-9]+)\] \[(\d{4})\]\s*\.dck$/);
  return m ? { name: m[1], set: m[2], year: Number(m[3]) } : null;
}

/** Seções [Commander] e [Main] (o Forge escreve às vezes em minúsculas); o "+" no fim do comandante é o cartão alternativo. */
function parseDck(text) {
  const sections = { commander: new Map(), main: new Map() };
  let current = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const header = line.match(/^\[(.+)\]$/);
    if (header) { current = sections[header[1].toLowerCase()] ?? null; continue; }
    const card = current && line.match(/^(\d+)\s+([^|]+)/);
    if (!card) continue;
    const name = card[2].trim().replace(/\+$/, '');
    current.set(name, (current.get(name) ?? 0) + Number(card[1]));
  }
  const entries = map => [...map].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name, 'en'));
  return { commanders: entries(sections.commander), cards: entries(sections.main) };
}

const files = fs.readdirSync(DCK_DIR).map(file => ({ file, info: fileInfo(file) }))
  .filter(({ info }) => info && SERIES[info.set] && PRECONS[info.name]);
const missing = Object.keys(PRECONS).filter(name => !files.some(f => f.info.name === name));
if (missing.length) throw new Error(`Precons não encontrados em ${DCK_DIR}: ${missing.join(', ')}`);

const bracket = await bracketOf();
const cache = fs.existsSync(PRICE_CACHE) ? JSON.parse(fs.readFileSync(PRICE_CACHE, 'utf8')) : {};
const today = new Date().toISOString().slice(0, 10);
const decks = JSON.parse(fs.readFileSync(DECKS_FILE, 'utf8'));
const order = Object.keys(SERIES);
files.sort((a, b) => order.indexOf(a.info.set) - order.indexOf(b.info.set) || a.info.name.localeCompare(b.info.name, 'en'));

for (const { file, info } of files) {
  const meta = PRECONS[info.name];
  const { commanders, cards } = parseDck(fs.readFileSync(path.join(DCK_DIR, file), 'utf8'));
  const total = [...commanders, ...cards].reduce((s, e) => s + e.count, 0);
  if (total !== 100 || !commanders.length) throw new Error(`${file}: ${total} cartas e ${commanders.length} comandantes`);
  const id = meta.id ?? `precon-${slug(info.set)}-${slug(info.name)}`;
  const deck = {
    id, name: meta.pt, builtin: true, format: 'commander', bracket: bracket({ cards, commanders }),
    precon: { name: info.name, set: info.set, series: SERIES[info.set].name, year: SERIES[info.set].year },
    commanders, cards, sideboard: [],
  };
  const old = decks.find(d => d.id === id);
  if (withPrice) {
    let usd = 0;
    for (const e of [...commanders, ...cards]) {
      const price = await cheapest(e.name, cache);
      if (price == null) console.warn(`  sem preço: ${e.name}`);
      usd += (price ?? 0) * e.count;
    }
    fs.writeFileSync(PRICE_CACHE, JSON.stringify(cache));
    deck.price = { usd: Math.round(usd * 100) / 100, date: today };
  } else if (old?.price) deck.price = old.price;
  if (old) decks[decks.indexOf(old)] = deck; else decks.push(deck);
  console.log(`${id.padEnd(48)} ${meta.pt.padEnd(28)} B${deck.bracket}${deck.price ? ` US$ ${deck.price.usd}` : ''}`);
}
fs.writeFileSync(DECKS_FILE, JSON.stringify(decks, null, 2) + '\n');
console.log(`${files.length} precons em ${path.relative(ROOT, DECKS_FILE)}.`);
