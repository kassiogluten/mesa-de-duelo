# Roadmap de manutenção

Melhorias internas que deixam o projeto mais fácil e seguro de manter: estrutura, arquitetura, padrões, testes e ferramentas. Nada aqui muda o que o jogador vê, então não entra no `CHANGELOG.md`. Fica separado do `ROADMAP.md` (funcionalidades decididas) e do `SUGESTOES.md` (ideias de funcionalidade).

Esforço: **P** (poucas horas), **M** (um ou dois dias), **G** (vários dias). Ganho: o que melhora na manutenção. Ao concluir um item, marque ✅ com a data e o commit; ao descartar, ❌ com o motivo.

**Regra de toda refatoração daqui:** comportamento idêntico, conferido com `npm test`, `npm run test:browser`, `npm run test:e2e` (servidor) e `npm run visual -- snap/compare` (tela).

## Feito (2026-11-04, branch `refactor`)

- ✅ Carregador único dos testes (`tests/register.mjs`); testes importam o código direto.
- ✅ Contrato do estado entre servidor e mesa (`ProtocolContractTest` + `tests/protocol.test.mjs`).
- ✅ Servidor não congela a mesa calado (`stateFailed`, log de perguntas na resposta padrão).
- ✅ Base dos testes Java (`EngineListener`, `TestGames`); Forge em `~/forge` sem flag; suíte em ~30 s.
- ✅ `forgeTable.ts` 4040 → 1934 linhas; `Session.java` 2427 → 624 linhas.
- ✅ Chaves do navegador em `src/storage.ts`; mensagens do servidor tipadas no `client.ts`.
- ✅ Hook de pre-commit; `npm run test:browser`, `test:e2e`, `visual`, `css-why`, `print`, `unused`; skill `/entregar`.
- ❌ `@layer` no CSS: muda a prioridade das regras em dezenas de pontos da tela inicial; trocado pelo `npm run css-why`.

## 1. Proteções (pegar bugs antes do jogador)

### 1.1 Contrato também para campos que somem · P ✅
**Feito em 2026-11-05:** `tests/protocol.test.mjs` exige no `state-keys.txt` todo campo obrigatório de `FState`; o `ProtocolContractTest` monta também um estado com pilha e combate (29 campos a mais).
Hoje o contrato pega campo novo ou renomeado no servidor, mas não campo que o servidor parou de mandar. Conferir o contrário: todo campo **obrigatório** (sem `?`) de `FState` no `client.ts` precisa estar em `tests/protocol/state-keys.txt`. Ganho: remover um campo no Java quebra um teste em vez da mesa.

### 1.2 Contrato das outras mensagens · M ✅
**Feito em 2026-11-05:** `tests/protocol/message-keys.txt` (respostas, erros, sala) conferido contra `ServerMessage`; `tests/client-messages.test.mjs` confere os tipos do `ClientMessage` contra os `case` do servidor. Achou o `validation.deck` sem declaração.
O contrato cobre só a mensagem `state`. Fazer o mesmo para `room`, `hello`, `toast`, `error`, as respostas com `requestId` (`ServerMessage`/`ReplyMessage` do `client.ts`) e, no sentido contrário, para o `ClientMessage` que o `ClientActions.java` lê (hoje ~25 tipos em strings soltas). Ganho: o protocolo inteiro com uma fonte de verdade conferida.

### 1.3 Corrigir as falhas conhecidas · M ✅
**Feito em 2026-11-05:** Os testes de idioma (`CoinFlipTextTest`, `InputContextTest`) não dependem mais da ordem; `test-damage-events` e `test-preferences` corrigidos (o script, não o jogo); `commander-overlays` espera o layout parar. O teste novo do Laboratório achou e corrigiu um erro de verdade (0.126.1). Lista de falhas conhecidas vazia.
Listadas no `TESTES.md`:
- partidas: `test-damage-events`, `test-preferences` (sempre) e `test-end-step-stop` (às vezes);
- servidor no Windows: `CoinFlipTextTest` ×2 e `InputContextTest.targetSelection…` (dependem do idioma que o Forge carregou: fixar o idioma na JVM de teste);
- navegador: `commander-overlays` (galeria em 1440) e as falhas ocasionais de `attack-groups` e `commander-table`.

Ganho: uma suíte que passa inteira, então qualquer falha é nova e minha.

### 1.4 Pre-commit também para o servidor · P ✅
**Feito em 2026-11-05:** O hook roda `mvn -o -q test` quando o commit mexe em `forge-bridge/src`, `pom.xml` ou `shared/`.
Quando o commit mexe em `forge-bridge/src`, rodar `mvn -o -q test` (~30 s). Ganho: o servidor fica protegido como a mesa já está.

### 1.5 CI no GitHub · M ✅
**Feito em 2026-11-05:** `.github/workflows/mesa.yml`: `npm ci`, `tsc`, `npm test` e build a cada push e pull request. O servidor fica de fora (precisa do Forge).
Um workflow com `npm test`, `tsc` e build a cada push. O servidor fica para depois, porque precisa do Forge compilado (cache do `~/.m2`). Ganho: nada quebrado chega na `main`, mesmo vindo de outra máquina.

### 1.6 TypeScript mais rígido · M
Ligar `noUncheckedIndexedAccess` (acesso a lista/mapa pode ser `undefined`) e corrigir o que aparecer, arquivo por arquivo. Ganho: pega a classe de bug "carta/jogador não encontrado", a mais comum numa mesa que muda o tempo todo.

## 2. Estrutura (ler menos para mudar uma coisa)

### 2.1 Terminar o `forgeTable.ts` · G ✅
**Feito em 2026-11-05:** `forgeTable.ts` 1935 → 491 linhas: `tableContext` + 20 módulos por região e por entrada (`tableSeats`, `tableHand`, `tableQuestion`, `tableClicks`, `tableKeyboard`…), nenhum acima de ~310 linhas. 60/60 telas iguais.
Faltam as partes que mexem em muito estado:
- `renderTable` (~330 linhas): separar por região (topo, assentos, mão, pilha, perguntas) com um contexto explícito;
- o tratador de cliques (~400 linhas): um arquivo por grupo de `data-ui`;
- a fila de apresentação, o teclado/Escape e a vista de foco do oponente.

Meta: nenhum arquivo acima de ~600 linhas.

### 2.2 Os outros arquivos grandes da mesa · M cada ✅
**Feito em 2026-11-05:** `motion.ts` 1127 → 142 (8 módulos `motion*`), `main.ts` 487 → 325 (`src/app/`), `scryfall.ts` 427 → 246, `admin.ts` 455 → 286, `deckbuilder.ts` 607 → 498, `lobby.ts` 812 → 686. Ficam acima de 400: `lobby.ts` (precisa de um objeto de estado) e `deckbuilder.ts`.
Mesmo método do `forgeTable.ts`:
- `motion.ts` (1127): um módulo por família de animação;
- `lobby.ts` (812): `refresh` e `setFormat`;
- `deckbuilder.ts` (607);
- `main.ts` (487): `openForge` mistura conexão, nova tentativa e ligação dos callbacks;
- `admin.ts` (455);
- `scryfall.ts` (427).

### 2.3 Tipos do protocolo em arquivo próprio · P ✅
**Feito em 2026-11-05:** Tipos em `src/forge/protocol.ts` (607 linhas); `client.ts` 773 → 173, com `export type *` para os imports antigos.
~600 das 773 linhas do `client.ts` são tipos. Passá-los para `src/forge/protocol.ts`, deixando no `client.ts` só a conexão. Ganho: mudar um campo não exige abrir o cliente, e o contrato aponta para um arquivo só.

### 2.4 Servidor: `Rooms.java` e os serializadores · M ✅
**Feito em 2026-11-05:** `LobbyRequests` e `LobbyFields` saem do `Rooms.java` (762 → 646); `QuestionBroker.ask` com um método por tipo de pergunta.
- `Rooms.java` (762): separar os pedidos sem sala (`validate-deck`, `fetch-deck`, `similar-cards`, `list-rooms`) num `LobbyRequests` e tirar o bloco de erro assíncrono duplicado.
- `StateJson` (545), `SeatStateView` (450) e `QuestionBroker` (445): o `switch` grande do `ask` vira um tratador por tipo de pergunta.

### 2.5 Reflexão do Forge sem derrubar a classe · P ✅
**Feito em 2026-11-05:** `ForgeReflection`: campo ou método que falta só desliga o detalhe que o usa, com aviso no log; `ForgeReflectionTest` lista os que faltam no Forge fixado.
O `InputContext` lê ~22 campos privados do Forge na inicialização da classe. Se uma versão nova do Forge tirar um campo, a classe inteira não carrega e nenhuma partida abre. Trocar por campos que, se faltarem, só desligam o detalhe que usavam, com um aviso no log. Junto, um teste que lista os campos lidos e confere que existem. Ganho: atualizar o Forge vira uma lista clara do que mudou, não um servidor que não sobe.

### 2.6 Ícones e utilitários num lugar só · P ✅
**Feito em 2026-11-05:** `src/ui/icons.ts` (o antigo `tableIcons.ts` mais os da tela inicial e do menu ⋯), `src/ui/cardLabels.ts` (nomes de marcadores e palavras-chave), `src/ui/dom.ts` (`finder`, no lugar de 9 cópias do `$`). As quatro variantes do olho ficam separadas porque o traço é diferente. 72/72 telas iguais.
- O `tableIcons.ts` já junta os ícones da mesa; o `lobby.ts` e outros ainda têm SVGs próprios (o olho está copiado três vezes). Juntar num `src/ui/icons.ts`.
- O mesmo para o `$` (seletor), copiado em ~6 arquivos.

## 3. Ferramentas (desenvolver mais rápido)

### 3.1 Mapa do código gerado · P ✅
**Feito em 2026-11-05:** `npm run mapa [-- texto]`; `tests/mapa.test.mjs` exige o comentário do topo em todo arquivo.
`npm run mapa`: lista cada arquivo de `src/` e `forge-bridge/src/main` com o comentário do topo e as linhas. Ganho: achar onde mexer sem abrir arquivo, com um comando só em vez de várias buscas. Exige um comentário de uma linha no topo de cada arquivo, e um teste confere que ele existe.

### 3.2 Comparação de telas cobrindo tudo · M ✅
**Feito em 2026-11-05:** O `npm run visual` cobre 36 telas em dois tamanhos: as da mesa, as do site e, por cliques, Meus decks, construtor, Laboratório, menu ⋯, formatos e mesa livre. Cada tela começa com o navegador limpo; o ruído conhecido fica em `NOISE`.
O `npm run visual` não passa pelo construtor de decks, Meus decks, Laboratório, mesa livre nem pelos menus abertos. Acrescentar páginas de teste para elas (como `tests/fixtures/`). Ganho: refatorar CSS e telas fora da mesa com a mesma segurança da mesa. É também o que tornaria possível arrumar o CSS (4.1).

### 3.3 Relatos dos jogadores para a conversa · P ✅
**Feito em 2026-11-05:** `npm run relatos -- baixar-api` (no `deploy/relatos.mjs`): baixa pela área de admin, só com `MESA_ADMIN_URL` e `MESA_ADMIN_PASSWORD`, no mesmo formato do `baixar`; `listar`, `mostrar`, `abrir` e `issue` funcionam em cima.
Um comando que baixa os relatos novos do servidor (área de admin, com a senha do `.env`) para uma pasta local, já com a partida anexada. Ganho: eu leio o problema e a partida sem você copiar e colar.

### 3.4 Log do servidor com contexto · M ✅
**Feito em 2026-11-05:** `Log` (`Log.bridge()`, `Log.of(session)`, `Log.match(...)`) com nível e prefixo `[SALA partida …]`; 58 chamadas convertidas; `-Dmesa.log=warn` esconde as de informação.
Os ~60 `System.out`/`System.err` viram um logger com nível, sala e partida em cada linha. Ganho: um relato de produção aponta direto para as linhas daquela partida.

### 3.5 Teste de mesa a partir de um cenário do Laboratório · M ✅
**Feito em 2026-11-05:** `forge-bridge/scripts/test-lab-scenarios.mjs` (no `npm run test:e2e`): cada cenário pronto montado numa sala de teste de verdade, conferindo zonas, vida e grimório.
Montar uma página de teste (`tests/fixtures`) a partir de um `cenario` do `src/lab-cenarios.json`. Ganho: toda correção que já tem cenário ganha também um teste de navegador quase sem código.

## 4. Padrões (menos surpresa)

### 4.1 CSS sem guerra de especificidade · G
**Fora desta rodada:** pedido para deixar o CSS tela por tela para depois.
Sem `@layer` (descartado), arrumar tela por tela:
- tirar as regras de tela que ficaram no `style.css` e levar cada uma para o arquivo da sua tela;
- juntar as variantes de `.arena-btn` (redefinido em 23 arquivos);
- trocar os ~70 seletores por `#id` por classes.

Cada tela só depois de ter cobertura no `npm run visual` (3.2), conferindo com o `npm run css-why`.

### 4.2 CHANGELOG em partes · P ✅
**Feito em 2026-11-05:** Versões antes da 0.100.0 em `docs/changelog-antigo.md`; o painel Novidades e os testes leem os dois.
O `CHANGELOG.md` tem ~185 KB e só o topo importa no dia a dia. Mover as versões antigas para `docs/changelog-antigo.md`. O `src/ui/changelog.ts` passa a ler os dois, para o painel Novidades continuar igual. Ganho: menos texto quando alguém abre o arquivo.

### 4.3 Uma regra de nomes · P ✅
**Feito em 2026-11-05:** Regras em "Nomes e organização do código", no `CLAUDE.md`.
Arquivos e identificadores misturam português (`salas`, `conta/`, `maisMenu`) e inglês. Não renomear o que existe. Escrever no `CLAUDE.md` a regra para arquivo novo: nome em inglês no código, texto do jogador em português.

### 4.4 `README` do servidor gerado do contrato · M ✅
**Feito em 2026-11-05:** `docs/protocolo.md` gerado por `npm run protocol-doc`; `tests/protocol-doc.test.mjs` acusa quando fica desatualizado; o `forge-bridge/README.md` aponta para ele.
O `forge-bridge/README.md` (32 KB) descreve o protocolo à mão e pode estar desatualizado. Gerar a parte dos campos a partir de `tests/protocol/state-keys.txt` e dos tipos do `client.ts`, e deixar à mão só o que não se deduz. Ganho: documentação que não mente.

## Ordem sugerida

1. **Proteções rápidas:** 1.1, 1.4, 2.5 e 2.3, que são baratas e fecham buracos.
2. **Suíte inteira passando:** 1.3, para toda falha passar a ser sinal.
3. **Ferramentas:** 3.1, 3.3 e 3.2.
4. **Estrutura:** 2.1, 2.2 e 2.4, sempre com o comparador e os contratos ligados.
5. **Por último:** 1.2, 1.5, 1.6, 3.4, 3.5 e o bloco 4.
