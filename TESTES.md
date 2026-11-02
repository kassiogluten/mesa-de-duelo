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

`npm test` (sem `--experimental-strip-types`) também funciona, mas veja a falha conhecida abaixo.

**Servidor (`forge-bridge`):** precisa do JDK 17 e do Forge em `C:/Users/Kassio/forge`. O `-Dforge.dir` vai duas vezes: como propriedade e dentro do `argLine`.

```sh
cd forge-bridge
JAVA_HOME="/c/Program Files/Microsoft/jdk-17.0.13.11-hotspot" \
  mvn -o test -Dforge.dir=C:/Users/Kassio/forge -DargLine="-Dforge.dir=C:/Users/Kassio/forge"
```

Para uma classe só: acrescente `-Dtest=NomeDoTest`. A suíte inteira leva uns 4 minutos.

## Falhas conhecidas

### Mesa: 11 arquivos falham com `npm test` no Node 22.15 (desde antes da 0.105.0)

Os arquivos de teste que importam `.ts` direto falham com `ERR_UNKNOWN_FILE_EXTENSION`: esta versão do Node só carrega `.ts` com `--experimental-strip-types`. É do ambiente, não do código. Com `node --experimental-strip-types --test tests/*.test.mjs`, todos passam (420 testes na 0.106.0).

### Servidor: 3 testes de texto falham na suíte inteira (vista em 2026-11-01, na 0.106.0)

- `CoinFlipTextTest.promptAsksHeadsOrTailsWithCapitalizedButtons`
- `CoinFlipTextTest.thumbChoiceIsRewrittenOnlyForCoinResults`
- `InputContextTest.targetSelectionCarriesTheTriggerTextWhatItTargetsAndHowManyAreLeft` (erro com o texto do gatilho de Chupacabra Voraz)

Comprovado que já existiam: falham do mesmo jeito com o código do servidor da 0.105.0 (a mudança desfeita com `git stash`). Parecem depender do idioma que o Forge carregou antes (o `CoinFlipTextTest` passa quando roda sozinho; o `InputContextTest` falha até sozinho). Na 0.105.0 a suíte tinha passado inteira (270 testes), então algo no ambiente mudou desde então (talvez o Forge em `C:/Users/Kassio/forge` ou as preferências em `forge-bridge/target/test-home`). Ainda não investigado.
