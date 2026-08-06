# syntax=docker/dockerfile:1
# API 镜像（CD 使用）。
# 首版直接拷贝构建产物 + 全量 node_modules（含开发依赖），
# 便于容器内执行迁移（pg/node-pg-migrate 为 devDeps）；封测后优化为生产依赖裁剪。
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
WORKDIR /app/services/api
EXPOSE 3000
CMD ["node", "dist/index.js"]
