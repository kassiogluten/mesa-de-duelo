---
name: entregar
description: Lista de conferência para fechar uma mudança da Mesa de Duelo antes do commit (CHANGELOG, versão, Novidades em imagens, cenário do Laboratório, testes). Use ao terminar qualquer mudança que o jogador percebe, ou quando pedirem para entregar/commitar.
---

# Entregar uma mudança

Siga na ordem. Pule o que não se aplica, e diga o que pulou e por quê ao entregar. As regras completas estão no `CLAUDE.md`; aqui fica só o caminho.

## 1. CHANGELOG e versão
- `git log origin/main..HEAD --oneline` e `head -40 CHANGELOG.md`: se a seção do topo ainda não está na `main`, acrescente nela; senão abra uma nova (Z: correção, Y: novidade, X: quebra).
- Itens em `### Novo` / `### Mudou` / `### Corrigido`, começando por `**Título.**`, em português para o jogador, sem "ponte", sem nomes de código.
- Nova versão: `npm version X.Y.Z --no-git-tag-version`.
- Não leia o CHANGELOG inteiro (185 KB): `head` basta.

## 2. Novidades em imagens
- Para cada item novo, um print recortado no detalhe:
  `npm run dev` ligado e `npm run print -- tests/fixtures/<página>.html[?query] "<seletor>" public/novidades/<versão>/<nome>.webp [--setup "<js com window.fixture>"] [--viewport 1366x768]`
- Confira a imagem (Read no arquivo) antes de registrar.
- Registre em `src/novidades.json`: versão → título exato do item (sem o ponto) → `[{ "img": "<versão>/<nome>.webp", "legenda": "..." }]`.

## 3. Cenário do Laboratório (só correções de regra ou carta)
- Acrescente no começo de `src/lab-cenarios.json`: `nome`, `versao`, `item`, `conferir`, `cenario` (o formato de "Copiar cenário": `active`, `phase`, `players[2]` com `life`, `poison`, `hand`, `library`, `graveyard`, `exile`, `battlefield`).
- Correção que já tem cenário: atualize em vez de criar outro.

## 4. Testes
- Mesa: `npm test` e `npx tsc --noEmit -p .` (segundos).
- Mexeu no servidor: `cd forge-bridge && JAVA_HOME="/c/Program Files/Eclipse Adoptium/jdk-17.0.20.101-hotspot" mvn -o -q test -Dtest=<Classes>`; a suíte inteira leva ~30 s.
- Mudou um campo do estado (Java ou `src/forge/client.ts`): rode o `ProtocolContractTest` (com `-Dprotocol.update=true` se o campo é novo) e o `npm test`.
- Falhou? Veja `TESTES.md` antes de investigar; as conhecidas só precisam ser citadas.

## 5. Roadmap
- Item do `ROADMAP.md` concluído: marque ✅ e mova a seção para `docs/roadmap-feito.md`.

## 6. Commit
- Só se pedirem. Mensagem em português no estilo do `git log` (o que muda para o jogador, versão entre parênteses).
