import type { PresentationEvent } from './presentationTimeline';

/**
 * Como desenhar um dano, só a partir do que a ponte diz no evento (nunca do texto da carta):
 * golpe (combate), projétil (mágica ou habilidade) ou dor (dano a si mesmo), o número e os selos.
 */
export interface DamageLook {
  motion: 'strike' | 'bolt' | 'self';
  /** Texto do número flutuante: "−3", "−2/−2", "+2 veneno". */
  amount: string;
  tone: 'damage' | 'wither' | 'poison' | 'loyalty' | 'shield' | 'protection' | 'drain';
  badges: string[];
  deathtouch: boolean;
  lethal: boolean;
  /** Dano grande ou letal no jogador: número maior e um tremor leve da mesa. */
  heavy: boolean;
}

export const HEAVY_DAMAGE = 5;
/** Golpe que não passou: gasto num escudo de prevenção ou segurado pela proteção do jogador. */
export const heldLook = (look: Pick<DamageLook, 'tone'>) => look.tone === 'shield' || look.tone === 'protection';

export function damageLook(event: PresentationEvent): DamageLook {
  const n = Math.abs(event.delta ?? 0);
  const toPlayer = !!event.targets?.players?.length;
  const tone = event.loss ? 'drain' : event.protection ? 'protection' : event.prevented ? 'shield' : event.infect && toPlayer ? 'poison' : event.wither ? 'wither' : event.loyalty ? 'loyalty' : 'damage';
  const amount = tone === 'poison' ? `+${n} veneno` : tone === 'wither' ? `−${n}/−${n}` : `−${n}`;
  const badges: string[] = [];
  if (event.protection) badges.push('Proteção');
  else if (event.prevented) badges.push('Prevenido');
  if ((event.divided ?? 0) > 1) badges.push('Dividido');
  if (event.combat && event.step === 'first-strike') badges.push(event.doubleStrike ? '1º golpe' : 'Iniciativa');
  else if (event.combat && event.doubleStrike) badges.push('2º golpe');
  if (event.trample) badges.push('Atropelar');
  if (event.commander) badges.push('Comandante');
  if (event.lifelink) badges.push('Vínculo com a vida');
  if (event.fight) badges.push('Luta');
  const lethal = !!event.lethal && !event.prevented;
  return {
    motion: event.self ? 'self' : event.combat || event.fight ? 'strike' : 'bolt',
    amount, tone, badges, deathtouch: !!event.deathtouch && !toPlayer, lethal,
    heavy: !event.prevented && (n >= HEAVY_DAMAGE || (lethal && toPlayer)),
  };
}

/**
 * Perder vida por uma carta (Exsanguinate, Blood Artist, Yuriko): o mesmo passo de um dano no retrato de quem perde,
 * com o tom de dreno; perder vida sem fonte (pagar vida) fica de fora.
 */
export function lossAsDamage(event: PresentationEvent): PresentationEvent | null {
  if (event.type !== 'life-changed' || !event.loss || (event.delta ?? 0) >= 0 || event.actor === undefined) return null;
  return { ...event, type: 'damage', targets: { players: [event.actor] } };
}

/** Texto para o histórico e o leitor de tela, com o que muda o golpe. */
export function damageDetail(event: PresentationEvent) {
  const look = damageLook(event);
  const parts = [...look.badges];
  if (look.deathtouch) parts.push('Toque mortífero');
  if (look.tone === 'wither') parts.push('marcadores −1/−1');
  return parts.length ? ` (${parts.join(', ')})` : '';
}
