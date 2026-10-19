import type { PresentationEvent } from './presentationTimeline';

/**
 * Como desenhar um dano, só a partir do que a ponte diz no evento (nunca do texto da carta):
 * golpe (combate), projétil (mágica ou habilidade) ou dor (dano a si mesmo), o número e os selos.
 */
export interface DamageLook {
  motion: 'strike' | 'bolt' | 'self';
  /** Texto do número flutuante: "−3", "−2/−2", "+2 veneno". */
  amount: string;
  tone: 'damage' | 'wither' | 'poison' | 'loyalty' | 'shield';
  badges: string[];
  deathtouch: boolean;
  lethal: boolean;
  /** Dano grande ou letal no jogador: número maior e um tremor leve da mesa. */
  heavy: boolean;
}

export const HEAVY_DAMAGE = 5;

export function damageLook(event: PresentationEvent): DamageLook {
  const n = Math.abs(event.delta ?? 0);
  const toPlayer = !!event.targets?.players?.length;
  const tone = event.prevented ? 'shield' : event.infect && toPlayer ? 'poison' : event.wither ? 'wither' : event.loyalty ? 'loyalty' : 'damage';
  const amount = tone === 'poison' ? `+${n} veneno` : tone === 'wither' ? `−${n}/−${n}` : `−${n}`;
  const badges: string[] = [];
  if (event.prevented) badges.push('Prevenido');
  if ((event.divided ?? 0) > 1) badges.push('Dividido');
  if (event.combat && event.step === 'first-strike') badges.push(event.doubleStrike ? '1º golpe' : 'Iniciativa');
  else if (event.combat && event.doubleStrike) badges.push('2º golpe');
  if (event.trample) badges.push('Atropelar');
  if (event.commander) badges.push('Comandante');
  if (event.lifelink) badges.push('Vínculo com a vida');
  const lethal = !!event.lethal && !event.prevented;
  return {
    motion: event.self ? 'self' : event.combat ? 'strike' : 'bolt',
    amount, tone, badges, deathtouch: !!event.deathtouch && !toPlayer, lethal,
    heavy: !event.prevented && (n >= HEAVY_DAMAGE || (lethal && toPlayer)),
  };
}

/** Texto para o histórico e o leitor de tela, com o que muda o golpe. */
export function damageDetail(event: PresentationEvent) {
  const look = damageLook(event);
  const parts = [...look.badges];
  if (look.deathtouch) parts.push('Toque mortífero');
  if (look.tone === 'wither') parts.push('marcadores −1/−1');
  return parts.length ? ` (${parts.join(', ')})` : '';
}
