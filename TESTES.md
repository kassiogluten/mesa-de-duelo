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

**Contrato do estado:** o `ProtocolContractTest` (servidor) monta uma partida e confere que todo campo do estado está em `tests/protocol/state-keys.txt`; o `tests/protocol.test.mjs` confere que todo campo dessa lista está declarado em `src/forge/client.ts`. Campo novo no estado: rode o `ProtocolContractTest` com `-Dprotocol.update=true`, declare o campo no `client.ts` e rode `npm test`.

O hook de pre-commit (`.githooks/pre-commit`, ligado pelo `npm install`) roda `npm test` e `tsc` antes de cada commit que mexe no código da mesa.

## Falhas conhecidas

### Mesa: 1 teste de navegador falha (vista em 2026-11-04, na 0.123.0)

`commander-overlays.browser.mjs`: `1440/4: gallery shifted battlefield` (a galeria da pilha mexe no campo em 1440×900). Comprovado que já existia antes da 0.124.0. Ainda não investigado. (O `commander-table.browser.mjs`, que também estava aqui, passa desde que os testes rodam pelo `npm run test:browser`.)

### Servidor: 3 testes de texto falham na suíte inteira (vista em 2026-11-01, na 0.106.0)

Em 2026-11-04, na 0.125.0, a suíte inteira passou (335 testes, nenhuma falha, estes três inclusive) rodando no Linux, com o Forge em `~/forge`. No mesmo dia, no Windows, os três continuam falhando (e só eles, em 336): é o ambiente de lá.

- `CoinFlipTextTest.promptAsksHeadsOrTailsWithCapitalizedButtons`
- `CoinFlipTextTest.thumbChoiceIsRewrittenOnlyForCoinResults`
- `InputContextTest.targetSelectionCarriesTheTriggerTextWhatItTargetsAndHowManyAreLeft` (erro com o texto do gatilho de Chupacabra Voraz)

Comprovado que já existiam: falham do mesmo jeito com o código do servidor da 0.105.0 (a mudança desfeita com `git stash`). Parecem depender do idioma que o Forge carregou antes (o `CoinFlipTextTest` passa quando roda sozinho; o `InputContextTest` falha até sozinho). Na 0.105.0 a suíte tinha passado inteira (270 testes), então algo no ambiente mudou desde então (talvez o Forge em `C:/Users/Kassio/forge` ou as preferências em `forge-bridge/target/test-home`). Ainda não investigado.
