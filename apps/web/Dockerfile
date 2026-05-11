# syntax=docker/dockerfile:1
# ----- builder -----
FROM node:26-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

# Vite inlines VITE_* vars at BUILD time. Pass per-environment values
# via --build-arg; defaults below match the local docker-compose stack.
ARG VITE_API_URL=http://localhost:3001
ARG VITE_AUTH_URL=http://localhost:9999
ARG VITE_AUTH_ANON_KEY=
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_AUTH_URL=${VITE_AUTH_URL}
ENV VITE_AUTH_ANON_KEY=${VITE_AUTH_ANON_KEY}

# Manifests first
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json tsconfig.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/web/package.json ./apps/web/

RUN pnpm install --frozen-lockfile

# Source
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web

RUN pnpm --filter @prayer/shared build \
 && pnpm --filter @prayer/web build

# ----- runtime -----
# nginx-unprivileged runs as non-root (uid 101) and listens on port 8080.
FROM nginxinc/nginx-unprivileged:alpine AS runtime
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/docker-nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
