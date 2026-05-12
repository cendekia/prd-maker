FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY prisma ./prisma
# Skip postinstall here — we run `prisma generate` explicitly in the builder
# stage so this layer doesn't depend on a generated client.
RUN npm install --no-audit --no-fund --ignore-scripts

FROM node:22-alpine AS builder
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Reuse builder's node_modules so the prisma CLI is available at container
# start — we run `prisma migrate deploy` before booting the server.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./
COPY --from=builder /app/package-lock.json* ./
EXPOSE 3000
# Apply DB migrations, then start. A migration failure exits non-zero so
# Docker's restart policy surfaces the misconfig instead of silently serving
# 500s against an out-of-date schema.
CMD ["sh", "-c", "npx prisma migrate deploy && npm run start -- --hostname 0.0.0.0 --port 3000"]
