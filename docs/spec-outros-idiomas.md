# Plano: jogar sem falar português (item 136)

Data: 2026-11-16

## Objetivo

Quem não fala português consegue jogar a Mesa de Duelo do começo ao fim em inglês: entrar, escolher ou montar um deck, criar ou entrar numa sala, jogar contra pessoas ou contra o computador, entender cada pergunta da partida e mandar um relato. O português continua sendo o idioma principal e não pode perder nada no caminho. O inglês vem primeiro, mas a estrutura não pode impedir outros idiomas depois.

Fora do objetivo (pelo menos nesta etapa): a área de admin, os documentos internos (`docs/`, `ROADMAP.md`, `TESTES.md`) e os comentários do código continuam em português.

## Como é hoje

Números de 16/11/2026, contados no código.

**Mesa (`src/`)**

- 255 arquivos `.ts`, cerca de 30 mil linhas. Os textos estão escritos direto no código, sem camada de tradução: só os que têm acento já são cerca de 1.500, em 169 arquivos. Contando os sem acento, devem passar de 3 mil.
- 9 páginas HTML com `lang="pt-BR"` (tela inicial, salas, partidas, rever, torneios, novidades, sobre, privacidade e admin), com textos no próprio HTML.
- Datas e números formatados com `'pt-BR'` fixo em 30 lugares.
- Uns 10 pontos leem o texto que o Forge manda em português para decidir algo (expressões regulares sobre a frase): `src/ui/forgeText.ts` (o "você's" do Forge), `shortInstruction.ts`, `tableNotices.ts`, `tableActionBox.ts`, `startingRoll.ts`, `actionPanel.ts`, `lobby.ts`, `face.ts`, `deckPreview.ts` e `src/rulebreaker.ts`. Com o Forge em outro idioma, eles quebram.
- Boa parte da partida já é montada pela mesa a partir de dados, não do texto do Forge: as frases de evento e do histórico (`eventText.ts`), a frase curta da caixa de ação (`shortInstruction.ts`), o motivo da derrota (`lossReason.ts`) e o dano (`DamageDetails.java`). Esse é o caminho que facilita traduzir.
- **Cartas:** a mesa já usa o inglês quando a carta não tem tradução (`src/cards.ts`: `sc.pt?.name || sc.name`, e o mesmo para texto e imagem). Para mostrar as cartas em inglês, basta ignorar o `pt`.

**Servidor (`forge-bridge/`)**

- O Forge sobe com `UI_LANGUAGE` em `pt-BR` para o processo todo (`Main.java:57`, opção `--lang`). Perguntas, textos das habilidades, o `log` da partida e os nomes de cartas que vêm do Forge chegam nesse idioma.
- O `Localizer` e o `CardTranslation` do Forge são estáticos: **um idioma por processo**. Duas pessoas com idiomas diferentes na mesma partida não cabem no jeito de hoje.
- O Forge já traz `en-US` e mais 9 idiomas (`forge-gui/res/languages`). O texto em inglês é o original do Forge, mais completo que o português.
- A ponte tem cerca de 440 textos próprios em português, em 62 arquivos: erros, lobby, moeda, votação, montes, explicação de ataque e outros. Seis arquivos usam o `Localizer` do Forge direto (`QuestionBroker`, `LibraryChoice`, `AttackExplain`, `Votes`, `CoinFlipText`, `Piles`).
- Já existe precedente de classe nossa dentro de um pacote do Forge (`forge-bridge/src/main/java/forge/ai/AvailableActions.java`).

**Conteúdo**

- 186 decks prontos com nome em português (`shared/starter-decks.json`).
- Novidades: `CHANGELOG.md` (120 KB), `docs/changelog-antigo.md` (145 KB), `src/novidades.json` com as legendas e o processo de `novidades-pendentes/`, tudo em português.
- O "Como jogar" da primeira visita (0.190.0), as mensagens do Laboratório e os cenários prontos.
- Os relatos já mandam `navigator.language` (`src/feedback.ts:62`).

## Decisões a tomar

Cada uma com a alternativa recomendada primeiro.

| # | Decisão | Alternativas |
| --- | --- | --- |
| 1 | Quais idiomas | **Inglês agora, com estrutura pronta para outros** (recomendado: a estrutura custa pouco a mais e evita refazer depois) · Inglês e espanhol juntos · Só inglês, sem estrutura |
| 2 | Como o idioma é escolhido | **Pelo navegador na primeira visita, com troca no menu ⋯, e guardado com as preferências da conta** (recomendado: quem chega de fora já vê em inglês) · Só pela escolha no menu · Por endereço (`/en/`) |
| 3 | Texto do Forge na partida (a decisão mais difícil) | **A. Idioma por jogador no servidor:** trocar o `Localizer` e o `CardTranslation` estáticos por um que escolhe o idioma pelo jogador que recebe a mensagem, como já fizemos com uma classe no pacote do Forge. Permite salas mistas e aproveita o inglês completo do Forge. Risco: depende de classe interna do Forge, e o `log` da partida é um só para todos · **B. A mesa traduz:** a ponte manda código e dados no lugar de frases, e a mesa monta a frase no idioma de cada um (o caminho de `shortInstruction` e `eventText`). É o mais robusto, mas o maior trabalho, e o Forge tem centenas de perguntas · **C. Um servidor por idioma:** um segundo processo com `--lang=en-US` e a sala escolhe o servidor. É simples de ligar, mas dobra a memória, divide a lista de salas, não permite sala mista e os dois processos disputam o `/data` (contas, relatos, partidas). **Recomendado: A**, confirmado por um teste curto na fase 0, e B aos poucos para as frases mais vistas e para os 10 pontos que leem o texto em português. C só como plano de emergência. |
| 4 | Sala com jogadores de idiomas diferentes | **Permitir, cada um vê no seu idioma** (recomendado se a decisão 3 for A ou B) · A sala tem um idioma e só entra quem joga nele |
| 5 | Nomes dos decks prontos | **Nome em inglês para cada deck** (recomendado: 186 nomes curtos, num campo a mais no `starter-decks.json`) · O nome do comandante ou do arquétipo, sem traduzir |
| 6 | Novidades em inglês | **Só daqui para frente:** cada novidade pendente ganha também o texto em inglês, e as versões antigas aparecem em português com um aviso (recomendado: traduzir 265 KB de histórico não ajuda quem chega agora) · Traduzir o histórico também · Painel só em português |
| 7 | Prints das Novidades em imagens | **Continuam em português** (recomendado: dobrar os prints dobra o trabalho de cada entrega) · Prints nos dois idiomas |
| 8 | Página de apresentação | **Versão em inglês junto com o item 104 (SEO)** (recomendado) · Depois do lançamento |

Fica decidido sem pergunta: os termos de jogo seguem a terminologia oficial de Magic em inglês (Wizards of the Coast), como o português segue a das cartas impressas em português.

## Fases

### Fase 0: preparação (nada muda para o jogador)

- Camada de tradução própria, sem biblioteca: `src/i18n.ts` com `t('chave', { parâmetros })`. O português é a fonte (um objeto TypeScript com as chaves tipadas), e o inglês tem que ter as mesmas chaves. Plural com `Intl.PluralRules`, e datas e números com o idioma escolhido no lugar do `'pt-BR'` fixo.
- O dicionário do idioma que não é o da pessoa só é baixado quando ela o escolhe (`import()`), para não pesar no primeiro acesso (item 135).
- Chave `mesa:lang` em `KEYS` (`src/storage.ts`), em `SYNCED_PREFS` e em `AccountDecks.PREF_KEYS`. O idioma vai junto da entrada na sala (`src/forge/protocol.ts`).
- Teste curto do servidor para a decisão 3: com o `Localizer` trocado, uma mesma partida manda uma pergunta em português para um jogador e em inglês para outro. Anotar aqui o resultado e o que acontece com o `log`.
- Teste que recusa chave faltando no inglês e, nos arquivos já migrados, texto em português solto no código (no molde do `tests/sem-ponte.test.mjs`).

### Fase 1: telas fora da partida

- Tela inicial, Meus decks, construtor e busca de cartas, salas e sala de espera, conta, Partidas e Rever, Torneios, Sobre, Privacidade e o formulário de relato.
- Cartas em inglês para quem joga em inglês (nome, texto e imagem do Scryfall sem o `pt`).
- Escolha do idioma no menu ⋯.
- Tudo escondido atrás do `mesa:dev` até a fase 2 ficar pronta, como na entrada da conta Google (`docs/spec-login-google.md`).

### Fase 2: a partida

- Textos da própria mesa: caixa de ação, perguntas (`tableQuestion.ts` e afins), avisos, selos, inspetor, histórico, fim de partida e leitor de tela.
- Os 10 pontos que leem o texto em português do Forge passam a usar dados do protocolo (o que faltar a ponte manda), para funcionar em qualquer idioma.
- Servidor com o idioma de cada jogador (decisão 3), incluindo o `log` da partida.
- Os 440 textos próprios da ponte: os erros e avisos viram código mais parâmetros, que a mesa traduz; os que montam frase de jogo usam o idioma do jogador.
- Bots: os nomes e frases do computador no idioma de quem está na mesa.

### Fase 3: conteúdo

- Nomes dos 186 decks prontos (decisão 5) e dos precons (nome oficial em inglês, que já existe).
- "Como jogar", Laboratório (os textos da tela; os cenários prontos podem ficar em português) e as Novidades (decisão 6).
- Página de apresentação em inglês (decisão 8, item 104).
- Admin: mostrar o idioma de cada relato, para responder no idioma certo.

### Fase 4: lançar

- Tirar o `mesa:dev`, revisar o inglês inteiro com alguém fluente que jogue Magic e anunciar.
- Contar quantos jogadores e partidas usam cada idioma (admin e Grafana).
- Atualizar o `CLAUDE.md` e a skill `/entregar` com as regras abaixo.

## Como manter depois

- Todo texto novo que o jogador vê entra pelo `t()` com as duas línguas na mesma mudança; o teste recusa chave sem inglês.
- Cada novidade pendente ganha o texto em inglês junto (decisão 6), e o `publicar-versao` passa a juntar os dois.
- O `tests/sem-ponte.test.mjs` passa a conferir também "bridge" no texto em inglês.
- O `npm run visual` passa a tirar as telas nos dois idiomas, para pegar texto que estoura o espaço.

## Riscos

- **Volume:** mais de 3 mil textos na mesa. A migração vai arquivo por arquivo, com o teste da fase 0 marcando o que já foi.
- **Qualidade do inglês:** tradução automática revisada por quem joga Magic em inglês; um glossário (`docs/glossario-idiomas.md`) com os termos de jogo para manter a coerência.
- **Forge por dentro:** a decisão 3A depende de uma classe interna do Forge; uma atualização do Forge pode quebrá-la. Um teste do servidor confere as duas línguas na mesma partida.
- **Tamanho dos textos:** o inglês costuma ser mais curto, mas botões e selos precisam ser conferidos (fase 0, `npm run visual`).
- **Peso do primeiro acesso:** só o dicionário do idioma em uso é baixado (item 135).
