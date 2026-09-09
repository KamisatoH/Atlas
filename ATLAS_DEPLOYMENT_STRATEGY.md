# Atlas 部署策略

> **历史方案说明。** 当前项目已改用 SQLite 本地文件数据库，推荐部署方式为 `LIGHTHOUSE_CLOUDBASE_DEPLOY.md`：Lighthouse 持久化 SQLite，CloudBase 静态托管与 HTTP 访问服务统一提供前端和 HTTPS API 入口。

本文档基于当前 Atlas 项目代码、仓库内已有部署文档，以及外部参考文档
`DEPLOYMENT.md` 的“同域 HTTPS + PostgreSQL + 后端 API”方法整理而成。

外部文档中的 `friend-api`、`JOIN_CODE`、`AUTH_PEPPER`、图片 Storage、
`scf_bootstrap` 和函数 ZIP 都属于另一个项目，不适用于 Atlas。本项目使用
现有的 Express 服务和根目录 `Dockerfile` 进行容器部署。

## 一、推荐方案

推荐使用：

> 腾讯云 CloudBase 云托管单容器 + CloudBase PostgreSQL + 同域 HTTPS

这样可以让电脑和手机通过同一个域名访问，前端继续使用 `/api`，无需额外修改
API 地址，也不需要单独处理跨域会话。

## 二、项目结构与运行架构

```text
浏览器 HTTPS
    │
    ▼
CloudBase 云托管 atlas 服务（Node.js 20）
    ├── /api/auth          → 注册、登录、用户信息
    ├── /api/itineraries   → 行程保存、读取、删除
    ├── /api/ai            → AI 行程规划
    ├── /api/health        → 健康检查
    └── 其它路径           → frontend/dist 静态资源与 SPA 回退
             │
             ├── Prisma → CloudBase PostgreSQL
             ├── 后端 → OpenAI/DeepSeek 兼容接口
             └── 浏览器 → 高德地图 JS API
```

### 代码对应关系

| 模块 | 位置 | 部署作用 |
|---|---|---|
| React/Vite 前端 | `frontend/` | 构建为 `frontend/dist` |
| Express 后端 | `server/` | 提供 `/api/*` 接口并托管前端 |
| 数据模型 | `server/prisma/schema.prisma` | `User`、`Itinerary` 表 |
| 前端 API 客户端 | `frontend/src/api/http.ts` | 固定请求同域 `/api` |
| 静态文件与 SPA 回退 | `server/src/index.ts` | 生产环境托管前端 |
| 容器构建 | `Dockerfile` | Node 20 多阶段构建 |

## 三、外部参考文档的 Atlas 适配

| 参考文档概念 | Atlas 实际方案 |
|---|---|
| `web/` | `frontend/` |
| HTTP 云函数 `friend-api` | Atlas Express Node.js 容器 |
| 手写业务 SQL | Prisma Schema，首次用 `prisma db push` 初始化 |
| 图片桶 `friend-images` | Atlas 当前没有图片上传功能，不需要 |
| `JOIN_CODE`、`AUTH_PEPPER` | Atlas 不使用 |
| `CLOUDBASE_APIKEY` | Atlas 直接使用 `DATABASE_URL`，不需要 |
| `scf_bootstrap`、函数 ZIP | 不适用，不要上传到 Atlas |
| `/` 与 `/api/*` 同域 | 保留，全部路由指向同一 Atlas 服务 |

如果强行采用“静态托管 + HTTP 云函数”的原始方式，需要把 Express 服务改造成
云函数入口并重新制作函数部署包；当前仓库没有这套函数包，因此不作为首选方案。

## 四、数据库部署

### 4.1 创建 PostgreSQL

在 CloudBase 控制台创建 PostgreSQL，建议：

- 与云托管服务使用同一地域；
- 优先使用私有网络；
- 连接串启用 SSL；
- 密码中的 `@`、`:`、`/` 等特殊字符先进行 URL 编码；
- 为数据库配置定期备份。

连接串示例：

```text
postgresql://用户名:密码@主机:端口/atlas?sslmode=require
```

### 4.2 首次初始化表结构

当前仓库还没有 `server/prisma/migrations/`，首次部署可执行：

```powershell
cd server
npm ci
npx prisma generate
npx prisma db push
```

如果云数据库账号没有 DDL 权限，应在 CloudBase 数据库控制台执行由 Prisma
生成或根据 `server/prisma/schema.prisma` 整理出的建表 SQL。

当前 [Dockerfile](D:/github实现/Atlas/Dockerfile) 启动时会执行一次幂等的
`prisma db push`。正式迭代前建议建立 Prisma Migration 流程，并将启动命令
改为只启动应用，避免多实例同时修改数据库结构。

## 五、CloudBase 云托管部署

### 5.1 构建代码

使用仓库根目录进行代码部署，构建文件为根目录的 `Dockerfile`。不要上传
`node_modules`，也不要把后端 `.env` 或真实密钥提交到 Git。

本地可先执行：

```powershell
cd frontend
npm ci
npm run build

cd ..\server
npm ci
npm run db:generate
npm run build
```

### 5.2 构建参数

在 CloudBase 云托管的构建设置中填写：

| 参数 | 必填 | 说明 |
|---|---:|---|
| `VITE_AMAP_KEY` | 是 | 高德 Web 端 Key，会被 Vite 编译进前端 |
| `VITE_AMAP_SECURITY_JS_CODE` | 推荐 | 高德 JS API 安全密钥 |

这两个变量由 `Dockerfile` 的 `ARG` 接收。它们属于浏览器端公开配置，不能
当作后端密钥，但必须配置高德域名白名单。

### 5.3 运行时环境变量

在 CloudBase 服务配置的运行时环境变量中填写：

| 变量 | 必填 | 示例或说明 |
|---|---:|---|
| `DATABASE_URL` | 是 | PostgreSQL 连接串，建议包含 `sslmode=require` |
| `JWT_SECRET` | 是 | 至少 32 位的高强度随机字符串 |
| `OPENAI_API_KEY` | 是 | OpenAI、DeepSeek 或其它兼容服务的密钥 |
| `OPENAI_BASE_URL` | 是 | 例如 `https://api.deepseek.com` |
| `OPENAI_MODEL` | 是 | 例如 `deepseek-chat` |
| `OPENAI_TIMEOUT_MS` | 否 | 默认 90000，AI 请求较慢时可调大 |
| `OPENAI_MAX_TOKENS` | 否 | 默认 8192，按模型限制调整 |
| `AI_REQUIRE_AUTH` | 推荐 | `true`；仅允许已登录用户调用 AI |
| `AI_RATE_LIMIT_MAX` | 否 | 默认 20；每 IP 在限流窗口内的最大 AI 请求数 |
| `AI_RATE_LIMIT_WINDOW_MS` | 否 | 默认 60000；限流窗口（毫秒） |
| `CORS_ORIGIN` | 通常不需要 | 同域部署无需设置；仅跨域前端时填 HTTPS 域名 |
| `PORT` | 否 | 默认 3001；若平台分配端口则使用平台值 |
| `NODE_ENV` | 推荐 | `production` |

`DATABASE_URL`、`JWT_SECRET`、`OPENAI_API_KEY` 只能放在运行时环境变量或
CloudBase 密钥管理器中，不要写入 Dockerfile、前端变量或 Git 仓库。

### 5.4 服务设置

- 运行时选择 Node.js 20 镜像构建；
- 容器监听端口设置为 `3001`，或设置为平台分配的 `PORT`；
- 初次部署建议最小实例数为 `1`，避免冷启动并降低启动时数据库同步冲突；
- 健康检查路径设置为 `/api/health`；
- 如果使用 HTTP 路由，将 `/` 和 `/api/*` 都指向同一个 Atlas 服务；
- 取得默认 HTTPS 域名后，再配置高德地图白名单。

CloudBase 默认域名可用于测试；绑定自定义域名时，需要按腾讯云要求完成域名
解析和备案流程。

## 六、高德地图配置

在高德开放平台找到与 `VITE_AMAP_KEY` 对应的应用，平台选择“Web 端（JS API）”，
并加入 CloudBase 分配的完整域名，例如：

```text
atlas-xxxxx.ap-shanghai.app.tcloudbase.com
```

域名白名单未生效时，地图通常会出现空白或 `INVALID_USER_SCODE`。手机端访问
的是同一域名，不需要额外配置一套 Key。

## 七、发布后验收

按以下顺序验收：

1. `https://你的域名/api/health` 返回 `{"ok":true}`；
2. 首页显示地图和行程规划界面；
3. 注册、登录、退出流程正常；
4. 新建、保存、读取、删除行程正常；
5. `https://你的域名/api/ai/status` 返回正确的模型配置状态；
6. AI 能生成单日和多日行程；
7. 刷新页面后登录状态和行程数据仍然存在；
8. 地图搜索、路线规划、交通时间计算正常；
9. 手机浏览器访问同一 HTTPS 地址，功能与电脑一致；
10. 未登录访问 `/api/itineraries` 应返回 401。

## 八、上线前安全与稳定性要求

### 已配置

- [server/src/middleware/auth.ts](D:/github实现/Atlas/server/src/middleware/auth.ts)
  会在生产环境缺少 `JWT_SECRET` 时拒绝启动；
- `/api/ai/chat` 支持 `AI_REQUIRE_AUTH=true` 登录保护，并启用按 IP 的进程内限流；CloudBase 生产镜像默认启用两项保护。
- 生产环境默认同域且不返回宽松 CORS 头；只有配置 `CORS_ORIGIN` 才允许跨域。

### 仍需在控制台处理

- 保证所有外部访问都使用 HTTPS；
- 强制使用强 `JWT_SECRET`，并通过密钥管理器保存；
- 为 PostgreSQL 设置备份策略和合理的连接数限制。

### 建议处理

- 当前 JWT 保存在浏览器 `localStorage`，长期可改为 HttpOnly、Secure、
  SameSite Cookie，降低 XSS 风险；
- AI 服务请求最长可达 90 秒，云平台请求超时时间应高于该值；
- 用 Prisma Migration 替代每次启动执行 `db push`；
- 增加数据库连通性和 AI 可用性的 readiness 检查，区分“进程存活”和“服务可用”；
- 记录 API、数据库和 AI 调用日志，但禁止记录密码、JWT 和 API Key。

## 九、备用方案：Render + Neon

如果 CloudBase 不可用，可使用仓库已有的 [render.yaml](D:/github实现/Atlas/render.yaml)
和 [RENDER_NEON_DEPLOY.md](D:/github实现/Atlas/RENDER_NEON_DEPLOY.md)：

- Neon 提供 PostgreSQL；
- Render 构建并运行前后端；
- Render 使用 `PORT=10000`；
- `VITE_*` 变量在构建阶段注入；
- `DATABASE_URL`、`JWT_SECRET`、`OPENAI_API_KEY` 在运行时配置。

Render 免费服务和 Neon 免费数据库可能自动休眠，首次访问会有冷启动延迟。

## 十、当前验证状态

- 后端 `npm run build`：已通过；
- 前端 `npm run build`：当前工作区依赖目录不完整，`tsc` 未找到，需要先执行
  `frontend/npm ci` 后重新验证；
- Docker 本机验证：未执行，本机未安装 Docker CLI；
- 工作区未因本策略新增真实密钥或环境文件。

## 十一、运维注意事项

仓库中的 [deploy.sh](D:/github实现/Atlas/deploy.sh) 是面向自托管服务器的脚本，
包含 `git reset --hard origin/<branch>`。它不属于 CloudBase 推荐流程，使用前必须
确认目标分支和工作区内容，避免覆盖未提交的修改。
