# Testes

Como rodar os testes e quais falhas já são conhecidas. Se uma falha estiver na lista abaixo, ela não foi causada pela mudança que você está fazendo: siga em frente e só diga ao entregar que ela continua. Se aparecer uma falha fora da lista, essa sim precisa ser investigada.

Ao corrigir uma das falhas conhecidas, tire-a desta lista. Ao achar uma nova que comprovadamente já existia antes da sua mudança (rodando de novo sem a mudança: um commit temporário ou `git stash push -u -m <nome>`, nunca o `git stash` puro, que é compartilhado entre as cópias do repositório), acrescente-a aqui com a data.

## Como rodar

**Mesa (navegador):**

```sh
npm test                       # todos os testes (uns 6 s)
npx tsc --noEmit -p .          # tipos
npm run build                  # build
```

O `npm test` carrega o `tests/register.mjs`, que deixa o teste importar o código da mesa direto (`await import('../src/ui/x.ts')`): ele resolve os imports sem extensão, converte o TypeScript, troca CSS por módulo vazio e simula o `import.meta.env`. Teste novo não precisa montar import nenhum à mão. Para rodar um arquivo só: `node --import ./tests/register.mjs --test tests/<nome>.test.mjs`.

**Servidor (`forge-bridge`):** precisa do JDK 17 e do Forge em `~/forge` (no Windows, `C:/Users/Kassio/forge`). Outro lugar: acrescente `-Dforge.dir=/caminho`.

```sh
cd forge-bridge
JAVA_HOME="/c/Program Files/Eclipse Adoptium/jdk-17.0.20.101-hotspot" mvn -o test
```

Para uma classe só: acrescente `-q -Dtest=NomeDoTest` (várias: `-Dtest=A,B`). A suíte inteira leva uns 30 s. O motor do Forge liga sozinho antes do primeiro teste (`EngineListener`); partidas de teste saem de `TestGames` (`empty()`, `pauper(...)`, `add(...)`).

**Contrato do estado:** o `ProtocolContractTest` (servidor) monta uma partida e confere que todo campo do estado está em `tests/protocol/state-keys.txt`; o `tests/protocol.test.mjs` confere que todo campo dessa lista está declarado em `src/forge/client.ts`. Campo novo no estado: rode o `ProtocolContractTest` com `-Dprotocol.update=true`, declare o campo no `client.ts` e rode `npm test`.

## Falhas conhecidas

### Mesa: 2 testes de navegador falham (vista em 2026-11-04, na 0.123.0)

Os `tests/*.browser.mjs` rodam com o `npx vite` ligado. Uns esperam a mesa em `http://localhost:5174`, outros em `http://127.0.0.1:5173`: rode com `TABLE_TEST_URL=http://localhost:5174 node tests/<nome>.browser.mjs` para todos usarem o mesmo endereço.

- `commander-overlays.browser.mjs`: `1440/4: gallery shifted battlefield`.
- `commander-table.browser.mjs`: na 0.123.0 caía em `1280: creatures clipped`; desde a 0.124.0 passa em 1440×900 e 1280×800 e cai em 844×390 (a janela da carta cobre o botão da pilha, ou `"undefined" is not valid JSON` rodando só esse tamanho).

Comprovado que já existiam: com a mudança da 0.124.0 desfeita (`git stash`), falham igual (o tamanho 844×390 rodado sozinho falha do mesmo jeito). Ainda não investigado.

### Servidor: 3 testes de texto falham na suíte inteira (vista em 2026-11-01, na 0.106.0)

Em 2026-11-04, na 0.125.0, a suíte inteira passou (335 testes, nenhuma falha, estes três inclusive) rodando no Linux, com o Forge em `~/forge`. No mesmo dia, no Windows, os três continuam falhando (e só eles, em 336): é o ambiente de lá.

- `CoinFlipTextTest.promptAsksHeadsOrTailsWithCapitalizedButtons`
- `CoinFlipTextTest.thumbChoiceIsRewrittenOnlyForCoinResults`
- `InputContextTest.targetSelectionCarriesTheTriggerTextWhatItTargetsAndHowManyAreLeft` (erro com o texto do gatilho de Chupacabra Voraz)

Comprovado que já existiam: falham do mesmo jeito com o código do servidor da 0.105.0 (a mudança desfeita com `git stash`). Parecem depender do idioma que o Forge carregou antes (o `CoinFlipTextTest` passa quando roda sozinho; o `InputContextTest` falha até sozinho). Na 0.105.0 a suíte tinha passado inteira (270 testes), então algo no ambiente mudou desde então (talvez o Forge em `C:/Users/Kassio/forge` ou as preferências em `forge-bridge/target/test-home`). Ainda não investigado.
