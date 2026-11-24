// A arte escolhida para uma carta do deck: grava a série e o número na linha (o que a partida usa para todos verem a mesma arte).
import { entryKey, type DeckData, type DeckEntry } from '../decks';
import type { CardPrint } from './api';

export type DeckSection = 'cards' | 'sideboard' | 'commanders';

/**
 * Troca a impressão da linha `key` da seção (todas as cópias dela). `print` null volta à arte padrão da mesa. Se outra
 * linha da mesma carta já estava nessa impressão, as duas viram uma (somando as cópias), como na importação; os
 * comandantes nunca se juntam. Devolve a chave nova da linha, ou null se nada mudou.
 */
export function choosePrint(deck: DeckData, section: DeckSection, key: string, print: Pick<CardPrint, 'set' | 'cn'> | null): string | null {
  const list = section === 'cards' ? deck.cards : deck[section];
  const index = list?.findIndex(e => entryKey(e) === key) ?? -1;
  if (!list || index < 0) return null;
  const old = list[index]!;
  const next: DeckEntry = { ...old };
  delete next.set; delete next.cn;
  if (print) { next.set = print.set.toLowerCase(); next.cn = print.cn; }
  const newKey = entryKey(next);
  if (newKey === key) return null;
  const same = section === 'commanders' ? -1 : list.findIndex(e => entryKey(e) === newKey);
  if (same >= 0) { list[same] = { ...list[same]!, count: list[same]!.count + old.count }; list.splice(index, 1); }
  else list[index] = next;
  return newKey;
}

/** "Sem borda · Vitrine": o que distingue a impressão, para o jogador achar a que quer. */
export function printTraits(p: CardPrint): string[] {
  const out: string[] = [];
  if (p.border === 'borderless') out.push('Sem borda');
  if (p.fullArt) out.push('Arte cheia');
  if (p.frame?.includes('showcase')) out.push('Vitrine');
  if (p.frame?.includes('extendedart')) out.push('Arte estendida');
  if (p.frame?.includes('etched') || (p.finishes?.length === 1 && p.finishes[0] === 'etched')) out.push('Gravada');
  if (p.promo) out.push('Promo');
  return out;
}

/** "US$ 2,50", ou vazio sem preço. */
export const printPrice = (p: CardPrint) => p.usd ? `US$ ${Number(p.usd).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '';
