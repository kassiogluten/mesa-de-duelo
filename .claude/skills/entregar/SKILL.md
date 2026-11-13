---
name: entregar
description: Lista de conferência para fechar uma mudança da Mesa de Duelo antes do commit (novidade pendente, Novidades em imagens, cenário do Laboratório, testes). Use ao terminar qualquer mudança que o jogador percebe, ou quando pedirem para entregar/commitar.
---

# Entregar uma mudança

Siga na ordem. Pule o que não se aplica, e diga o que pulou e por quê ao entregar. As regras completas estão no `CLAUDE.md`; aqui fica só o caminho.

## 1. Novidade pendente (sem número de versão)
- Não mexa no `CHANGELOG.md`, `src/novidades.json`, `src/lab-cenarios.json` nem no `version` do `package.json`: o número só sai no `/cp` (`npm run publicar-versao`), e é isso que evita duas worktrees com a mesma versão.
- Escreva em `novidades-pendentes/<nome-da-mudanca>/novidade.md` (formato no `README.md` de lá). A mudança já tem pasta? Acrescente nela.
- Itens em `### Novo` / `### Mudou` / `### Corrigido`, começando por `**Título.**`, em português para o jogador, sem "ponte", sem nomes de código.
- Algo deixa de funcionar como antes (versão X)? Diga ao entregar, para o `/cp` publicar com `--x`.

## 2. Novidades em imagens
- Para cada item novo, um print recortado no detalhe, salvo na pasta da mudança:
  `npm run dev` ligado e `npm run print -- tests/fixtures/<página>.html[?query] "<seletor>" novidades-pendentes/<pasta>/<nome>.webp [--setup "<js com window.fixture>"] [--viewport 1366x768]`
- Confira a imagem (Read no arquivo) antes de registrar.
- Registre no `imagens.json` da pasta: título exato do item (sem o ponto) → `[{ "img": "<nome>.webp", "legenda": "..." }]`.

## 3. Cenário do Laboratório (só correções de regra ou carta)
- No `cenarios.json` da pasta da mudança (uma lista, no estilo de `src/lab-cenarios.json`): `nome`, `item`, `conferir`, `cenario` (o formato de "Copiar cenário": `active`, `phase`, `players[2]` com `life`, `poison`, `hand`, `library`, `graveyard`, `exile`, `battlefield`). **Sem `versao`**: ela entra na publicação.
- Correção que já tem cenário publicado: atualize-o em `src/lab-cenarios.json` em vez de criar outro. Se ele estava como para investigar (sem `versao` e `item`), tire-o de lá e ponha no `cenarios.json` da mudança, com o `item`.

## 4. Testes
- Mesa: `npm test` e `npx tsc --noEmit -p .` (segundos).
- Mexeu no servidor: `cd forge-bridge && JAVA_HOME="/c/Program Files/Eclipse Adoptium/jdk-17.0.20.101-hotspot" mvn -o -q test -Dtest=<Classes>`; a suíte inteira leva ~30 s.
- Mudou um campo do estado (Java ou `src/forge/protocol.ts`): rode o `ProtocolContractTest` (com `-Dprotocol.update=true` se o campo é novo) e o `npm test`.
- Mexeu na tela: `npm run test:browser`. Mexeu nas regras ou no servidor: `npm run test:e2e` (partidas de verdade).
- Refatoração que não pode mudar a tela: `npm run visual -- snap` antes e depois, e `compare`.
- Falhou? Veja `TESTES.md` antes de investigar; as conhecidas só precisam ser citadas.

## 4b. Servidor local
- Mexeu no `forge-bridge/` (ou um pull trouxe mudança nele): reinicie o servidor da 7171 (`npm run forge` em segundo plano, depois de parar o processo da porta) e diga ao entregar que a mesa precisa ser recarregada. Detalhes no `CLAUDE.md`, "Servidor local".

## 5. Roadmap
- Item do `ROADMAP.md` concluído: marque ✅ e mova a seção para `docs/roadmap-feito.md`.

## 6. Commit
- Só se pedirem. Mensagem em português no estilo do `git log` (o que muda para o jogador). A versão entre parênteses só aparece no `/cp`, quando a novidade ganha número.
