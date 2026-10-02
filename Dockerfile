FROM oven/bun:1 AS builder

WORKDIR /app

COPY package.json bun.lock ./
COPY prisma ./prisma

ENV DATABASE_URL="mongodb://localhost:27017/office-ledger-build"

RUN bun install --frozen-lockfile

COPY . .

RUN bun run build

FROM oven/bun:1-slim AS runner

WORKDIR /app

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000

CMD ["bun", "server.js"]
