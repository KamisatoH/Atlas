# Atlas · Lighthouse + CloudBase 静态托管部署

## 架构

```text
浏览器
  │ HTTPS（CloudBase HTTP 访问服务）
  ├─ /       → CloudBase 静态网站托管（frontend/dist）
  └─ /api/*  → Lighthouse 上的 Atlas Express（server/）
                         └─ SQLite：/opt/atlas-data/atlas.db
```

前端继续请求同域 `/api`，不需要修改 `frontend/src/api/http.ts`。CloudBase 负责 HTTPS 和路径路由；Lighthouse 不需要 Nginx 或证书。

## 1. 创建 Lighthouse

1. 在腾讯云 Lighthouse 创建 Ubuntu 22.04/24.04 实例，地域尽量与 CloudBase 环境相同。
2. 防火墙至少放通 SSH（22）。根据 CloudBase HTTP 访问服务的 Lighthouse 路由校验要求放通应用端口 3001；不要把数据库文件或其它管理端口暴露到公网。
3. 通过 SSH 登录，安装 Node.js 20、Git：

```bash
apt update
apt install -y curl git
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node -v
```

## 2. 部署后端和 SQLite

上传或克隆仓库后，在服务器执行：

```bash
mkdir -p /opt/atlas-data
chmod 700 /opt/atlas-data
cd /opt/Atlas/server
```

创建 `server/.env`，不要提交它：

```env
NODE_ENV=production
PORT=3001
DATABASE_URL="file:/opt/atlas-data/atlas.db"
JWT_SECRET="替换为至少 32 位随机字符串"
OPENAI_API_KEY="你的 API Key"
OPENAI_BASE_URL="https://api.deepseek.com"
OPENAI_MODEL="deepseek-chat"
AI_REQUIRE_AUTH=true
AI_RATE_LIMIT_MAX=20
AI_RATE_LIMIT_WINDOW_MS=60000
```

初始化并构建：

```bash
npm ci
npm run db:generate
npm run db:push
npm run build
```

`db:push` 会在 `/opt/atlas-data/atlas.db` 不存在时创建数据库和表。不要把数据库放在仓库目录，否则代码更新或重新部署时容易误删。

安装 PM2 并常驻运行：

```bash
npm install -g pm2
pm2 start dist/index.js --name atlas-api --time
pm2 save
pm2 startup
```

按 `pm2 startup` 打印的命令再执行一次。验证：

```bash
curl http://127.0.0.1:3001/api/health
pm2 logs atlas-api
```

## 3. 备份 SQLite

在 `server/` 目录执行：

```bash
npm run db:backup -- /opt/atlas-backups/atlas-$(date +%F-%H%M%S).db
```

该命令使用 SQLite `VACUUM INTO` 生成一致性快照，不会覆盖已有备份。建议通过 crontab 每天执行，并将备份同步到对象存储或另一台设备。

恢复时先停止服务，用备份文件替换 `/opt/atlas-data/atlas.db`，再启动：

```bash
pm2 stop atlas-api
cp /opt/atlas-backups/你的备份.db /opt/atlas-data/atlas.db
pm2 start atlas-api
```

## 4. 部署前端到 CloudBase 静态网站托管

在 CloudBase 控制台打开「静态网站托管 → 网站部署」。

可选方式：

- 本地构建后上传 `frontend/dist`；
- Git 构建：项目目录 `frontend`、安装命令 `npm ci`、构建命令 `npm run build`、输出目录 `dist`、Node 20。

在静态托管的构建环境变量中设置：

```text
VITE_AMAP_KEY
VITE_AMAP_SECURITY_JS_CODE
```

## 5. 配置 CloudBase HTTP 访问服务

进入「环境管理 → HTTP 访问服务」，开启服务并先使用默认域名测试。

为同一个 HTTP 服务域名添加路由：

| 路径 | 上游资源 | 路径透传 |
|---|---|---|
| `/` | 静态托管（`staticstore`） | 关闭 |
| `/api/*` 或 `/api` 前缀 | Lighthouse（选择后端实例） | **开启** |

`/api` 路由应比 `/` 更具体。不要在 CloudBase 路由层开启额外身份认证，Atlas 后端已经用 JWT 处理登录。

访问统一域名验证：

```text
https://你的HTTP访问服务域名/api/health
https://你的HTTP访问服务域名/
```

前端和 API 同域，因此不需要设置 `CORS_ORIGIN`。

## 6. 高德地图

把 HTTP 访问服务的实际 HTTPS 域名加入高德 Web JS API 域名白名单。地图空白或 `INVALID_USER_SCODE` 通常是白名单未生效或域名不完全一致。

## 7. 证书与域名

CloudBase 默认 HTTPS 域名可用于测试，无需在 Lighthouse 配证书。正式使用自定义域名时，仍需在 CloudBase HTTP 访问服务绑定域名和证书；证书在 CloudBase 终止 TLS，Lighthouse 仍然无需 Nginx 或证书配置。

## 8. 重要限制

- SQLite 适合单台 Lighthouse、低并发应用；不要同时在多台实例上读写同一个文件。
- 不要把 SQLite 放入 CloudBase 云托管容器或静态托管目录，这些位置不保证数据库数据持久化。
- 每次修改 Prisma schema 后，在 Lighthouse 执行 `npm run db:push`，再重启 PM2。
