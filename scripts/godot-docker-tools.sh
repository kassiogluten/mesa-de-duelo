#!/bin/sh
# Baixa, no build do Docker, o Godot (Linux) e o template de exportação do Windows que o zip da mesa no PC usa.
#   sh scripts/godot-docker-tools.sh <versão do Godot>
# Do .tpz de ~1 GB com os templates de todas as plataformas, guarda só o windows_release_x86_64.exe e apaga o resto.
# O que já existe fica: o Dockerfile roda uma vez numa camada em cache (só baixa de novo quando a versão muda) e outra vez
# a cada deploy, que só baixa se a camada em cache ficou sem alguma peça (download que falhou não fica preso no cache).
# Nunca falha o build: sem o Godot, o site sobe sem a mesa no PC; sem o template, sobe sem o zip (avisos no log).
V="$1"
REL="https://github.com/godotengine/godot/releases/download/${V}-stable"
TEMPLATES="${HOME:-/root}/.local/share/godot/export_templates/${V}.stable"

if ! command -v wget >/dev/null 2>&1 || ! command -v unzip >/dev/null 2>&1; then
  { apt-get update && apt-get install -y --no-install-recommends ca-certificates wget unzip && rm -rf /var/lib/apt/lists/*; } \
    || echo "AVISO: não consegui instalar wget e unzip."
fi

if [ ! -x /usr/local/bin/godot ]; then
  { wget -q "$REL/Godot_v${V}-stable_linux.x86_64.zip" -O /tmp/godot.zip \
    && unzip -q -o /tmp/godot.zip -d /tmp/godot \
    && mv /tmp/godot/Godot_v*_linux.x86_64 /usr/local/bin/godot; } \
    || echo "AVISO: o Godot ${V} não foi baixado; a mesa no PC fica sem pacote neste deploy."
  rm -rf /tmp/godot.zip /tmp/godot
fi

if [ ! -f "$TEMPLATES/windows_release_x86_64.exe" ]; then
  mkdir -p "$TEMPLATES"
  { wget -q "$REL/Godot_v${V}-stable_export_templates.tpz" -O /tmp/templates.tpz \
    && unzip -j -o -q /tmp/templates.tpz templates/windows_release_x86_64.exe templates/version.txt -d "$TEMPLATES"; } \
    || { rm -f "$TEMPLATES/windows_release_x86_64.exe"; echo "AVISO: o template do Windows não foi baixado; o zip da mesa no PC fica de fora neste deploy."; }
  rm -f /tmp/templates.tpz
fi
exit 0
