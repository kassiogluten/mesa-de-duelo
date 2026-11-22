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

# Pacote do jogo da mesa no PC (godot-table/) e o manifesto que o atualizador dela consulta, na mesma versão do site.
# Não bloqueia o deploy: se o Godot não baixar ou o pacote não sair, o site sobe igual e a mesa no PC fica na versão
# anterior até o próximo deploy (o aviso aparece no log do build).
FROM node:20-bookworm-slim AS mesa-pc
ARG GODOT_VERSION=4.7.2
WORKDIR /app
COPY package.json ./
COPY scripts/godot.mjs scripts/godot-pck.mjs scripts/
COPY shared shared
COPY public/audio public/audio
COPY godot-table godot-table
RUN mkdir -p /out/mesa-pc && ( \
      apt-get update && apt-get install -y --no-install-recommends ca-certificates wget unzip \
      && wget -q "https://github.com/godotengine/godot/releases/download/${GODOT_VERSION}-stable/Godot_v${GODOT_VERSION}-stable_linux.x86_64.zip" -O /tmp/godot.zip \
      && unzip -q /tmp/godot.zip -d /tmp/godot && mv /tmp/godot/Godot_v*_linux.x86_64 /usr/local/bin/godot \
      && GODOT=/usr/local/bin/godot node scripts/godot-pck.mjs --out /out/mesa-pc \
    ) || (rm -rf /out/mesa-pc && mkdir -p /out/mesa-pc && echo "AVISO: o pacote da mesa no PC não foi gerado neste deploy.")

FROM nginx:1.27-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
# Pasta do cache das imagens das cartas, com o dono certo antes do volume ser montado nela (docker-compose.yml).
RUN mkdir -p /var/cache/nginx/scryfall && chown nginx:nginx /var/cache/nginx/scryfall
COPY --from=build /app/dist /usr/share/nginx/html
COPY --from=mesa-pc /out/mesa-pc /usr/share/nginx/html/mesa-pc
EXPOSE 80
