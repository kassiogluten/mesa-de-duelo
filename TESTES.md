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

**Servidor (`forge-bridge`):** precisa do JDK 17 e do Forge em `~/forge` (no Windows, `C:/Users/Kassio/forge`). Outro lugar: acrescente `-Dforge.dir=/caminho`.

```sh
cd forge-bridge
JAVA_HOME="/c/Program Files/Eclipse Adoptium/jdk-17.0.20.101-hotspot" mvn -o test
```

Para uma classe só: acrescente `-q -Dtest=NomeDoTest` (várias: `-Dtest=A,B`). A suíte inteira leva uns 30 s. O motor do Forge liga sozinho antes do primeiro teste (`EngineListener`); partidas de teste saem de `TestGames` (`empty()`, `pauper(...)`, `add(...)`).

**Partidas de verdade:** `npm run test:e2e` sobe o servidor numa porta própria (7199) e roda os `forge-bridge/scripts/test-*.mjs` contra ele (uns 4 min; um só: `npm run test:e2e -- undo`).

**Refatoração sem mudar a tela:** `npm run visual -- snap <pasta>` tira prints de 36 telas (páginas de teste da mesa e telas do site) em dois tamanhos (sem animações e sem as imagens das cartas, que carregam em tempos diferentes). Tire antes e depois da mudança e rode `npm run visual -- compare <antes> <depois>`: grava `diff-*.png` onde mudou. O ruído conhecido (relógios, mesa livre embaralhada, nomes que chegam do Scryfall) fica em `NOISE`, no script: aparece na saída e não conta. A partir da 0.126.1 cobre 36 telas, inclusive Meus decks, construtor, Laboratório, menu ⋯ e mesa livre.

**Código morto:** `npm run unused` lista exports que ninguém usa ("morto" pode apagar).

**Contrato do estado:** o `ProtocolContractTest` (servidor) monta uma partida e confere que todo campo do estado está em `tests/protocol/state-keys.txt`; o `tests/protocol.test.mjs` confere que todo campo dessa lista está declarado em `src/forge/protocol.ts`. Campo novo no estado: rode o `ProtocolContractTest` com `-Dprotocol.update=true`, declare o campo no `protocol.ts` e rode `npm test`.

O hook de pre-commit (`.githooks/pre-commit`, ligado pelo `npm install`) roda `npm test` e `tsc` antes de cada commit que mexe no código da mesa.

## Falhas conhecidas

Nenhuma desde 2026-11-04 (0.126.1): a suíte da mesa, a do servidor, os testes de navegador e as partidas (`test:e2e`) passam inteiros. Qualquer falha agora é nova e precisa ser investigada.

Testes que já falharam de vez em quando e passaram ao rodar de novo (máquina carregada, várias mesas e servidores subindo juntos): `attack-groups`, `commander-table` e `artwork-click` (navegador) e `test-end-step-stop`, `test-commander`, `test-lifecycle` (em 07/11/2026 falhou na suíte inteira antes e depois da mudança da 0.147.0, por tempo em "survivors play after chooser concedes", e passou sozinho) e `test-damage-events` (partidas; este último falhou 1 vez em 4 também sem a mudança em 05/11/2026, na comparação da mão; e `test-damage-events`, que falhou 1 vez no `test:e2e` e 1 em 3 sozinho em 06/11/2026, quando a partida acaba antes de todos os danos conferidos aparecerem, sem relação com a mudança). O `test-commander` falha cerca de metade das vezes, mesmo sozinho, por tempo em "4-player AI round completes" (a volta de três computadores com decks de Commander passa dos 25 s); em 09/11/2026 falhou 3 de 6 no código de antes da 0.154.0 e 3 de 7 depois, então não conta como falha nova. Em 09/11/2026 o `test-lifecycle` falhou 3 vezes seguidas (na suíte e sozinho, em "survivors play after chooser concedes"), também no código da 0.155.0 sem a mudança da 0.155.1: falha que já existia, ainda sem investigar. Se um deles falhar, rode de novo sozinho antes de investigar; se falhar duas vezes, é de verdade.
