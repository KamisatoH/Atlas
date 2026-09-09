# Atlas 旅行攻略 · CloudBase 云托管部署指南

> **已不适用于当前 SQLite 方案。** CloudBase 云托管容器的本地文件不适合作为 SQLite 的持久化数据盘；请改用 `LIGHTHOUSE_CLOUDBASE_DEPLOY.md`，将 SQLite 放在 Lighthouse 的持久化目录，并由 CloudBase 静态托管 + HTTP 访问服务提供 HTTPS 与 `/api` 路由。

把前后端一起部署到腾讯云开发（CloudBase）云托管，**电脑和手机用同一个 HTTPS 域名访问**。

## 最终架构

```
浏览器（电脑 / 手机）
      │  HTTPS
      ▼
CloudBase 云托管（一个容器，Node 20）
  ├─ /api/*          → Express 后端（登录、行程、AI 对话）
  ├─ 其它路径        → 前端静态文件（frontend/dist）+ SPA 回退
  └─ 数据库          → CloudBase 云数据库 PostgreSQL（Prisma 直连）
```

> 为什么这样部署：前端 `baseURL` 是 `/api`，前后端同域后无需改任何前端代码，也不用处理跨域。

---

## 一、前置准备

| 事项 | 说明 |
|---|---|
| CloudBase 环境 | 在 [云开发控制台](https://tcb.cloud.tencent.com/dev) 开通，地域选 **上海**（云托管当前支持地域） |
| 高德地图 Key | 作为 CloudBase 构建参数传入；Vite 会在构建时内联进前端 |
| DeepSeek API Key | 需换成你自己账号的 Key（生产环境不要用本地测试 key） |
| Docker（可选） | 若用「镜像部署」或想本地先验证构建，需安装 Docker |

---

## 二、本地开发说明（provider 已从 SQLite 切换为 PostgreSQL）

- 数据库 provider 已统一改为 `postgresql`（一个 Prisma schema 只能有一种 provider），因此**本地开发也不再使用原来的 SQLite `dev.db`**。
- 本地跑 `npm run dev` 前，先在 `server/.env` 填一个可用的 PostgreSQL 连接串，任选其一：
  1. 本地 Docker 起 PG：`docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:16`，连接串用 `postgresql://postgres:postgres@localhost:5432/postgres?sslmode=disable`；
  2. 直接连 CloudBase 云数据库 PG（公网连接串 + `sslmode=require`）。
- 首次运行前执行 `npx prisma db push` 建表，再 `npm run dev`。
- 原 SQLite `dev.db` 里的旧数据不会自动迁移；如确需保留，需手动导出后写入 PG（个人新项目通常可忽略）。

---

## 三、开通 PostgreSQL 数据库（云端）

1. 控制台 → **数据库 → PostgreSQL**（按提示创建，若环境是 PG 模式会自动启用）。
2. 进入「连接信息」，拿到直连所需：**主机 / 端口 / 数据库名 / 用户名 / 密码**。
3. 拼成 Prisma 连接串（部署时环境变量用）：

```
postgresql://用户名:密码@主机:端口/数据库名?sslmode=require
```

- 密码里有 `@ : /` 等特殊字符时要 URL 编码（`@`→`%40`）。
- 云托管与数据库同地域时走内网更快更安全（需在云托管服务里开启「私有网络」）；图省事可用公网连接串 + SSL（`sslmode=require`）。

---

## 四、部署到云托管

本项目已带好 `Dockerfile`（多阶段构建：先编译前端+后端，再只跑 Node 服务）。三种部署方式任选：

### 方式 A：控制台「镜像/代码」部署（推荐新手）

1. 控制台 → **云托管 → 新建服务**，命名如 `atlas`。
2. 部署方式选 **代码部署** 或 **镜像部署**：
   - 代码部署：上传整个项目（`Dockerfile` 在根目录，云端自动构建）。
   - 镜像部署：先本地 `docker build -t atlas .` 再推到腾讯云容器镜像服务，选择该镜像。
3. **容器监听端口**设为 **3001**（与镜像默认 `PORT` 一致）。如果控制台为服务自动分配端口，则把 `PORT` 改成控制台分配的端口；应用会读取该变量。
4. 运行模式建议「始终自动扩缩容」，最小实例数设为 **1**（避免冷启动；`db push` 也只需跑一次，单实例更稳）。
5. 在构建设置中填入构建参数 `VITE_AMAP_KEY` 和 `VITE_AMAP_SECURITY_JS_CODE`，再填好运行时环境变量（见下表），发布。

> 构建参数只用于生成浏览器端静态文件。`DATABASE_URL`、`JWT_SECRET`、`OPENAI_API_KEY` 等后端密钥只能放在运行时环境变量中，不能写进 Dockerfile、前端变量或 Git 仓库。

### 方式 B：本地 Docker 构建验证（可选）

```bash
# 在项目根目录执行
docker build -t atlas .
docker run --rm -p 3001:3001 \
  -e DATABASE_URL="postgresql://user:pass@host:5432/atlas?sslmode=require" \
  -e JWT_SECRET="一段长随机字符串" \
  -e OPENAI_API_KEY="sk-xxx" \
  -e OPENAI_BASE_URL="https://api.deepseek.com" \
  -e OPENAI_MODEL="deepseek-chat" \
  atlas
```

本地浏览器打开 `http://localhost:3001` 即可看到完整应用（前端+接口）。

---

## 五、构建参数与环境变量

### 5.1 构建参数（云托管构建设置中填写）

| 参数 | 必填 | 用途 |
|---|---|---|
| `VITE_AMAP_KEY` | ✅ | 高德 Web 端 Key；构建后会出现在浏览器代码中 |
| `VITE_AMAP_SECURITY_JS_CODE` | 推荐 | 高德安全密钥；用于高德 JS API 的安全校验 |

这两个值对应根目录 `Dockerfile` 的 `ARG`。CloudBase 从代码构建时不会读取未提交的本地 `frontend/.env`，因此必须在构建参数中配置。

### 5.2 运行时环境变量（云托管「服务配置 → 环境变量」里填）

| 变量 | 必填 | 示例 |
|---|---|---|
| `DATABASE_URL` | ✅ | `postgresql://user:pass@host:5432/atlas?sslmode=require` |
| `JWT_SECRET` | ✅ | 一段 ≥32 位的随机字符串（可用 `openssl rand -hex 32` 生成） |
| `OPENAI_API_KEY` | ✅ | 你自己的 DeepSeek Key |
| `OPENAI_BASE_URL` | ✅ | `https://api.deepseek.com` |
| `OPENAI_MODEL` | ✅ | `deepseek-chat`（或 `deepseek-reasoner`） |
| `PORT` | 可选 | `3001`（默认值；若平台分配端口则使用平台值） |
| `OPENAI_TIMEOUT_MS` | 可选 | `90000` |
| `OPENAI_MAX_TOKENS` | 可选 | `8192` |
| `AI_REQUIRE_AUTH` | 推荐 | `true`；仅允许已登录用户调用 AI |
| `AI_RATE_LIMIT_MAX` | 可选 | `20`；每个 IP 在限流窗口内最多调用次数 |
| `AI_RATE_LIMIT_WINDOW_MS` | 可选 | `60000`；限流窗口（毫秒） |
| `CORS_ORIGIN` | 通常不需要 | 同域部署无需设置；仅跨域前端时填 HTTPS 域名 |

> 前端高德 Key 不要作为后端运行时密钥处理；它们需要在构建参数中配置，构建后会打进 JS 产物。

---

## 六、高德地图域名白名单（关键，否则地图报 `INVALID_USER_SCODE`）

1. 打开 [高德开放平台控制台](https://console.amap.com/) → 应用管理 → 找到 `VITE_AMAP_KEY` 对应的应用。
2. 平台选 **Web端（JS API）**，在「域名白名单」里加入云托管分配给你的默认域名，例如：

```
your-service-name-xxxxx.ap-shanghai.app.tcloudbase.com
```

3. 保存后通常几分钟内生效。手机浏览器访问的是同一域名，无需额外配置。

---

## 七、验证

1. 云托管「服务详情」里拿到默认访问域名：`{service-name}-{random}.{region}.app.tcloudbase.com`。
2. 电脑浏览器打开 → 能注册/登录、能生成行程、地图正常。
3. 手机浏览器打开**同一个地址** → 同样的功能。
4. 检查接口健康：`https://<你的域名>/api/health` 返回 `{"ok":true}`。

---

## 八、常见问题排查

**1. 首次启动报 `prisma db push` 相关错误 / 表不存在**
镜像启动时会自动执行 `prisma db push` 建表（幂等，重复执行无害）。若因数据库账号 DDL 权限不足失败（CloudBase PG 对直连账号可能限制建表），改用控制台 **数据库 → DMC/SQL 窗口**手动执行下面的建表 SQL 一次，然后去掉 Dockerfile 里 `CMD` 中的 `npx prisma db push --skip-generate &&`：

```sql
CREATE TABLE "User" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "email" TEXT NOT NULL UNIQUE,
  "passwordHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "Itinerary" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "payload" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Itinerary_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "Itinerary_userId_idx" ON "Itinerary"("userId");
```

**2. 连接数据库报 SSL / 证书错误**
在 `DATABASE_URL` 末尾加 `sslmode=require`；若仍报证书校验失败，再加 `&sslaccept=accept_invalid_certs`（仅测试用，生产建议内网直连）。

**3. 手机能打开但地图空白**
几乎都是高德域名白名单没加对，回「六、高德地图域名白名单」核对域名是否与浏览器地址栏完全一致。

**4. 登录后刷新丢状态 / 接口 404**
前端是非 `/api` 的 SPA 路由回退问题；确认部署的是本仓库最新 `server/src/index.ts`（已内置 SPA 回退）。

**5. AI 对话超时或 503**
检查 `OPENAI_*` 三个变量是否正确、DeepSeek 账户是否有余额；`OPENAI_TIMEOUT_MS` 可适当调大。

---

## 九、费用与安全提示

- **云托管**：按量计费（最小 0.25 核 0.5GB，按秒），无流量可缩容到 0，个人使用成本很低。
- **PostgreSQL**：按需计费，注意「自动暂停」冷启动；不想等可关闭自动暂停。
- **DeepSeek**：按 token 计费，与云托管无关。
- **安全**：生产镜像会在 `JWT_SECRET` 缺失时拒绝启动，默认要求登录后才能调用 AI，并按 IP 限流；`server/.env`（含真实 DeepSeek Key）不要提交到公开仓库（已在 `.gitignore` 与 `.dockerignore` 中排除）。
- **自定义域名**：CloudBase 默认域名无需备案；绑定自有域名需完成 ICP 备案。
