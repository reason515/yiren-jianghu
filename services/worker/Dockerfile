# syntax=docker/dockerfile:1
# Worker 镜像（F2 挂机结算，CD 使用）。
# 与 api Dockerfile 同构：monorepo 全量构建后运行 worker 主循环。
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages ./packages
COPY services ./services
RUN pnpm install --frozen-lockfile
RUN pnpm -r build

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
RUN corepack enable
COPY --from=build /app ./
WORKDIR /app/services/worker
USER node
# Worker 为常驻循环进程，无 HTTP 探针；由 compose restart 策略守护
CMD ["node", "dist/main.js"]
