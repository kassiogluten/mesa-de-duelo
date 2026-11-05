/** Imagens já pedidas nesta visita: cada endereço uma vez só. */
const preloaded = new Set<string>();
function loadImage(url: string): Promise<void> {
  return new Promise(resolve => {
    const img = new Image();
    img.decoding = 'async';
    (img as HTMLImageElement & { fetchPriority?: string }).fetchPriority = 'low';
    img.onload = img.onerror = () => resolve();
    img.src = url;
  });
}

/**
 * Baixa as imagens aos poucos (poucas de cada vez, com prioridade baixa) para que fiquem no cache
 * do navegador antes da partida. Cada endereço é pedido uma vez por sessão; falhas são ignoradas.
 * Devolve quantas imagens foram pedidas.
 */
export async function preloadImages(urls: string[], load: (url: string) => Promise<void> = loadImage, parallel = 4): Promise<number> {
  const todo = [...new Set(urls)].filter(u => !preloaded.has(u));
  todo.forEach(u => preloaded.add(u));
  let next = 0;
  const worker = async () => {
    while (next < todo.length) {
      const url = todo[next++];
      try { await load(url); } catch { preloaded.delete(url); }
    }
  };
  await Promise.all(Array.from({ length: Math.min(parallel, todo.length) }, worker));
  return todo.length;
}
