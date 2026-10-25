import type { FCard } from '../forge/client';
import { esc, manaHTML, pip } from './cardtext';

/**
 * Efeitos contínuos de uma permanente no campo (item 17 do roadmap): uma moldura e um brilho no máximo, escolhidos
 * por importância, mais detalhes na base e selos embaixo da carta. Tudo fica na borda ou fora da carta, para não
 * cobrir nome, custo nem P/T; o movimento (pulsar, correr) só existe sem "reduzir movimento" (no CSS).
 */
export interface PermanentFx {
  frame?: 'indestructible' | 'ward' | 'protection' | 'menace' | 'defender' | 'token';
  glow?: 'hexproof' | 'shroud' | 'lifelink' | 'enchanted' | 'plus' | 'minus';
  base: ('deathtouch' | 'haste' | 'chained')[];
  /** Detalhes na borda esquerda: olho (vigilância), pegadas (atropelar) e espada/escudo riscados (não pode atacar/bloquear). */
  corner: ('vigilance' | 'trample' | 'no-attack' | 'no-block')[];
  seals: { kind: 'ward' | 'protection' | 'prevent' | 'face-down'; html: string; label: string }[];
  phased: boolean;
  targeted?: 'mine' | 'theirs';
  sick: boolean;
  /** "não pode atacar", "não pode bloquear" ou os dois. */
  restricted?: string;
}

const COLOR_PIP: Record<string, string> = { white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' };
const PROTECTION_LABEL: Record<string, string> = {
  white: 'branco', blue: 'azul', black: 'preto', red: 'vermelho', green: 'verde', artifact: 'artefatos', artifacts: 'artefatos',
  creature: 'criaturas', creatures: 'criaturas', multicolored: 'multicoloridas', monocolored: 'monocoloridas', everything: 'tudo',
  colorless: 'incolores', instant: 'instantâneas', sorcery: 'feitiços', enchantment: 'encantamentos', planeswalker: 'planeswalkers',
};
const FACE_DOWN_LABEL: Record<string, string> = { morph: 'Metamorfose', disguise: 'Disfarce', manifest: 'Manifestada', cloak: 'Encoberta' };
const AURA_COLOR: Record<string, string> = { W: '#f4e7b8', U: '#5aa9e6', B: '#a284c9', R: '#ef6a4f', G: '#5cbf74', M: '#f2b54c', C: '#c3c8d2', L: '#c3c8d2' };
/** Cor do brilho da carta encantada: a cor da aura (dourado se tiver várias cores). */
export function auraColor(manaCost = '') {
  const colors = new Set(manaCost.match(/[WUBRG]/g) ?? []);
  return AURA_COLOR[colors.size > 1 ? 'M' : [...colors][0] ?? 'C'];
}
export const protectionLabel = (from: string) => PROTECTION_LABEL[from] ?? from;

export function permanentFx(c: FCard, context: { targeted?: 'mine' | 'theirs'; enchanted?: boolean } = {}): PermanentFx {
  const k = new Set(c.keywords ?? []);
  const has = (name: string) => k.has(name);
  const p1 = c.counters?.P1P1 ?? 0, m1 = c.counters?.M1M1 ?? 0;
  const frame = has('INDESTRUCTIBLE') ? 'indestructible' : has('WARD') ? 'ward' : has('PROTECTION') ? 'protection'
    : c.creature && has('MENACE') ? 'menace' : c.creature && has('DEFENDER') ? 'defender' : c.token ? 'token' : undefined;
  const glow = has('HEXPROOF') ? 'hexproof' : has('SHROUD') ? 'shroud' : c.creature && has('LIFELINK') ? 'lifelink'
    : context.enchanted ? 'enchanted' : p1 > m1 ? 'plus' : m1 > p1 ? 'minus' : undefined;
  const base: PermanentFx['base'] = [];
  if (c.creature && has('DEATHTOUCH')) base.push('deathtouch');
  if (c.creature && has('HASTE') && c.sick) base.push('haste');
  if (c.creature && (c.cantAttack || c.cantBlock)) base.push('chained');
  const corner: PermanentFx['corner'] = c.creature ? (['VIGILANCE', 'TRAMPLE'] as const).filter(has).map(k => k === 'VIGILANCE' ? 'vigilance' : 'trample') : [];
  if (c.creature && c.cantAttack) corner.push('no-attack');
  if (c.creature && c.cantBlock) corner.push('no-block');
  const seals: PermanentFx['seals'] = [];
  if (has('WARD')) seals.push({ kind: 'ward', html: `Ward ${c.ward?.startsWith('{') ? manaHTML(c.ward) : esc(c.ward ?? '')}`, label: `Proteção contra alvos${c.ward ? `: ${c.ward}` : ''}` });
  if (c.protection?.length) {
    const pips = c.protection.filter(p => COLOR_PIP[p]).map(p => pip(COLOR_PIP[p])).join('');
    const words = c.protection.filter(p => !COLOR_PIP[p]).map(protectionLabel).join(', ');
    seals.push({ kind: 'protection', html: `Prot. ${pips}${words ? `${pips ? ' ' : ''}${esc(words)}` : ''}`, label: `Proteção contra ${c.protection.map(protectionLabel).join(', ')}` });
  }
  if (c.preventDamage) seals.push({ kind: 'prevent', html: `Prevenir ${c.preventDamage}`, label: `Previne os próximos ${c.preventDamage} de dano` });
  if (c.faceDown) {
    const kind = c.faceDownKind && FACE_DOWN_LABEL[c.faceDownKind];
    seals.push({ kind: 'face-down', html: kind ? `${kind} 2/2` : '2/2', label: `Virada para baixo${kind ? ` (${kind})` : ''}, 2/2` });
  }
  const restricted = c.cantAttack && c.cantBlock ? 'não pode atacar nem bloquear' : c.cantAttack ? 'não pode atacar' : c.cantBlock ? 'não pode bloquear' : undefined;
  return { frame, glow, base, corner, seals, phased: !!c.phasedOut, targeted: context.targeted, sick: !!(c.creature && c.sick), restricted };
}

/** Classes da carta e o HTML dos efeitos (desenhados atrás ou na borda da carta, sem receber clique). */
export function permanentFxHTML(fx: PermanentFx, auraColor?: string) {
  const classes = [fx.phased ? 'fx-phased' : '', fx.sick ? 'fx-sick' : '', fx.targeted ? `fx-targeted ${fx.targeted}` : ''].filter(Boolean);
  const parts = [
    fx.glow ? `<span class="fx-glow ${fx.glow}"${fx.glow === 'enchanted' && auraColor ? ` style="--aura:${auraColor}"` : ''} aria-hidden="true"></span>` : '',
    fx.frame ? `<span class="fx-frame ${fx.frame}" aria-hidden="true"></span>` : '',
    ...fx.base.map(b => `<span class="fx-base ${b}" aria-hidden="true"></span>`),
    fx.corner.length ? `<span class="fx-corner" aria-hidden="true">${fx.corner.map(k => `<i class="${k}"></i>`).join('')}</span>` : '',
    fx.targeted ? '<span class="fx-crosshair" aria-hidden="true"></span>' : '',
    fx.seals.length ? `<span class="fx-seals">${fx.seals.map(seal => `<span class="fx-seal ${seal.kind}" title="${esc(seal.label)}">${seal.html}</span>`).join('')}</span>` : '',
  ];
  return { classes, html: parts.join('') };
}

/** Texto para o leitor de tela: o que os efeitos mostram e as palavras-chave não dizem. */
export function permanentFxText(fx: PermanentFx) {
  return [...fx.seals.map(s => s.label), fx.phased ? 'fora de fase' : '', fx.restricted ?? '',
    fx.targeted ? 'alvo de algo na pilha' : ''].filter(Boolean).join(', ');
}
