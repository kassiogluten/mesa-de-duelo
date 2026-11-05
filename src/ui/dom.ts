// Atalhos de DOM usados pelas telas.

/** `$` de uma tela: procura dentro da raiz dela; o elemento existe (é do próprio HTML da tela). */
export const finder = (root: ParentNode) => <T extends HTMLElement = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
