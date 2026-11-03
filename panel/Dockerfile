# syntax=docker/dockerfile:1
# Build context = repository root (needs infrastructure/nginx/panel.conf).
FROM node:25-alpine AS build
WORKDIR /app

COPY panel/package.json panel/package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY panel/ ./
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime
COPY infrastructure/nginx/panel.conf /etc/nginx/conf.d/default.conf
# vite base=/admin/ → serve the bundle under /admin so paths resolve as-is
COPY --from=build /app/dist /usr/share/nginx/html/admin
EXPOSE 8080
