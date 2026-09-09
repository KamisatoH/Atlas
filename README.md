# Atlas

地图驱动的智能行程规划：搜索选点、AI 对话生成多日路线、行程面板编辑时间与交通。

## 结构

- `frontend/` — React + Vite + 高德地图
- `server/` — Express + Prisma (SQLite 本地文件) + AI 对话 API

## 本地开发

### 后端

```bash
cd server
cp .env.example .env   # 配置 SQLite 文件路径、JWT_SECRET、OPENAI_API_KEY 等
npm install
npm run db:generate
npm run db:push
npm run dev            # http://localhost:3001
```

### 前端

```bash
cd frontend
# 新建 .env，配置 VITE_AMAP_KEY
npm install
npm run dev            # http://localhost:5173
```

## 环境变量

| 位置 | 变量 | 说明 |
|------|------|------|
| `server/.env` | `DATABASE_URL` | SQLite 文件 URL；Lighthouse 建议 `file:/opt/atlas-data/atlas.db` |
| `server/.env` | `JWT_SECRET` | 登录令牌密钥 |
| `server/.env` | `OPENAI_API_KEY` | 大模型 API 密钥 |
| `server/.env` | `OPENAI_BASE_URL` / `OPENAI_MODEL` | 兼容 OpenAI 接口的地址和模型（可选） |
| 构建参数 | `VITE_AMAP_KEY` / `VITE_AMAP_SECURITY_JS_CODE` | 高德 Web 端配置；生产构建时注入 |

勿将 `.env` 提交到 Git。

## 推荐部署

SQLite 数据库必须放在有持久化磁盘的单台服务器上。推荐使用 CloudBase 静态网站托管和 HTTP 访问服务提供同域 HTTPS，再将 Express 后端与 SQLite 部署到腾讯云 Lighthouse。详见 `LIGHTHOUSE_CLOUDBASE_DEPLOY.md`。
