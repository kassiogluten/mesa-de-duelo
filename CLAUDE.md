# Mesa de Duelo

## Novidades (CHANGELOG.md)

O painel **Novidades** da tela inicial é gerado do `CHANGELOG.md` (`src/ui/changelog.ts`), e a versão mostrada é a da primeira seção. Ele só fica atualizado se o arquivo for atualizado junto com o código:

- Toda mudança que o jogador percebe (recurso, deck, regra, tela, correção) entra no `CHANGELOG.md` **na mesma mudança de código**, sem esperar pedido.
- Escreva em português, para o jogador: o que muda na mesa, não o que mudou no código. Nada de nomes de arquivos, funções ou classes CSS.
- Use as seções `### Novo`, `### Mudou` e `### Corrigido`, com o cabeçalho `## [X.Y.Z] - AAAA-MM-DD`.
- Versão: **Z** para só correções, **Y** para coisas novas (decks, telas, regras, recursos), **X** quando algo deixa de funcionar como antes. Se a seção do topo ainda não foi publicada (não está na `main`), acrescente nela em vez de abrir outra.
- Mantenha o `version` do `package.json` (e do `package-lock.json`, via `npm version X.Y.Z --no-git-tag-version`) igual ao do topo do `CHANGELOG.md`.
- Mudanças só internas (testes, refatoração, build) não entram.
