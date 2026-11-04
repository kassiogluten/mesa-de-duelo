# Testes

Como rodar os testes e quais falhas já são conhecidas. Se uma falha estiver na lista abaixo, ela não foi causada pela mudança que você está fazendo: siga em frente e só diga ao entregar que ela continua. Se aparecer uma falha fora da lista, essa sim precisa ser investigada.

Ao corrigir uma das falhas conhecidas, tire-a desta lista. Ao achar uma nova que comprovadamente já existia antes da sua mudança (rodando de novo sem a mudança, com `git stash`), acrescente-a aqui com a data.

## Como rodar

**Mesa (navegador):**

```sh
npx tsc --noEmit -p .          # tipos
npm run build                  # build
node --experimental-strip-types --test tests/*.test.mjs   # todos os testes
```

`npm test` (sem `--experimental-strip-types`) também funciona, mas veja a falha conhecida abaixo. Se o `node` do terminal for o 18 (que não tem `--experimental-strip-types`), use o 22 do nvm direto: `/c/Users/Kassio/AppData/Local/nvm/v22.19.0/node.exe --experimental-strip-types --test tests/*.test.mjs`.

**Servidor (`forge-bridge`):** precisa do JDK 17 e do Forge em `C:/Users/Kassio/forge`. O `-Dforge.dir` vai duas vezes: como propriedade e dentro do `argLine`.

```sh
cd forge-bridge
JAVA_HOME="/c/Program Files/Eclipse Adoptium/jdk-17.0.20.101-hotspot" \
  mvn -o test -Dforge.dir=C:/Users/Kassio/forge -DargLine="-Dforge.dir=C:/Users/Kassio/forge"
```

Para uma classe só: acrescente `-Dtest=NomeDoTest`. A suíte inteira leva uns 4 minutos.

## Falhas conhecidas

### Mesa: 11 arquivos falham com `npm test` no Node 22.15 (desde antes da 0.105.0)

Os arquivos de teste que importam `.ts` direto falham com `ERR_UNKNOWN_FILE_EXTENSION`: esta versão do Node só carrega `.ts` com `--experimental-strip-types`. É do ambiente, não do código. Com `node --experimental-strip-types --test tests/*.test.mjs`, todos passam (420 testes na 0.106.0).

### Mesa: 2 testes de navegador falham (vista em 2026-11-04, na 0.123.0)

Os `tests/*.browser.mjs` rodam com o `npx vite` ligado. Uns esperam a mesa em `http://localhost:5174`, outros em `http://127.0.0.1:5173`: rode com `TABLE_TEST_URL=http://localhost:5174 node tests/<nome>.browser.mjs` para todos usarem o mesmo endereço.

- `commander-overlays.browser.mjs`: `1440/4: gallery shifted battlefield`.
- `commander-table.browser.mjs`: na 0.123.0 caía em `1280: creatures clipped`; desde a 0.124.0 passa em 1440×900 e 1280×800 e cai em 844×390 (a janela da carta cobre o botão da pilha, ou `"undefined" is not valid JSON` rodando só esse tamanho).

Comprovado que já existiam: com a mudança da 0.124.0 desfeita (`git stash`), falham igual (o tamanho 844×390 rodado sozinho falha do mesmo jeito). Ainda não investigado.

### Servidor: 3 testes de texto falham na suíte inteira (vista em 2026-11-01, na 0.106.0)

- `CoinFlipTextTest.promptAsksHeadsOrTailsWithCapitalizedButtons`
- `CoinFlipTextTest.thumbChoiceIsRewrittenOnlyForCoinResults`
- `InputContextTest.targetSelectionCarriesTheTriggerTextWhatItTargetsAndHowManyAreLeft` (erro com o texto do gatilho de Chupacabra Voraz)

Comprovado que já existiam: falham do mesmo jeito com o código do servidor da 0.105.0 (a mudança desfeita com `git stash`). Parecem depender do idioma que o Forge carregou antes (o `CoinFlipTextTest` passa quando roda sozinho; o `InputContextTest` falha até sozinho). Na 0.105.0 a suíte tinha passado inteira (270 testes), então algo no ambiente mudou desde então (talvez o Forge em `C:/Users/Kassio/forge` ou as preferências em `forge-bridge/target/test-home`). Ainda não investigado.

### Servidor: `AdminTest.listsLiveMatchesWithoutSecrets` falha sozinho (vista em 2026-11-02, na 0.118.0)

Erro `ExceptionInInitializerError` em `UndoHistory.<clinit>`: o teste cria uma sala (`Session.room`) sem ligar o motor do Forge antes (`BridgeRulesTest.engine()`). Comprovado que já existia (falha igual com a mudança desfeita por `git stash`). Rodado com `-Dtest` junto de outras classes, ele pode quebrar a inicialização de `PhaseType` e derrubar as classes seguintes (o `MatchHistoryTest` deu 6 erros assim, e passa inteiro sozinho).
