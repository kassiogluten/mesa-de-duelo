# Sugestões do Claude

Roadmap só com sugestões do Claude: funcionalidades, correções e melhorias que ele notou trabalhando no código. Fica separado do `ROADMAP.md`, que é o plano decidido do projeto. Nada aqui foi pedido nem está aprovado. Quando uma sugestão for aceita, ela passa para o `ROADMAP.md`; quando for descartada, vai para **Descartadas**, no fim, com o motivo.

Esforço: **P** (poucas horas), **M** (um ou dois dias), **G** (vários dias ou infraestrutura nova).

## Objetivo

Agradar quem joga: tudo **intuitivo** (sem precisar de explicação), **limpo** (só o que importa na hora) e **imersivo** (a sensação de estar numa mesa de Magic, não num site). Cada sugestão é pesada por isso. As que não servem ao objetivo continuam aqui, mas ficam no fim da fila.

### Ordem sugerida

Revista em 06/11/2026 (versão 0.139.0).

1. **Intuitivo sem tutorial**: S29 (botões de passar com nomes distintos), S30 (terrenos na mão do mulligan), S28 (dicas na primeira partida), S31 (como jogar cada deck pronto).
2. **Primeira impressão**: S14 (partida rápida), S13 (ver o deck do oponente).
3. **Commander com mais gente**: S32 (o que aconteceu desde a sua última vez), S33 (mesa leve no celular).
4. **Imersão**: S27 (som ambiente), S10 (reações rápidas).
5. **Construtor**: S4, S15, S5, S16, S7.
6. **Fora do foco por enquanto**: S3, S12, S17, S20, S21, S34. São úteis, mas o jogador não sente a diferença no dia a dia (ou o custo é alto para o que muda).

---

## Correções e robustez

### S3. Testes rodando a cada push · Melhoria · P · em parte ✅

O job **Mesa** do GitHub Actions (`.github/workflows/mesa.yml`) já roda `tsc`, `npm test` e `npm run build` em cada push e PR. O servidor ficou de fora, porque precisa do Forge compilado.

- [x] GitHub Actions com o typecheck, `npm test` e `npm run build` em cada push e PR.
- [ ] Um segundo job com `mvn test` do servidor, guardando o Forge compilado (`~/.m2`) no cache do Actions para não recompilar a cada vez.
- [ ] Conferir num teste que o `version` do `package.json` é igual ao do topo do `CHANGELOG.md`, como pede o `CLAUDE.md` (hoje só a revisão pega).

### S34. Partidas de teste que falham de vez em quando · Correção · M

O `TESTES.md` lista cinco testes intermitentes (`attack-groups`, `commander-table`, `artwork-click`, `test-end-step-stop` e `test-commander`). O `test-commander` falhou 1 vez em 4 mesmo sem mudança nenhuma, na comparação da mão. Teste que falha à toa ensina a ignorar falha de verdade.

- [ ] Rodar cada um 20 vezes seguidas e anotar onde quebra (espera fixa, ordem de mensagens, máquina carregada).
- [ ] Trocar as esperas por tempo por esperas por estado ("até a mão ter 7 cartas") e tirar da lista do `TESTES.md` os que ficarem estáveis.

---

## Partida

### S29. Botões de passar com nomes que não se confundem · Melhoria · P

Desde a 0.132.2 o botão de destaque diz o próximo passo e **Fim de turno** fica ao lado, secundário. Na principal 2, os dois ficam quase iguais: **Fim de turno** e **Para o fim do turno**. O primeiro passa até o próximo turno, sem parar; o segundo para na etapa final, onde quase nunca há o que fazer. O jogador não sabe qual apertar.

- [ ] Na principal 2, renomear um dos dois (por exemplo, o secundário vira **Passar o turno**, ou o destaque vira **Para a etapa final**), ou esconder o secundário quando os dois levariam ao mesmo lugar na prática.
- [ ] Conferir as outras fases com o mesmo olhar: dois botões nunca devem soar como a mesma coisa.

### S30. Contagem de terrenos na mão do mulligan · Melhoria · P

Decidir o mulligan é a primeira decisão da partida, e o jogador novo não sabe se a mão é boa. A pergunta que todo mundo faz é "quantos terrenos?".

- [ ] Na tela de abertura, ao lado de **Manter** e **Mulligan**, uma linha discreta: "3 terrenos, 4 mágicas" (no Commander, contando as que entram como terreno, como as cartas de dupla face modais).
- [ ] Sem conselho nem cor de alerta: a mesa conta, o jogador decide.

### S13. Ver o deck do oponente no fim da partida · Funcionalidade · P

No fim da partida, o jogador só conhece as cartas do oponente que apareceram na mesa. Para entender como perdeu (ou para copiar uma ideia), precisa perguntar.

- [ ] No resumo do fim da partida, botão **Ver deck** de cada oponente: a lista inteira quando for um deck pronto ou do computador; em partidas entre pessoas, só se o dono deixar (opção "Mostrar meu deck no fim da partida", desligada por padrão).
- [ ] Atalho **Copiar para Meus decks** quando o deck for um deck pronto.

### S14. Desafio rápido contra um deck do mesmo nível · Funcionalidade · P

O **Jogar de novo** da tela inicial (0.101.0) repete a última partida, mas escolher um oponente novo entre os decks prontos ainda toma tempo, e escolher ao acaso pode dar uma partida desequilibrada. O bracket de cada deck já existe.

- [ ] Botão **Partida rápida**: começa contra o computador com um deck pronto aleatório do mesmo formato e do mesmo bracket (ou do bracket vizinho) do deck escolhido.
- [ ] Revelar o deck do computador só no fim, junto com a S13.

### S32. O que aconteceu desde a sua última vez · Funcionalidade · M

No Commander com quatro jogadores, entre uma vez e outra passam três turnos inteiros. Quem se distraiu volta sem saber quem perdeu vida, que criatura morreu ou o que entrou no campo, e precisa abrir o histórico e ler linha por linha. O histórico detalhado (item 36 do `ROADMAP.md`) organiza a lista; isto é o resumo.

- [ ] Quando a vez volta para o jogador, um cartão curto e que some sozinho: vida de cada um (com a diferença), permanentes que entraram e saíram, e mágicas conjuradas, em no máximo quatro linhas.
- [ ] Só em partidas com mais de dois jogadores, com opção de desligar.

### S10. Reações rápidas na sala · Funcionalidade · M

As salas não têm nenhuma forma de comunicação. Chat livre traz moderação; reações prontas não.

- [ ] Um conjunto fixo de reações ("Boa jogada", "Pensando…", "Ops", "Bom jogo") que aparecem por alguns segundos ao lado do retrato.
- [ ] Opção para silenciar as reações dos outros.

### S12. Dificuldade do computador · Funcionalidade · M

O computador joga sempre com o perfil padrão do Forge (`createAiPlayer` em `Session.java`, sem perfil). O Forge já traz outros perfis de IA (cauteloso, arriscado, experimental), e hoje quem quer um treino mais fácil ou mais duro não tem escolha.

- [ ] Opção **Computador: Fácil / Normal / Difícil** ao começar contra a IA, ligada aos perfis do Forge (conferir antes quais existem na versão usada e o que cada um muda de verdade).
- [ ] Guardar a última escolha nas preferências (e na conta, quando conectado).
- [ ] Mostrar a dificuldade no retrato do computador e no histórico de **Minhas partidas**.

### S21. Rever as minhas partidas · Funcionalidade · G

A gravação da partida no aparelho (item 28) já permite repetir a mesa sem o servidor, mas só na página de desenvolvimento e na área de admin. Quem joga também ganharia com isso: rever a jogada que decidiu a partida.

- [ ] Em **Minhas partidas**, botão **Rever** nas partidas gravadas neste aparelho, abrindo a repetição com avançar, voltar e pular para um turno.
- [ ] Mostrar só o que o jogador viu na hora (a mão dele, não a dos outros).
- [ ] Limite de quantas gravações guardar e opção de apagar.

---

## Intuitivo, limpo e imersivo

### S28. Dicas na primeira partida · Funcionalidade · M

Não existe tutorial, e o jogador novo aprende pela tentativa: como jogar um terreno, para que serve o botão de destaque, como ver uma carta de perto, como atacar. Um tutorial longo afasta; dicas curtas no momento certo não.

- [ ] Balões curtos que aparecem uma única vez, no momento em que a ação aparece pela primeira vez ("Toque num terreno da mão para jogá-lo", "Segure uma carta para ver de perto", "Toque nas criaturas para atacar").
- [ ] Botão **Entendi** e uma opção **Não mostrar dicas** que vale para todas; guardar nas preferências (e na conta).
- [ ] Opção no Menu para ver as dicas de novo.

### S31. Como jogar cada deck pronto · Funcionalidade · M

São dezenas de decks prontos, e a escolha mostra arte, cores, bracket e preço, mas não o que o deck faz. Quem pega o "Forja de Dakkon" pela primeira vez não sabe se deve atacar cedo ou esperar.

- [ ] Duas linhas por deck pronto: o plano ("Encha o campo de fichas e ataque com todas de uma vez") e duas ou três cartas-chave, na visualização do deck e no balão da escolha.
- [ ] Texto curto e em português para o jogador, guardado junto com a lista do deck; um teste confere que todo deck pronto tem o seu.

### S27. Som ambiente na mesa · Funcionalidade · M

A mesa já tem sons para cada jogada e pacotes de som, mas entre as jogadas fica em silêncio. Um fundo sonoro discreto ajuda a imersão.

- [ ] Trilha ambiente baixa e sem melodia marcada (tipo taverna, biblioteca, floresta), em laço, com volume próprio e desligada por padrão ou bem baixa.
- [ ] Momentos com som próprio: embaralhar no começo da partida, a mesa "esquentando" quando a vida de alguém fica baixa, uma vinheta curta de vitória e de derrota.
- [ ] Respeitar o som desligado e não tocar com a aba escondida.

---

## Celular e acessibilidade

### S33. Mesa leve no celular com quatro jogadores · Melhoria · M

A mesa ganhou bastante coisa por cima das cartas nas últimas versões: tapete com a arte do deck, selos de exílio, ícones novos nos selos da borda e relógios no topo. A S26 deixou em aberto conferir o tapete no celular, e ninguém mediu a mesa cheia num aparelho simples.

- [ ] Medir, com o perfil do navegador num celular médio, quanto tempo cada atualização da mesa leva numa partida de Commander com quatro jogadores e o campo cheio.
- [ ] Atacar o que pesar mais (imagens desfocadas do tapete, sombras, animações) e, se preciso, desligar o tapete sozinho em aparelhos lentos.

### S20. Partida inteira com leitor de tela · Melhoria · M

A mesa tem anúncios para leitores de tela, atalhos de teclado e a lista de atalhos (`?`), mas ninguém confere uma partida do começo ao fim só com teclado e leitor de tela.

- [ ] Jogar uma partida contra o computador só com teclado e NVDA (ou TalkBack no celular) e anotar onde trava: escolhas, combate, pilha, mulligan.
- [ ] Corrigir os bloqueios encontrados e transformar o roteiro num teste no navegador, para não voltar a quebrar.

---

## Construtor de decks

### S4. Mão de teste · Funcionalidade · P

Não há como ver uma mão inicial do deck sem começar uma partida. A Mesa livre já tem embaralhar, comprar e mulligan (`src/free/sandbox.ts`).

- [ ] Botão **Mão de teste** no editor: compra 7, permite mulligan (London) e "comprar mais uma" para simular os primeiros turnos.
- [ ] Contar quantas vezes saiu uma mão com 2 a 4 terrenos em 1.000 mãos simuladas.

### S15. Completar os terrenos básicos · Funcionalidade · P

Montar um deck novo sempre termina com a conta de quantas Florestas e Ilhas pôr. Combina com a S5.

- [ ] Botão **Completar terrenos** no editor: adiciona básicos até o número que o jogador escolher (sugestão: 17 em 60 cartas, 37 em Commander), divididos pela proporção de símbolos de cada cor nos custos.
- [ ] Mostrar a divisão antes de aplicar, para ajustar à mão.

### S5. Cores de mana: símbolos contra fontes · Funcionalidade · M

As estatísticas do editor mostram curva, tipos e cores, mas não se a base de mana sustenta as cores do deck.

- [ ] Contar os símbolos de cada cor nos custos e as fontes de cada cor nos terrenos (e mana rocks), lado a lado.
- [ ] Aviso quando uma cor tem muitos símbolos e poucas fontes.

### S16. Histórico de mudanças do deck · Funcionalidade · M

O editor salva cada mudança na hora e só dá para desfazer a exclusão do deck inteiro. Tirar uma carta por engano, ou testar uma troca e querer voltar à lista da semana passada, não tem volta.

- [ ] Guardar versões do deck (por exemplo, uma por dia de edição ou antes de cada importação), com as cartas que entraram e saíram de uma versão para a outra.
- [ ] **Voltar a esta versão** e **Desfazer** a última mudança no editor (Ctrl+Z).
- [ ] Na conta, as versões viajam junto com o deck (item 44), com um limite de quantas guardar.

### S7. Pastas ou etiquetas nos decks · Funcionalidade · M

Com muitos decks a lista fica longa. Filtros por nome e cor já existem.

- [ ] Etiquetas livres ("testando", "casual", "torneio") com filtro.
- [ ] Marcar decks como favoritos, que aparecem primeiro na escolha do deck da partida.

### S17. Novos formatos: Brawl e Pauper Commander · Funcionalidade · G · em parte ✅

Oathbreaker feito na 0.112.0 (validação no construtor e no servidor, de dois a quatro jogadores e 10 decks prontos). Brawl e Pauper Commander continuam em aberto.

- [ ] Começar por Pauper Commander (PDH), que reaproveita quase tudo do Commander e conversa com os decks Pauper que já existem: validação pela legalidade `paupercommander` do Scryfall, botão de formato e alguns decks prontos.
- [ ] Brawl depois: 60 cartas, vida 25 no 1x1, só cartas do Standard.

---

## Concluídas

| Sugestão | Onde foi parar |
| --- | --- |
| S1. Cache de cartas no localStorage perto do limite | 0.30.0, item 10 do `ROADMAP.md`: o cache foi para o IndexedDB. |
| S2. Falha ao carregar dados na biblioteca não aparece | 0.105.0, item 79. |
| S8. Histórico de partidas e vitórias por deck | 0.100.0, item 65 (**Minhas partidas**, na conta). |
| S9. Gráfico de vida no fim da partida | 0.105.0, item 78. |
| S11. Lista de atalhos de teclado | 0.105.0, item 77. |
| S18. Tela acesa durante a partida | 0.103.0, item 72. |
| S19. Vibração quando é a sua vez | 0.103.0, item 73. |
| S22. Tela inicial com o deck primeiro | 0.101.0, item 70. |
| S23. Cabeçalho mais limpo | 0.101.0, item 71. |
| S24. Cartas maiores quando há espaço na mesa | 0.101.0, item 67 (só com uma fileira vazia). |
| S25. Menos selos e ícones soltos na mesa | 0.105.0, item 76. |
| S26. Tapete de mesa com a arte do deck | 0.101.0, item 68; a conferência no celular passou para a S33. |

## Descartadas

- ❌ **S1, o que sobrou (faces como apelido e limpeza de cartas antigas).** Os dois itens só existiam por causa do limite de 5 MB do `localStorage`; no IndexedDB o espaço não aperta, e o jogador não sente diferença.
- ❌ **S6. Exportar e importar todos os decks.** A conta Google guarda e sincroniza os decks (item 44), e cada deck já sai como lista em texto em **Exportar lista**. Um arquivo com todos os decks só atenderia quem não entra com a conta e troca de aparelho, um caso pequeno demais para uma tela nova.
