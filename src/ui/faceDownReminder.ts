import type { FCard } from '../forge/client';

export type FaceDownKind = NonNullable<FCard['faceDownKind']>;

/** Como a permanente foi virada para baixo, no balão, no selo e no inspetor. */
export const FACE_DOWN_LABEL: Record<FaceDownKind, string> = { morph: 'Metamorfose', disguise: 'Disfarce', manifest: 'Manifestada', cloak: 'Encoberta' };

/**
 * Cartas de lembrete impressas para cobrir uma criatura virada para baixo, conferidas no Scryfall em 31/10/2026:
 * Morph (MKC 30, tmkc/30), Manifest (MKC 29, tmkc/29, que vale também para manifestar pavor) e A Mysterious
 * Creature (MKM 21, tmkm/21), a mesma para disfarce e encobrir. O endereço fixo em cards.scryfall.io (pelo id do
 * Scryfall) não depende de busca e entra no mesmo cache de imagens das outras cartas.
 */
const REMINDER: Record<FaceDownKind, { id: string; text: string }> = {
  morph: { id: '5430da88-b72e-4d64-bd3c-b21062cac1c2', text: 'Uma carta com metamorfose pode ser desvirada a qualquer momento pelo custo de metamorfose dela.' },
  manifest: { id: '7b010eeb-1304-4e0b-9eff-3e4561b67396', text: 'Uma carta de criatura manifestada pode ser desvirada a qualquer momento pelo custo de mana dela. Uma carta virada para baixo também pode ser desvirada pelo custo de metamorfose ou de disfarce dela.' },
  disguise: { id: '241b3b6d-a25f-4a43-b5d6-1d1079e7e498', text: 'Tem resguardo {2}. Uma carta com disfarce pode ser desvirada a qualquer momento pelo custo de disfarce dela.' },
  cloak: { id: '241b3b6d-a25f-4a43-b5d6-1d1079e7e498', text: 'Tem resguardo {2}. Uma carta de criatura encoberta pode ser desvirada a qualquer momento pelo custo de mana dela, ou pelo custo de metamorfose ou de disfarce, se tiver.' },
};

export interface FaceDownReminder {
  kind: FaceDownKind;
  label: string;
  /** O que a carta de lembrete diz, em português. */
  text: string;
  small: string;
  normal: string;
  art: string;
}

const url = (version: string, id: string) => `https://cards.scryfall.io/${version}/front/${id[0]}/${id[1]}/${id}.jpg`;

/** A carta de lembrete de uma permanente virada para baixo, quando a ponte diz como ela foi virada. */
export function faceDownReminder(c: Pick<FCard, 'faceDown' | 'faceDownKind'>): FaceDownReminder | undefined {
  const kind = c.faceDown ? c.faceDownKind : undefined;
  const r = kind && REMINDER[kind];
  if (!kind || !r) return undefined;
  return { kind, label: FACE_DOWN_LABEL[kind], text: r.text, small: url('small', r.id), normal: url('normal', r.id), art: url('art_crop', r.id) };
}
