# Relatos de jogadores e repetição de partidas (desenho do item 28)

Documento de desenho do item 28 do `ROADMAP.md`. Aqui ficam as decisões técnicas e os motivos; o roadmap guarda as etapas.

## Objetivo

1. O jogador manda uma **sugestão** ou um **relato de erro** de dentro do jogo, na tela inicial ou durante a partida.
2. Quando quiser, anexa a **partida**, para depois dar para repetir o que ele viu, reproduzir o erro e testar a correção.

## O que já existe e serve de base

- **A mesa já roda sem a ponte.** `createForgeTableView(...).attach(client)` só precisa de um objeto com `state`, `connected` e `send`. As páginas `tests/fixtures/duel-table.ts` e `effects-lab.ts` fazem isso, então a repetição no navegador não precisa de nenhuma mudança na mesa.
- **Cada `state` é um quadro completo e já filtrado para quem o recebe.** A ponte manda o estado inteiro de cada assento a cada 50 ms quando algo muda. A mão dos outros vai vazia, e a ordem e o conteúdo do grimório nunca saem (`StateJson.java`). Os eventos chegam aos poucos com `seq` e `eventCursor`, e a linha do tempo (`presentationTimeline.ts`) já ignora os repetidos. Repetir os `state` na ordem recria as animações.
- **O painel "Erros da partida"** (`matchDiagnostics.ts`) já monta um relatório com versão da mesa, regras, motor, formato, partida e navegador. O relato reaproveita esses dados.
- **Identificadores**: `matchId` (UUID por partida, novo a cada revanche), `stateVersion`, `gameNumber` e `gen` do pedido atual.
- **A ponte não guarda nada em disco.** As ações do jogador não ficam registradas. O Forge usa um único gerador aleatório para o processo todo (`MyRandom`, estático e compartilhado por todas as partidas).
- **O Forge tem `forge.game.GameState`** (no forge-game da versão que usamos): `initFromGame(game)` tira um retrato em texto das zonas, vida, marcadores, fase e turno, e `applyToGame(game)` o aplica numa partida nova. É o recurso que o Forge usa nos quebra-cabeças e no "dump/setup game state" do modo dev.
- **Servidor**: Netty puro. Só `/ws` passa pelo nginx. O agregador HTTP aceita até 64 KB, um quadro WebSocket até 1 MiB, e a ponte não vê o IP de quem conecta (o nginx não repassa `X-Real-IP`).

## Decisões

### 1. O que capturar

**No aparelho (gravador da mesa)**, gravado sempre durante a partida, só em memória, e a última partida no IndexedDB:

| O quê | Por quê |
|---|---|
| Cada `state` recebido (sem repetir `stateVersion`), com o horário de chegada | É exatamente o que a mesa desenhou. Basta para repetir na mesa. |
| Cada mensagem enviada (`ClientMessage`) com horário, `gen` e o `stateVersion` visto naquele instante | Mostra o que o jogador clicou e em que quadro, inclusive cliques recusados. |
| `diagnostic`, `toast`, `error`, quedas de conexão e erros de JavaScript da mesa | São o próprio sintoma. Já estão em `MatchDiagnostics`. |
| Versão da mesa, `rulesVersion`, `engineVersion`, formato e partida | Para saber em qual versão o erro aparece e se a correção já chegou. |
| Aparelho: navegador, tamanho da tela, densidade, toque, PWA instalado ou não | Muitos erros de mesa dependem disso. |
| Preferências: aparência das cartas, ritmo, reduzir movimento, passar automaticamente | Mudam o que a mesa mostra e quando ela passa a vez. |
| O próprio deck (lista) | É do jogador, e ajuda mesmo sem o lado do servidor. |

Fica de fora: IP, nome do aparelho, qualquer dado de outros sites e o conteúdo do `localStorage` além das preferências acima.

**Tamanho**: um `state` tem dezenas de KB, mas as partidas repetem muito texto e o gzip (`CompressionStream`, nativo do navegador) reduz bastante. Limite da gravação: **2 MB comprimidos**. Passando disso, ficam o primeiro quadro e os mais recentes (os últimos minutos interessam mais). A etapa 1 mede o tamanho real numa partida longa de Commander, e, se precisar, guardamos só as diferenças entre quadros (um quadro inteiro a cada N).

**Na ponte (diário da partida)**, só em memória, enquanto a sessão existir:

| O quê | Por quê |
|---|---|
| Decks de todos os jogadores, inclusive os do computador | Sem eles não dá para recriar a partida no Forge. |
| Configuração (formato, melhor de três, jogadores, quem começou, mulligans) | Idem. |
| Retrato `GameState` no começo de cada turno (os últimos 3) e no instante do relato | Pontos de partida para restaurar sem refazer o jogo todo. |
| Diário das ações aceitas e recusadas de cada assento (tipo, `gen`, `stateVersion`, horário) e as respostas a perguntas | Para seguir dali em diante até o erro. |

O diário só sai da memória quando alguém manda um relato **com a partida anexada**. O jogador nunca recebe esse lado, que inclui a mão e o grimório dos outros.

### 2. Como repetir a partida

Dois caminhos complementares, cada um para um tipo de erro:

**a) Repetição na mesa, sem a ponte (principal).** Uma página de desenvolvimento, `tests/fixtures/replay.html`, no mesmo molde do laboratório de efeitos. Ela abre o arquivo do relato, monta a mesa com um cliente falso e entrega os `state` gravados na ordem: tocar e pausar, quadro a quadro, velocidade, ir direto ao momento do relato, e uma lista lateral com as ações enviadas e os erros. Cobre a maior parte dos relatos que esperamos (tela, animação, botão errado, texto, mesa travada) e também serve para testar a correção na mesa: abre-se o mesmo relato com o código novo.

**b) Restaurar no Forge (para erros de regra ou do motor).** Um modo de desenvolvimento da ponte (`--mode=replay` ou um teste JUnit que lê o relato) cria uma partida com os mesmos decks, aplica o `GameState` do começo do turno do erro e deixa o desenvolvedor continuar dali pela mesa, com o diário de ações ao lado como roteiro. Quando o erro aparece, o mesmo retrato vira um teste de regressão em `forge-bridge/src/test` (como os testes que já existem com o motor real).

**Descartado: repetir a partida inteira a partir de uma semente.** O gerador do Forge é um só para o processo todo e é compartilhado por todas as partidas abertas. A IA também depende do tempo e da ordem das threads. Fixar uma semente por partida exigiria mudar o Forge, e mesmo assim qualquer diferença de versão quebraria a repetição. O retrato por turno é menos ambicioso, mas funciona com o Forge como ele é.

**Limites conhecidos do `GameState`**: efeitos "até o fim do turno", gatilhos atrasados, a pilha e escolhas feitas nos turnos anteriores (por exemplo "escolha um tipo de criatura") nem sempre voltam iguais. Por isso o retrato é tirado no começo do turno, com a pilha vazia, e o relato diz qual retrato foi usado. Conferir esses limites é parte da etapa 5.

### 3. Onde guardar os relatos

**Na ponte, em arquivos num volume próprio** (`feedback-data`), recebidos por uma rota HTTP nova: `POST /api/relatos`, repassada pelo nginx.

- **HTTP em vez de WebSocket**: funciona na tela inicial sem abrir sessão na ponte e pode ser reenviado pela fila sem conexão. No nginx dá para aplicar `client_max_body_size`, `limit_req` e `X-Real-IP` só nessa rota. Na ponte, a rota tem um agregador próprio (até 3 MB) sem mexer no limite de 64 KB das outras.
- **Formato**: `relatos/AAAA-MM/<código>.json.gz`, com um índice em linhas JSON (`indice.jsonl`: código, data, tipo, versão, formato, tamanho, se tem partida). O código curto (ex.: `R-7K2Q`) é mostrado ao jogador.
- **Sem banco de dados**: o volume de relatos esperado é pequeno, e arquivos se copiam e se abrem com facilidade na página de repetição.
- **GitHub Issues não recebe nada automático.** O repositório é público, e um token de escrita no servidor viraria um jeito de encher o repositório de spam. Os relatos expõem também apelidos e decks de quem jogou. A triagem é manual, com um script que transforma um relato escolhido em issue (`gh issue create`) só com o texto e o resumo técnico, sem a partida anexada.
- **Retenção**: 90 dias, ou até 1 GB no volume, apagando os mais antigos primeiro.
- **Métricas**: `mesa.feedback.received{kind,attached}`, `mesa.feedback.rejected{reason}` e o espaço ocupado, no painel do Grafana.

### 4. Privacidade

- O formulário diz, antes de enviar, o que vai junto: o texto, a versão e o tipo de aparelho e, se marcado, a partida (seu deck, os apelidos dos jogadores e as jogadas que você viu). Nada de e-mail, conta ou IP.
- O IP só é usado, em memória e como resumo (hash), para o limite de envio. Não fica gravado no relato.
- O lado da ponte (mãos e grimórios de todos) fica só no servidor e nunca volta para nenhum jogador.
- Anexar a partida é opção do jogador. Vem marcado num relato de erro durante a partida e desmarcado numa sugestão.

### 5. Limites de envio (ligado ao item 19)

- nginx: `limit_req` em `/api/relatos` (por exemplo 3 por minuto por IP, rajada de 2) e `client_max_body_size 3m`.
- Ponte: no máximo 10 relatos por hora por IP, descrição de até 2.000 caracteres, gravação de até 2 MB comprimidos, e recusa com mensagem clara em português quando o disco chega ao limite.
- O diário da ponte também tem limite (3 retratos e as últimas 2.000 ações por partida), para não pesar na memória com muitas partidas abertas.
- Ao bater no limite, o aparelho mostra "Muitos relatos seguidos, tente de novo em alguns minutos" e guarda o relato na fila.

### 6. Interface para o jogador

- **Onde**: botão **Enviar sugestão ou erro** no menu da tela inicial (cabeçalho) e no menu da partida, ao lado de **Erros da partida**. O painel de erros ganha **Relatar este erro**, que abre o formulário já como erro e com a partida marcada.
- **Formulário curto**, sobre o fundo dos modais do Arena (item 7):
  - Tipo: **Sugestão** ou **Algo deu errado**.
  - Descrição (obrigatória, até 2.000 caracteres), com um exemplo no campo: "O que você fez e o que aconteceu?".
  - **Anexar a partida** (durante a partida, ou na tela inicial quando houver uma partida recente gravada, com data e formato): mostra o tamanho e um "o que vai junto".
  - Botões grandes **Enviar** e **Cancelar**.
- **Depois de enviar**: "Relato R-7K2Q enviado. Obrigado!", com o código para citar depois. Sem rede, ou com o servidor fora: "Guardado; envio quando a conexão voltar". Fica na fila no IndexedDB e sai sozinho depois.
- Teclado, leitor de tela e celular como nas outras janelas. Enviar não pausa a partida nem segura a vez.
