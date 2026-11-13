---
name: cp
description: Commit e push na main da Mesa de Duelo, de uma vez. Use quando pedirem "commit e push", "cp" ou "sobe na main".
---

# Commit e push na main

Pedir `/cp` já é a autorização para commitar e dar push na `main`; não pergunte de novo. Siga em ordem e pare no primeiro problema, dizendo qual foi.

1. `git status --short` e `git diff --stat`: veja o que vai entrar. Fica de fora o que não é do projeto (prints soltos, logs, arquivos temporários); se algo parecer de outra pessoa ou de outra tarefa, pergunte antes.
2. Mudança que o jogador percebe e ainda sem novidade pendente (`novidades-pendentes/<pasta>/`) ou imagens: rode o `/entregar` antes.
3. `git fetch` e, se a `origin/main` andou, `git pull --rebase` (ou `git rebase origin/main` numa branch). As novidades pendentes ficam em pastas próprias e não dão conflito; outro conflito: pare e conte.
4. Commit do trabalho: `git add` dos arquivos da mudança (pelo nome, ou `-A` quando tudo é da mudança) e `git commit` com a mensagem no estilo do `git log`: em português, o que muda para o jogador. Termine com a linha de coautoria das instruções do sistema. Guarde o hash: `W=$(git rev-parse HEAD)`.
5. Número da versão, só se há pastas em `novidades-pendentes/`: `npm run publicar-versao` (com `-- --x` se algo deixa de funcionar como antes). Ele escolhe a versão seguinte à do topo do `CHANGELOG.md`, escreve tudo e apaga as pastas. Depois `git add -A CHANGELOG.md src/novidades.json src/lab-cenarios.json package.json package-lock.json public/novidades novidades-pendentes` e `git commit --amend` acrescentando a versão entre parênteses no fim da primeira linha (`... (0.166.0)`).
6. O hook de pre-commit roda `npm test` e `tsc`. Se falhar, corrija e faça um commit novo; nunca `--no-verify`.
7. `git push` (numa branch de worktree, `git push origin HEAD:main`). O `pre-push` recusa a main com novidades sem número. Recusado porque a `origin/main` andou: `git reset --hard $W` (volta ao commit do passo 4, com as pendentes; só se perde o que o script gerou), `git pull --rebase` (ou `git rebase origin/main`) e repita do passo 5; nunca `--force`.
8. Responda com o hash, a mensagem e o que entrou, em uma ou duas linhas. Se o `forge-bridge/` mudou, lembre que o servidor local precisa estar reiniciado (`CLAUDE.md`, "Servidor local").
