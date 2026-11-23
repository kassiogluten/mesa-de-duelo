// O que vai na pasta do pacote Linux da mesa no PC, além do executável e do jogo: o LEIA-ME e o script do atalho no menu.

export const LINUX_ARCHIVE = 'mesa-de-duelo-pc-linux.tar.gz';
/** Sem espaços, para abrir no terminal sem aspas (./mesa-de-duelo); a pasta continua "Mesa de Duelo". */
export const LINUX_EXE = 'mesa-de-duelo';
export const SHORTCUT_SCRIPT = 'criar-atalho.sh';
/** Onde o criar-atalho.sh grava o atalho (dentro de ~/.local/share/applications). */
export const DESKTOP_FILE = 'mesa-de-duelo.desktop';

/** O LEIA-ME da pasta, com quebras de linha do Linux. */
export const LINUX_README = `Mesa de Duelo no PC (Linux)

COMO ABRIR
Deixe esta pasta onde preferir (sua pasta pessoal, Documentos, um pendrive) e abra o "${LINUX_EXE}"
com dois cliques. Se o gerenciador de arquivos não abrir, clique com o botão direito nele e escolha
"Executar como programa", ou abra um terminal nesta pasta (botão direito no espaço vazio da pasta,
"Abrir no terminal") e digite:
  ./${LINUX_EXE}

ATALHO NO MENU DE APLICATIVOS (opcional)
Para a Mesa de Duelo aparecer no menu de aplicativos, com o ícone, abra um terminal nesta pasta e digite:
  ./${SHORTCUT_SCRIPT}
Não pede senha: o atalho fica só no seu usuário (~/.local/share/applications/${DESKTOP_FILE}).
Se mudar esta pasta de lugar, rode o ${SHORTCUT_SCRIPT} de novo. Para tirar o atalho:
  ./${SHORTCUT_SCRIPT} --remover

ATUALIZAÇÕES
A mesa se atualiza sozinha: cada vez que abre, ela confere se saiu versão nova e baixa só o que mudou.
Não precisa baixar o arquivo de novo. Raramente uma versão precisa ser baixada de novo no site; quando
isso acontecer, a própria mesa avisa e abre a página.

O QUE PRECISA
Linux de 64 bits (x86_64), como o Ubuntu 22.04 ou mais novo, e placa de vídeo com Vulkan, com o driver
atualizado (o Mesa, que já vem no Ubuntu, ou o da NVIDIA).

ONDE FICAM SEUS DADOS
As atualizações, os decks guardados no computador, as preferências e o login ficam em
  ~/.local/share/godot/app_userdata/Mesa de Duelo
(a pasta começa com ponto, então fica escondida: no gerenciador de arquivos, Ctrl+H mostra).
Mudar esta pasta de lugar não perde nada.

DESINSTALAR
Se criou o atalho, rode antes ./${SHORTCUT_SCRIPT} --remover. Depois, apague esta pasta. Para apagar
também as atualizações, os decks guardados no computador e o login, apague a pasta acima. Os decks
da sua conta continuam no site.

https://mesao.online
`;

/**
 * Cria (ou refaz) o atalho no menu de aplicativos apontando para o executável desta pasta, onde quer que ela esteja.
 * Sem sudo: grava em ~/.local/share/applications. No Exec, o caminho vai entre aspas com o escape da especificação
 * dos arquivos .desktop (aspas, crase, cifrão e barra invertida escapados, e % dobrado).
 */
export const SHORTCUT_SCRIPT_TEXT = `#!/bin/sh
# Cria o atalho da Mesa de Duelo no menu de aplicativos, só para o seu usuário (não precisa de senha).
# Rode de novo se mudar a pasta de lugar. Para tirar o atalho: ./${SHORTCUT_SCRIPT} --remover
set -e

DIR=$(cd "$(dirname "$0")" && pwd)
APPS="\${XDG_DATA_HOME:-$HOME/.local/share}/applications"
FILE="$APPS/${DESKTOP_FILE}"

if [ "$1" = "--remover" ]; then
  rm -f "$FILE"
  command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$APPS" >/dev/null 2>&1 || true
  echo "Atalho removido do menu de aplicativos."
  exit 0
fi

EXE="$DIR/${LINUX_EXE}"
if [ ! -f "$EXE" ]; then
  echo "Não achei o ${LINUX_EXE} nesta pasta ($DIR)." >&2
  exit 1
fi
chmod +x "$EXE" 2>/dev/null || true

# Texto comum de um .desktop: a barra invertida vira \\\\.
plain() { printf '%s' "$1" | sed -e 's/\\\\/\\\\\\\\/g'; }
# Argumento do Exec entre aspas: escapa \\, ", \` e $, depois o texto comum, e dobra o %.
quoted() { printf '%s' "$1" | sed -e 's/\\\\/\\\\\\\\/g' -e 's/["\`$]/\\\\&/g' -e 's/\\\\/\\\\\\\\/g' -e 's/%/%%/g'; }

mkdir -p "$APPS"
TMP="$FILE.tmp"
cat > "$TMP" <<EOF
[Desktop Entry]
Type=Application
Version=1.0
Name=Mesa de Duelo
GenericName=Mesa de Magic
Comment=Partidas de Magic contra o computador ou com amigos
Exec="$(quoted "$EXE")"
TryExec=$(plain "$EXE")
Path=$(plain "$DIR")
Icon=$(plain "$DIR/icon.png")
Terminal=false
Categories=Game;CardGame;
StartupWMClass=Mesa de Duelo
EOF
chmod 644 "$TMP"
mv -f "$TMP" "$FILE"
command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$APPS" >/dev/null 2>&1 || true
echo "Pronto: a Mesa de Duelo está no menu de aplicativos."
`;
