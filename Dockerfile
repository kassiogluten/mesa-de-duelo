# Site (Vite) servido pelo nginx, que também repassa /ws para a ponte do Forge.
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Sem client ID, o botão Entrar com Google não aparece.
ARG VITE_GOOGLE_CLIENT_ID=""
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
# Host das imagens das cartas (a CDN na frente do /scryfall/ deste nginx). Sem ele, as imagens vêm do próprio site.
ARG VITE_IMAGENS_URL=""
ENV VITE_IMAGENS_URL=$VITE_IMAGENS_URL
RUN npm run build

# Mesa no PC (godot-table/): o pacote do jogo, os downloads do jogador (zip do Windows e .tar.gz do Linux, cada um com
# executável + pacote + LEIA-ME) e o manifesto que o atualizador e a página /baixar consultam, na mesma versão do site.
# Não bloqueia o deploy: se o Godot não baixar ou o pacote não sair, o site sobe igual e a mesa no PC fica sem manifesto
# (quem já tem abre com a versão que tem); se só um download falhar, o pacote sai e o manifesto vem sem os campos dele.
FROM node:20-bookworm-slim AS mesa-pc
ARG GODOT_VERSION=4.7.2
WORKDIR /app
# O Godot e os templates do Windows e do Linux numa camada em cache: só baixam de novo quando GODOT_VERSION (ou o
# script) muda.
COPY scripts/godot-docker-tools.sh scripts/
RUN sh scripts/godot-docker-tools.sh "$GODOT_VERSION"
COPY package.json ./
COPY scripts/godot.mjs scripts/godot-pck.mjs scripts/godot-zip.mjs scripts/zip-file.mjs scripts/tar-gz-file.mjs scripts/godot-linux-files.mjs scripts/
COPY shared shared
COPY public/audio public/audio
COPY godot-table godot-table
# De novo a cada deploy, mas só baixa o que a camada em cache não tem (um download que falhou não fica preso no cache).
RUN sh scripts/godot-docker-tools.sh "$GODOT_VERSION" && mkdir -p /out/mesa-pc \
    && (GODOT=/usr/local/bin/godot node scripts/godot-pck.mjs --out /out/mesa-pc \
      || (rm -rf /out/mesa-pc && mkdir -p /out/mesa-pc && echo "AVISO: o pacote da mesa no PC não foi gerado neste deploy.")) \
    && if [ -f /out/mesa-pc/versao.json ]; then \
      GODOT=/usr/local/bin/godot node scripts/godot-zip.mjs --out /out/mesa-pc \
        || echo "AVISO: o zip da mesa no PC (Windows) não foi gerado neste deploy."; \
    fi

FROM nginx:1.27-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
# Pasta do cache das imagens das cartas, com o dono certo antes do volume ser montado nela (docker-compose.yml).
RUN mkdir -p /var/cache/nginx/scryfall && chown nginx:nginx /var/cache/nginx/scryfall
COPY --from=build /app/dist /usr/share/nginx/html
COPY --from=mesa-pc /out/mesa-pc /usr/share/nginx/html/mesa-pc
EXPOSE 80
