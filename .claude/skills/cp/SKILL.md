---
name: cp
description: Commit e push na main da Mesa de Duelo, de uma vez. Use quando pedirem "commit e push", "cp" ou "sobe na main".
---

# Commit e push na main

Pedir `/cp` já é a autorização para commitar e dar push na `main`; não pergunte de novo. Siga em ordem e pare no primeiro problema, dizendo qual foi.

1. `git status --short` e `git diff --stat`: veja o que vai entrar. Fica de fora o que não é do projeto (prints soltos, logs, arquivos temporários); se algo parecer de outra pessoa ou de outra tarefa, pergunte antes.
2. Mudança que o jogador percebe e ainda sem `CHANGELOG.md`, versão ou imagens: rode o `/entregar` antes.
3. `git fetch` e, se a `origin/main` andou, `git pull --rebase`. Conflito: pare e conte.
4. `git add` dos arquivos da mudança (pelo nome, ou `-A` quando tudo é da mudança) e `git commit` com a mensagem no estilo do `git log`: em português, o que muda para o jogador, e a versão entre parênteses quando o `CHANGELOG.md` ganhou uma (`... (0.135.0)`). Termine com a linha de coautoria das instruções do sistema.
5. O hook de pre-commit roda `npm test` e `tsc`. Se falhar, corrija e faça um commit novo; nunca `--no-verify`.
6. `git push`. Recusado: `git pull --rebase` e push de novo; nunca `--force`.
7. Responda com o hash, a mensagem e o que entrou, em uma ou duas linhas. Se o `forge-bridge/` mudou, lembre que o servidor local precisa estar reiniciado (`CLAUDE.md`, "Servidor local").
