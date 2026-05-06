# syntax=docker/dockerfile:1
# ----- builder -----
FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

# Manifests first so the install layer caches when source changes
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json tsconfig.json ./
COPY packages/db/package.json ./packages/db/
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/

RUN pnpm install --frozen-lockfile

# Source
COPY packages ./packages
COPY apps/api ./apps/api

# Build project-ref artifacts then the api itself
RUN pnpm --filter @prayer/db build \
 && pnpm --filter @prayer/shared build \
 && pnpm --filter @prayer/api build

# pnpm deploy produces a self-contained directory; --prod prunes
# devDependencies (vitest, tsx, etc.) for a smaller runtime image.
RUN pnpm --filter @prayer/api deploy --prod /app/deploy

# pnpm deploy doesn't copy workspace package dist outputs — copy them
# explicitly so runtime can resolve @prayer/db and @prayer/shared.
RUN cp -r packages/db/dist /app/deploy/node_modules/@prayer/db/dist \
 && cp -r packages/shared/dist /app/deploy/node_modules/@prayer/shared/dist

# ----- runtime -----
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder --chown=node:node /app/deploy ./

USER node
EXPOSE 3001
HEALTHCHECK --interval=10s --timeout=3s CMD wget --quiet --tries=1 --spider http://localhost:3001/healthz || exit 1
CMD ["node", "dist/server.js"]
