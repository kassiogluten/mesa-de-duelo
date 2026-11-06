// Nomes dos marcadores e das palavras-chave que aparecem nas cartas do campo.
import type { FCard } from '../forge/client';
import { counterName } from './proliferate';

export const COUNTER_LABEL: Record<string, string> = { P1P1: '+1/+1', M1M1: '-1/-1', LOYALTY: 'Lealdade', SHIELD: 'Escudo', STUN: 'Atordoar' };
export const counterLabel = (k: string) => COUNTER_LABEL[k] ?? KEYWORD_LABEL[k] ?? counterName(k);

/** Palavras-chave que viram marcador na carta do campo. */
export const KEYWORD_LABEL: Record<string, string> = {
  FLYING: 'Voar', REACH: 'Alcance', TRAMPLE: 'Atropelar', MENACE: 'Ameaçar', FIRST_STRIKE: 'Iniciativa',
  DOUBLE_STRIKE: 'Golpe duplo', DEATHTOUCH: 'Toque mortífero', LIFELINK: 'Vínculo com a vida', VIGILANCE: 'Vigilância',
  HASTE: 'Ímpeto', DEFENDER: 'Defensor', HEXPROOF: 'Resistência à magia', SHROUD: 'Manto', WARD: 'Proteção contra alvos',
  INDESTRUCTIBLE: 'Indestrutível', PROTECTION: 'Proteção',
};
export const keywordsOf = (c: FCard) => (c.keywords ?? []).filter(k => KEYWORD_LABEL[k]);
/** As que protegem a permanente: valem em qualquer uma (planeswalker, artefato), não só nas criaturas. */
const PROTECTIVE = new Set(['HEXPROOF', 'SHROUD', 'WARD', 'INDESTRUCTIBLE', 'PROTECTION']);
/** Palavras-chave mostradas no campo: todas numa criatura; nas outras permanentes, só as de proteção (Voar não muda nada nelas). */
export const fieldKeywordsOf = (c: FCard) => c.creature ? keywordsOf(c) : keywordsOf(c).filter(k => PROTECTIVE.has(k));
