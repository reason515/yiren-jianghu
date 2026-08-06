# syntax=docker/dockerfile:1
# API 镜像（CD 使用）。首版含开发依赖以支持在容器内跑迁移；封测后优化为 --prod 分层。
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages ./packages
COPY services ./services
RUN pnpm install --frozen-lockfile
RUN pnpm -r build
# pnpm deploy 产出独立可运行目录（含 workspace 依赖与 node_modules）
RUN pnpm --filter @yjh/api deploy /app/api-deploy

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
RUN corepack enable
COPY --from=build /app/api-deploy ./
EXPOSE 3000
CMD ["node", "dist/index.js"]
