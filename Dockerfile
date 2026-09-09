# syntax=docker/dockerfile:1
# Atlas 旅行攻略 —— CloudBase 云托管部署镜像
# 构建产物：一个同时托管「前端静态文件 + 后端 /api」的 Node 服务（单域名访问）

# ---------- 构建阶段 ----------
FROM node:20-slim AS builder

WORKDIR /build

# CloudBase 构建时通过 Build Args 注入前端公开配置；不要把后端密钥放在这里。
ARG VITE_AMAP_KEY
ARG VITE_AMAP_SECURITY_JS_CODE
ENV VITE_AMAP_KEY=${VITE_AMAP_KEY}
ENV VITE_AMAP_SECURITY_JS_CODE=${VITE_AMAP_SECURITY_JS_CODE}

# 前端：安装依赖
COPY frontend/package.json frontend/package-lock.json ./frontend/
RUN cd frontend && npm ci

# 前端源码（含 frontend/.env，高德 Key 在 Vite 构建期内联进产物）
COPY frontend/ ./frontend/

# 后端：安装依赖
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci

# 后端源码 + Prisma schema
COPY server/ ./server/

# 生成 Prisma Client（SQLite provider）+ 编译 TypeScript。
# 注意：CloudBase 容器文件系统不适合保存 SQLite 正式数据；SQLite 部署请使用 Lighthouse 指南。
RUN cd server && DATABASE_URL="file:./atlas.db" npx prisma generate && npm run build

# 编译前端（生产环境）
RUN cd frontend && npm run build

# ---------- 运行阶段 ----------
FROM node:20-slim AS runner

ENV NODE_ENV=production \
    PORT=3001 \
    AI_REQUIRE_AUTH=true \
    AI_RATE_LIMIT_MAX=20 \
    AI_RATE_LIMIT_WINDOW_MS=60000

WORKDIR /app/server

# 只安装生产依赖，并补一个 prisma CLI（用于启动时同步表结构）
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev && npm install prisma@6.19.2 --no-save

# Prisma Client 生成产物（builder 中已生成）
COPY --from=builder /build/server/node_modules/.prisma ./node_modules/.prisma
# 后端编译产物
COPY --from=builder /build/server/dist ./dist
# Prisma schema（启动时 db push 用）
COPY --from=builder /build/server/prisma ./prisma
# 前端构建产物（由 express.static 托管）
COPY --from=builder /build/frontend/dist ../frontend/dist

EXPOSE 3001

# 启动时先同步数据库表结构（幂等），再启动服务
CMD ["sh", "-c", "npm run db:push && node dist/index.js"]
