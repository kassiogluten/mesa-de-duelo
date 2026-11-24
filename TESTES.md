# Testes

Como rodar os testes e quais falhas já são conhecidas. Se uma falha estiver na lista abaixo, ela não foi causada pela mudança que você está fazendo: siga em frente e só diga ao entregar que ela continua. Se aparecer uma falha fora da lista, essa sim precisa ser investigada.

Ao corrigir uma das falhas conhecidas, tire-a desta lista. Ao achar uma nova que comprovadamente já existia antes da sua mudança (rodando de novo sem a mudança: um commit temporário ou `git stash push -u -m <nome>`, nunca o `git stash` puro, que é compartilhado entre as cópias do repositório), acrescente-a aqui com a data.

## Como rodar

**Mesa (navegador):**

```sh
npm test                       # todos os testes (uns 6 s)
npx tsc --noEmit -p .          # tipos
npm run build                  # build
npm run test:browser           # testes de navegador (sobe a mesa sozinho; uns 2 min). Um só: npm run test:browser -- graveyard
```

O `npm test` carrega o `tests/register.mjs`, que deixa o teste importar o código da mesa direto (`await import('../src/ui/x.ts')`): ele resolve os imports sem extensão, converte o TypeScript, troca CSS por módulo vazio e simula o `import.meta.env`. Teste novo não precisa montar import nenhum à mão. Teste de navegador novo usa o `browserSession` de `tests/browser-helper.mjs`. Para rodar um arquivo só: `node --import ./tests/register.mjs --test tests/<nome>.test.mjs`.

**Servidor (`forge-bridge`):** precisa do JDK 17 e do Forge em `~/forge` (no Windows, `C:/Users/Kassio/forge`). Outro lugar: acrescente `-Dforge.dir=/caminho`. O `npm run forge` e o pre-commit usam o `FORGE_DIR` do `.env`, se houver: rodando à mão, passe o mesmo (`-Dforge.dir=$FORGE_DIR`), senão as cartas mais novas (Star Trek) aparecem como desconhecidas.

```sh
cd forge-bridge
JAVA_HOME="/c/Program Files/Eclipse Adoptium/jdk-17.0.20.101-hotspot" mvn -o test
```

Para uma classe só: acrescente `-q -Dtest=NomeDoTest` (várias: `-Dtest=A,B`). A suíte inteira leva uns 30 s. O motor do Forge liga sozinho antes do primeiro teste (`EngineListener`); partidas de teste saem de `TestGames` (`empty()`, `pauper(...)`, `add(...)`).

**Partidas de verdade:** `npm run test:e2e` sobe o servidor numa porta própria (7199) e roda os `forge-bridge/scripts/test-*.mjs` contra ele (uns 4 min; um só: `npm run test:e2e -- undo`).

**Refatoração sem mudar a tela:** `npm run visual -- snap <pasta>` tira prints de 37 telas (páginas de teste da mesa e telas do site) em dois tamanhos (sem animações e sem as imagens das cartas, que carregam em tempos diferentes). Tire antes e depois da mudança e rode `npm run visual -- compare <antes> <depois>`: grava `diff-*.png` onde mudou. O ruído conhecido (relógios, mesa livre embaralhada, nomes que chegam do Scryfall) fica em `NOISE`, no script: aparece na saída e não conta. A partir da 0.126.1 cobre 36 telas, inclusive Meus decks, construtor, Laboratório, menu ⋯ e mesa livre.

**Mesa no PC (`godot-table/`, Godot 4.7.2; `docs/spec-mesa-godot.md`):** o `npm run godot -- <args>` acha o executável do Godot (variável `GODOT`, PATH ou instalação do winget).

```sh
npm run godot:smoke              # conecta ao servidor local (npm run forge), confere o hello e mede um ping
npm run godot:test-atualizador   # exporta o executável e testa o atualizador de ponta a ponta, o zip e o .tar.gz do Linux do site (uns 2 min; precisa dos templates do Windows e do Linux)
npm run godot:pck                # gera o pacote do jogo e o versao.json em dist/mesa-pc/ (o deploy faz isso sozinho)
npm run godot:zip                # depois do godot:pck: exporta os executáveis e monta o mesa-de-duelo-pc.zip e o mesa-de-duelo-pc-linux.tar.gz do site (o deploy faz isso sozinho)
```

```sh
npm run godot:test               # testes dentro do Godot (godot-table/tests/test_*.gd); um arquivo: npm run godot:test -- table_view
npm run godot:partida            # inicia contra o computador, derruba a conexão e confere a volta ao assento (servidor local ligado)
npm run godot:crossplay          # crossplay nos dois sentidos: a mesa no PC cria e o site entra, depois o contrário (servidor local ligado)
npm run godot:golden             # regrava os fixtures dourados dos textos (godot-table/tests/golden/) a partir dos testes de TS
```

Mudou um texto da mesa do navegador (frase curta, pedidos, possessivos): o `tests/godot-golden.test.mjs` falha; rode `npm run godot:golden` e ajuste o porte em `godot-table/text/` até o `npm run godot:test` passar.

Para ver a mesa: `npm run godot` abre a tela inicial. Variáveis úteis: `MESA_PARTIDA_DIRETO=1` pula a tela inicial, `MESA_COMMANDER=1` escolhe o Commander com 4, `MESA_LAB=<botão>` abre o laboratório de efeitos e aperta o botão (ex.: `MESA_LAB=Destruída`), `MESA_AUTOJOGAR=1` joga sozinho, `MESA_PRINT=<arquivo.png>` (com `MESA_PRINT_APOS=<s>`) salva um print e fecha, imprimindo o resumo de FPS, o medidor de FPS fica sempre no canto de cima à esquerda (`MESA_FPS=1` ou F3 acrescentam os objetos desenhados), `FORGE_URL` troca o servidor. Para depurar cliques: `MESA_LOG_ENVIO=1` imprime cada mensagem mandada ao servidor e cada clique em carta, `MESA_TESTE_CLIQUE=1` aceita a mão e clica numa carta jogável da mão pelo caminho real do mouse, e `MESA_SAIR_APOS=<s>` fecha sozinho (dá para rodar com `--headless`, sem a janela aparecer e receber cliques de quem está usando o PC). Exemplo: `MESA_PARTIDA_DIRETO=1 MESA_AUTOJOGAR=1 MESA_PRINT=mesa.png MESA_PRINT_APOS=60 npm run godot -- --resolution 1600x900 --disable-vsync`.

O `godot:test-atualizador` precisa dos templates de exportação do Windows em `%APPDATA%/Godot/export_templates/4.7.2.stable/` (`windows_release_x86_64.exe` e `windows_debug_x86_64.exe`).

**Código morto:** `npm run unused` lista exports que ninguém usa ("morto" pode apagar).

**Contrato do estado:** o `ProtocolContractTest` (servidor) monta uma partida e confere que todo campo do estado está em `tests/protocol/state-keys.txt`; o `tests/protocol.test.mjs` confere que todo campo dessa lista está declarado em `src/forge/protocol.ts`. Campo novo no estado: rode o `ProtocolContractTest` com `-Dprotocol.update=true`, declare o campo no `protocol.ts` e rode `npm test`.

O hook de pre-commit (`.githooks/pre-commit`, ligado pelo `npm install`) roda `npm test` e `tsc` antes de cada commit que mexe no código da mesa.

## Falhas conhecidas

Sete, desde 2026-11-13, 2026-11-16, 2026-11-18 e 2026-11-19 (a do servidor com as cartas de Star Trek passou inteira em 16/11/2026); fora elas, a suíte da mesa, a do servidor, os testes de navegador e as partidas (`test:e2e`) passam inteiros, e qualquer outra falha é nova e precisa ser investigada.

- `test-lab-scenarios` no `npm run test:e2e` (2026-11-13): o cenário "Shared Fate: a carta exilada do grimório do oponente" (para investigar, da 0.166.0) falha em "exílio do Jogador 2", 49/50, todas as vezes pelo executor, também no código de antes da mudança daquele dia (conferido com `git stash push -u -m`). Rodando o script sozinho contra um servidor já de pé (`node forge-bridge/scripts/test-lab-scenarios.mjs ws://127.0.0.1:7171/ws`) passavam os 50; em 15/11/2026 falhou também sozinho (50/51), no mesmo cenário e no código do servidor de antes da mudança daquele dia (conferido com `git stash push -- forge-bridge/src/main`). O executor só mostra as últimas 40 linhas, e a linha `FAIL` fica antes delas.
- `gpu-layer.browser.mjs` no `npm run test:browser` (2026-11-18): "the living table drew 5 frames in 1 s (about 30 expected)", a mesa viva desenha poucos quadros no navegador sem tela desta máquina (Linux); falhou também no código de antes da mudança daquele dia (o limpa campo), conferido com o stash.
- `commander-overlays.browser.mjs` no `npm run test:browser` (2026-11-18): a comparação das caixas das sobreposições (`deepStrictEqual` das posições) dá outros números; falhou também no código de antes da mudança daquele dia (o limpa campo), conferido com o stash.
- `test-reveal-choose` no `npm run test:e2e` (2026-11-18): "Tempo esgotado: quem assiste vê as cartas enquanto ele escolhe", quem assiste não recebe a janela de espera (`waiting`) do Grisly Salvage; falhou também com o servidor no código de antes da mudança daquele dia (o selo de ninjutsu e sneak), conferido com o stash. Em 19/11/2026, na suíte, falhou antes, por tempo, em "quem joga recebe direto a escolha" (a pergunta do Grisly Salvage não chegou em 15 s com a máquina carregada); sozinho, duas vezes, passou dali e parou no ponto de sempre. Mais tarde no mesmo dia falhou também em "alvo ou pagamento", e falhou do mesmo jeito com o servidor sem a mudança daquele dia (busca de dois destinos e dano dividido), conferido com o stash: o ponto da falha muda com o tempo da máquina.
- `test-preferences` no `npm run test:e2e` (2026-11-18): com "passar sozinho" desligado, a entrada muda de número (`gen` 8 → 10) durante a espera de 1,2 s na prioridade vazia (`assert.equal(a.state.input.gen, gen)`); falhou também, duas vezes seguidas, no código de antes da mudança daquele dia (o efeito do ward), conferido numa worktree da main. Em 19/11/2026 falhou também por tempo em "Timeout Bo3 next game" com a mudança daquele dia e, sem ela (stash), duas vezes na asserção de sempre.
- `test-protocol` no `npm run test:e2e` (2026-11-19): "Timeout: registered pool rejection", o deck ilegal mandado no sideboard (Island num deck só de Mountain) não volta como `validation-error`; falhou também com o servidor sem a mudança daquele dia (a escolha de número), conferido desfazendo os três arquivos dela, com outras mudanças ainda não commitadas na cópia (golpe de comandante, decks de Sacola 50).
- `card-text-fit.browser.mjs` no `npm run test:browser` (2026-11-24): "na carta menor a letra fica menor ou igual"; falha sempre nesta máquina (Linux), também no commit de antes da mudança daquele dia (a tela de detalhes do deck), conferido numa worktree separada do mesmo commit.
- `image-loading.browser.mjs` no `npm run test:browser` (2026-11-16): espera as imagens da cena (`#cena img`) chegarem de `cards.scryfall.io` e o tempo acaba antes; falhou também no código de antes da mudança daquele dia (a placa da masmorra), então depende da rede e do Scryfall, não da mesa.

Testes que já falharam de vez em quando e passaram ao rodar de novo (máquina carregada, várias mesas e servidores subindo juntos): `attack-groups`, `commander-table` e `artwork-click` (navegador) e `test-end-step-stop`, `test-commander`, `test-lifecycle` (em 07/11/2026 falhou na suíte inteira antes e depois da mudança da 0.147.0, por tempo em "survivors play after chooser concedes", e passou sozinho) e `test-damage-events` (partidas; este último falhou 1 vez em 4 também sem a mudança em 05/11/2026, na comparação da mão; e `test-damage-events`, que falhou 1 vez no `test:e2e` e 1 em 3 sozinho em 06/11/2026, quando a partida acaba antes de todos os danos conferidos aparecerem, sem relação com a mudança). Em 19/11/2026 o `test-undo` falhou 2 vezes (na suíte e sozinho, por tempo em "Ana no próximo prompt", depois de passar a vez na principal 1) e passou nas 3 seguintes (uma sem a mudança da escolha de número, duas com ela). O `test-commander` falha cerca de metade das vezes, mesmo sozinho, por tempo em "4-player AI round completes" (a volta de três computadores com decks de Commander passa dos 25 s); em 09/11/2026 falhou 3 de 6 no código de antes da 0.154.0 e 3 de 7 depois, então não conta como falha nova. Em 09/11/2026 o `test-lifecycle` falhou 3 vezes seguidas (na suíte e sozinho, em "survivors play after chooser concedes"), também no código da 0.155.0 sem a mudança da 0.155.1, e passou na suíte inteira em 10/11/2026 (0.156.1): instável, não quebrado. Se um deles falhar, rode de novo sozinho antes de investigar; se falhar duas vezes, é de verdade.
