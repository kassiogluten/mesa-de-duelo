/**
 * Os links que abrem a página já num lugar: convite (?sala=MESA) e "Criar sala" vindo da página Salas (?criar-sala=1).
 * `search` é o que fica no endereço depois de tirá-los, para recarregar a página não entrar de novo.
 */
export function startupLinks(search: string) {
  const params = new URLSearchParams(search);
  const room = params.get('sala')?.trim().toUpperCase();
  const createRoom = params.has('criar-sala');
  params.delete('sala'); params.delete('criar-sala');
  return { room, createRoom, search: params.size ? `?${params}` : '' };
}
