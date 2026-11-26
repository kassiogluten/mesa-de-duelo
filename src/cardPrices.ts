// Preço de cada carta em reais (menor preço da LigaMagic, shared/card-prices-brl.json), baixado só quando alguém abre uma carta.

/** Uma cotação: o menor preço entre todas as edições e a data dela (AAAA-MM-DD). */
export interface CardPrice { brl: number; date: string; stale: boolean }
type PriceFile = { fonte: string; cartas: Record<string, [number, string]> };

/** Cotação com mais de 30 dias aparece apagada, como antiga. */
export const STALE_DAYS = 30;
let table: Map<string, [number, string]> | null = null;
let loading: Promise<void> | null = null;

/**
 * O nome como a base guarda (norm de ligamagic_scraper/base.py): Æ como "Ae", sem acento, apóstrofo reto, minúsculas
 * e espaços simples.
 */
export function priceKey(name: string) {
  return name.replace(/Æ/g, 'Ae').replace(/æ/g, 'ae').replace(/’/g, "'").normalize('NFKD').replace(/[^\x00-\x7f]/g, '').toLowerCase().split(/\s+/).filter(Boolean).join(' ');
}
/** Monta a busca: cada carta pelo nome inteiro e, nas de duas faces, também pela primeira face. */
export function setCardPrices(data: PriceFile | null) {
  if (!data) { table = null; return; }
  table = new Map();
  for (const [key, value] of Object.entries(data.cartas)) {
    table.set(key, value);
    const front = key.split(' // ')[0]!;
    if (front !== key && !data.cartas[front]) table.set(front, value);
  }
}
/** Baixa o arquivo de preços uma vez; sem rede, a carta só fica sem preço. */
export function loadCardPrices(): Promise<void> {
  loading ??= import('../shared/card-prices-brl.json').then(m => setCardPrices(m.default as unknown as PriceFile)).catch(() => { loading = null; });
  return loading;
}
export const cardPricesLoaded = () => table !== null;
/** A cotação da carta pelo nome em inglês (o inteiro ou a primeira face), ou null se ela não tem preço. */
export function cardPrice(name: string | undefined, today = new Date()): CardPrice | null {
  if (!name || !table) return null;
  const key = priceKey(name);
  const hit = table.get(key) ?? table.get(key.split(' // ')[0]!);
  if (!hit) return null;
  const [brl, date] = hit;
  const limit = new Date(today.getFullYear(), today.getMonth(), today.getDate() - STALE_DAYS);
  const [y = 0, m = 1, d = 1] = date.split('-').map(Number);
  return { brl, date, stale: new Date(y, m - 1, d) < limit };
}
export const brlText = (value: number) => `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** "25/11/2026". */
export const priceDate = (date: string) => date.split('-').reverse().join('/');
