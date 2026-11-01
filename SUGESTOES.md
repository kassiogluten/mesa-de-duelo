# Sugestões do Claude

Roadmap só com sugestões do Claude: funcionalidades, correções e melhorias que ele notou trabalhando no código. Fica separado do `ROADMAP.md`, que é o plano decidido do projeto. Nada aqui foi pedido nem está aprovado. Quando uma sugestão for aceita, ela passa para o `ROADMAP.md`; quando for descartada, sai daqui ou recebe ❌ com o motivo.

Esforço: **P** (poucas horas), **M** (um ou dois dias), **G** (vários dias ou infraestrutura nova).

## Objetivo

Agradar quem joga: tudo **intuitivo** (sem precisar de explicação), **limpo** (só o que importa na hora) e **imersivo** (a sensação de estar numa mesa de Magic, não num site). Cada sugestão é pesada por isso. As que não servem ao objetivo continuam aqui, mas ficam no fim da fila.

### Ordem sugerida

1. **Primeira impressão**: S14 (partida rápida); S22 e S23 já feitas.
2. **Mesa mais limpa**: S25 (menos selos e ícones soltos na mesa); S24 já feita.
3. **Imersão**: S27 (som ambiente); S18 e S19 já feitas.
4. **Intuitivo sem tutorial**: S28 (dicas na primeira partida), S11 (atalhos), S13 (ver o deck do oponente).
5. **Construtor**: S4, S15, S5, S16.
6. **Fora do foco por enquanto**: S1, S3, S7, S12, S17, S20, S21. São úteis, mas o jogador não sente a diferença no dia a dia (ou o custo é alto para o que muda).

---

## Correções e robustez

### S1. Cache de cartas no localStorage perto do limite · Correção · M · em parte ✅

O cache do Scryfall guarda cada carta no `localStorage` (`scry:v1:…`), uma chave pelo nome e outra para cada face. Com os 58 decks prontos são cerca de 2.650 chaves. O navegador dá uns 5 MB por site, e quando enche o `cachePut` falha sem avisar. A partir daí as cartas novas são buscadas de novo a cada tela, as imagens e traduções somem do cache e os decks salvos (que dividem o mesmo espaço) correm risco.

Aceita em parte e feita na v0.30.0 (registrada no item 10 do `ROADMAP.md`): o cache foi para o IndexedDB e as cartas antigas migram sozinhas. Sem o limite de 5 MB, a medição perdeu o sentido. Ficam as duas otimizações abaixo.

- [x] ~~Medir o tamanho atual do cache com todos os decks prontos abertos.~~ Desnecessário depois da mudança para o IndexedDB.
- [x] Mover o cache de cartas para o IndexedDB (sem limite prático) e deixar o `localStorage` só para decks e preferências.
- [ ] Guardar as faces como apelido (só o nome da carta inteira) em vez de cópias completas.
- [ ] Limpar cartas que não aparecem em nenhum deck há muito tempo.

### S2. Falha ao carregar dados na biblioteca não aparece · Correção · P

Quando a busca de cartas falha (sem rede, Scryfall fora), a biblioteca de decks engole o erro; só o editor mostra o aviso. O jogador vê decks sem arte e sem cores e não sabe por quê.

- [ ] Mostrar o mesmo aviso na biblioteca, com **Tentar de novo**.

### S3. Testes rodando a cada push · Melhoria · P

O projeto tem 175 testes do frontend, testes da ponte em Java e testes no navegador, mas não tem CI (não há `.github/workflows`). Hoje uma quebra só aparece quando alguém roda os testes à mão.

- [ ] GitHub Actions com `npm run typecheck`, `npm test` e `npm run build` em cada push e PR.
- [ ] Um segundo job com `mvn test` da ponte (precisa do Forge instalado no cache do Maven; dá para guardar como cache do Actions).
- [ ] Conferir que o `version` do `package.json` é igual ao do topo do `CHANGELOG.md`, como pede o `CLAUDE.md`.

---

## Construtor de decks

### S4. Mão de teste · Funcionalidade · P

Não há como ver uma mão inicial do deck sem começar uma partida. A Mesa livre já tem embaralhar, comprar e mulligan (`src/free/sandbox.ts`).

- [ ] Botão **Mão de teste** no editor: compra 7, permite mulligan (London) e "comprar mais uma" para simular os primeiros turnos.
- [ ] Contar quantas vezes saiu uma mão com 2 a 4 terrenos em 1.000 mãos simuladas.

### S5. Cores de mana: símbolos contra fontes · Funcionalidade · M

As estatísticas mostram curva e custo médio, mas não se a base de mana sustenta as cores do deck.

- [ ] Contar os símbolos de cada cor nos custos e as fontes de cada cor nos terrenos (e mana rocks), lado a lado.
- [ ] Aviso quando uma cor tem muitos símbolos e poucas fontes.

### S6. Exportar e importar todos os decks · Funcionalidade · P · em parte ✅

Quem entra com a conta Google já tem os decks guardados no servidor (item 44 do `ROADMAP.md`). Continua valendo para quem joga sem conta.

Os decks ficam só no navegador. Trocar de aparelho, limpar os dados do site ou usar outro navegador apaga tudo. Hoje existe só a cópia de segurança automática da migração de formato.

- [ ] **Exportar todos os decks** num arquivo `.json` e **Importar decks** a partir dele, sem duplicar os que já existem (pelo `id`).
- [ ] Lembrete discreto para exportar quando o jogador tem muitos decks e nunca exportou.

### S7. Pastas ou etiquetas nos decks · Funcionalidade · M

Com muitos decks a lista fica longa. Filtros por nome e cor já existem.

- [ ] Etiquetas livres ("testando", "casual", "torneio") com filtro.
- [ ] Marcar decks como favoritos, que aparecem primeiro na escolha do deck da partida.

---

## Partida

### S8. Histórico de partidas e vitórias por deck · Funcionalidade · M · ✅

Feita como item 65 do `ROADMAP.md` (0.100.0), na conta em vez de no aparelho: a tela **Minhas partidas** tem a lista e as vitórias por deck, formato e oponente. Fica de fora quem joga sem conta.

Ao fim da partida o resultado se perde.

- [ ] Guardar localmente cada partida: data, formato, deck usado, oponentes (decks e computador ou pessoa), vencedor e número de turnos.
- [ ] Mostrar vitórias e derrotas no cartão do deck e uma tela simples de histórico.

### S9. Gráfico de vida no fim da partida · Funcionalidade · M

- [ ] Registrar a vida de cada jogador no fim de cada turno e mostrar um gráfico no resumo do fim da partida, junto do dano de comandante em Commander.

### S10. Reações rápidas na sala · Funcionalidade · M

As salas não têm nenhuma forma de comunicação. Chat livre traz moderação; reações prontas não.

- [ ] Um conjunto fixo de reações ("Boa jogada", "Pensando…", "Ops", "Bom jogo") que aparecem por alguns segundos ao lado do retrato.
- [ ] Opção para silenciar as reações dos outros.

### S11. Lista de atalhos de teclado · Melhoria · P

A partida já tem atalhos (espaço para passar, teclado no inspetor de cartas, entre outros), mas eles só são descobertos por acaso.

- [ ] Tecla `?` abre uma lista dos atalhos, e o menu de Opções ganha um link para ela.

### S12. Dificuldade do computador · Funcionalidade · M

O computador joga sempre com o perfil padrão do Forge (`createAiPlayer` em `Session.java`, sem perfil). O Forge já traz outros perfis de IA (cauteloso, arriscado, experimental), e hoje quem quer um treino mais fácil ou mais duro não tem escolha.

- [ ] Opção **Computador: Fácil / Normal / Difícil** ao começar contra a IA, ligada aos perfis do Forge (conferir antes quais existem na versão usada e o que cada um muda de verdade).
- [ ] Guardar a última escolha nas preferências (e na conta, quando conectado).
- [ ] Mostrar a dificuldade no retrato do computador e no histórico de **Minhas partidas**.

### S13. Ver o deck do oponente no fim da partida · Funcionalidade · P

No fim da partida, o jogador só conhece as cartas do oponente que apareceram na mesa. Para entender como perdeu (ou para copiar uma ideia), precisa perguntar.

- [ ] No resumo do fim da partida, botão **Ver deck** de cada oponente: a lista inteira quando for um deck pronto ou do computador; em partidas entre pessoas, só se o dono deixar (opção "Mostrar meu deck no fim da partida", desligada por padrão).
- [ ] Atalho **Copiar para Meus decks** quando o deck for um deck pronto.

### S14. Desafio rápido contra um deck do mesmo nível · Funcionalidade · P

Escolher o deck do computador entre 58 decks prontos toma tempo, e escolher ao acaso pode dar uma partida desequilibrada. O bracket de cada deck já existe (item 35).

- [ ] Botão **Partida rápida**: começa contra o computador com um deck pronto aleatório do mesmo formato e do mesmo bracket (ou do bracket vizinho) do deck escolhido.
- [ ] Revelar o deck do computador só no fim, junto com a S13.

---

## Construtor de decks (mais)

### S15. Completar os terrenos básicos · Funcionalidade · P

Montar um deck novo sempre termina com a conta de quantas Florestas e Ilhas pôr. Combina com a S5.

- [ ] Botão **Completar terrenos** no editor: adiciona básicos até o número que o jogador escolher (sugestão: 17 em 60 cartas, 37 em Commander), divididos pela proporção de símbolos de cada cor nos custos.
- [ ] Mostrar a divisão antes de aplicar, para ajustar à mão.

### S16. Histórico de mudanças do deck · Funcionalidade · M

O editor salva cada mudança na hora e só dá para desfazer a exclusão do deck inteiro. Tirar uma carta por engano, ou testar uma troca e querer voltar à lista da semana passada, não tem volta.

- [ ] Guardar versões do deck (por exemplo, uma por dia de edição ou antes de cada importação), com as cartas que entraram e saíram de uma versão para a outra.
- [ ] **Voltar a esta versão** e **Desfazer** a última mudança no editor (Ctrl+Z).
- [ ] Na conta, as versões viajam junto com o deck (item 44), com um limite de quantas guardar.

### S17. Novos formatos: Brawl, Oathbreaker e Pauper Commander · Funcionalidade · G

A mesa tem Livre, Standard, Pauper, Sacola 50 e Commander, e a ponte só usa os tipos `Constructed` e `Commander` do Forge. O Forge já conhece Brawl e Oathbreaker; Pauper Commander (PDH) é Commander com regras de raridade.

- [ ] Levantar o que cada formato pede na mesa (Oathbreaker: assinatura de mágica na zona de comando; Brawl: 60 cartas, vida 25 em 1x1) e o que o Forge já aplica.
- [ ] Validação no construtor (legalidades do Scryfall: `brawl`, `oathbreaker`, `paupercommander`) e filtro de formato nas salas.
- [ ] Começar por Pauper Commander, que reaproveita quase tudo do Commander e conversa com os decks Pauper que já existem.

---

## Celular e acessibilidade

### S18. Tela acesa durante a partida · Melhoria · P · ✅

Aceita e feita na 0.103.0 como item 72 do `ROADMAP.md` (ligada por padrão).

No celular, a tela apaga sozinha enquanto o oponente pensa, e às vezes o jogador perde a vez ou a conexão cai ao voltar. Nada pede ao aparelho para manter a tela acesa.

- [ ] Pedir a trava de tela acesa (Screen Wake Lock) enquanto houver partida aberta, soltando ao sair, e pedindo de novo quando a aba volta a ficar visível.
- [ ] Opção para desligar no menu de Opções.

### S19. Vibração quando é a sua vez · Melhoria · P · ✅

Aceita e feita na 0.103.0 como item 73 do `ROADMAP.md` (ligada por padrão, com opção própria).

O aviso de turno (`turnNotice.ts`) usa título, som e notificação. No celular com o som desligado, só a tela avisa.

- [ ] Vibração curta quando o turno ou uma decisão chega para o jogador (onde o navegador permitir), respeitando a mesma opção dos outros avisos.

### S20. Partida inteira com leitor de tela · Melhoria · M

A mesa tem anúncios para leitores de tela e atalhos de teclado em vários lugares, mas ninguém confere uma partida do começo ao fim só com teclado e leitor de tela.

- [ ] Jogar uma partida contra o computador só com teclado e NVDA (ou TalkBack no celular) e anotar onde trava: escolhas, combate, pilha, mulligan.
- [ ] Corrigir os bloqueios encontrados e transformar o roteiro num teste no navegador, para não voltar a quebrar.
- [ ] Junto com a S11 (lista de atalhos).

### S21. Rever as minhas partidas · Funcionalidade · G

A gravação da partida no aparelho (item 28) já permite repetir a mesa sem a ponte, mas só na página de desenvolvimento. Quem joga também ganharia com isso: rever a jogada que decidiu a partida.

- [ ] Em **Minhas partidas**, botão **Rever** nas partidas gravadas neste aparelho, abrindo a repetição com avançar, voltar e pular para um turno.
- [ ] Mostrar só o que o jogador viu na hora (a mão dele, não a dos outros).
- [ ] Limite de quantas gravações guardar e opção de apagar.

---

## Intuitivo, limpo e imersivo

Levantamento feito em 01/11/2026 olhando a tela inicial e a página de teste da mesa (`tests/fixtures/duel-table.html`) no computador (1440×900) e no celular (390×844).

### S22. Tela inicial com o deck primeiro · Melhoria · M · ✅

Aceita e feita na 0.101.0 como item 70 do `ROADMAP.md` (faixa Jogar de novo; ajustes resumidos só no celular).

A tela inicial abre com o título "Como jogar:" e a frase "Escolha seu deck, o formato de jogo e seu oponente.", que soa como manual. No celular, antes de chegar aos decks, o jogador passa por Formato, Oponentes, Jogadores e três seletores de "Decks dos computadores"; a barra de baixo diz "Escolha um deck para jogar" com o botão **Jogar** apagado. Quem volta para jogar de novo refaz o mesmo caminho.

- [ ] Quem já jogou vê em destaque o último deck usado, com a arte do comandante e um botão grande **Jogar de novo** (mesmo formato e oponentes da última vez).
- [ ] Os ajustes (formato, oponentes, jogadores, decks dos computadores) começam com o padrão de sempre e ficam numa linha resumida ("Commander · 4 jogadores · computadores aleatórios"), que abre ao tocar.
- [ ] No celular, os decks vêm antes dos ajustes.
- [ ] Trocar "Como jogar:" por um título que convide (ou nenhum título, deixando as artes dos decks falarem).

### S23. Cabeçalho mais limpo · Melhoria · P · ✅

Aceita e feita na 0.101.0 como item 71 do `ROADMAP.md` (Novidades como ícone; relatar e tema no menu ⋯).

O cabeçalho da tela inicial tem cinco coisas ao lado das abas: **Enviar sugestão ou erro**, **Novidades v0.100.0**, o botão de tema e **Fazer Login com o Google**. No celular, "Relatar" e "Novidades" disputam espaço com as abas **Jogar** e **Meus decks**. São coisas que se usam de vez em quando, mas aparecem com o mesmo peso das abas, que se usam sempre.

- [ ] Deixar no cabeçalho só as abas e a conta (foto ou **Entrar**).
- [ ] Tema, Novidades e Enviar sugestão ou erro vão para o menu da conta (e para o rodapé, para quem não entrou). Novidades continua com o ponto de aviso quando há versão nova.
- [ ] A versão sai do botão e fica só no painel de Novidades.

### S24. Cartas maiores quando há espaço na mesa · Melhoria · M · ✅

Aceita e feita na 0.101.0 como item 67 do `ROADMAP.md`, mas só para quando uma das fileiras está vazia: medindo a mesa, o espaço sobrando era só na largura, e na altura as duas fileiras já ocupam o campo.

No computador, com poucas permanentes, as cartas do campo ficam pequenas (cerca de 110 px de largura numa tela de 1440) no meio de um campo quase vazio. É preciso passar o mouse ou abrir o inspetor para ler o que já caberia na tela.

- [ ] O tamanho das cartas do campo acompanha o espaço livre: grande quando há poucas, diminuindo conforme o campo enche (com um limite máximo).
- [ ] Sem pular de tamanho a cada carta nova: mudar em degraus e com animação curta.
- [ ] Conferir em Commander com quatro jogadores, onde o espaço de cada um é menor.

### S25. Menos selos e ícones soltos na mesa · Melhoria · P

Durante a partida, o canto de cima mostra **Menu**, tela cheia, **Desfazer**, o formato ("Standard"), a sala ("Sala ABCD") e o placar ("Jogo 2 · 1 × 0"). Embaixo, ao lado dos botões, há uma fileira de ícones pequenos sem texto (relógio, nível de passar automaticamente, e outros) que só se entende passando o mouse. No celular esses ícones ficam ainda menores.

- [ ] No topo, só o que muda a partida: Menu, Desfazer e o placar (e só em melhor de 3). Formato e sala vão para dentro do Menu.
- [ ] A fileira de ícones de baixo vira um único botão de ajustes da partida, ou cada ícone ganha um rótulo curto ao tocar.
- [ ] Revisar o mesmo no celular, onde cada ícone tem que ter pelo menos 44 px de área de toque.

### S26. Tapete de mesa com a arte do deck · Funcionalidade · M · ✅

Aceita e feita na 0.101.0 como item 68 do `ROADMAP.md` (sutil e ligado por padrão).

O fundo da mesa é um degradê azul igual para todos. No Arena e nas mesas de verdade, o tapete diz de quem é cada lado e dá clima à partida.

- [ ] Atrás do campo de cada jogador, a arte do comandante (ou de uma carta escolhida do deck) bem escura e desfocada, sem atrapalhar a leitura das cartas.
- [ ] Opção nas preferências: tapete do deck, tapete liso (como hoje) ou um dos temas existentes.
- [ ] Conferir desempenho no celular (uma imagem grande desfocada por jogador).

### S27. Som ambiente na mesa · Funcionalidade · M

A mesa já tem sons para cada jogada e pacotes de som, mas entre as jogadas fica em silêncio. Um fundo sonoro discreto ajuda a imersão.

- [ ] Trilha ambiente baixa e sem melodia marcada (tipo taverna, biblioteca, floresta), em laço, com volume próprio e desligada por padrão ou bem baixa.
- [ ] Momentos com som próprio: embaralhar no começo da partida, a mesa "esquentando" quando a vida de alguém fica baixa, uma vinheta curta de vitória e de derrota.
- [ ] Respeitar o som desligado e não tocar com a aba escondida.

### S28. Dicas na primeira partida · Funcionalidade · M

Não existe tutorial, e o jogador novo aprende pela tentativa: como jogar um terreno, para que serve o botão amarelo, como ver uma carta de perto, como atacar. Um tutorial longo afasta; dicas curtas no momento certo não.

- [ ] Balões curtos que aparecem uma única vez, no momento em que a ação aparece pela primeira vez ("Toque num terreno da mão para jogá-lo", "Segure uma carta para ver de perto", "Arraste ou toque nas criaturas para atacar").
- [ ] Botão **Entendi** e uma opção **Não mostrar dicas** que vale para todas; guardar nas preferências (e na conta).
- [ ] Opção no Menu para ver as dicas de novo.
