/**
 * Frase curta para a caixa de ação, montada com o que a ponte já manda (carta de origem, tipo de entrada)
 * em vez do texto do Forge, que traz a habilidade inteira e o pedido em inglês ("Select target creature").
 * Sem uma frase conhecida, devolve null e a mesa mostra o texto do Forge como sempre.
 */
export interface ShortInstructionInput {
  message: string;
  paying?: boolean;
  card?: { name?: string };
  targeting?: { card?: { name?: string } };
}

const WORDS: Record<string, string> = {
  creature: 'criatura', creatures: 'criaturas', player: 'jogador', players: 'jogadores',
  planeswalker: 'planeswalker', planeswalkers: 'planeswalkers', permanent: 'permanente', permanents: 'permanentes',
  artifact: 'artefato', artifacts: 'artefatos', enchantment: 'encantamento', enchantments: 'encantamentos',
  land: 'terreno', lands: 'terrenos', spell: 'mágica', spells: 'mágicas', card: 'carta', cards: 'cartas',
  battle: 'batalha', battles: 'batalhas', opponent: 'oponente', opponents: 'oponentes', or: 'ou', and: 'e',
  nonland: 'não terreno', noncreature: 'não criatura', other: 'outra', another: 'outra',
};
const PHRASES: [RegExp, string][] = [
  [/\byou control\b/g, 'que você controla'],
  [/\ban opponent controls\b/g, 'de um oponente'],
  [/\byou don't control\b/g, 'que você não controla'],
];
const COUNTS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

/** Traduz o tipo do alvo ("creature or player"); null se sobrar alguma palavra desconhecida. */
function targetKind(text: string) {
  let out = text.toLowerCase().trim();
  for (const [re, pt] of PHRASES) out = out.replace(re, `§${pt}§`);
  const parts = out.split('§').flatMap((part, i) => i % 2 ? [part] : part.split(/\s+/).filter(Boolean).map(word => WORDS[word] ?? null));
  return parts.some(part => part === null) ? null : parts.join(' ');
}

/** "Select up to two target creatures" → { count: 2, upTo: true, kind: 'criaturas' }. */
function parseTargetRequest(message: string) {
  const line = message.split('\n').map(l => l.trim()).filter(l => /^select\b/i.test(l)).pop();
  if (!line) return null;
  const m = line.match(/^select\s+(up to\s+)?(?:(an?|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+)?(any\s+target|targets?)\s*(.*?)[.:]?$/i);
  if (!m) return null;
  const upTo = !!m[1];
  const raw = (m[2] ?? '').toLowerCase();
  const count = raw === 'a' || raw === 'an' || raw === '' ? 1 : COUNTS[raw] ?? Number(raw);
  const kind = /^any/i.test(m[3]) || !m[4] ? '' : targetKind(m[4]);
  return { count, upTo, kind };
}

function sourceName(input: ShortInstructionInput, translate: (name: string) => string) {
  const engine = input.targeting?.card?.name ?? input.card?.name;
  return engine ? translate(engine) : input.message.match(/^(.+?) \(\d+\)(?: -|\n|$)/)?.[1]?.trim();
}

/** translate: nome da carta no idioma da mesa (o motor manda o nome em inglês). */
export function shortInstruction(input: ShortInstructionInput, translate: (name: string) => string = name => name): string | null {
  const name = sourceName(input, translate);
  if (input.targeting) {
    const request = parseTargetRequest(input.message);
    if (!request) return name ? `Escolha o alvo de ${name}.` : null;
    const how = request.upTo ? `até ${request.count} ${request.count === 1 ? 'alvo' : 'alvos'}` : request.count === 1 ? 'um alvo' : `${request.count} alvos`;
    return `Escolha ${how}${name ? ` para ${name}` : ''}${request.kind ? ` (${request.kind})` : ''}.`;
  }
  if (input.paying) return name ? `Pague o custo de mana de ${name}.` : 'Pague o custo de mana.';
  return null;
}
