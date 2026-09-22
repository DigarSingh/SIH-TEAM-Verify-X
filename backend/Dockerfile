# syntax=docker/dockerfile:1
#
# API image. The build context is the REPOSITORY ROOT (the Prisma schema and migrations live in ./prisma):
#   docker build -f backend/Dockerfile -t capacity-connect-api .
#
# The image also carries the Prisma CLI, so the same image runs the one-off migration step
# (`npx prisma migrate deploy`, see docker-compose.yml) and the administrator bootstrap command
# (`node dist/cli/create-admin.js`). Trade-off: it keeps dev dependencies; slim it down later if image size matters.
FROM node:22-bookworm-slim

# Prisma's query engine needs OpenSSL.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependencies first, so this layer is reused until a package.json changes.
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci

COPY prisma ./prisma
COPY prisma.config.ts tsconfig.json ./
COPY backend ./backend
RUN npx prisma generate && npm run build -w backend

ENV NODE_ENV=production \
    PORT=4000 \
    STORAGE_LOCAL_DIR=/data/uploads

# Uploaded files live in a volume (or use STORAGE_DRIVER=s3). The process never runs as root.
RUN mkdir -p /data/uploads && chown -R node:node /data /app
USER node
WORKDIR /app/backend

EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 4000) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"

CMD ["node", "dist/server.js"]
