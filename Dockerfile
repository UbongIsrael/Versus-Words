# API image. Build from the GitHub repo root (not apps/api).
FROM node:22-slim
WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/sim ./packages/sim
COPY apps/api ./apps/api
COPY data ./data

RUN npm ci -w @versus/sim -w @versus/api --include-workspace-root

ENV NODE_ENV=production
WORKDIR /app/apps/api
EXPOSE 8080
CMD ["npx", "tsx", "src/index.ts"]
