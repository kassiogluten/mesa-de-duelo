// Nomes dos marcadores e das palavras-chave que aparecem nas cartas do campo.
import type { FCard } from '../forge/client';
import { playerCounterName } from './playerCounters';

const CARD_COUNTERS: Record<string, string> = {
  P1P1: '+1/+1', M1M1: '−1/−1', LOYALTY: 'Lealdade', DEFENSE: 'Defesa', SHIELD: 'Escudo', STUN: 'Atordoamento',
  TIME: 'Tempo', CHARGE: 'Carga', LORE: 'Saga', OIL: 'Óleo', AGE: 'Idade', FADE: 'Desvanecer', FLOOD: 'Inundação',
  DIVINITY: 'Divindade', QUEST: 'Missão', LEVEL: 'Nível', FINALITY: 'Finalidade', BOUNTY: 'Recompensa',
};
/** Marcadores de palavra-chave que não aparecem como palavra-chave no campo. */
const OTHER_KEYWORD_COUNTERS: Record<string, string> = { EXALTED: 'Exaltado' };
/**
 * A palavra-chave de um marcador de palavra-chave (Indominus Rex, Alpha, Ikoria): o servidor manda o nome do Forge
 * ("Flying", "First Strike", "Hexproof:Card.Black:black"); vira a chave das palavras-chave da carta (FLYING).
 */
export function counterKeyword(type: string) {
  const key = type.split(':')[0]!.trim().toUpperCase().replaceAll(' ', '_');
  return KEYWORD_LABEL[key] || OTHER_KEYWORD_COUNTERS[key] ? key : undefined;
}
/** Nome de um marcador de permanente, em português. */
export function counterName(type: string) {
  const keyword = counterKeyword(type);
  return CARD_COUNTERS[type] ?? (keyword ? KEYWORD_LABEL[keyword] ?? OTHER_KEYWORD_COUNTERS[keyword] : undefined) ?? playerCounterName(type);
}

export const COUNTER_LABEL: Record<string, string> = { P1P1: '+1/+1', M1M1: '-1/-1', LOYALTY: 'Lealdade', SHIELD: 'Escudo', STUN: 'Atordoar' };
export const counterLabel = (k: string) => COUNTER_LABEL[k] ?? counterName(k);

/** Palavras-chave que viram marcador na carta do campo. */
export const KEYWORD_LABEL: Record<string, string> = {
  FLYING: 'Voar', REACH: 'Alcance', TRAMPLE: 'Atropelar', MENACE: 'Ameaçar', FIRST_STRIKE: 'Iniciativa',
  DOUBLE_STRIKE: 'Golpe duplo', DEATHTOUCH: 'Toque mortífero', LIFELINK: 'Vínculo com a vida', VIGILANCE: 'Vigilância',
  HASTE: 'Ímpeto', DEFENDER: 'Defensor', HEXPROOF: 'Resistência à magia', SHROUD: 'Manto', WARD: 'Proteção contra alvos',
  INDESTRUCTIBLE: 'Indestrutível', PROTECTION: 'Proteção', INTIMIDATE: 'Intimidar', FEAR: 'Medo', SHADOW: 'Sombra',
  SKULK: 'Sorrateiro', HORSEMANSHIP: 'Equitação', LANDWALK: 'Travessia',
};
/** A regra das evasões que limitam quem bloqueia: vai no balão do selo, que nem todo jogador conhece. */
const KEYWORD_RULE: Record<string, string> = {
  INTIMIDATE: 'Só pode ser bloqueada por criaturas de artefato ou que tenham uma cor em comum com ela.',
  FEAR: 'Só pode ser bloqueada por criaturas de artefato ou pretas.',
  SHADOW: 'Só pode bloquear ou ser bloqueada por criaturas com sombra.',
  SKULK: 'Não pode ser bloqueada por criaturas com poder maior que o dela.',
  HORSEMANSHIP: 'Só pode ser bloqueada por criaturas com equitação.',
};
/** Tipo de terreno da travessia ("Swamp", "Land.Legendary", "Forest.Snow"), como nas cartas em português: "pântano". */
const LAND: Record<string, [string, 'm' | 'f']> = {
  Swamp: ['pântano', 'm'], Island: ['ilha', 'f'], Forest: ['floresta', 'f'], Mountain: ['montanha', 'f'], Plains: ['planície', 'f'],
  Desert: ['deserto', 'm'], Land: ['terreno', 'm'],
};
const LAND_TRAIT: Record<string, string> = { Snow: 'da neve', Legendary: 'lendário', nonBasic: 'não básico' };
export function landwalkLand(spec: string) {
  const [type = '', ...traits] = spec.split('.');
  const land = LAND[type];
  if (!land) return { name: spec.toLowerCase(), article: 'um' };
  return { name: [land[0], ...traits.map(t => LAND_TRAIT[t] ?? t.toLowerCase())].join(' '), article: land[1] === 'f' ? 'uma' : 'um' };
}
const orList = (items: string[], last: string) => items.length > 1 ? `${items.slice(0, -1).join(', ')} ${last} ${items.at(-1)}` : items[0] ?? '';
/** Nome da palavra-chave nesta carta: a travessia diz de quê ("Travessia de pântano"). */
export function keywordName(c: Pick<FCard, 'landwalk'>, k: string) {
  if (k === 'LANDWALK' && c.landwalk?.length) return `Travessia de ${orList(c.landwalk.map(l => landwalkLand(l).name), 'e de')}`;
  return KEYWORD_LABEL[k] ?? k;
}
/** A regra que vai no balão do selo, quando a palavra-chave tem uma (só as evasões que limitam quem bloqueia). */
export function keywordRule(c: Pick<FCard, 'landwalk'>, k: string) {
  if (k === 'LANDWALK') return c.landwalk?.length ? `Não pode ser bloqueada enquanto o jogador que defende controlar ${orList(c.landwalk.map(l => { const land = landwalkLand(l); return `${land.article} ${land.name}`; }), 'ou')}.` : undefined;
  return KEYWORD_RULE[k];
}
export const keywordsOf = (c: FCard) => (c.keywords ?? []).filter(k => KEYWORD_LABEL[k]);
/** As que protegem a permanente: valem em qualquer uma (planeswalker, artefato), não só nas criaturas. */
const PROTECTIVE = new Set(['HEXPROOF', 'SHROUD', 'WARD', 'INDESTRUCTIBLE', 'PROTECTION']);
/** Palavras-chave mostradas no campo: todas numa criatura; nas outras permanentes, só as de proteção (Voar não muda nada nelas). */
export const fieldKeywordsOf = (c: FCard) => c.creature ? keywordsOf(c) : keywordsOf(c).filter(k => PROTECTIVE.has(k));
