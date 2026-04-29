FROM oven/bun:1 AS builder

WORKDIR /app

COPY package.json bun.lock prisma ./

ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"

RUN bun install

COPY . .

RUN bun run build

FROM oven/bun:1-slim AS runner

WORKDIR /app

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000

CMD ["bun", "server.js"]