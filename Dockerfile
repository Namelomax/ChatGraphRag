FROM node:22-bookworm-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Иначе в клиентском бандле NEXT_PUBLIC_* пустые до первого запроса /api/models — см. localCurated в app/(chat)/api/models/route.ts
ARG NEXT_PUBLIC_LOCAL_OPENAI_MODEL=""
ARG NEXT_PUBLIC_LOCAL_OPENAI_BASE_URL=""
ENV NEXT_PUBLIC_LOCAL_OPENAI_MODEL=$NEXT_PUBLIC_LOCAL_OPENAI_MODEL
ENV NEXT_PUBLIC_LOCAL_OPENAI_BASE_URL=$NEXT_PUBLIC_LOCAL_OPENAI_BASE_URL
RUN pnpm build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Upload route runs LibreOffice (`soffice`) for Office/RTF → PDF (same as local dev).
RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts

EXPOSE 3000
CMD ["node", "node_modules/next/dist/bin/next", "start", "-p", "3000"]
