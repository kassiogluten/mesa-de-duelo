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

FROM nginx:1.27-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
# Pasta do cache das imagens das cartas, com o dono certo antes do volume ser montado nela (docker-compose.yml).
RUN mkdir -p /var/cache/nginx/scryfall && chown nginx:nginx /var/cache/nginx/scryfall
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
