import type { FCard, FCount, FCountUse } from '../forge/client';
import { esc, pip } from './cardtext';

/**
 * O valor que a carta conta (item 56 do roadmap): Lições no cemitério de Combustion Technique, o poder das suas
 * criaturas de Ghalta, a devoção dos deuses de Theros. A ponte manda o que é contado e o valor; aqui vira um selo
 * mínimo (o número, e "2/3" quando o efeito liga a partir de um mínimo) e a frase do balão e do inspetor.
 */
export interface CountSeal { kind: 'count' | 'count met' | 'devotion' | 'devotion met'; html: string; label: string }

const COLOR_NAME: Record<string, string> = { W: 'branco', U: 'azul', B: 'preto', R: 'vermelho', G: 'verde' };
const list = (names: string[], last = 'e') => names.length > 1 ? `${names.slice(0, -1).join(', ')} ${last} ${names.at(-1)}` : names[0] ?? '';
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const capital = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

type Gender = 'm' | 'f';
/** Nome no plural e gênero. Tipos de carta fora do campo viram "cartas de criatura" (ver {@link noun}). */
const NOUN: Record<string, [string, Gender]> = {
  Card: ['cartas', 'f'], Permanent: ['permanentes', 'f'], Creature: ['criaturas', 'f'], Land: ['terrenos', 'm'], Artifact: ['artefatos', 'm'],
  Enchantment: ['encantamentos', 'm'], Planeswalker: ['planeswalkers', 'm'], Battle: ['batalhas', 'f'], Instant: ['mágicas instantâneas', 'f'], Sorcery: ['feitiços', 'm'],
  Lesson: ['Lições', 'f'], Forest: ['Florestas', 'f'], Island: ['Ilhas', 'f'], Swamp: ['Pântanos', 'm'], Mountain: ['Montanhas', 'f'], Plains: ['Planícies', 'f'],
  Equipment: ['Equipamentos', 'm'], Aura: ['Auras', 'f'], Vehicle: ['Veículos', 'm'], Saga: ['Sagas', 'f'], Treasure: ['Tesouros', 'm'], Food: ['Comidas', 'f'],
  Clue: ['Pistas', 'f'], Gate: ['Portões', 'm'], Shrine: ['Santuários', 'm'], Desert: ['Desertos', 'm'], Cave: ['Cavernas', 'f'], Elf: ['Elfos', 'm'],
  Goblin: ['Goblins', 'm'], Zombie: ['Zumbis', 'm'], Human: ['Humanos', 'm'], Wizard: ['Magos', 'm'], Dragon: ['Dragões', 'm'], Merfolk: ['Tritões', 'm'],
  Vampire: ['Vampiros', 'm'], Spirit: ['Espíritos', 'm'], Soldier: ['Soldados', 'm'], Angel: ['Anjos', 'm'], Cleric: ['Clérigos', 'm'], Warrior: ['Guerreiros', 'm'],
  Knight: ['Cavaleiros', 'm'], Beast: ['Feras', 'f'], Dinosaur: ['Dinossauros', 'm'], Cat: ['Gatos', 'm'], Myr: ['Myr', 'm'], Rat: ['Ratos', 'm'],
  Faerie: ['Fadas', 'f'], Rogue: ['Ladinos', 'm'], Pirate: ['Piratas', 'm'], Ninja: ['Ninjas', 'm'], Giant: ['Gigantes', 'm'], Insect: ['Insetos', 'm'],
  Squirrel: ['Esquilos', 'm'], Wolf: ['Lobos', 'm'], Demon: ['Demônios', 'm'], Horror: ['Horrores', 'm'], Eldrazi: ['Eldrazi', 'm'], Sliver: ['Fractius', 'm'],
  Construct: ['Constructos', 'm'], Thopter: ['Topteros', 'm'], Ally: ['Aliados', 'm'], Snake: ['Serpentes', 'f'],
};
/** Tipos de carta no singular, para "cartas de criatura" e "não terreno". */
const CARD_TYPE: Record<string, string> = {
  Creature: 'criatura', Land: 'terreno', Artifact: 'artefato', Enchantment: 'encantamento', Planeswalker: 'planeswalker', Battle: 'batalha',
  Instant: 'mágica instantânea', Sorcery: 'feitiço',
};
const KEYWORD: Record<string, string> = {
  Flying: 'voar', Trample: 'atropelar', Defender: 'defensor', Haste: 'ímpeto', Vigilance: 'vigilância', Lifelink: 'vínculo com a vida',
  Deathtouch: 'toque mortífero', Reach: 'alcance', Menace: 'ameaça', Flash: 'lampejo', Hexproof: 'resistência a magia', Indestructible: 'indestrutível',
};
/** Adjetivos no plural (masculino, feminino); o que não varia tem as duas formas iguais. */
const ADJECTIVE: Record<string, [string, string]> = {
  untapped: ['desvirados', 'desviradas'], tapped: ['virados', 'viradas'], attacking: ['atacando', 'atacando'],
  white: ['brancos', 'brancas'], blue: ['azuis', 'azuis'], black: ['pretos', 'pretas'], red: ['vermelhos', 'vermelhas'], green: ['verdes', 'verdes'],
  colorless: ['incolores', 'incolores'], multicolor: ['multicoloridos', 'multicoloridas'], legendary: ['lendários', 'lendárias'], snow: ['da neve', 'da neve'], basic: ['básicos', 'básicas'],
};
const NUMBER_WORD: Record<string, string> = { power: 'poder', toughness: 'resistência', cmc: 'valor de mana' };
const NUMBER_CMP: Record<string, (n: string) => string> = { GE: n => `${n} ou mais`, LE: n => `${n} ou menos`, GT: n => `maior que ${n}`, LT: n => `menor que ${n}`, EQ: n => `igual a ${n}` };

/** "criaturas", "cartas de criatura" (fora do campo), "Lições", ou "permanentes do tipo Kor" quando a mesa não conhece o tipo. */
function noun(type: string, onField: boolean): [string, Gender] {
  if (!onField && CARD_TYPE[type]) return [`cartas de ${CARD_TYPE[type]}`, 'f'];
  return NOUN[type] ?? [`${onField ? 'permanentes' : 'cartas'} do tipo ${type}`, 'f'];
}
function qualified(count: FCount): [string, Gender] {
  const onField = count.zone === 'battlefield';
  const nouns = (count.types?.length ? count.types : ['Card']).map(t => noun(t, onField));
  const gender = nouns[0]![1]; // nouns tem ao menos o 'Card'
  const q = count.qualities ?? [];
  const before = q.includes('other') ? (gender === 'f' ? 'outras ' : 'outros ') : '';
  const after: string[] = [];
  for (const quality of q) {
    if (ADJECTIVE[quality]) after.push(ADJECTIVE[quality][gender === 'f' ? 1 : 0]);
    else if (quality.startsWith('non:')) { const t = quality.slice(4); after.push(`não ${CARD_TYPE[t] ?? ADJECTIVE[t.toLowerCase()]?.[gender === 'f' ? 1 : 0] ?? t}`); }
    else if (quality.startsWith('with:')) after.push(`com ${KEYWORD[quality.slice(5)] ?? quality.slice(5)}`);
    else if (quality === 'token') after.push('que são fichas');
    else if (quality === 'nontoken') after.push('que não são fichas');
    else {
      const m = quality.match(/^(power|toughness|cmc)(GE|LE|GT|LT|EQ)(\d+)$/);
      if (m) { const [, what = '', cmp = '', n = ''] = m; after.push(`com ${NUMBER_WORD[what]} ${NUMBER_CMP[cmp]?.(n)}`); }
    }
  }
  return [`${before}${list(nouns.map(n => n[0]), 'ou')}${after.length ? ` ${after.join(' ')}` : ''}`, gender];
}

/** De quem é a contagem, do ponto de vista de quem olha: "que você controla", "no cemitério de Ana", "em todos os cemitérios". */
function whose(count: FCount, owner?: string) {
  const zone = count.zone ?? 'battlefield';
  const who = count.whose ?? 'all';
  if (zone === 'battlefield') {
    if (who === 'you') return owner ? `que ${owner} controla` : 'que você controla';
    if (who === 'opponents') return owner ? `que os oponentes de ${owner} controlam` : 'que seus oponentes controlam';
    return 'no campo, de todos os jogadores';
  }
  const place = zone === 'graveyard' ? ['cemitério', 'cemitérios'] : ['exílio', 'exílios'];
  if (who === 'you') return owner ? `no ${place[0]} de ${owner}` : `no seu ${place[0]}`;
  if (who === 'opponents') return owner ? `nos ${place[1]} dos oponentes de ${owner}` : `nos ${place[1]} dos seus oponentes`;
  return zone === 'graveyard' ? 'em todos os cemitérios' : 'no exílio, de todos os jogadores';
}
const MEASURE: Record<string, [string, 'de' | 'entre']> = {
  power: ['poder total', 'de'], greatestPower: ['maior poder', 'entre'], toughness: ['resistência total', 'de'], greatestToughness: ['maior resistência', 'entre'],
  manaValue: ['valor de mana total', 'de'], greatestManaValue: ['maior valor de mana', 'entre'], cardTypes: ['tipos de carta', 'entre'],
  names: ['nomes diferentes', 'entre'], colors: ['cores', 'entre'],
};

/**
 * O que é contado, em português: "Lições no seu cemitério", "poder total das criaturas que você controla",
 * "devoção ao azul". `owner` é o nome de quem controla a carta, quando não é quem olha.
 */
export function countSubject(count: FCount, owner?: string) {
  switch (count.of) {
    case 'devotion': return `devoção${owner ? ` de ${owner}` : ''} ao ${list((count.colors ?? []).map(k => COLOR_NAME[k] ?? k))}`;
    case 'hand':
      if (count.whose === 'opponents') return owner ? `cartas nas mãos dos oponentes de ${owner}` : 'cartas nas mãos dos seus oponentes';
      return owner ? `cartas na mão de ${owner}` : 'cartas na sua mão';
    case 'life': return owner ? `pontos de vida de ${owner}` : 'seus pontos de vida';
    case 'domain': return `tipos básicos de terreno entre os terrenos ${owner ? `que ${owner} controla` : 'que você controla'}`;
    default: break;
  }
  const [what, gender] = qualified(count);
  const place = whose(count, owner);
  const measure = count.measure && MEASURE[count.measure];
  if (!measure) return `${what} ${place}`;
  const article = measure[1] === 'de' ? (gender === 'f' ? 'das' : 'dos') : (gender === 'f' ? 'entre as' : 'entre os');
  return `${measure[0]} ${article} ${what} ${place}`;
}

/** O número que importa: o de agora ou, num "quando entra" visto da mão, o de quando ela estiver no campo. */
export const countShown = (count: FCount) => count.entering ?? count.value;
/** O mínimo que liga um efeito (Accumulate Wisdom, o deus de Theros), se houver. */
export function countMinimum(count: FCount) {
  const use = count.uses.find((u): u is Extract<FCountUse, { min: number }> => u.use === 'threshold' || u.use === 'creature');
  return use?.min;
}

function useText(use: FCountUse, count: FCount): string {
  const n = countShown(count);
  switch (use.use) {
    case 'pt': {
      const signed = (v?: string) => !!v && /^[+-]/.test(v);
      if (use.power !== undefined && use.toughness !== undefined) return `${signed(use.power) ? 'Dá' : 'Fica'} ${use.power}/${use.toughness}`;
      if (use.power !== undefined) return signed(use.power) ? `Dá ${use.power} de poder` : `Poder ${use.power}`;
      return signed(use.toughness) ? `Dá ${use.toughness} de resistência` : `Resistência ${use.toughness}`;
    }
    case 'threshold': {
      if (n >= use.min) return `Com ${use.min} ou mais, o efeito extra já vale`;
      const missing = use.min - n;
      return `O efeito extra vale com ${use.min} ou mais (falta${missing > 1 ? 'm' : ''} ${missing})`;
    }
    case 'creature': {
      if (n >= use.min) return `Com ${use.min} ou mais, é criatura`;
      const missing = use.min - n;
      return `Só é criatura com ${use.min} (falta${missing > 1 ? 'm' : ''} ${missing})`;
    }
    case 'damage': return `Causa ${use.amount} de dano${use.plus !== undefined ? ` (${use.plus} + ${n})` : ''}`;
    case 'costLess': return use.others ? `As mágicas afetadas custam ${use.amount} a menos` : `Custa ${use.amount} a menos`;
    case 'costMore': return use.others ? `As mágicas afetadas custam ${use.amount} a mais` : `Custa ${use.amount} a mais`;
    case 'lifeGain': return `Faz ganhar ${use.amount} de vida`;
    case 'lifeLoss': return `Faz perder ${use.amount} de vida`;
    case 'life': return `${use.amount} de vida`;
    case 'draw': return `Compra ${plural(use.amount, 'carta', 'cartas')}`;
    case 'mill': return `Põe ${plural(use.amount, 'carta', 'cartas')} do grimório no cemitério`;
    case 'discard': return `Faz descartar ${plural(use.amount, 'carta', 'cartas')}`;
    case 'pick': return `Põe ${plural(use.amount, 'carta', 'cartas')} na mão`;
    case 'tokens': return `Cria ${plural(use.amount, 'ficha', 'fichas')}`;
    case 'counters': return `Põe ${plural(use.amount, 'marcador', 'marcadores')}`;
    case 'mana': return `Gera ${use.amount} de mana`;
    default: return '';
  }
}

/** A frase do balão e do inspetor: "Lições no seu cemitério: 3. Causa 5 de dano (2 + 3)." */
export function countLabel(count: FCount, owner?: string) {
  const entering = count.entering !== undefined && count.entering !== count.value ? `; ${count.entering} quando ela entrar` : '';
  const effects = count.uses.map(u => useText(u, count)).filter(Boolean);
  return `${capital(countSubject(count, owner))}: ${count.value}${entering}.${effects.length ? ` ${effects.join('. ')}.` : ''}`;
}

const TALLY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h2v16H5zm4 0h2v16H9zm4 0h2v16h-2zm4 0h2v16h-2zM2.6 16.4 20.4 6.6l1 1.8-17.8 9.8z" fill="currentColor"/></svg>';

/** Os selos das contagens da carta: o ícone (ou as cores da devoção) e o número; "2/3" quando há um mínimo, verde quando já vale. */
export function countSeals(c: Pick<FCard, 'counts' | 'controller'>, playerName?: (id: number) => string, you?: number): CountSeal[] {
  const owner = you !== undefined && c.controller !== undefined && c.controller !== you && playerName ? playerName(c.controller) : undefined;
  return (c.counts ?? []).map(count => {
    const n = countShown(count), min = countMinimum(count);
    const met = min !== undefined && n >= min;
    const devotion = count.of === 'devotion';
    const icon = devotion ? (count.colors ?? []).map(k => pip(k)).join('') : TALLY;
    const kind = `${devotion ? 'devotion' : 'count'}${met ? ' met' : ''}` as CountSeal['kind'];
    return { kind, html: `${icon}${n}${min !== undefined ? `/${min}` : ''}`, label: countLabel(count, owner) };
  });
}

/** Os selos fora do campo (mão, pilha, zona de comando), num canto da carta; o texto fica no balão e no inspetor. */
export function countSealsHTML(c: Pick<FCard, 'counts' | 'controller'>, playerName?: (id: number) => string, you?: number) {
  const seals = countSeals(c, playerName, you);
  return seals.length ? `<span class="count-seals">${seals.map(s => `<span class="fx-seal ${s.kind}" title="${esc(s.label)}">${s.html}</span>`).join('')}</span>` : '';
}
