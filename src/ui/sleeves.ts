/*
 * Verso das cartas na cor de cada jogador (item 85). O servidor sorteia a cor (`sleeve`, de 0 a 7) e a mesa tinge o
 * verso pelas variáveis --sleeve-* da classe `sleeve-N` (veja style.css). Sem cor (pontes antigas), fica o verso de sempre.
 */

export const SLEEVE_VARS = ['--sleeve-light', '--sleeve-mid', '--sleeve-base', '--sleeve-dark', '--sleeve-edge'] as const;

/** " sleeve-3" para juntar ao class de um verso ou de quem o contém; vazio sem cor. */
export function sleeveClass(sleeve: number | undefined): string {
  return Number.isInteger(sleeve) && sleeve! >= 0 && sleeve! < 8 ? ` sleeve-${sleeve}` : '';
}

/** A carta que voa (compra, vidência, embaralhar) leva a cor do monte de onde saiu. */
export function copySleeve(to: HTMLElement, from: Element | null | undefined) {
  if (!from) return;
  const style = getComputedStyle(from);
  for (const name of SLEEVE_VARS) {
    const value = style.getPropertyValue(name).trim();
    if (value) to.style.setProperty(name, value);
  }
}
