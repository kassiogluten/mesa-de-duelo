# Sugestões do Claude

Roadmap só com sugestões do Claude: funcionalidades, correções e melhorias que ele notou trabalhando no código. Fica separado do `ROADMAP.md`, que é o plano decidido do projeto. Nada aqui foi pedido nem está aprovado. Quando uma sugestão for aceita, ela passa para o `ROADMAP.md`; quando for descartada, sai daqui ou recebe ❌ com o motivo.

Esforço: **P** (poucas horas), **M** (um ou dois dias), **G** (vários dias ou infraestrutura nova).

---

## Correções e robustez

### S1. Cache de cartas no localStorage perto do limite · Correção · M

O cache do Scryfall guarda cada carta no `localStorage` (`scry:v1:…`), uma chave pelo nome e outra para cada face. Com os 58 decks prontos são cerca de 2.650 chaves. O navegador dá uns 5 MB por site, e quando enche o `cachePut` falha sem avisar. A partir daí as cartas novas são buscadas de novo a cada tela, as imagens e traduções somem do cache e os decks salvos (que dividem o mesmo espaço) correm risco.

- [ ] Medir o tamanho atual do cache com todos os decks prontos abertos.
- [ ] Mover o cache de cartas para o IndexedDB (sem limite prático) e deixar o `localStorage` só para decks e preferências.
- [ ] Guardar as faces como apelido (só o nome da carta inteira) em vez de cópias completas.
- [ ] Limpar cartas que não aparecem em nenhum deck há muito tempo.

### S2. Primeira carga de preços lenta e sem progresso · Melhoria · P

Na primeira vez depois da 0.29.0, cada carta em cache busca o preço uma vez. Com todos os decks isso levou cerca de um minuto no teste, e a tela só atualiza no fim: até lá os cartões ficam sem preço, sem nenhum aviso.

- [ ] Atualizar a tela a cada lote do Scryfall (75 cartas), não só no fim.
- [ ] Buscar primeiro as cartas dos decks visíveis (Meus decks antes dos decks prontos).
- [ ] Um aviso discreto "Atualizando preços…" enquanto a busca roda.

### S3. Falha ao carregar dados na biblioteca não aparece · Correção · P

Quando a busca de cartas falha (sem rede, Scryfall fora), a biblioteca de decks engole o erro; só o editor mostra o aviso. O jogador vê decks sem arte, sem cores e sem preço e não sabe por quê.

- [ ] Mostrar o mesmo aviso na biblioteca, com **Tentar de novo**.

### S4. Testes rodando a cada push · Melhoria · P

O projeto tem 175 testes do frontend, testes da ponte em Java e testes no navegador, mas não tem CI (não há `.github/workflows`). Hoje uma quebra só aparece quando alguém roda os testes à mão.

- [ ] GitHub Actions com `npm run typecheck`, `npm test` e `npm run build` em cada push e PR.
- [ ] Um segundo job com `mvn test` da ponte (precisa do Forge instalado no cache do Maven; dá para guardar como cache do Actions).
- [ ] Conferir que o `version` do `package.json` é igual ao do topo do `CHANGELOG.md`, como pede o `CLAUDE.md`.

---

## Preço dos decks (continuação da 0.29.0)

### S5. Preço por carta e na busca · Funcionalidade · P

O preço já está no cache de cada carta, mas só aparece somado no deck.

- [ ] Mostrar o preço de cada carta na lista do editor (discreto, ao lado da quantidade) e na carta ampliada.
- [ ] Mostrar o preço nos resultados da busca de cartas e permitir ordenar por preço.
- [ ] Destacar as cinco cartas mais caras do deck nas estatísticas.

### S6. Escolher qual preço usar · Melhoria · P

Hoje o preço é o da impressão que o Scryfall devolve pelo nome; só cai para a impressão mais barata quando essa não tem preço. Para quem quer montar o deck de verdade, o mais útil costuma ser o preço da impressão mais barata.

- [ ] Opção "Preço: impressão mais barata / impressão padrão" no construtor (a busca `prefer:usd-low` já existe para o caso sem preço).
- [ ] Em Commander, mostrar à parte o preço do comandante e o total sem o sideboard.

### S7. Filtro e ordenação por preço na biblioteca · Funcionalidade · P

- [ ] Ordenar **Meus decks** e os decks prontos por preço, nome ou data de edição.
- [ ] Filtro "até US$ X" nos decks prontos, para quem quer um deck barato para começar.

---

## Construtor de decks

### S8. Mão de teste · Funcionalidade · P

Não há como ver uma mão inicial do deck sem começar uma partida. A Mesa livre já tem embaralhar, comprar e mulligan (`src/free/sandbox.ts`).

- [ ] Botão **Mão de teste** no editor: compra 7, permite mulligan (London) e "comprar mais uma" para simular os primeiros turnos.
- [ ] Contar quantas vezes saiu uma mão com 2 a 4 terrenos em 1.000 mãos simuladas.

### S9. Cores de mana: símbolos contra fontes · Funcionalidade · M

As estatísticas mostram curva e custo médio, mas não se a base de mana sustenta as cores do deck.

- [ ] Contar os símbolos de cada cor nos custos e as fontes de cada cor nos terrenos (e mana rocks), lado a lado.
- [ ] Aviso quando uma cor tem muitos símbolos e poucas fontes.

### S10. Exportar e importar todos os decks · Funcionalidade · P

Os decks ficam só no navegador. Trocar de aparelho, limpar os dados do site ou usar outro navegador apaga tudo. Hoje existe só a cópia de segurança automática da migração de formato.

- [ ] **Exportar todos os decks** num arquivo `.json` e **Importar decks** a partir dele, sem duplicar os que já existem (pelo `id`).
- [ ] Lembrete discreto para exportar quando o jogador tem muitos decks e nunca exportou.

### S11. Pastas ou etiquetas nos decks · Funcionalidade · M

Com muitos decks a lista fica longa. Filtros por nome e cor já existem.

- [ ] Etiquetas livres ("testando", "casual", "torneio") com filtro.
- [ ] Marcar decks como favoritos, que aparecem primeiro na escolha do deck da partida.

---

## Partida

### S12. Histórico de partidas e vitórias por deck · Funcionalidade · M

Ao fim da partida o resultado se perde.

- [ ] Guardar localmente cada partida: data, formato, deck usado, oponentes (decks e computador ou pessoa), vencedor e número de turnos.
- [ ] Mostrar vitórias e derrotas no cartão do deck e uma tela simples de histórico.

### S13. Gráfico de vida no fim da partida · Funcionalidade · M

- [ ] Registrar a vida de cada jogador no fim de cada turno e mostrar um gráfico no resumo do fim da partida, junto do dano de comandante em Commander.

### S14. Reações rápidas na sala · Funcionalidade · M

As salas não têm nenhuma forma de comunicação. Chat livre traz moderação; reações prontas não.

- [ ] Um conjunto fixo de reações ("Boa jogada", "Pensando…", "Ops", "Bom jogo") que aparecem por alguns segundos ao lado do retrato.
- [ ] Opção para silenciar as reações dos outros.

### S15. Lista de atalhos de teclado · Melhoria · P

A partida já tem atalhos (espaço para passar, teclado no inspetor de cartas, entre outros), mas eles só são descobertos por acaso.

- [ ] Tecla `?` abre uma lista dos atalhos, e o menu de Opções ganha um link para ela.
