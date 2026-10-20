/**
 * O Forge monta o possessivo à moda do inglês mesmo com o texto em português ("Procurar você's grimório",
 * "Olhando as cartas em Oponente's mão"). Aqui ele vira português: "seu grimório", "na mão de Oponente".
 */
const ZONES: Record<string, 'm' | 'f'> = {
  'grimório': 'm', 'mão': 'f', 'cemitério': 'm', 'exílio': 'm', 'campo de batalha': 'm', 'pilha': 'f',
  'zona de comando': 'f', 'biblioteca': 'f', 'library': 'm', 'hand': 'f', 'graveyard': 'm', 'exile': 'm', 'battlefield': 'm',
};
const ZONE = Object.keys(ZONES).sort((a, b) => b.length - a.length).map(z => z.replace(/ /g, '\\s+')).join('|');
const MERGED: Record<string, Record<'m' | 'f', string>> = {
  em: { m: 'no', f: 'na' }, no: { m: 'no', f: 'na' }, na: { m: 'no', f: 'na' },
  de: { m: 'do', f: 'da' }, do: { m: 'do', f: 'da' }, da: { m: 'do', f: 'da' }, para: { m: 'para o', f: 'para a' },
};
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const gender = (z: string) => ZONES[z.toLowerCase().replace(/\s+/g, ' ')] ?? 'm';
const capitalize = (s: string) => s[0].toUpperCase() + s.slice(1);

/** `names`: nomes dos jogadores da partida, para reconhecer nomes com mais de uma palavra ("IA vermelho's mão"). */
export function fixPossessives(text: string, names: readonly string[] = []): string {
  if (!text || !/['’]s\s/.test(text)) return text;
  // Nomes conhecidos primeiro (os mais longos antes), depois "você" e, por fim, qualquer palavra solta.
  const owners = [...names].filter(Boolean).sort((a, b) => b.length - a.length).map(escape);
  const owner = `(${[...owners, 'você', `[^\\s'’,.;:!?()"]+`].join('|')})`;
  const pattern = new RegExp(`(?:\\b(em|de|do|da|no|na|para)\\s+)?${owner}['’]s\\s+(${ZONE})\\b`, 'giu');
  return text.replace(pattern, (_match, prep: string | undefined, who: string, zone: string, offset: number) => {
    const g = gender(zone), you = who.toLowerCase() === 'você';
    const object = you ? `${g === 'f' ? 'sua' : 'seu'} ${zone}` : `${zone} de ${who}`;
    let out = prep ? `${MERGED[prep.toLowerCase()][g]} ${object}` : you ? object : `${g === 'f' ? 'a' : 'o'} ${object}`;
    // Mantém a maiúscula de começo de frase.
    if ((prep ?? who)[0] === (prep ?? who)[0].toUpperCase() && (offset === 0 || /[.!?]\s*$/.test(text.slice(0, offset)))) out = capitalize(out);
    return out;
  });
}
